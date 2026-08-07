import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_COVER_SPEC,
  PublishingIntentSchema,
  buildDeliveryCoverAssignment,
  buildDeliveryCoverPackage,
  buildDeliveryCoverResult,
  buildPublishingIntent,
  computeCoverVisualStyleSpecFingerprint,
  createDeliveryReleaseIdV2,
  createDeliverySpecificationV2,
  createPublishingMetadataV2,
  resolveCurrentPublishingIntent,
} from "../../src/contracts";
import { computeStoryFingerprint } from "../../src/contracts/generation-input";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const story = {
  schemaVersion: 1 as const,
  storyId: "delivery-v2-proof",
  title: "为什么 AI 产品需要可验证交付",
  beats: [
    {
      meaningId: "problem",
      narrativePurpose: "提出问题",
      ttsChunks: [{ chunkId: "problem-1", ttsText: "先看问题。" }],
      explicitPauses: [],
    },
    {
      meaningId: "solution",
      narrativePurpose: "给出方案",
      ttsChunks: [{ chunkId: "solution-1", ttsText: "再看方案。" }],
      explicitPauses: [],
    },
  ],
};

const visualStyle = {
  schemaVersion: 1 as const,
  storyId: "delivery-v2-proof",
  styleProfileId: "comic-editorial",
  resourceCatalogFingerprint: sha("1"),
  artDirection: {
    medium: "纯代码编辑漫画",
    palette: "暖黄、深蓝、珊瑚红",
    lighting: "平面高对比",
    texture: "网点与纸张纹理",
    compositionGrammar: "大标题与图形叙事",
    motionLanguage: "封面为静态构图",
    typography: "粗体中文标题",
  },
  continuityRules: ["保持编辑漫画语言"],
  forbiddenTreatments: ["禁止照片"],
};

const authoredIntent = () => ({
  description: "从叙事、封面到批准媒体都绑定 current identity。",
  topics: ["AI 产品", "视频制作", "Remotion", "本地交付", "可验证", "工程实践"],
  collection: "AI 产品方法",
  chapters: [
    { meaningId: "problem", name: "问题出现" },
    { meaningId: "solution", name: "AI 方案" },
  ],
});

test("PublishingIntent is strict, fingerprinted, title-free, and current against Story order", () => {
  const intent = buildPublishingIntent({ story, authored: authoredIntent() });
  assert.equal(intent.contractVersion, "publishing-intent-v1");
  assert.equal("title" in intent, false);
  assert.doesNotThrow(() => PublishingIntentSchema.parse(intent));
  assert.deepEqual(
    resolveCurrentPublishingIntent({ story, intent }).chapters.map(({ meaningId }) => meaningId),
    ["problem", "solution"],
  );

  assert.throws(() =>
    buildPublishingIntent({
      story,
      authored: { ...authoredIntent(), topics: ["重复", "重复", "三", "四", "五", "六"] },
    }),
  );
  assert.throws(() =>
    buildPublishingIntent({
      story,
      authored: {
        ...authoredIntent(),
        chapters: [
          { meaningId: "problem", name: "English" },
          { meaningId: "solution", name: "AI 方案" },
        ],
      },
    }),
  );
  assert.throws(() =>
    buildPublishingIntent({
      story,
      authored: {
        ...authoredIntent(),
        chapters: [
          { meaningId: "problem", name: "这是十二个中文字章节名啊" },
          { meaningId: "solution", name: "AI 方案" },
        ],
      },
    }),
  );
  assert.throws(() =>
    buildPublishingIntent({
      story,
      authored: {
        ...authoredIntent(),
        chapters: [
          { meaningId: "problem", name: "问题" },
          { meaningId: "problem", name: "重复" },
        ],
      },
    }),
  );

  const reversed = { ...intent, chapters: [...intent.chapters].reverse() };
  assert.throws(() => resolveCurrentPublishingIntent({ story, intent: reversed }));
  assert.throws(() =>
    resolveCurrentPublishingIntent({
      story: { ...story, title: "Story 已漂移" },
      intent,
    }),
  );
});

test("publishing v2 projects title and ordered chapter frames with floored HH:MM:SS", () => {
  const intent = buildPublishingIntent({ story, authored: authoredIntent() });
  const publishing = createPublishingMetadataV2({
    story,
    intent,
    semanticTiming: {
      schemaVersion: 1,
      algorithmId: "pcm-cumulative-ceil-v1",
      storyId: "delivery-v2-proof",
      fingerprint: sha("2"),
      sampleRate: 48_000,
      fps: 30,
      leadInFrames: 15,
      tailFrames: 15,
      durationInFrames: 108_062,
      segments: [
        {
          kind: "chunk",
          chunkId: "problem-1",
          meaningId: "problem",
          ttsText: "先看问题。",
          sampleRange: { startSampleFrame: 0, endSampleFrame: 172_752_000 },
          frameRange: { startFrame: 15, endFrame: 107_985 },
        },
        {
          kind: "chunk",
          chunkId: "solution-1",
          meaningId: "solution",
          ttsText: "再看方案。",
          sampleRange: { startSampleFrame: 172_752_000, endSampleFrame: 172_851_200 },
          frameRange: { startFrame: 107_985, endFrame: 108_047 },
        },
      ],
      captionCues: [
        { chunkId: "problem-1", meaningId: "problem", text: "先看问题。", startFrame: 15, endFrame: 107_985 },
        { chunkId: "solution-1", meaningId: "solution", text: "再看方案。", startFrame: 107_985, endFrame: 108_047 },
      ],
      storyBeats: [
        { meaningId: "problem", startFrame: 15, endFrame: 107_985 },
        { meaningId: "solution", startFrame: 107_985, endFrame: 108_047 },
      ],
    },
    finalAssembly: {
      storyId: "delivery-v2-proof",
      compositionId: "DeliveryV2Proof",
      fps: 30,
      durationInFrames: 108_062,
    },
    actualDurationSeconds: 3_602.123,
  });
  assert.equal(publishing.title, story.title);
  assert.deepEqual(publishing.chapters[1], {
    meaningId: "solution",
    name: "AI 方案",
    startFrame: 107_985,
    timecode: "00:59:59",
  });
  assert.equal(publishing.actualDurationSeconds, 3_602.123);
  assert.equal(publishing.mp4FileName, "delivery-v2-proof.mp4");
});

test("fixed CoverSpec and cover contracts require two independent exact-ratio compositions", () => {
  assert.deepEqual(
    FIXED_COVER_SPEC.variants.map(({ width, height }) => [width, height]),
    [[1600, 1200], [1200, 1600]],
  );
  const visualStyleSpecFingerprint = computeCoverVisualStyleSpecFingerprint(visualStyle);
  const assignment = buildDeliveryCoverAssignment({ story, visualStyle });
  assert.equal(
    assignment.storyFingerprint,
    computeStoryFingerprint(assignment.story),
  );
  assert.equal(assignment.visualStyleSpecFingerprint, visualStyleSpecFingerprint);
  assert.equal(assignment.inputs.length, 3);

  const packageArtifact = buildDeliveryCoverPackage({
    storyId: story.storyId,
    compositionId: "DeliveryV2Proof",
    assignmentFingerprint: assignment.assignmentFingerprint,
    storyFingerprint: assignment.storyFingerprint,
    visualStyleSpecFingerprint,
    coverSpecFingerprint: assignment.coverSpecFingerprint,
    sourceFiles: [
      { relativePath: "src/projects/delivery-v2-proof/delivery/cover/Cover4x3.tsx", checksum: sha("5") },
      { relativePath: "src/projects/delivery-v2-proof/delivery/cover/Cover3x4.tsx", checksum: sha("6") },
      { relativePath: "src/projects/delivery-v2-proof/delivery/cover/Root.tsx", checksum: sha("7") },
      { relativePath: "src/projects/delivery-v2-proof/delivery/cover/index.ts", checksum: sha("8") },
    ],
    sourceGraphFingerprint: sha("9"),
    compositions: [
      { variantId: "cover-4x3", compositionId: "DeliveryV2ProofDeliveryCover4x3V2", sourceFile: "Cover4x3.tsx", width: 1600, height: 1200 },
      { variantId: "cover-3x4", compositionId: "DeliveryV2ProofDeliveryCover3x4V2", sourceFile: "Cover3x4.tsx", width: 1200, height: 1600 },
    ],
  });
  assert.notEqual(packageArtifact.sourceFiles[0].checksum, packageArtifact.sourceFiles[1].checksum);

  const result = buildDeliveryCoverResult({
    storyId: story.storyId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    packageFingerprint: packageArtifact.packageFingerprint,
    sourceGraphFingerprint: packageArtifact.sourceGraphFingerprint,
    covers: [
      { variantId: "cover-4x3", repositoryPath: `src/projects/delivery-v2-proof/delivery/cover/results/${assignment.assignmentFingerprint.slice(7)}/cover-4x3.png`, checksum: sha("a"), sizeBytes: 100, width: 1600, height: 1200, decodedToEof: true },
      { variantId: "cover-3x4", repositoryPath: `src/projects/delivery-v2-proof/delivery/cover/results/${assignment.assignmentFingerprint.slice(7)}/cover-3x4.png`, checksum: sha("b"), sizeBytes: 101, width: 1200, height: 1600, decodedToEof: true },
    ],
    thumbnailChecks: [
      { variantId: "cover-4x3", width: 320, height: 240, decodedToEof: true },
      { variantId: "cover-3x4", width: 240, height: 320, decodedToEof: true },
    ],
  });
  assert.equal(result.status, "cover-ready");
  assert.throws(() =>
    buildDeliveryCoverResult({
      ...result,
      covers: [
        {
          ...result.covers[0],
          repositoryPath: `src/projects/delivery-v2-proof/delivery/cover/results/${assignment.assignmentFingerprint.slice(7)}/../cover-4x3.png`,
        },
        result.covers[1],
      ],
    }),
  );

  assert.throws(() => buildDeliveryCoverPackage({ ...packageArtifact, compositions: [packageArtifact.compositions[0]] }));
  assert.throws(() =>
    buildDeliveryCoverPackage({
      ...packageArtifact,
      compositions: [
        { ...packageArtifact.compositions[0], width: 1200 },
        packageArtifact.compositions[1],
      ],
    }),
  );
  assert.throws(() =>
    buildDeliveryCoverPackage({
      ...packageArtifact,
      sourceFiles: packageArtifact.sourceFiles.map((file, index) =>
        index === 1 ? { ...file, checksum: packageArtifact.sourceFiles[0].checksum } : file,
      ),
    }),
  );
});

test("delivery v2 identity binds PublishingIntent Cover result and fixed archive policy", () => {
  const intent = buildPublishingIntent({ story, authored: authoredIntent() });
  const specification = createDeliverySpecificationV2({
    storyId: story.storyId,
    compositionId: "DeliveryV2Proof",
    publishingIntentFingerprint: intent.intentFingerprint,
    coverResultFingerprint: sha("c"),
  });
  const release = createDeliveryReleaseIdV2({
    approvalFingerprint: sha("d"),
    finalAssemblyFingerprint: sha("e"),
    deliverySpecificationFingerprint: specification.deliverySpecificationFingerprint,
  });
  assert.match(release, /^release-[0-9a-f]{64}$/u);
  assert.notEqual(
    release,
    createDeliveryReleaseIdV2({
      approvalFingerprint: sha("d"),
      finalAssemblyFingerprint: sha("e"),
      deliverySpecificationFingerprint: createDeliverySpecificationV2({
        storyId: story.storyId,
        compositionId: "DeliveryV2Proof",
        publishingIntentFingerprint: intent.intentFingerprint,
        coverResultFingerprint: sha("f"),
      }).deliverySpecificationFingerprint,
    }),
  );
});
