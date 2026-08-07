import assert from "node:assert/strict";
import test from "node:test";

import {
  DeliveryPublishingSchema,
  DeliveryReleaseManifestSchema,
  createDeliveryReleaseId,
  createDeliveryReleaseManifest,
  createDeliverySpecification,
  createPublishingMetadata,
} from "../../src/contracts/delivery";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const authoredSpecification = () => ({
  schemaVersion: 1 as const,
  specificationVersion: "delivery-specification-v1" as const,
  verificationPolicyVersion: "delivery-local-verification-v1" as const,
  storyId: "delivery-proof",
  compositionId: "DeliveryProof",
  title: "可验证的视频交付",
  description: "从批准预览生成可复验的本地交付包。",
  topics: [
    "视频制作",
    "Remotion",
    "创作流程",
    "本地交付",
    "可验证",
    "工程实践",
  ],
  collection: "可验证创作",
  chapters: [
    { name: "问题", startFrame: 0 },
    { name: "生产流程", startFrame: 60 },
  ],
});

const specification = () =>
  createDeliverySpecification({
    authored: authoredSpecification(),
    coverSourceFiles: [
      {
        relativePath: "src/projects/delivery-proof/delivery/Covers.tsx",
        checksum: sha("1"),
      },
      {
        relativePath: "src/projects/delivery-proof/delivery/Root.tsx",
        checksum: sha("2"),
      },
      {
        relativePath: "src/projects/delivery-proof/delivery/index.ts",
        checksum: sha("3"),
      },
    ],
  });

test("delivery specification is strict future-only and binds fixed cover source", () => {
  const current = specification();
  assert.equal(current.specificationVersion, "delivery-specification-v1");
  assert.equal(current.coverSourceFiles.length, 3);

  assert.throws(() =>
    createDeliverySpecification({
      authored: { ...authoredSpecification(), topics: ["one", "two"] },
      coverSourceFiles: current.coverSourceFiles,
    }),
  );
  assert.throws(() =>
    createDeliverySpecification({
      authored: {
        ...authoredSpecification(),
        topics: ["重复", "重复", "三", "四", "五", "六"],
      },
      coverSourceFiles: current.coverSourceFiles,
    }),
  );
  assert.throws(() =>
    createDeliverySpecification({
      authored: {
        ...authoredSpecification(),
        chapters: [{ name: "十二个Unicode字符名", startFrame: 0 }],
      },
      coverSourceFiles: current.coverSourceFiles,
    }),
  );
  assert.throws(() =>
    createDeliverySpecification({
      authored: { ...authoredSpecification(), unknown: true },
      coverSourceFiles: current.coverSourceFiles,
    }),
  );
  assert.throws(() =>
    createDeliverySpecification({
      authored: authoredSpecification(),
      coverSourceFiles: [
        ...current.coverSourceFiles.slice(0, 2),
        {
          relativePath: "../../private.ts",
          checksum: sha("3"),
        },
      ],
    }),
  );
});

test("release id derives only from approval assembly and delivery specification identities", () => {
  const input = {
    approvalFingerprint: sha("4"),
    finalAssemblyFingerprint: sha("5"),
    deliverySpecificationFingerprint:
      specification().deliverySpecificationFingerprint,
  };
  const first = createDeliveryReleaseId(input);
  assert.equal(first, createDeliveryReleaseId(input));
  assert.match(first, /^release-[0-9a-f]{64}$/u);
  assert.notEqual(
    first,
    createDeliveryReleaseId({ ...input, approvalFingerprint: sha("6") }),
  );
});

test("publishing metadata binds chapters timepoints and actual media facts", () => {
  const publishing = createPublishingMetadata({
    specification: specification(),
    fps: 30,
    totalFrames: 120,
    actualDurationSeconds: 4.021333,
  });
  assert.equal(publishing.mp4FileName, "delivery-proof.mp4");
  assert.deepEqual(publishing.chapters[1], {
    name: "生产流程",
    startFrame: 60,
    timeSeconds: 2,
    timecode: "00:00:02.000",
  });
  assert.doesNotThrow(() => DeliveryPublishingSchema.parse(publishing));
  assert.throws(() =>
    createPublishingMetadata({
      specification: createDeliverySpecification({
        authored: {
          ...authoredSpecification(),
          chapters: [
            { name: "later", startFrame: 60 },
            { name: "earlier", startFrame: 0 },
          ],
        },
        coverSourceFiles: specification().coverSourceFiles,
      }),
      fps: 30,
      totalFrames: 120,
      actualDurationSeconds: 4,
    }),
  );
});

test("release manifest binds approval final-v2 delivery specification and every payload file", () => {
  const currentSpecification = specification();
  const releaseId = createDeliveryReleaseId({
    approvalFingerprint: sha("4"),
    finalAssemblyFingerprint: sha("5"),
    deliverySpecificationFingerprint:
      currentSpecification.deliverySpecificationFingerprint,
  });
  const manifest = createDeliveryReleaseManifest({
    schemaVersion: 1,
    manifestVersion: "delivery-release-manifest-v1",
    releaseId,
    storyId: "delivery-proof",
    compositionId: "DeliveryProof",
    identities: {
      approvalFingerprint: sha("4"),
      evidenceFingerprint: sha("6"),
      finalAssemblyFingerprint: sha("5"),
      finalMechanicalCheckVersion: "final-mechanical-check-v2",
      finalMechanicalCheckReportFingerprint: sha("7"),
      deliverySpecificationFingerprint:
        currentSpecification.deliverySpecificationFingerprint,
      approvedPreviewChecksum: sha("8"),
    },
    files: {
      video: {
        kind: "video",
        fileName: "delivery-proof.mp4",
        checksum: sha("8"),
        sizeBytes: 1000,
        media: {
          videoCodec: "h264",
          audioCodec: "aac",
          width: 1080,
          height: 1920,
          fpsNumerator: 30,
          fpsDenominator: 1,
          frameCount: 120,
          videoDurationSeconds: 4,
          actualDurationSeconds: 4.021333,
          sampleRate: 48000,
          channelLayout: "stereo",
          videoStreamCount: 1,
          audioStreamCount: 1,
          decodedToEof: true,
        },
      },
      cover4x3: {
        kind: "image",
        fileName: "cover-4x3.png",
        checksum: sha("9"),
        sizeBytes: 200,
        media: {
          imageFormat: "png",
          width: 1600,
          height: 1200,
          decodedToEof: true,
        },
      },
      cover3x4: {
        kind: "image",
        fileName: "cover-3x4.png",
        checksum: sha("a"),
        sizeBytes: 201,
        media: {
          imageFormat: "png",
          width: 1200,
          height: 1600,
          decodedToEof: true,
        },
      },
      publishing: {
        kind: "json",
        fileName: "publishing.json",
        checksum: sha("b"),
        sizeBytes: 300,
        contentType: "application/json",
      },
      handoff: {
        kind: "markdown",
        fileName: "HANDOFF.md",
        checksum: sha("c"),
        sizeBytes: 400,
        contentType: "text/markdown; charset=utf-8",
      },
    },
    verification: {
      deliveryCheckCommand: `npm run delivery:check -- --project delivery-proof --release ${releaseId}`,
      checksumCommand: `cd deliveries/delivery-proof/${releaseId} && sha256sum -c checksums.sha256`,
    },
  });
  assert.doesNotThrow(() => DeliveryReleaseManifestSchema.parse(manifest));
  assert.equal(
    manifest.files.video.checksum,
    manifest.identities.approvedPreviewChecksum,
  );
});
