import { join } from "node:path";

import {
  DeliveryPublishingSchema,
  DeliveryReleaseManifestSchema,
  DeliveryReleaseManifestV2Schema,
  createDeliveryReleaseIdV2,
  createDeliveryReleaseManifestV2,
  createPublishingMetadataV2,
  serializeCanonicalJson,
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
  assertCanonicalPublishingV2,
  assertCanonicalReleaseManifestV2,
  buildChecksumLedger,
  buildDeliveryHandoff,
  serializeDeliveryJson,
} from "../domain/release";
import { loadCurrentDeliveryInputsV2 } from "./inputs-v2";
import type { DeliveryApplicationDependencies } from "./types";

export const DELIVERY_RELEASE_FILE_NAMES = [
  "HANDOFF.md",
  "checksums.sha256",
  "cover-3x4.png",
  "cover-4x3.png",
  "publishing.json",
  "release-manifest.json",
] as const;

type CurrentInputsV2 = Awaited<ReturnType<typeof loadCurrentDeliveryInputsV2>>;

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

export const buildDeliveryManifestContextV2 = ({
  inputs,
  releaseId,
}: {
  readonly inputs: CurrentInputsV2;
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
    publishingIntentFingerprint: inputs.intent.intentFingerprint,
    coverResultFingerprint: inputs.cover.result.resultFingerprint,
    deliveryArchivePolicyVersion: "approved-preview-cover-archive-v2" as const,
    deliverySpecificationFingerprint:
      inputs.specification.deliverySpecificationFingerprint,
    approvedPreviewChecksum: inputs.approval.previewChecksum,
  },
  verification: {
    deliveryCheckCommand: `npm run delivery:check -- --project ${inputs.finalAssembly.storyId} --release ${releaseId}`,
    checksumCommand: `cd deliveries/${inputs.finalAssembly.storyId}/${releaseId} && sha256sum -c checksums.sha256`,
  },
});

export const checkDeliveryDirectoryV2 = async ({
  releaseDir,
  releaseId,
  inputs,
  dependencies = {},
}: {
  readonly releaseDir: string;
  readonly releaseId: DeliveryReleaseId;
  readonly inputs: CurrentInputsV2;
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
    throw new Error("Delivery v2 video differs from the approved preview.");
  }
  const cover4x3Path = join(releaseDir, "cover-4x3.png");
  const cover3x4Path = join(releaseDir, "cover-3x4.png");
  const [cover4x3Media, cover3x4Media, cover4x3File, cover3x4File] =
    await Promise.all([
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
      inspectDeliveryFile(cover4x3Path),
      inspectDeliveryFile(cover3x4Path),
    ]);
  const [source4x3, source3x4] = inputs.cover.result.covers;
  if (
    cover4x3File.checksum !== source4x3.checksum ||
    cover4x3File.sizeBytes !== source4x3.sizeBytes ||
    cover3x4File.checksum !== source3x4.checksum ||
    cover3x4File.sizeBytes !== source3x4.sizeBytes
  ) {
    throw new Error("Delivery v2 Covers differ from the immutable result.");
  }
  const expectedPublishing = createPublishingMetadataV2({
    story: inputs.story,
    intent: inputs.intent,
    semanticTiming: inputs.semanticTiming,
    finalAssembly: inputs.finalAssembly,
    actualDurationSeconds: videoInspection.actualDurationSeconds,
  });
  const publishingFile = await inspectDeliveryFile(
    join(releaseDir, "publishing.json"),
  );
  const publishing = assertCanonicalPublishingV2(
    parseJsonBytes(publishingFile.bytes, "Delivery publishing metadata v2"),
    expectedPublishing,
  );
  const manifestContext = buildDeliveryManifestContextV2({ inputs, releaseId });
  const expectedHandoff = buildDeliveryHandoff({
    manifest: manifestContext,
    publishing,
  });
  const handoffFile = await inspectDeliveryFile(join(releaseDir, "HANDOFF.md"));
  if (new TextDecoder().decode(handoffFile.bytes) !== expectedHandoff) {
    throw new Error("Delivery v2 handoff drifted.");
  }
  const expectedManifest = createDeliveryReleaseManifestV2({
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
  const manifest = assertCanonicalReleaseManifestV2(
    parseJsonBytes(manifestFile.bytes, "Delivery release manifest v2"),
    expectedManifest,
  );
  if (new TextDecoder().decode(manifestFile.bytes) !== serializeDeliveryJson(manifest)) {
    throw new Error("Delivery release manifest v2 is not canonical.");
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
    throw new Error("Delivery v2 checksum ledger drifted.");
  }
  return { manifest, publishing } as const;
};

const checkLegacyDeliveryDirectoryV1 = async ({
  releaseDir,
  projectId,
  releaseId,
  manifestFile,
  dependencies,
}: {
  readonly releaseDir: string;
  readonly projectId: string;
  readonly releaseId: string;
  readonly manifestFile: Awaited<ReturnType<typeof inspectDeliveryFile>>;
  readonly dependencies: DeliveryApplicationDependencies;
}) => {
  const manifest = DeliveryReleaseManifestSchema.parse(
    parseJsonBytes(manifestFile.bytes, "Legacy Delivery release manifest"),
  );
  if (
    new TextDecoder().decode(manifestFile.bytes) !==
    serializeDeliveryJson(manifest)
  ) {
    throw new Error("Legacy Delivery release manifest is not canonical.");
  }
  if (
    manifest.storyId !== projectId ||
    manifest.releaseId !== releaseId
  ) {
    throw new Error("Legacy Delivery release identity drifted.");
  }
  const videoFileName = `${projectId}.mp4`;
  await assertDeliveryReleaseEntries({
    releaseDir,
    expected: [...DELIVERY_RELEASE_FILE_NAMES, videoFileName],
  });
  const videoPath = join(releaseDir, videoFileName);
  const videoFile = await inspectDeliveryFile(videoPath);
  const videoMedia = await inspectDeliveryVideo({
    absolutePath: videoPath,
    expected: {
      width: manifest.files.video.media.width,
      height: manifest.files.video.media.height,
      fps:
        manifest.files.video.media.fpsNumerator /
        manifest.files.video.media.fpsDenominator,
      frameCount: manifest.files.video.media.frameCount,
    },
    ...(dependencies.runProcess === undefined
      ? {}
      : { runProcess: dependencies.runProcess }),
  });
  const cover4x3Path = join(releaseDir, "cover-4x3.png");
  const cover3x4Path = join(releaseDir, "cover-3x4.png");
  const [cover4x3File, cover3x4File, cover4x3Media, cover3x4Media] =
    await Promise.all([
      inspectDeliveryFile(cover4x3Path),
      inspectDeliveryFile(cover3x4Path),
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
  if (
    videoFile.checksum !== manifest.files.video.checksum ||
    videoFile.sizeBytes !== manifest.files.video.sizeBytes ||
    cover4x3File.checksum !== manifest.files.cover4x3.checksum ||
    cover4x3File.sizeBytes !== manifest.files.cover4x3.sizeBytes ||
    cover3x4File.checksum !== manifest.files.cover3x4.checksum ||
    cover3x4File.sizeBytes !== manifest.files.cover3x4.sizeBytes ||
    serializeCanonicalJson(videoMedia) !==
      serializeCanonicalJson(manifest.files.video.media) ||
    serializeCanonicalJson(cover4x3Media) !==
      serializeCanonicalJson(manifest.files.cover4x3.media) ||
    serializeCanonicalJson(cover3x4Media) !==
      serializeCanonicalJson(manifest.files.cover3x4.media)
  ) {
    throw new Error("Legacy Delivery payload drifted from its v1 manifest.");
  }
  const publishingFile = await inspectDeliveryFile(
    join(releaseDir, "publishing.json"),
  );
  const publishing = DeliveryPublishingSchema.parse(
    parseJsonBytes(publishingFile.bytes, "Legacy Delivery publishing"),
  );
  if (
    new TextDecoder().decode(publishingFile.bytes) !==
    serializeDeliveryJson(publishing)
  ) {
    throw new Error("Legacy Delivery publishing is not canonical.");
  }
  const handoffFile = await inspectDeliveryFile(join(releaseDir, "HANDOFF.md"));
  if (
    publishingFile.checksum !== manifest.files.publishing.checksum ||
    publishingFile.sizeBytes !== manifest.files.publishing.sizeBytes ||
    handoffFile.checksum !== manifest.files.handoff.checksum ||
    handoffFile.sizeBytes !== manifest.files.handoff.sizeBytes ||
    new TextDecoder().decode(handoffFile.bytes) !==
    buildDeliveryHandoff({ manifest, publishing })
  ) {
    throw new Error("Legacy Delivery handoff drifted.");
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
    throw new Error("Legacy Delivery checksum ledger drifted.");
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
  const paths = resolveDeliveryPaths({ rootDir, projectId, releaseId });
  await assertDeliveryDirectoryChain([
    paths.deliveries,
    paths.project,
    paths.release,
  ]);
  if (!(await deliveryReleaseExists(paths.release))) {
    throw new Error("Delivery release is missing.");
  }
  const manifestFile = await inspectDeliveryFile(
    join(paths.release, "release-manifest.json"),
  );
  const rawManifest = parseJsonBytes(manifestFile.bytes, "Delivery release manifest");
  const legacy = DeliveryReleaseManifestSchema.safeParse(rawManifest);
  if (legacy.success) {
    await checkLegacyDeliveryDirectoryV1({
      releaseDir: paths.release,
      projectId,
      releaseId,
      manifestFile,
      dependencies,
    });
    return {
      projectId,
      releaseId,
      status: "current" as const,
      compatibility: "delivery-release-manifest-v1" as const,
    };
  }
  DeliveryReleaseManifestV2Schema.parse(rawManifest);
  const inputs = await loadCurrentDeliveryInputsV2({
    rootDir,
    projectId,
    dependencies,
  });
  const expectedReleaseId = createDeliveryReleaseIdV2({
    approvalFingerprint: inputs.approval.approvalFingerprint,
    finalAssemblyFingerprint: inputs.finalAssembly.finalAssemblyFingerprint,
    deliverySpecificationFingerprint:
      inputs.specification.deliverySpecificationFingerprint,
  });
  if (releaseId !== expectedReleaseId) {
    throw new Error("Delivery v2 release is not current for approved inputs.");
  }
  await checkDeliveryDirectoryV2({
    releaseDir: paths.release,
    releaseId: expectedReleaseId,
    inputs,
    dependencies,
  });
  return {
    projectId,
    releaseId,
    status: "current" as const,
    compatibility: "delivery-release-manifest-v2" as const,
  };
};
