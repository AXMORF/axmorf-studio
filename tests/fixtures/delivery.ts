import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  FINAL_MECHANICAL_CHECK_V2_IDS,
  createFinalAssemblyPlan,
  createFinalMechanicalCheckV2Report,
  createFinalPreviewApproval,
  createFinalPreviewEvidence,
  buildPublishingIntent,
} from "../../src/contracts";

const sha = (value: string) => `sha256:${value.repeat(64)}`;
const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const createDeliveryProjectFixture = async (rootDir: string) => {
  const storyId = "delivery-proof";
  const compositionId = "DeliveryProof";
  const projectRoot = join(rootDir, "src/projects", storyId);
  const previewRelativePath = "out/delivery-proof/final-preview.mp4";
  const previewBytes = new TextEncoder().encode("approved-preview-bytes");
  const previewChecksum = checksum(previewBytes);
  await mkdir(join(rootDir, "out/delivery-proof"), { recursive: true });
  await writeFile(join(rootDir, previewRelativePath), previewBytes);
  await mkdir(join(projectRoot, "delivery"), { recursive: true });
  await writeFile(
    join(projectRoot, "delivery/Covers.tsx"),
    "export const Covers = true;\n",
  );
  await writeFile(
    join(projectRoot, "delivery/Root.tsx"),
    "export const Root = true;\n",
  );
  await writeFile(join(projectRoot, "delivery/index.ts"), "export {};\n");

  const story = {
    schemaVersion: 1 as const,
    storyId,
    title: "可验证的视频交付",
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
    storyId,
    styleProfileId: "comic-editorial",
    resourceCatalogFingerprint: sha("6"),
    artDirection: {
      medium: "纯代码漫画图形",
      palette: "暖黄深蓝",
      lighting: "平面高对比",
      texture: "代码网点",
      compositionGrammar: "大标题图形叙事",
      motionLanguage: "静态封面",
      typography: "粗体中文",
    },
    continuityRules: ["保持编辑漫画语言"],
    forbiddenTreatments: ["禁止图片"],
  };
  const semanticTiming = {
    schemaVersion: 1 as const,
    algorithmId: "pcm-cumulative-ceil-v1" as const,
    storyId,
    fingerprint: sha("4"),
    sampleRate: 48_000,
    fps: 30,
    leadInFrames: 0,
    tailFrames: 0,
    durationInFrames: 120,
    segments: [
      {
        kind: "chunk" as const,
        chunkId: "problem-1",
        meaningId: "problem",
        ttsText: "先看问题。",
        sampleRange: { startSampleFrame: 0, endSampleFrame: 96_000 },
        frameRange: { startFrame: 0, endFrame: 60 },
      },
      {
        kind: "chunk" as const,
        chunkId: "solution-1",
        meaningId: "solution",
        ttsText: "再看方案。",
        sampleRange: { startSampleFrame: 96_000, endSampleFrame: 192_000 },
        frameRange: { startFrame: 60, endFrame: 120 },
      },
    ],
    captionCues: [
      {
        chunkId: "problem-1",
        meaningId: "problem",
        text: "先看问题。",
        startFrame: 0,
        endFrame: 60,
      },
      {
        chunkId: "solution-1",
        meaningId: "solution",
        text: "再看方案。",
        startFrame: 60,
        endFrame: 120,
      },
    ],
    storyBeats: [
      { meaningId: "problem", startFrame: 0, endFrame: 60 },
      { meaningId: "solution", startFrame: 60, endFrame: 120 },
    ],
  };
  const publishingIntent = buildPublishingIntent({
    story,
    authored: {
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
        { meaningId: "problem", name: "问题" },
        { meaningId: "solution", name: "生产流程" },
      ],
    },
  });
  await writeJson(join(projectRoot, "story.json"), story);
  await writeJson(join(projectRoot, "visual-style.json"), visualStyle);
  await writeJson(
    join(projectRoot, "generated/semantic-timing.generated.json"),
    semanticTiming,
  );
  await writeJson(
    join(projectRoot, "publishing-intent.json"),
    publishingIntent,
  );
  await mkdir(join(projectRoot, "delivery/cover"), { recursive: true });
  await writeFile(
    join(projectRoot, "delivery/cover/Cover4x3.tsx"),
    `import {AbsoluteFill} from "remotion"; export default function Cover4x3(){return <AbsoluteFill style={{backgroundColor:"#f5c542"}}><div>可验证交付</div></AbsoluteFill>}\n`,
  );
  await writeFile(
    join(projectRoot, "delivery/cover/Cover3x4.tsx"),
    `import {AbsoluteFill} from "remotion"; export default function Cover3x4(){return <AbsoluteFill style={{backgroundColor:"#14213d"}}><div>独立构图</div></AbsoluteFill>}\n`,
  );
  await writeFile(
    join(projectRoot, "delivery/cover/Root.tsx"),
    `import {Composition} from "remotion";\nimport Cover4x3 from "./Cover4x3";\nimport Cover3x4 from "./Cover3x4";\nexport const CoverRoot=()=> <><Composition id="DeliveryProofDeliveryCover4x3V2" component={Cover4x3} width={1600} height={1200} fps={30} durationInFrames={1}/><Composition id="DeliveryProofDeliveryCover3x4V2" component={Cover3x4} width={1200} height={1600} fps={30} durationInFrames={1}/></>;\n`,
  );
  await writeFile(
    join(projectRoot, "delivery/cover/index.ts"),
    `import {registerRoot} from "remotion";\nimport {CoverRoot} from "./Root";\nregisterRoot(CoverRoot);\n`,
  );

  const assembly = createFinalAssemblyPlan({
    schemaVersion: 1,
    planVersion: "final-assembly-plan-v1",
    storyId,
    compositionId,
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 120,
    remotionVersion: "4.0.489",
    narrativeReportFingerprint: sha("1"),
    sealedNarrationChecksum: sha("2"),
    sealedNarrationFingerprint: sha("3"),
    semanticTimingFingerprint: sha("4"),
    captionCuesFingerprint: sha("5"),
    resourceCatalogFingerprint: sha("6"),
    sceneCoverageFingerprint: sha("7"),
    scenePackageFingerprints: [sha("8")],
    rendererRegistryFingerprint: sha("9"),
    storyVisualProjectionFingerprint: sha("a"),
    soundDesignProjectionFingerprint: sha("b"),
    globalSoundPlanFingerprint: sha("c"),
    finalSoundProjectionFingerprint: sha("d"),
    globalVisualPlanFingerprint: sha("e"),
    globalVisualProjectionFingerprint: sha("f"),
    compositionSourceChecksum: sha("0"),
    zOrderVersion: "scene-global-visual-caption-v1",
    mixOrderVersion: "narration-scene-ambience-bgm-v1",
  });
  const evidence = createFinalPreviewEvidence({
    schemaVersion: 1,
    evidenceVersion: "final-preview-evidence-v1",
    storyId,
    compositionId,
    finalAssemblyFingerprint: assembly.finalAssemblyFingerprint,
    resourceCatalogFingerprint: sha("6"),
    reviewFingerprint: sha("1"),
    media: {
      fullPreview: {
        relativePath: previewRelativePath,
        checksum: previewChecksum,
      },
      contactSheet: {
        relativePath: "out/delivery-proof/contact.png",
        checksum: sha("2"),
      },
      representativeStills: [
        {
          frame: 0,
          relativePath: "out/delivery-proof/still.png",
          checksum: sha("3"),
        },
      ],
    },
    technical: {
      videoCodec: "h264",
      width: 1080,
      height: 1920,
      fpsNumerator: 30,
      fpsDenominator: 1,
      frameCount: 120,
      durationSeconds: 4.021333,
      audioCodec: "aac",
      sampleRate: 48000,
      channelLayout: "stereo",
      decodedToEof: true,
      integratedLoudnessLufs: -20,
      truePeakDbtp: -2,
      samplePeakDbfs: -3,
      duckingEvidenceFingerprint: sha("4"),
    },
    aggregateStatus: "ready-for-user-approval",
  });
  const approval = createFinalPreviewApproval({
    schemaVersion: 1,
    approvalVersion: "final-preview-approval-v1",
    storyId,
    compositionId,
    decision: "approved",
    previewChecksum,
    evidenceFingerprint: evidence.evidenceFingerprint,
    finalAssemblyFingerprint: assembly.finalAssemblyFingerprint,
    approvalReference: "user-approved-current-preview",
  });
  const finalReport = createFinalMechanicalCheckV2Report({
    schemaVersion: 2,
    reportVersion: "final-mechanical-check-v2",
    storyId,
    level: "final",
    aggregateStatus: "pass",
    inputIdentity: {
      narrativeReportFingerprint: sha("1"),
      visualStyleFingerprint: sha("2"),
      resourceCatalogFingerprint: sha("3"),
      referenceModes: ["inspiration-only"],
      externalSnapshotFingerprints: [sha("4")],
      fidelityReceiptFingerprints: [],
      sceneCoverageFingerprint: sha("5"),
      scenePackageFingerprints: [sha("6")],
      rendererRegistryFingerprint: sha("7"),
      storyVisualProjectionFingerprint: sha("8"),
      soundDesignProjectionFingerprint: sha("9"),
      compositionAssemblyChecksum: sha("a"),
      globalSoundPlanFingerprint: sha("b"),
      finalSoundProjectionFingerprint: sha("c"),
      globalVisualPlanFingerprint: sha("d"),
      globalVisualProjectionFingerprint: sha("e"),
      finalAssemblyFingerprint: assembly.finalAssemblyFingerprint,
      finalPreviewEvidenceFingerprint: evidence.evidenceFingerprint,
      finalPreviewApprovalFingerprint: approval.approvalFingerprint,
    },
    checks: FINAL_MECHANICAL_CHECK_V2_IDS.map((checkId) => ({
      checkId,
      status: checkId === "reference-fidelity" ? "not-applicable" : "pass",
      failureReasons: [],
    })),
  });

  await writeJson(
    join(projectRoot, "generated/final-assembly.generated.json"),
    assembly,
  );
  await writeJson(
    join(projectRoot, "generated/final-preview-evidence.generated.json"),
    evidence,
  );
  await writeJson(
    join(projectRoot, "generated/final-preview-approval.generated.json"),
    approval,
  );
  await writeJson(
    join(projectRoot, "generated/final-mechanical-check.generated.json"),
    finalReport,
  );
  await writeJson(join(projectRoot, "delivery/delivery-spec.json"), {
    schemaVersion: 1,
    specificationVersion: "delivery-specification-v1",
    verificationPolicyVersion: "delivery-local-verification-v1",
    storyId,
    compositionId,
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
  return {
    storyId,
    compositionId,
    projectRoot,
    previewRelativePath,
    previewChecksum,
    previewBytes,
    assembly,
    evidence,
    approval,
    finalReport,
    story,
    visualStyle,
    semanticTiming,
    publishingIntent,
  } as const;
};
