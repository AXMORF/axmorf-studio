import type { ResourceAssetDescriptor } from "../../../contracts";
import sceneTemplateAudioJson from "../../catalog/scene-template-audio.generated.json";
import type { SceneTemplateId } from "./catalog";
import {
  SceneTemplateAudioProjectionSchema,
  type SceneTemplateAudioProjection,
} from "./template-audio";

export const SCENE_TEMPLATE_AUDIO_PROJECTION =
  SceneTemplateAudioProjectionSchema.parse(sceneTemplateAudioJson);

type TemplateAudioBinding = NonNullable<SceneTemplateAudioProjection["intro"]>;

export type SceneTemplateDefinition = Readonly<{
  templateId: SceneTemplateId;
  durationInFrames: number;
  narrativePurpose: string;
  visualIntent: string;
  soundIntent: string;
  componentName: string;
  sourceFiles: readonly Readonly<{
    sourcePath: string;
    destinationName: string;
  }>[];
  sourceReferencesProp: boolean;
  assets: readonly Readonly<{
    assetKey: string;
    sourcePath: string;
    destinationName: string;
    sourceDescriptor: ResourceAssetDescriptor;
    targetMediaRole: "scene-sfx" | "scene-ambience";
  }>[];
  soundCues: readonly Readonly<{
    cueId: string;
    assetKey: string;
    anchorId: string;
    offsetFrames: number;
    durationInFrames: number;
    volume: number;
  }>[];
  orderedShotIds: readonly string[];
  anchors: readonly Readonly<{
    eventId: string;
    sceneLocalFrame: number;
    purpose: string;
  }>[];
  shots: readonly Readonly<{
    shotId: string;
    order: number;
    primaryRange: Readonly<{ startFrame: number; endFrame: number }>;
    purpose: string;
    action: string;
    syncAnchorIds: readonly string[];
  }>[];
  visual: Readonly<{
    semanticObjective: string;
    subject: string;
    primaryAction: string;
    causalLink: string;
    primaryComposition: string;
    styleRealization: readonly string[];
    continuity: string;
    fallbackIntent: string;
  }>;
}>;

const audioAssets = (binding: TemplateAudioBinding | null) =>
  binding === null
    ? []
    : [
        {
          assetKey: "sound",
          sourcePath: binding.source.localPath,
          destinationName: binding.destinationName,
          sourceDescriptor: binding.source,
          targetMediaRole: binding.targetMediaRole,
        },
      ];

const audioCues = (binding: TemplateAudioBinding | null) =>
  binding?.soundCues.map((cue) => ({ ...cue, assetKey: "sound" })) ?? [];

const BRAND_REVEAL: SceneTemplateDefinition = {
  templateId: "axmorf-brand-reveal-v1",
  durationInFrames: 60,
  narrativePurpose: "Render the configured opening Scene before content.",
  visualIntent:
    "Reveal the AXMORF mark and wordmark as a concise configured Scene.",
  soundIntent:
    SCENE_TEMPLATE_AUDIO_PROJECTION.intro === null
      ? "Render without Scene-local sound."
      : "Play only the configured opening impact from frame zero for the full Scene.",
  componentName: "AxmorfIntroScene",
  sourceReferencesProp: false,
  sourceFiles: [
    {
      sourcePath:
        "src/remotion/capabilities/scenes/templates/axmorf/AxmorfBrand.tsx",
      destinationName: "AxmorfBrand.tsx",
    },
    {
      sourcePath:
        "src/remotion/capabilities/scenes/templates/axmorf/AxmorfIntroScene.tsx",
      destinationName: "AxmorfIntroScene.tsx",
    },
  ],
  assets: audioAssets(SCENE_TEMPLATE_AUDIO_PROJECTION.intro),
  soundCues: audioCues(SCENE_TEMPLATE_AUDIO_PROJECTION.intro),
  orderedShotIds: ["brand-reveal"],
  anchors: [
    {
      eventId: "intro-sound-start",
      sceneLocalFrame: 0,
      purpose: "Start the configured opening sound at the Scene boundary.",
    },
    {
      eventId: "brand-reveal-start",
      sceneLocalFrame: 6,
      purpose: "Start the copied mark and wordmark reveal.",
    },
  ],
  shots: [
    {
      shotId: "brand-reveal",
      order: 0,
      primaryRange: { startFrame: 0, endFrame: 60 },
      purpose: "Reveal the copied brand Scene.",
      action: "Construction guides resolve into the mark and wordmark.",
      syncAnchorIds: ["brand-reveal-start"],
    },
  ],
  visual: {
    semanticObjective: "Identify the configured brand before content begins.",
    subject: "The copied AXMORF mark and wordmark.",
    primaryAction: "The brand mark assembles and the wordmark resolves.",
    causalLink: "Construction guides trigger the final brand lockup.",
    primaryComposition:
      "A centered brand lockup with restrained construction guides.",
    styleRealization: [
      "Warm editorial neutrals with a muted bronze accent.",
      "Frame-driven blur, scale, and guide-line reveal.",
    ],
    continuity: "Finish on a stable transparent frame.",
    fallbackIntent: "Fail closed rather than alter the copied Scene.",
  },
};

const SOURCE_FOLLOW: SceneTemplateDefinition = {
  templateId: "axmorf-source-follow-v1",
  durationInFrames: 240,
  narrativePurpose: "Render the configured closing Scene after content.",
  visualIntent: "Show source credits then resolve to the AXMORF follow lockup.",
  soundIntent:
    SCENE_TEMPLATE_AUDIO_PROJECTION.outro === null
      ? "Render without Scene-local sound."
      : "Play only the configured closing music from frame zero for the full Scene.",
  componentName: "AxmorfOutroScene",
  sourceReferencesProp: true,
  sourceFiles: [
    {
      sourcePath:
        "src/remotion/capabilities/scenes/templates/axmorf/AxmorfBrand.tsx",
      destinationName: "AxmorfBrand.tsx",
    },
    {
      sourcePath:
        "src/remotion/capabilities/scenes/templates/axmorf/AxmorfOutroScene.tsx",
      destinationName: "AxmorfOutroScene.tsx",
    },
    {
      sourcePath:
        "src/remotion/capabilities/scenes/templates/axmorf/BrandFollowScene.tsx",
      destinationName: "BrandFollowScene.tsx",
    },
    {
      sourcePath:
        "src/remotion/capabilities/scenes/templates/axmorf/SourceCreditsScene.tsx",
      destinationName: "SourceCreditsScene.tsx",
    },
    {
      sourcePath:
        "src/remotion/capabilities/scenes/templates/axmorf/content.ts",
      destinationName: "content.ts",
    },
    {
      sourcePath: "src/remotion/capabilities/scenes/templates/axmorf/NOTICE.md",
      destinationName: "NOTICE.md",
    },
  ],
  assets: audioAssets(SCENE_TEMPLATE_AUDIO_PROJECTION.outro),
  soundCues: audioCues(SCENE_TEMPLATE_AUDIO_PROJECTION.outro),
  orderedShotIds: ["source-credits", "brand-follow"],
  anchors: [
    {
      eventId: "brand-lockup-start",
      sceneLocalFrame: 120,
      purpose: "Hand source credits to the copied follow lockup.",
    },
  ],
  shots: [
    {
      shotId: "source-credits",
      order: 0,
      primaryRange: { startFrame: 0, endFrame: 120 },
      purpose: "Show the current Story source references.",
      action: "The closing statement and source cards resolve in order.",
      syncAnchorIds: [],
    },
    {
      shotId: "brand-follow",
      order: 1,
      primaryRange: { startFrame: 120, endFrame: 240 },
      purpose: "Close on the copied brand interaction.",
      action: "The mark resolves into a lockup and follow confirmation.",
      syncAnchorIds: ["brand-lockup-start"],
    },
  ],
  visual: {
    semanticObjective: "Credit sources and close with the configured identity.",
    subject: "Source references followed by the copied follow lockup.",
    primaryAction: "Credits resolve into the brand and follow confirmation.",
    causalLink: "The end of the credits triggers the final brand lockup.",
    primaryComposition:
      "Readable source cards followed by a centered brand interaction.",
    styleRealization: [
      "Warm editorial cards with restrained typography.",
      "Frame-driven brand shrink, wordmark reveal, cursor, and confirmation.",
    ],
    continuity: "Resolve on a stable transparent frame.",
    fallbackIntent: "Fail closed rather than alter the copied Scene.",
  },
};

export const SCENE_TEMPLATE_DEFINITIONS = [
  BRAND_REVEAL,
  SOURCE_FOLLOW,
] as const;

export const getSceneTemplateDefinition = (templateId: string) => {
  const definition = SCENE_TEMPLATE_DEFINITIONS.find(
    (candidate) => candidate.templateId === templateId,
  );
  if (definition === undefined) {
    throw new Error(`Configured Scene template is unknown: ${templateId}.`);
  }
  return definition;
};

export const renderCopiedSceneRenderer = (
  definition: SceneTemplateDefinition,
) => {
  const sourceReferencesProp = definition.sourceReferencesProp
    ? " sourceReferences={sourceReferences}"
    : "";
  return `import {${definition.componentName}} from "./${definition.componentName}";\n\ntype RendererProps = Readonly<{\n  sceneFrame: number;\n  width: number;\n  height: number;\n  sourceReferences: readonly Readonly<{title: string; url: string}>[];\n}>;\n\nconst Renderer = ({sceneFrame, width, height, sourceReferences}: RendererProps) => (\n  <${definition.componentName} sceneFrame={sceneFrame} width={width} height={height}${sourceReferencesProp} />\n);\n\nexport default Renderer;\n`;
};
