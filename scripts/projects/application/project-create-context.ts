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
      targetDurationSeconds: 20,
      deliveryConstraints: ["旁白简洁；结尾给出具体行动。"],
    },
    story: {
      schemaVersion: 3,
      storyId,
      title,
      beats: [
        {
          kind: "narrated-scene",
          meaningId: "next-step",
          narrativePurpose: "用一个清晰的小步骤代替模糊的大目标。",
          ttsChunks: [
            {
              chunkId: "next-step-01",
              ttsText: "目标太大时，先找出今天能完成的一小步。",
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
        medium: "二维几何动态图形",
        palette: "遵循 theme 的深色背景、浅色文字和暖色强调色",
        lighting: "均匀平面光线",
        texture: "清晰无噪点",
        compositionGrammar: "一个主要图形和一个视觉焦点",
        motionLanguage: "根据视频帧逐步展开",
        typography: "清晰的大号无衬线字体",
      },
      continuityRules: ["保持同一强调色。"],
      forbiddenTreatments: ["不要装饰性文字或无关图形。"],
    },
    resources: { allowedResourceIds: [], allowedSnapshots: [] },
    scenes: [
      {
        meaningId: "next-step",
        visualIntent: "把一个整体拆成可执行的小步骤。",
        compositionIntent: "使用一个居中的因果示意图。",
        motionIntent: "依次展示整体与下一步。",
        soundIntent: "旁白为主。",
        continuityBrief: "保持几何形状与强调色一致。",
        candidateResourceIds: [],
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
      chapters: [{ meaningId: "next-step", name: "找到下一步" }],
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
    example,
    fieldExamples: {
      render: { ...example.render, width: 1920, height: 1080 },
      "production.additionalRequirements": [AUTHORING_REQUIREMENT_EXAMPLE],
    },
    guidance: [
      "Adapt example to the requested brief; do not submit it unchanged as the user's video.",
      "Resolve each render field from the explicit user request first, otherwise renderDefaults. Convert an orientation/aspect-ratio request to concrete width and height in render; do not leave it only in brief.deliveryConstraints or production.additionalRequirements. Unspecified fields stay omitted, and saved settings remain unchanged. Verify the returned frozen render against the request before production.",
      "production.additionalRequirements is an array of objects, never strings. Keep [] when no additional requirement is needed; otherwise adapt fieldExamples to the user's requirement, preserving every required field.",
      "durationBudget describes this example with inherited boundary templates. Recalculate available narration time when changing the requested total duration, render lead/tail or selected boundaries; include speech and pauses in that budget.",
      "Omit sceneTemplates to inherit settings. Set both fields explicitly only when the user selected or disabled boundary Scenes.",
      "Keep Story beats, scenes and publishing chapters in the same meaningId order; each ttsChunk is an object with chunkId and ttsText.",
      "The JSON Schema describes shape; project:create also validates cross-field semantics, caption budget and current Catalog choices.",
    ],
    nextCommand: `npm run project:create -- --project ${storyId} --input inputs/${storyId}.json`,
  };
};
