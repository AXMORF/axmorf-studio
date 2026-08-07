import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test, { type TestContext } from "node:test";

import type { ProcessRunner } from "../../scripts/baseline/evidence";
import { checksumDeliveryBytes } from "../../scripts/delivery/adapters/filesystem";
import { checkDelivery } from "../../scripts/delivery/application/check";
import {
  buildChecksumLedger,
  buildDeliveryHandoff,
  serializeDeliveryJson,
} from "../../scripts/delivery/domain/release";
import {
  createDeliveryReleaseId,
  createDeliveryReleaseManifest,
  createDeliverySpecification,
  createPublishingMetadata,
  Sha256DigestSchema,
  type DeliveryReleaseManifest,
} from "../../src/contracts";

const sha = (value: string) =>
  Sha256DigestSchema.parse(`sha256:${value.repeat(64)}`);

const fakePng = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

const mediaRunner: ProcessRunner = async (command) => {
  if (basename(command) === "ffprobe") {
    return {
      status: 0,
      stdout: JSON.stringify({
        streams: [
          { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1", nb_read_frames: "120", duration: "4.000000" },
          { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channel_layout: "stereo", duration: "4.021333" },
        ],
        format: { duration: "4.021333" },
      }),
      stderr: "",
    };
  }
  if (basename(command) === "ffmpeg") return { status: 0, stdout: "", stderr: "" };
  throw new Error(`Unexpected legacy process: ${command}`);
};

test("v1 release remains self-contained and read-only verifiable without current Project inputs", async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-legacy-delivery-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const specification = createDeliverySpecification({
    authored: {
      schemaVersion: 1,
      specificationVersion: "delivery-specification-v1",
      verificationPolicyVersion: "delivery-local-verification-v1",
      storyId: "legacy-proof",
      compositionId: "LegacyProof",
      title: "旧版只读交付",
      description: "旧 identity 不迁移。",
      topics: ["一", "二", "三", "四", "五", "六"],
      collection: "旧版",
      chapters: [{ name: "开始", startFrame: 0 }],
    },
    coverSourceFiles: [
      { relativePath: "src/projects/legacy-proof/delivery/Covers.tsx", checksum: sha("1") },
      { relativePath: "src/projects/legacy-proof/delivery/Root.tsx", checksum: sha("2") },
      { relativePath: "src/projects/legacy-proof/delivery/index.ts", checksum: sha("3") },
    ],
  });
  const identities = {
    approvalFingerprint: sha("4"),
    evidenceFingerprint: sha("5"),
    finalAssemblyFingerprint: sha("6"),
    finalMechanicalCheckVersion: "final-mechanical-check-v2" as const,
    finalMechanicalCheckReportFingerprint: sha("7"),
    deliverySpecificationFingerprint: specification.deliverySpecificationFingerprint,
    approvedPreviewChecksum: checksumDeliveryBytes(new TextEncoder().encode("legacy-approved-preview")),
  };
  const releaseId = createDeliveryReleaseId({
    approvalFingerprint: identities.approvalFingerprint,
    finalAssemblyFingerprint: identities.finalAssemblyFingerprint,
    deliverySpecificationFingerprint: identities.deliverySpecificationFingerprint,
  });
  const releaseDir = join(rootDir, "deliveries/legacy-proof", releaseId);
  await mkdir(releaseDir, { recursive: true });
  const videoBytes = new TextEncoder().encode("legacy-approved-preview");
  const cover4x3 = fakePng(1600, 1200);
  const cover3x4 = fakePng(1200, 1600);
  await writeFile(join(releaseDir, "legacy-proof.mp4"), videoBytes);
  await writeFile(join(releaseDir, "cover-4x3.png"), cover4x3);
  await writeFile(join(releaseDir, "cover-3x4.png"), cover3x4);
  const publishing = createPublishingMetadata({
    specification,
    fps: 30,
    totalFrames: 120,
    actualDurationSeconds: 4.021333,
  });
  await writeFile(join(releaseDir, "publishing.json"), serializeDeliveryJson(publishing));
  const contextManifest: Pick<
    DeliveryReleaseManifest,
    "releaseId" | "storyId" | "compositionId" | "identities" | "verification"
  > = {
    releaseId,
    storyId: specification.storyId,
    compositionId: specification.compositionId,
    identities,
    verification: {
      deliveryCheckCommand: `npm run delivery:check -- --project legacy-proof --release ${releaseId}`,
      checksumCommand: `sha256sum -c deliveries/legacy-proof/${releaseId}/checksums.sha256`,
    },
  };
  const handoff = buildDeliveryHandoff({ manifest: contextManifest, publishing });
  await writeFile(join(releaseDir, "HANDOFF.md"), handoff);
  const videoMedia = {
    videoCodec: "h264" as const,
    audioCodec: "aac" as const,
    width: 1080,
    height: 1920,
    fpsNumerator: 30,
    fpsDenominator: 1,
    frameCount: 120,
    videoDurationSeconds: 4,
    actualDurationSeconds: 4.021333,
    sampleRate: 48_000,
    channelLayout: "stereo",
    videoStreamCount: 1 as const,
    audioStreamCount: 1 as const,
    decodedToEof: true as const,
  };
  const fileRecord = async (fileName: string) => {
    const bytes = Uint8Array.from(await readFile(join(releaseDir, fileName)));
    return { checksum: checksumDeliveryBytes(bytes), sizeBytes: bytes.byteLength };
  };
  const manifest = createDeliveryReleaseManifest({
    schemaVersion: 1,
    manifestVersion: "delivery-release-manifest-v1",
    ...contextManifest,
    files: {
      video: { kind: "video", fileName: "legacy-proof.mp4", ...(await fileRecord("legacy-proof.mp4")), media: videoMedia },
      cover4x3: { kind: "image", fileName: "cover-4x3.png", ...(await fileRecord("cover-4x3.png")), media: { imageFormat: "png", width: 1600, height: 1200, decodedToEof: true } },
      cover3x4: { kind: "image", fileName: "cover-3x4.png", ...(await fileRecord("cover-3x4.png")), media: { imageFormat: "png", width: 1200, height: 1600, decodedToEof: true } },
      publishing: { kind: "json", fileName: "publishing.json", ...(await fileRecord("publishing.json")), contentType: "application/json" },
      handoff: { kind: "markdown", fileName: "HANDOFF.md", ...(await fileRecord("HANDOFF.md")), contentType: "text/markdown; charset=utf-8" },
    },
  });
  await writeFile(join(releaseDir, "release-manifest.json"), serializeDeliveryJson(manifest));
  const manifestRecord = await fileRecord("release-manifest.json");
  await writeFile(
    join(releaseDir, "checksums.sha256"),
    buildChecksumLedger([
      { fileName: "legacy-proof.mp4", checksum: identities.approvedPreviewChecksum },
      { fileName: "cover-4x3.png", checksum: manifest.files.cover4x3.checksum },
      { fileName: "cover-3x4.png", checksum: manifest.files.cover3x4.checksum },
      { fileName: "publishing.json", checksum: manifest.files.publishing.checksum },
      { fileName: "HANDOFF.md", checksum: manifest.files.handoff.checksum },
      { fileName: "release-manifest.json", checksum: manifestRecord.checksum },
    ]),
  );
  const before = (await stat(join(releaseDir, "release-manifest.json"))).mtimeMs;
  const checked = await checkDelivery({
    rootDir,
    projectId: "legacy-proof",
    releaseId,
    dependencies: { runProcess: mediaRunner },
  });
  assert.equal(checked.compatibility, "delivery-release-manifest-v1");
  assert.equal((await stat(join(releaseDir, "release-manifest.json"))).mtimeMs, before);

  const ledgerPath = join(releaseDir, "checksums.sha256");
  const publishingPath = join(releaseDir, "publishing.json");
  const originalPublishing = await readFile(publishingPath);
  const originalLedger = await readFile(ledgerPath, "utf8");
  const driftedPublishing = new TextEncoder().encode(
    `${new TextDecoder().decode(originalPublishing)} `,
  );
  await writeFile(publishingPath, driftedPublishing);
  await writeFile(
    ledgerPath,
    originalLedger.replace(
      manifest.files.publishing.checksum.slice(7),
      checksumDeliveryBytes(driftedPublishing).slice(7),
    ),
  );
  await assert.rejects(
    () =>
      checkDelivery({
        rootDir,
        projectId: "legacy-proof",
        releaseId,
        dependencies: { runProcess: mediaRunner },
      }),
    /publishing|payload/iu,
  );
  await writeFile(publishingPath, Uint8Array.from(originalPublishing));
  await writeFile(ledgerPath, originalLedger);

  const manifestPath = join(releaseDir, "release-manifest.json");
  const nonCanonicalManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, nonCanonicalManifest);
  await writeFile(
    ledgerPath,
    originalLedger.replace(
      manifestRecord.checksum.slice(7),
      checksumDeliveryBytes(new TextEncoder().encode(nonCanonicalManifest)).slice(7),
    ),
  );
  await assert.rejects(
    () =>
      checkDelivery({
        rootDir,
        projectId: "legacy-proof",
        releaseId,
        dependencies: { runProcess: mediaRunner },
      }),
    /not canonical/iu,
  );
});
