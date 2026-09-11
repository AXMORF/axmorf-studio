import {
  ProducerAssetManifestSchema,
  type ResourceAssetDescriptor,
} from "../../../contracts";
import packageAssetManifest from "../../catalog/assets.manifest.json";
import type { SceneTemplateId } from "./catalog";
import {
  SceneTemplateAudioProjectionSchema,
  type SceneTemplateAudioProjection,
} from "./template-audio";

const packagedAssets =
  ProducerAssetManifestSchema.parse(packageAssetManifest).assets;

const packagedAudioAsset = ({
  id,
  mediaRole,
  minimumDurationInSeconds,
}: {
  readonly id: string;
  readonly mediaRole: "sound-effect" | "background-music";
  readonly minimumDurationInSeconds: number;
}) => {
  const descriptor = packagedAssets.find((asset) => asset.id === id);
  if (
    descriptor === undefined ||
    descriptor.assetKind !== "audio" ||
    descriptor.mediaRole !== mediaRole ||
    descriptor.allowedUse !== "runtime-approved" ||
    descriptor.media?.durationInSeconds === undefined ||
    descriptor.media.durationInSeconds < minimumDurationInSeconds ||
    !descriptor.localPath.startsWith("public/assets/axmorf-shared/")
  ) {
    throw new Error(`Packaged Scene template audio is invalid: ${id}.`);
  }
  return descriptor;
};

const packagedIntroAudio = packagedAudioAsset({
  id: "asset.mixkit.movie-trailer-epic-impact-2908-intro-2s",
  mediaRole: "sound-effect",
  minimumDurationInSeconds: 2,
});
const packagedOutroAudio = packagedAudioAsset({
  id: "asset.mixkit.deep-urban-623-outro-8s",
  mediaRole: "background-music",
  minimumDurationInSeconds: 8,
});

export const DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION =
  SceneTemplateAudioProjectionSchema.parse({
    schemaVersion: 1,
    intro: {
      source: packagedIntroAudio,
      targetMediaRole: "sound-effect",
      destinationName: "mixkit-movie-trailer-epic-impact-2908-intro-2s.wav",
      soundCues: [
        {
          cueId: "reveal-impact",
          anchorId: "intro-sound-start",
          offsetFrames: 0,
          durationInFrames: 60,
          volume: 0.82,
        },
      ],
    },
    outro: {
      source: packagedOutroAudio,
      targetMediaRole: "background-music",
      destinationName: "mixkit-deep-urban-623-outro-8s.mp3",
      soundCues: [
        {
          cueId: "closing-music",
          anchorId: "closing-music-start",
          offsetFrames: 0,
          durationInFrames: 240,
          volume: 1,
        },
      ],
    },
  });

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
    targetMediaRole: "sound-effect" | "background-music";
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

const brandReveal = (
  audioProjection: SceneTemplateAudioProjection,
): SceneTemplateDefinition => ({
  templateId: "axmorf-brand-reveal-v1",
  durationInFrames: 60,
  narrativePurpose: "Render the configured opening Scene before content.",
  visualIntent:
    "Reveal the AXMORF mark and wordmark as a concise configured Scene.",
  soundIntent:
    audioProjection.intro === null
      ? "Render without a sound-effect contribution."
      : "Play only the configured opening Scene sound cues.",
  componentName: "AxmorfIntroScene",
  sourceReferencesProp: false,
  sourceFiles: [
    {
      sourcePath: "axmorf/AxmorfBrand.tsx",
      destinationName: "AxmorfBrand.tsx",
    },
    {
      sourcePath: "axmorf/AxmorfIntroScene.tsx",
      destinationName: "AxmorfIntroScene.tsx",
    },
  ],
  assets: audioAssets(audioProjection.intro),
  soundCues: audioCues(audioProjection.intro),
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
      "Validated Project theme colors with fixed brand typography and geometry.",
      "Frame-driven blur, scale, and guide-line reveal.",
    ],
    continuity: "Finish on a stable transparent frame.",
    fallbackIntent: "Fail closed rather than alter the copied Scene.",
  },
});

const sourceFollow = (
  audioProjection: SceneTemplateAudioProjection,
): SceneTemplateDefinition => ({
  templateId: "axmorf-source-follow-v1",
  durationInFrames: 240,
  narrativePurpose: "Render the configured closing Scene after content.",
  visualIntent: "Show source credits then resolve to the AXMORF follow lockup.",
  soundIntent:
    audioProjection.outro === null
      ? "Render without a sound-effect contribution."
      : "Play only the configured closing Scene sound cues.",
  componentName: "AxmorfOutroScene",
  sourceReferencesProp: true,
  sourceFiles: [
    {
      sourcePath: "axmorf/AxmorfBrand.tsx",
      destinationName: "AxmorfBrand.tsx",
    },
    {
      sourcePath: "axmorf/AxmorfOutroScene.tsx",
      destinationName: "AxmorfOutroScene.tsx",
    },
    {
      sourcePath: "axmorf/BrandFollowScene.tsx",
      destinationName: "BrandFollowScene.tsx",
    },
    {
      sourcePath: "axmorf/SourceCreditsScene.tsx",
      destinationName: "SourceCreditsScene.tsx",
    },
    {
      sourcePath: "axmorf/content.ts",
      destinationName: "content.ts",
    },
    {
      sourcePath: "axmorf/NOTICE.md",
      destinationName: "NOTICE.md",
    },
  ],
  assets: audioAssets(audioProjection.outro),
  soundCues: audioCues(audioProjection.outro),
  orderedShotIds: ["source-credits", "brand-follow"],
  anchors: [
    {
      eventId: "closing-music-start",
      sceneLocalFrame: 0,
      purpose: "Start the configured closing music at the Scene boundary.",
    },
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
      "Transparent source cards with validated Project theme colors and fixed typography.",
      "Frame-driven brand shrink, wordmark reveal, cursor, and confirmation.",
    ],
    continuity: "Resolve on a stable transparent frame.",
    fallbackIntent: "Fail closed rather than alter the copied Scene.",
  },
});

export const buildSceneTemplateDefinitions = (rawProjection: unknown) => {
  const audioProjection =
    SceneTemplateAudioProjectionSchema.parse(rawProjection);
  return [brandReveal(audioProjection), sourceFollow(audioProjection)] as const;
};

export const SCENE_TEMPLATE_DEFINITIONS = buildSceneTemplateDefinitions(
  DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
);

export const getSceneTemplateDefinition = (
  templateId: string,
  audioProjection: unknown = DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
) => {
  const definition = buildSceneTemplateDefinitions(audioProjection).find(
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
  const sourceReferencesBinding = definition.sourceReferencesProp
    ? ", sourceReferences"
    : "";
  const sourceReferencesProp = definition.sourceReferencesProp
    ? " sourceReferences={sourceReferences}"
    : "";
  return `import type {VisualTheme} from "@axmorf/studio/contracts";\nimport {${definition.componentName}} from "./${definition.componentName}";\n\ntype RendererProps = Readonly<{\n  sceneFrame: number;\n  viewportWidth: number;\n  viewportHeight: number;\n  visualStyle: Readonly<{theme?: VisualTheme}>;\n  sourceReferences: readonly Readonly<{title: string; url: string}>[];\n}>;\n\nconst Renderer = ({sceneFrame, viewportWidth, viewportHeight, visualStyle${sourceReferencesBinding}}: RendererProps) => {\n  const theme = visualStyle.theme;\n  if (theme === undefined) {\n    throw new Error("Configured Scene template requires the Project visual theme.");\n  }\n  return (\n    <${definition.componentName} sceneFrame={sceneFrame} width={viewportWidth} height={viewportHeight} theme={theme}${sourceReferencesProp} />\n  );\n};\n\nexport default Renderer;\n`;
};
