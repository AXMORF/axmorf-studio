import { join } from "node:path";

import {
  createDeliveryReleaseIdV2,
  createDeliveryReleaseManifestV2,
  createPublishingMetadataV2,
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
import { inspectDeliveryCover, inspectDeliveryVideo } from "../adapters/media";
import {
  buildChecksumLedger,
  buildDeliveryHandoff,
  serializeDeliveryJson,
} from "../domain/release";
import {
  buildDeliveryManifestContextV2,
  checkDeliveryDirectoryV2,
} from "./check";
import { loadCurrentDeliveryInputsV2 } from "./inputs-v2";
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
  const inputs = await loadCurrentDeliveryInputsV2({
    rootDir,
    projectId,
    dependencies,
  });
  const releaseId = createDeliveryReleaseIdV2({
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
    await checkDeliveryDirectoryV2({
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
        "Delivery v2 staging video differs from the approved preview.",
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
    const coverRecords = [];
    for (const cover of inputs.cover.result.covers) {
      const destination = join(
        staging.root,
        cover.variantId === "cover-4x3"
          ? "cover-4x3.png"
          : "cover-3x4.png",
      );
      await copyDeliveryFileExclusive({
        source: join(rootDir, cover.repositoryPath),
        destination,
      });
      const file = await inspectDeliveryFile(destination);
      if (file.checksum !== cover.checksum || file.sizeBytes !== cover.sizeBytes) {
        throw new Error("Delivery v2 Cover copy differs from immutable result.");
      }
      const media = await inspectDeliveryCover({
        absolutePath: destination,
        expected: { width: cover.width, height: cover.height },
        ...(dependencies.runProcess === undefined
          ? {}
          : { runProcess: dependencies.runProcess }),
      });
      coverRecords.push({ cover, destination, file, media });
    }
    const [cover4x3, cover3x4] = coverRecords;
    if (
      cover4x3?.cover.variantId !== "cover-4x3" ||
      cover3x4?.cover.variantId !== "cover-3x4"
    ) {
      throw new Error("Delivery v2 requires both immutable Cover outputs.");
    }
    const publishing = createPublishingMetadataV2({
      story: inputs.story,
      intent: inputs.intent,
      semanticTiming: inputs.semanticTiming,
      finalAssembly: inputs.finalAssembly,
      actualDurationSeconds: videoMedia.actualDurationSeconds,
    });
    const publishingPath = join(staging.root, "publishing.json");
    await writeDeliveryFileExclusive({
      destination: publishingPath,
      bytes: serializeDeliveryJson(publishing),
    });
    const manifestContext = buildDeliveryManifestContextV2({
      inputs,
      releaseId,
    });
    const handoff = buildDeliveryHandoff({ manifest: manifestContext, publishing });
    const handoffPath = join(staging.root, "HANDOFF.md");
    await writeDeliveryFileExclusive({
      destination: handoffPath,
      bytes: handoff,
    });
    const [publishingFile, handoffFile] = await Promise.all([
      inspectDeliveryFile(publishingPath),
      inspectDeliveryFile(handoffPath),
    ]);
    const manifest = createDeliveryReleaseManifestV2({
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
          checksum: cover4x3.file.checksum,
          sizeBytes: cover4x3.file.sizeBytes,
          media: cover4x3.media,
        },
        cover3x4: {
          kind: "image",
          fileName: "cover-3x4.png",
          checksum: cover3x4.file.checksum,
          sizeBytes: cover3x4.file.sizeBytes,
          media: cover3x4.media,
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
      { fileName: "cover-4x3.png", checksum: cover4x3.file.checksum },
      { fileName: "cover-3x4.png", checksum: cover3x4.file.checksum },
      { fileName: "publishing.json", checksum: publishingFile.checksum },
      { fileName: "HANDOFF.md", checksum: handoffFile.checksum },
      { fileName: "release-manifest.json", checksum: manifestFile.checksum },
    ]);
    await writeDeliveryFileExclusive({
      destination: join(staging.root, "checksums.sha256"),
      bytes: ledger,
    });
    await checkDeliveryDirectoryV2({
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
