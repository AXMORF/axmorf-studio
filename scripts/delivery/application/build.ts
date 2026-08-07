import { join } from "node:path";

import {
  createDeliveryReleaseId,
  createDeliveryReleaseManifest,
  createPublishingMetadata,
} from "../../../src/contracts";
import {
  assertDeliveryDirectoryChain,
  cleanupDeliveryStaging,
  copyDeliveryFileExclusive,
  createDeliveryStaging,
  deliveryReleaseExists,
  inspectDeliveryFile,
  promoteDeliveryStaging,
  resolveDeliveryPaths,
  writeDeliveryFileExclusive,
} from "../adapters/filesystem";
import {
  inspectDeliveryCover,
  inspectDeliveryVideo,
  renderDeliveryCover,
} from "../adapters/media";
import {
  buildChecksumLedger,
  buildDeliveryHandoff,
  serializeDeliveryJson,
} from "../domain/release";
import { buildDeliveryManifestContext, checkDeliveryDirectory } from "./check";
import { loadCurrentDeliveryInputs } from "./inputs";
import type { DeliveryApplicationDependencies } from "./types";

export const buildDelivery = async ({
  rootDir,
  projectId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly dependencies?: DeliveryApplicationDependencies;
}) => {
  const inputs = await loadCurrentDeliveryInputs({
    rootDir,
    projectId,
    ...(dependencies.verifyFinalProject === undefined
      ? {}
      : { verifyFinalProject: dependencies.verifyFinalProject }),
  });
  const releaseId = createDeliveryReleaseId({
    approvalFingerprint: inputs.approval.approvalFingerprint,
    finalAssemblyFingerprint: inputs.finalAssembly.finalAssemblyFingerprint,
    deliverySpecificationFingerprint:
      inputs.specification.deliverySpecificationFingerprint,
  });
  const fixedPaths = resolveDeliveryPaths({ rootDir, projectId, releaseId });
  await assertDeliveryDirectoryChain([
    fixedPaths.deliveries,
    fixedPaths.project,
    fixedPaths.release,
  ]);
  if (await deliveryReleaseExists(fixedPaths.release)) {
    await checkDeliveryDirectory({
      releaseDir: fixedPaths.release,
      releaseId,
      inputs,
      dependencies,
    });
    return {
      projectId,
      releaseId,
      status: "current" as const,
      noOp: true,
    };
  }
  const staging = await createDeliveryStaging({
    rootDir,
    projectId,
    releaseId,
  });
  let promoted = false;
  try {
    const videoFileName = `${projectId}.mp4`;
    const videoPath = join(staging.root, videoFileName);
    await copyDeliveryFileExclusive({
      source: inputs.preview.absolutePath,
      destination: videoPath,
    });
    const videoFile = await inspectDeliveryFile(videoPath);
    if (videoFile.checksum !== inputs.approval.previewChecksum) {
      throw new Error(
        "Delivery staging video differs from the approved preview.",
      );
    }
    const videoMedia = await inspectDeliveryVideo({
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
    const cover4x3Path = join(staging.root, "cover-4x3.png");
    const cover3x4Path = join(staging.root, "cover-3x4.png");
    await renderDeliveryCover({
      rootDir,
      projectId,
      compositionId: `${inputs.finalAssembly.compositionId}Cover4x3`,
      outputPath: cover4x3Path,
      ...(dependencies.runProcess === undefined
        ? {}
        : { runProcess: dependencies.runProcess }),
    });
    await renderDeliveryCover({
      rootDir,
      projectId,
      compositionId: `${inputs.finalAssembly.compositionId}Cover3x4`,
      outputPath: cover3x4Path,
      ...(dependencies.runProcess === undefined
        ? {}
        : { runProcess: dependencies.runProcess }),
    });
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
    const publishing = createPublishingMetadata({
      specification: inputs.specification,
      fps: inputs.finalAssembly.fps,
      totalFrames: inputs.finalAssembly.durationInFrames,
      actualDurationSeconds: videoMedia.actualDurationSeconds,
    });
    const publishingPath = join(staging.root, "publishing.json");
    await writeDeliveryFileExclusive({
      destination: publishingPath,
      bytes: serializeDeliveryJson(publishing),
    });
    const manifestContext = buildDeliveryManifestContext({ inputs, releaseId });
    const handoff = buildDeliveryHandoff({
      manifest: manifestContext,
      publishing,
    });
    const handoffPath = join(staging.root, "HANDOFF.md");
    await writeDeliveryFileExclusive({
      destination: handoffPath,
      bytes: handoff,
    });
    const [publishingFile, handoffFile] = await Promise.all([
      inspectDeliveryFile(publishingPath),
      inspectDeliveryFile(handoffPath),
    ]);
    const manifest = createDeliveryReleaseManifest({
      schemaVersion: 1,
      manifestVersion: "delivery-release-manifest-v1",
      ...manifestContext,
      files: {
        video: {
          kind: "video",
          fileName: videoFileName,
          checksum: videoFile.checksum,
          sizeBytes: videoFile.sizeBytes,
          media: videoMedia,
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
        publishing: {
          kind: "json",
          fileName: "publishing.json",
          checksum: publishingFile.checksum,
          sizeBytes: publishingFile.sizeBytes,
          contentType: "application/json",
        },
        handoff: {
          kind: "markdown",
          fileName: "HANDOFF.md",
          checksum: handoffFile.checksum,
          sizeBytes: handoffFile.sizeBytes,
          contentType: "text/markdown; charset=utf-8",
        },
      },
    });
    const manifestPath = join(staging.root, "release-manifest.json");
    await writeDeliveryFileExclusive({
      destination: manifestPath,
      bytes: serializeDeliveryJson(manifest),
    });
    const manifestFile = await inspectDeliveryFile(manifestPath);
    const ledger = buildChecksumLedger([
      { fileName: videoFileName, checksum: videoFile.checksum },
      { fileName: "cover-4x3.png", checksum: cover4x3File.checksum },
      { fileName: "cover-3x4.png", checksum: cover3x4File.checksum },
      { fileName: "publishing.json", checksum: publishingFile.checksum },
      { fileName: "HANDOFF.md", checksum: handoffFile.checksum },
      { fileName: "release-manifest.json", checksum: manifestFile.checksum },
    ]);
    await writeDeliveryFileExclusive({
      destination: join(staging.root, "checksums.sha256"),
      bytes: ledger,
    });
    await checkDeliveryDirectory({
      releaseDir: staging.root,
      releaseId,
      inputs,
      dependencies,
    });
    await promoteDeliveryStaging({
      staging: staging.root,
      destination: fixedPaths.release,
    });
    promoted = true;
    return { projectId, releaseId, status: "built" as const, noOp: false };
  } finally {
    if (!promoted) await cleanupDeliveryStaging(staging.root);
  }
};
