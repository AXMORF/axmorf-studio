import {
  AUTHORING_REQUIREMENT_EXAMPLE,
  buildDurationBudget,
  ProjectCreateInputSchema,
  StoryIdSchema,
} from "@axmorf/studio/contracts";
import { readGeneratedResourceCatalog } from "../../catalog/project-files";
import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../../config/producer-config";

import { getSceneTemplateDefinition } from "../../../packages/studio/src/remotion/capabilities/scene-templates/registry";

/** Project creation guidance only exposes public authoring choices, never TTS connections. */
export const inspectProjectCreateContext = async ({
  rootDir,
  storyId: rawStoryId,
  env,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const configPath = await resolveProducerConfigPathFromEnvironment({
    rootDir,
    env,
  });
  const [config, catalog] = await Promise.all([
    readProducerConfig({ configPath }),
    readGeneratedResourceCatalog(rootDir),
  ]);
  const styleProfiles = catalog.entries.flatMap(({ descriptor }) =>
    descriptor.kind === "style-profile" && descriptor.status === "approved"
      ? [
          {
            styleProfileId: descriptor.styleProfileId,
            title: descriptor.title,
            description: descriptor.description,
          },
        ]
      : [],
  );
  const capabilities = catalog.entries.filter(
    ({ descriptor }) =>
      descriptor.kind === "capability" &&
      descriptor.status === "approved" &&
      descriptor.allowedUse === "runtime-approved",
  );
  const exampleResources = capabilities
    .filter(({ descriptor }) => descriptor.id === "capability.camera")
    .map(({ descriptor }) => descriptor.id);
  const style =
    styleProfiles.find(
      ({ styleProfileId }) => styleProfileId === "editorial-tech",
    ) ?? styleProfiles[0];
  const collection = config.publishingCollections[0];
  if (style === undefined || collection === undefined) {
    throw new Error(
      "Project creation requires a registered style profile and publishing collection. Run npm run doctor.",
    );
  }
  const title = "把复杂问题拆成下一步";
  const example = ProjectCreateInputSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-create-input-v1",
    storyId,
    brief: {
      schemaVersion: 1,
      storyId,
      title,
      sourceMaterial: "说明把一个复杂目标拆成今天可以完成的小步骤。",
      sourceReferences: [],
      audience: "希望开始行动的普通观众",

      targetDurationSeconds: 30,
      deliveryConstraints: ["旁白简洁；结尾给出具体行动。"],
    },
    story: {
      schemaVersion: 3,
      storyId,
      title,
      beats: [
        {
          kind: "narrated-scene",
          meaningId: "stuck-goal",
          narrativePurpose: "让观众看见目标过大造成的停滞。",
          ttsChunks: [
            {
              chunkId: "stuck-goal-01",
              ttsText: "目标太大，眼前全是路线，却不知道从哪走。",
            },
          ],
          explicitPauses: [],
        },
        {
          kind: "narrated-scene",
          meaningId: "next-step",
          narrativePurpose: "用一个清晰的小步骤代替模糊的大目标。",
          ttsChunks: [
            {
              chunkId: "next-step-01",
              ttsText: "先选今天能走的一小步，迈出去，下一步才会出现。",
            },
          ],
          explicitPauses: [],
        },
      ],
    },
    visualStyle: {
      styleProfileId: style.styleProfileId,
      theme: "dark",
      artDirection: {
        medium: "带纸张肌理的二维路径地图",
        palette: "遵循 theme 的深色背景、浅色纸纹与暖色路径强调",
        lighting: "柔和侧光突出纸张层次",
        texture: "细纸纹与清晰的路径边缘",
        compositionGrammar:
          "先用交错路线制造阻力，再聚焦一段可走的路径；为字幕留出净空",
        motionLanguage: "纠缠的线停住，一条线被抽出并向前延伸；变化对齐旁白",
        typography: "克制的大号无衬线字，画面不复述旁白",
      },
      continuityRules: ["光点与纸张地图贯穿两段，暖色强调只标记找到的那一步。"],
      forbiddenTreatments: ["不要用与行动无关的漂浮粒子或抽象圆形填充画面。"],
    },
    resources: { allowedResourceIds: exampleResources, allowedSnapshots: [] },
    scenes: [
      {
        meaningId: "stuck-goal",
        visualIntent: "一团交错路线把光点困在中心，每个路口都通向新的分叉。",
        compositionIntent:
          "从密集路线的全景推近被困住的光点，让未被找到的出口保持在画外。",
        motionIntent:
          "路线从四周逐渐收紧，光点两次试探后回到原地；在旁白说到不知道时短暂停住。",
        soundIntent: "旁白为主。",
        continuityBrief:
          "被困住的光点在下一 Scene 延续；纸张和线条尺度保持一致，橙红路线到下一段才显现。",
        candidateResourceIds: exampleResources,
        allowedSnapshotCards: [],
      },
      {
        meaningId: "next-step",
        visualIntent:
          "上一 Scene 中被困的光点看见一小段橙红路线，找到今天可以走的一步。",
        compositionIntent:
          "从同一光点和路口承接上一 Scene，推近唯一可走的线段，结尾留出清晰的前进方向。",
        motionIntent:
          "旁白说到一小步时橙红线从乱线中抽出，光点沿线前进并停在第一个节点。",
        soundIntent: "旁白为主。",
        continuityBrief:
          "延续上一 Scene 的光点和纸张地图，橙红路径突出后其他路线退为背景。",
        candidateResourceIds: exampleResources,
        allowedSnapshotCards: [],
      },
    ],
    globalVisual: {
      visualIntent: [
        {
          intentId: "clear-background",
          description: "克制的深色背景，保持内容清晰。",
          appliesTo: "full-composition",
        },
      ],
    },
    render: {
      compositionId: storyId
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(""),
      leadInFrames: 0,
      tailFrames: 0,
      audioChannels: 2,
    },
    publishing: {
      description: "从今天能完成的一小步开始行动。",
      topics: ["行动", "目标", "习惯", "成长", "计划", "效率"],
      collectionId: collection.id,
      chapters: [
        { meaningId: "stuck-goal", name: "目标太大" },
        { meaningId: "next-step", name: "找到下一步" },
      ],
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
  });
  const durationBudget = buildDurationBudget({
    targetDurationSeconds: example.brief.targetDurationSeconds,
    fps: config.renderDefaults.fps,
    boundaryFrames: [
      config.sceneDefaults.introSceneTemplateId,
      config.sceneDefaults.outroSceneTemplateId,
    ].reduce(
      (frames, id) =>
        frames +
        (id === null ? 0 : getSceneTemplateDefinition(id).durationInFrames),
      0,
    ),
    leadInFrames: example.render.leadInFrames,
    tailFrames: example.render.tailFrames,
  });
  return {
    status: "project-create-context" as const,
    storyId,
    renderDefaults: config.renderDefaults,
    inheritedSceneTemplates: config.sceneDefaults,
    durationBudget,
    agentHandoff: {
      nextAction: "report-to-user-before-project-create",
      summary: `Render defaults: ${config.renderDefaults.width}x${config.renderDefaults.height}, ${config.renderDefaults.fps}fps, ${config.renderDefaults.locale}; boundary templates: intro=${config.sceneDefaults.introSceneTemplateId ?? "none"}, outro=${config.sceneDefaults.outroSceneTemplateId ?? "none"}; exampleTarget=${durationBudget.targetTotalSeconds}s, boundary=${durationBudget.boundarySeconds}s, availableNarrated=${durationBudget.availableNarratedSeconds}s.`,
      instruction:
        "Adapt the example to the user's target. Put explicit size/orientation, frame-rate and locale requests in render.width/render.height/render.fps/render.locale; omit unspecified fields to inherit renderDefaults. A textual requirement alone does not override dimensions. Use fieldExamples.render for a landscape example, not as an unconditional default. Do not change saved settings for this one Project. Recalculate speech budget with the chosen fps, boundaries and lead/tail. Before running project:create, report the resolved dimensions/fps/locale, selected boundaries and adapted total-duration budget in an intermediate progress message, not a final answer. Then continue tool execution in the same turn: write the adapted input and run nextCommand. Do not stop after the report or wait for a user reply unless a material brief conflict or actual blocker prevents creation. The example target is not the user's target. CLI output is not that report; existing video authorization needs no new confirmation. This handoff is diagnostic only.",
    },
    publishingCollections: config.publishingCollections.map(({ id, name }) => ({
      id,
      name,
    })),
    styleProfiles,
    capabilities,
    example,
    fieldExamples: {
      render: { ...example.render, width: 1920, height: 1080 },
      "production.additionalRequirements": [AUTHORING_REQUIREMENT_EXAMPLE],
    },
    guidance: [
      "Adapt example to the requested brief; do not submit it unchanged as the user's video.",
      "Evaluate current capabilities and their authoring guides before choosing self-authored implementations. Match the story's camera, data, typography, media and motion needs to concrete APIs; put selected capability IDs in the Story pool and each relevant Scene candidateResourceIds. Empty selections remain valid when no capability fits; describe the reason in the visual intent.",
      "Resolve each render field from the explicit user request first, otherwise renderDefaults. Convert an orientation/aspect-ratio request to concrete width and height in render; do not leave it only in brief.deliveryConstraints or production.additionalRequirements. Unspecified fields stay omitted, and saved settings remain unchanged. Verify the returned frozen render against the request before production.",
      "The example's paper map and light point are illustrative. Choose a different subject and visual metaphor when the user's story calls for one; do not repeat the example's motif across unrelated videos.",
      "production.additionalRequirements is an array of objects, never strings. Keep [] when no additional requirement is needed; otherwise adapt fieldExamples to the user's requirement, preserving every required field.",
      "durationBudget describes this example with inherited boundary templates. Recalculate available narration time when changing the requested total duration, render lead/tail or selected boundaries; include speech and pauses in that budget.",
      "Omit sceneTemplates to inherit settings. Set both fields explicitly only when the user selected or disabled boundary Scenes.",
      "Keep Story beats, scenes and publishing chapters in the same meaningId order; each ttsChunk is an object with chunkId and ttsText.",
      "For each narrated Scene, turn narrativePurpose into a visible subject, an observable change and a resulting state. Make the scene's compositionIntent and motionIntent describe what the viewer sees at the relevant narration cue; avoid generic diagrams, decorative motion and text that merely repeats the narration.",
      "The JSON Schema describes shape; project:create also validates cross-field semantics, caption budget and current Catalog choices.",
    ],
    nextCommand: `npm run project:create -- --project ${storyId} --input inputs/${storyId}.json`,
  };
};
