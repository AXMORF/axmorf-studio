import type { SceneTemplateId } from "./catalog";
import { Sha256DigestSchema, type Sha256Digest } from "../../../contracts";

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
    title: string;
    description: string;
    durationInSeconds: number;
    checksum: Sha256Digest;
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

const BRAND_REVEAL: SceneTemplateDefinition = {
  templateId: "axmorf-brand-reveal-v1",
  durationInFrames: 60,
  narrativePurpose: "Render the configured opening Scene before content.",
  visualIntent:
    "Reveal the AXMORF mark and wordmark as a concise configured Scene.",
  soundIntent: "Play only the copied AXMORF reveal chime as Scene-local SFX.",
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
  assets: [
    {
      assetKey: "chime",
      sourcePath:
        "public/assets/library/scene-templates/axmorf-brand-reveal-chime.wav",
      destinationName: "axmorf-brand-reveal-chime.wav",
      title: "AXMORF brand reveal chime",
      description: "Copied Scene-local PCM chime for the AXMORF reveal.",
      durationInSeconds: 0.6,
      checksum: Sha256DigestSchema.parse(
        "sha256:739069dd51389ebac5704cdcd4b16ef43abc458a268931ab5817b834c1f2c475",
      ),
    },
  ],
  soundCues: [
    {
      cueId: "reveal-chime",
      assetKey: "chime",
      anchorId: "brand-reveal-start",
      offsetFrames: 0,
      durationInFrames: 18,
      volume: 0.82,
    },
  ],
  orderedShotIds: ["brand-reveal"],
  anchors: [
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
  soundIntent: "Play only the copied AXMORF resolve chime as Scene-local SFX.",
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
  assets: [
    {
      assetKey: "chime",
      sourcePath:
        "public/assets/library/scene-templates/axmorf-source-follow-chime.wav",
      destinationName: "axmorf-source-follow-chime.wav",
      title: "AXMORF source follow chime",
      description: "Copied Scene-local PCM chime for the AXMORF resolve.",
      durationInSeconds: 1,
      checksum: Sha256DigestSchema.parse(
        "sha256:7140b3c599b3656e5c3ee26c9c127a5d6a8deb26a336c67574114e4fdbe355b0",
      ),
    },
  ],
  soundCues: [
    {
      cueId: "resolve-chime",
      assetKey: "chime",
      anchorId: "brand-lockup-start",
      offsetFrames: 0,
      durationInFrames: 30,
      volume: 0.82,
    },
  ],
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
