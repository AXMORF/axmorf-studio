import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { writeProducerConfig } from "../../scripts/config/producer-config";
import { generateResourceCatalog } from "../../scripts/catalog/generate";
import { generateSceneTemplateAudioProjection } from "../../scripts/scene-templates/audio-projection";
import {
  WORKSPACE_CAPABILITY_FACADE_SOURCE,
  WORKSPACE_REMOTION_FACADE_PATH,
} from "../../packages/studio/src/remotion/catalog/capability-descriptors";
import {
  WORKSPACE_STYLE_FACADE_PATH,
  WORKSPACE_STYLE_FACADE_SOURCE,
} from "../../packages/studio/src/remotion/catalog/style-descriptors";

export const validProjectCreateInput = {
  schemaVersion: 1,
  contractVersion: "project-create-input-v1",
  storyId: "story-example",
  brief: {
    schemaVersion: 1,
    storyId: "story-example",
    title: "A deterministic narration example",
    sourceMaterial: "Explain why measured PCM prevents frame drift.",
    sourceReferences: [],
    audience: "Developers",
    targetDurationSeconds: 10,
    deliveryConstraints: ["Keep the explanation concise."],
  },
  story: {
    schemaVersion: 3,
    storyId: "story-example",
    title: "A deterministic narration example",
    beats: [
      {
        kind: "narrated-scene",
        meaningId: "opening",
        narrativePurpose: "State the timing problem.",
        ttsChunks: [
          { chunkId: "opening-01", ttsText: "Measured audio is authority." },
        ],
        explicitPauses: [],
      },
    ],
  },
  visualStyle: {
    styleProfileId: "cinematic-3d",
    artDirection: {
      medium: "cinematic scientific visualization",
      palette: "deep blue and warm highlights",
      lighting: "high contrast orbital light",
      texture: "clean technical surfaces",
      compositionGrammar: "depth stage",
      motionLanguage: "slow spatial reveal",
      typography: "minimal technical editorial",
    },
    continuityRules: ["Keep direction stable."],
    forbiddenTreatments: ["No decorative HUD."],
  },
  resources: {
    allowedResourceIds: [],
    allowedSnapshots: [],
  },
  scenes: [
    {
      meaningId: "opening",
      visualIntent: "Show measured audio becoming a stable timeline.",
      compositionIntent: "Use one centered causal diagram.",
      motionIntent: "Reveal samples before frames.",
      soundIntent: "Narration only.",
      continuityBrief: "Keep the sample axis stable.",
      candidateResourceIds: [],
      allowedSnapshotCards: [],
    },
  ],
  globalVisual: {
    visualIntent: [
      {
        intentId: "background-depth",
        description: "Use a restrained dark depth field.",
        appliesTo: "full-composition",
      },
    ],
  },
  render: {
    compositionId: "StoryExample",
    leadInFrames: 15,
    tailFrames: 12,
    audioChannels: 2,
  },
  publishing: {
    description: "A publishing description.",
    topics: ["one", "two", "three", "four", "five", "six"],
    collectionId: "ai-workflow",
    chapters: [{ meaningId: "opening", name: "开场" }],
  },
  production: {
    enhancementSelection: {
      storyVisual: "required",
      sound: "allowed",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
  },
  sceneTemplates: {
    introSceneTemplateId: null,
    outroSceneTemplateId: null,
  },
} as const;

export const validProjectCreateProducerConfig = {
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: {
    width: 1080,
    height: 1920,
    fps: 30,
    locale: "zh-CN",
  },
  readability: { edgeInsetPx: 90 },
  sceneDefaults: {
    introSceneTemplateId: null,
    outroSceneTemplateId: null,
  },
  audioDefaults: { globalBgm: null },
  publishingCollections: [
    {
      id: "ai-workflow",
      name: "AI 工作流",
      description: "AI 工具、工作流和系统重构相关的理性观点视频。",
    },
  ],
  tts: {
    defaultProviderId: "local-voxcpm",
    defaultVoiceProfileId: "my-voice",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "local-voxcpm",
        kind: "voxcpm",
        name: "本地 VoxCPM",
        connection: {
          baseUrl: "http://127.0.0.1:9880",
          token: "visible-editable-token",
          timeoutMs: 120_000,
        },
        modelId: "voxcpm-1.5",
        routes: {
          controllableClone: "/clone",
          highFidelityClone: "/clone_with_prompt",
        },
        parameters: {
          cfgValue: 2,
          inferenceTimesteps: 10,
          minLen: 2,
          maxLen: 4096,
          normalize: true,
          denoise: true,
          retryBadcase: true,
          retryBadcaseMaxTimes: 3,
          retryBadcaseRatioThreshold: 6,
        },
        voiceProfiles: [
          {
            id: "my-voice",
            name: "我的声音",
            mode: "controllable-clone",
            referenceAudioPath: "voxcpm/voice_profile/my-voice.wav",
            controlInstruction: "自然、克制、清晰。",
          },
        ],
      },
    ],
  },
} as const;

const repositoryRoot = join(import.meta.dirname, "../..");

export const projectCreateRuntimeResources = {
  sceneTemplatesRoot: join(
    repositoryRoot,
    "packages/studio/src/remotion/capabilities/scene-templates",
  ),
} as const;

export const writeProjectCreateJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeTextFile = async (path: string, source: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source, "utf8");
};

export const prepareProjectCreateFixture = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-create-"));
  await Promise.all([
    writeTextFile(
      join(rootDir, WORKSPACE_REMOTION_FACADE_PATH),
      WORKSPACE_CAPABILITY_FACADE_SOURCE,
    ),
    writeTextFile(
      join(rootDir, WORKSPACE_STYLE_FACADE_PATH),
      WORKSPACE_STYLE_FACADE_SOURCE,
    ),
  ]);
  await cp(
    join(repositoryRoot, "public/assets"),
    join(rootDir, "public/assets"),
    { recursive: true },
  );
  await mkdir(join(rootDir, "src/projects"), { recursive: true });
  await mkdir(join(rootDir, "public/projects"), { recursive: true });
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
  await generateResourceCatalog({ rootDir, mode: "write" });
  const configPath = join(rootDir, "operator/producer.config.json");
  await writeProducerConfig({
    configPath,
    value: validProjectCreateProducerConfig,
  });
  const inputPath = join(rootDir, "inputs/project-create.json");
  await writeProjectCreateJson(inputPath, validProjectCreateInput);
  return {
    rootDir,
    configPath,
    inputPath,
    runtimeResources: projectCreateRuntimeResources,
  } as const;
};
