import { join } from "node:path";

import {
  createDeliveryReleaseId,
  createDeliveryReleaseManifest,
  createPublishingMetadata,
  type DeliveryReleaseId,
} from "../../../src/contracts";
import {
  assertDeliveryDirectoryChain,
  assertDeliveryReleaseEntries,
  deliveryReleaseExists,
  inspectDeliveryFile,
  resolveDeliveryPaths,
} from "../adapters/filesystem";
import { inspectDeliveryCover, inspectDeliveryVideo } from "../adapters/media";
import {
  assertCanonicalPublishing,
  assertCanonicalReleaseManifest,
  buildChecksumLedger,
  buildDeliveryHandoff,
  serializeDeliveryJson,
} from "../domain/release";
import { loadCurrentDeliveryInputs } from "./inputs";
import type { DeliveryApplicationDependencies } from "./types";

export const DELIVERY_RELEASE_FILE_NAMES = [
  "HANDOFF.md",
  "checksums.sha256",
  "cover-3x4.png",
  "cover-4x3.png",
  "publishing.json",
  "release-manifest.json",
] as const;

type CurrentInputs = Awaited<ReturnType<typeof loadCurrentDeliveryInputs>>;

export const buildDeliveryManifestContext = ({
  inputs,
  releaseId,
}: {
  readonly inputs: CurrentInputs;
  readonly releaseId: DeliveryReleaseId;
}) => ({
  releaseId,
  storyId: inputs.finalAssembly.storyId,
  compositionId: inputs.finalAssembly.compositionId,
  identities: {
    approvalFingerprint: inputs.approval.approvalFingerprint,
    evidenceFingerprint: inputs.evidence.evidenceFingerprint,
    finalAssemblyFingerprint: inputs.finalAssembly.finalAssemblyFingerprint,
    finalMechanicalCheckVersion: "final-mechanical-check-v2" as const,
    finalMechanicalCheckReportFingerprint: inputs.finalReport.reportFingerprint,
    deliverySpecificationFingerprint:
      inputs.specification.deliverySpecificationFingerprint,
    approvedPreviewChecksum: inputs.approval.previewChecksum,
  },
  verification: {
    deliveryCheckCommand: `npm run delivery:check -- --project ${inputs.finalAssembly.storyId} --release ${releaseId}`,
    checksumCommand: `cd deliveries/${inputs.finalAssembly.storyId}/${releaseId} && sha256sum -c checksums.sha256`,
  },
});

const parseJsonBytes = (bytes: Uint8Array, label: string) => {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} is malformed.`, { cause: error });
  }
};

const textRecord = async ({
  releaseDir,
  fileName,
  kind,
}: {
  readonly releaseDir: string;
  readonly fileName: "publishing.json" | "HANDOFF.md";
  readonly kind: "json" | "markdown";
}) => {
  const inspected = await inspectDeliveryFile(join(releaseDir, fileName));
  return kind === "json"
    ? ({
        kind,
        fileName,
        checksum: inspected.checksum,
        sizeBytes: inspected.sizeBytes,
        contentType: "application/json" as const,
      } as const)
    : ({
        kind,
        fileName,
        checksum: inspected.checksum,
        sizeBytes: inspected.sizeBytes,
        contentType: "text/markdown; charset=utf-8" as const,
      } as const);
};

export const checkDeliveryDirectory = async ({
  releaseDir,
  releaseId,
  inputs,
  dependencies = {},
}: {
  readonly releaseDir: string;
  readonly releaseId: DeliveryReleaseId;
  readonly inputs: CurrentInputs;
  readonly dependencies?: DeliveryApplicationDependencies;
}) => {
  const videoFileName = `${inputs.finalAssembly.storyId}.mp4`;
  await assertDeliveryReleaseEntries({
    releaseDir,
    expected: [...DELIVERY_RELEASE_FILE_NAMES, videoFileName],
  });
  const videoPath = join(releaseDir, videoFileName);
  const videoInspection = await inspectDeliveryVideo({
    absolutePath: videoPath,
    expected: {
      width: inputs.finalAssembly.width,
      height: inputs.finalAssembly.height,
      fps: inputs.finalAssembly.fps,
      frameCount: inputs.finalAssembly.durationInFrames,
    },
    ...(dependencies.runProcess === undefined
      ? {}
      : { runProcess: dependencies.runProcess }),
  });
  const videoFile = await inspectDeliveryFile(videoPath);
  if (videoFile.checksum !== inputs.approval.previewChecksum) {
    throw new Error(
      "Delivery video checksum differs from the approved preview.",
    );
  }
  const cover4x3Path = join(releaseDir, "cover-4x3.png");
  const cover3x4Path = join(releaseDir, "cover-3x4.png");
  const [cover4x3Media, cover3x4Media] = await Promise.all([
    inspectDeliveryCover({
      absolutePath: cover4x3Path,
      expected: { width: 1600, height: 1200 },
      ...(dependencies.runProcess === undefined
        ? {}
        : { runProcess: dependencies.runProcess }),
    }),
    inspectDeliveryCover({
      absolutePath: cover3x4Path,
      expected: { width: 1200, height: 1600 },
      ...(dependencies.runProcess === undefined
        ? {}
        : { runProcess: dependencies.runProcess }),
    }),
  ]);
  const [cover4x3File, cover3x4File] = await Promise.all([
    inspectDeliveryFile(cover4x3Path),
    inspectDeliveryFile(cover3x4Path),
  ]);
  const expectedPublishing = createPublishingMetadata({
    specification: inputs.specification,
    fps: inputs.finalAssembly.fps,
    totalFrames: inputs.finalAssembly.durationInFrames,
    actualDurationSeconds: videoInspection.actualDurationSeconds,
  });
  const publishingFile = await inspectDeliveryFile(
    join(releaseDir, "publishing.json"),
  );
  const publishing = assertCanonicalPublishing(
    parseJsonBytes(publishingFile.bytes, "Delivery publishing metadata"),
    expectedPublishing,
  );
  const manifestContext = buildDeliveryManifestContext({ inputs, releaseId });
  const expectedHandoff = buildDeliveryHandoff({
    manifest: manifestContext,
    publishing,
  });
  const handoffFile = await inspectDeliveryFile(join(releaseDir, "HANDOFF.md"));
  if (new TextDecoder().decode(handoffFile.bytes) !== expectedHandoff) {
    throw new Error("Delivery handoff drifted.");
  }
  const expectedManifest = createDeliveryReleaseManifest({
    schemaVersion: 1,
    manifestVersion: "delivery-release-manifest-v1",
    ...manifestContext,
    files: {
      video: {
        kind: "video",
        fileName: videoFileName,
        checksum: videoFile.checksum,
        sizeBytes: videoFile.sizeBytes,
        media: videoInspection,
      },
      cover4x3: {
        kind: "image",
        fileName: "cover-4x3.png",
        checksum: cover4x3File.checksum,
        sizeBytes: cover4x3File.sizeBytes,
        media: cover4x3Media,
      },
      cover3x4: {
        kind: "image",
        fileName: "cover-3x4.png",
        checksum: cover3x4File.checksum,
        sizeBytes: cover3x4File.sizeBytes,
        media: cover3x4Media,
      },
      publishing: await textRecord({
        releaseDir,
        fileName: "publishing.json",
        kind: "json",
      }),
      handoff: await textRecord({
        releaseDir,
        fileName: "HANDOFF.md",
        kind: "markdown",
      }),
    },
  });
  const manifestFile = await inspectDeliveryFile(
    join(releaseDir, "release-manifest.json"),
  );
  const manifest = assertCanonicalReleaseManifest(
    parseJsonBytes(manifestFile.bytes, "Delivery release manifest"),
    expectedManifest,
  );
  if (
    new TextDecoder().decode(manifestFile.bytes) !==
    serializeDeliveryJson(manifest)
  ) {
    throw new Error("Delivery release manifest is not canonical.");
  }
  const expectedLedger = buildChecksumLedger([
    { fileName: videoFileName, checksum: videoFile.checksum },
    { fileName: "cover-4x3.png", checksum: cover4x3File.checksum },
    { fileName: "cover-3x4.png", checksum: cover3x4File.checksum },
    { fileName: "publishing.json", checksum: publishingFile.checksum },
    { fileName: "HANDOFF.md", checksum: handoffFile.checksum },
    { fileName: "release-manifest.json", checksum: manifestFile.checksum },
  ]);
  const ledgerFile = await inspectDeliveryFile(
    join(releaseDir, "checksums.sha256"),
  );
  if (new TextDecoder().decode(ledgerFile.bytes) !== expectedLedger) {
    throw new Error("Delivery checksum ledger drifted.");
  }
  return { manifest, publishing } as const;
};

export const checkDelivery = async ({
  rootDir,
  projectId,
  releaseId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly releaseId: string;
  readonly dependencies?: DeliveryApplicationDependencies;
}) => {
  const inputs = await loadCurrentDeliveryInputs({
    rootDir,
    projectId,
    ...(dependencies.verifyFinalProject === undefined
      ? {}
      : { verifyFinalProject: dependencies.verifyFinalProject }),
  });
  const expectedReleaseId = createDeliveryReleaseId({
    approvalFingerprint: inputs.approval.approvalFingerprint,
    finalAssemblyFingerprint: inputs.finalAssembly.finalAssemblyFingerprint,
    deliverySpecificationFingerprint:
      inputs.specification.deliverySpecificationFingerprint,
  });
  if (releaseId !== expectedReleaseId) {
    throw new Error("Delivery release is not current for the approved inputs.");
  }
  const paths = resolveDeliveryPaths({
    rootDir,
    projectId,
    releaseId: expectedReleaseId,
  });
  await assertDeliveryDirectoryChain([
    paths.deliveries,
    paths.project,
    paths.release,
  ]);
  if (!(await deliveryReleaseExists(paths.release))) {
    throw new Error("Delivery release is missing.");
  }
  await checkDeliveryDirectory({
    releaseDir: paths.release,
    releaseId: expectedReleaseId,
    inputs,
    dependencies,
  });
  return {
    projectId,
    releaseId: expectedReleaseId,
    status: "current" as const,
  };
};
