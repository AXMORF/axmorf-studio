import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  createFingerprint,
  type ResourceCatalog,
  type SceneAssignment,
  type SelectedResourceRef,
  type Sha256Digest,
} from "../../../src/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "../../external-references/project-files";
import {
  writeOrCheckSceneArtifact,
  writeOrCheckSceneText,
  type SceneArtifactMode,
} from "../../scene-package/project-files";

type ReusableDefinition = Readonly<{
  implementationId: "axmorf-brand-intro-v1" | "axmorf-source-follow-outro-v1";
  componentName: "AxmorfIntroScene" | "AxmorfOutroScene";
  componentPath: string;
  sourcePaths: readonly string[];
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

const INTRO_DEFINITION: ReusableDefinition = {
  implementationId: "axmorf-brand-intro-v1",
  componentName: "AxmorfIntroScene",
  componentPath:
    "src/remotion/capabilities/story-bookends/AxmorfIntroScene.tsx",
  sourcePaths: [
    "src/remotion/capabilities/story-bookends/AxmorfBrand.tsx",
    "src/remotion/capabilities/story-bookends/AxmorfIntroScene.tsx",
  ],
  orderedShotIds: ["brand-reveal"],
  anchors: [
    {
      eventId: "brand-reveal-start",
      sceneLocalFrame: 6,
      purpose: "Start the fixed AXMORF mark and wordmark reveal.",
    },
  ],
  shots: [
    {
      shotId: "brand-reveal",
      order: 0,
      primaryRange: { startFrame: 0, endFrame: 60 },
      purpose: "Open with the reusable AXMORF brand reveal.",
      action: "Construction guides resolve into the AXMORF mark and wordmark.",
      syncAnchorIds: ["brand-reveal-start"],
    },
  ],
  visual: {
    semanticObjective: "Identify AXMORF before narrated content begins.",
    subject: "The AXMORF mark and wordmark.",
    primaryAction: "The brand mark assembles and the wordmark resolves.",
    causalLink: "Construction guides trigger the final brand lockup.",
    primaryComposition:
      "A centered brand lockup with restrained construction guides.",
    styleRealization: [
      "Warm editorial neutrals with a muted bronze accent.",
      "Frame-driven blur, scale, and guide-line reveal.",
    ],
    continuity:
      "Finish on a stable transparent frame for the first content Scene.",
    fallbackIntent:
      "Fail closed rather than replace the approved brand reveal.",
  },
};

const OUTRO_DEFINITION: ReusableDefinition = {
  implementationId: "axmorf-source-follow-outro-v1",
  componentName: "AxmorfOutroScene",
  componentPath:
    "src/remotion/capabilities/story-bookends/AxmorfOutroScene.tsx",
  sourcePaths: [
    "src/remotion/capabilities/story-bookends/AxmorfBrand.tsx",
    "src/remotion/capabilities/story-bookends/AxmorfOutroScene.tsx",
    "src/remotion/capabilities/story-bookends/BrandFollowScene.tsx",
    "src/remotion/capabilities/story-bookends/SourceCreditsScene.tsx",
    "src/remotion/capabilities/story-bookends/content.ts",
  ],
  orderedShotIds: ["source-credits", "brand-follow"],
  anchors: [
    {
      eventId: "brand-lockup-start",
      sceneLocalFrame: 120,
      purpose: "Hand source credits to the fixed AXMORF follow lockup.",
    },
  ],
  shots: [
    {
      shotId: "source-credits",
      order: 0,
      primaryRange: { startFrame: 0, endFrame: 120 },
      purpose: "Show the current Story source references.",
      action:
        "The closing statement and source reference cards resolve in order.",
      syncAnchorIds: [],
    },
    {
      shotId: "brand-follow",
      order: 1,
      primaryRange: { startFrame: 120, endFrame: 240 },
      purpose: "Close on the reusable AXMORF follow interaction.",
      action: "The mark shrinks into a lockup and the follow state confirms.",
      syncAnchorIds: ["brand-lockup-start"],
    },
  ],
  visual: {
    semanticObjective:
      "Credit sources and close with the stable AXMORF identity.",
    subject: "Source references followed by the AXMORF follow lockup.",
    primaryAction: "Credits resolve into the brand and follow confirmation.",
    causalLink: "The end of the credits triggers the final brand lockup.",
    primaryComposition:
      "Readable source cards followed by a centered brand interaction.",
    styleRealization: [
      "Warm editorial cards with restrained typography.",
      "Frame-driven brand shrink, wordmark reveal, cursor, and confirmation.",
    ],
    continuity: "Resolve the complete Story on a stable transparent frame.",
    fallbackIntent:
      "Fail closed rather than replace the approved closing design.",
  },
};

const definitions = new Map<string, ReusableDefinition>([
  [INTRO_DEFINITION.implementationId, INTRO_DEFINITION],
  [OUTRO_DEFINITION.implementationId, OUTRO_DEFINITION],
]);

export const computeReusableSilentSceneSourceFingerprint = async ({
  rootDir,
  implementationId,
}: {
  readonly rootDir: string;
  readonly implementationId: string;
}): Promise<Sha256Digest> => {
  const definition = definitions.get(implementationId);
  if (definition === undefined) {
    throw new Error(
      `Reusable silent Scene implementation is unknown: ${implementationId}.`,
    );
  }
  const files = await Promise.all(
    definition.sourcePaths.map(async (sourcePath) => ({
      sourcePath,
      checksum: checksumExternalBytes(
        await readExternalRegularFile(rootDir, sourcePath),
      ),
    })),
  );
  return createFingerprint({
    namespace: "reusable-silent-scene-source",
    version: 1,
    value: { implementationId, files },
  });
};

const renderProjectRenderer = (definition: ReusableDefinition) => {
  const sourceReferencesProp =
    definition.componentName === "AxmorfOutroScene"
      ? " sourceReferences={sourceReferences}"
      : "";
  return `import {${definition.componentName}} from "../../../../remotion/capabilities/story-bookends/${definition.componentName}";\n\ntype RendererProps = Readonly<{\n  sceneFrame: number;\n  width: number;\n  height: number;\n  sourceReferences: readonly Readonly<{title: string; url: string}>[];\n}>;\n\nconst Renderer = ({sceneFrame, width, height, sourceReferences}: RendererProps) => (\n  <${definition.componentName} sceneFrame={sceneFrame} width={width} height={height}${sourceReferencesProp} />\n);\n\nexport default Renderer;\n`;
};

const selectedSfx = ({
  catalog,
  resourceId,
}: {
  readonly catalog: ResourceCatalog;
  readonly resourceId: string;
}) => {
  const entry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === resourceId,
  );
  if (
    entry === undefined ||
    entry.descriptor.kind !== "asset" ||
    entry.descriptor.assetKind !== "audio" ||
    entry.descriptor.mediaRole !== "scene-sfx" ||
    entry.descriptor.allowedUse !== "runtime-approved"
  ) {
    throw new Error(
      `Reusable silent Scene SFX is not runtime-approved: ${resourceId}.`,
    );
  }
  const selected: SelectedResourceRef = {
    schemaVersion: 1,
    resourceId: entry.descriptor.id,
    kind: "asset",
    role: "scene-sfx",
    descriptorFingerprint: entry.descriptorFingerprint,
    catalogFingerprint: catalog.catalogFingerprint,
  };
  return { selected, descriptor: entry.descriptor } as const;
};

const ensurePublicRoot = async ({
  rootDir,
  relativePath,
  mode,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly mode: SceneArtifactMode;
}) => {
  const absolutePath = join(rootDir, relativePath);
  if (mode === "write") await mkdir(absolutePath, { recursive: true });
  const metadata = await lstat(absolutePath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(
      "Reusable silent Scene public root must be a real directory.",
    );
  }
};

export const materializeReusableSilentScenes = async ({
  rootDir,
  assignments,
  catalog,
  mode,
}: {
  readonly rootDir: string;
  readonly assignments: readonly SceneAssignment[];
  readonly catalog: ResourceCatalog;
  readonly mode: SceneArtifactMode;
}) => {
  const meaningIds: string[] = [];
  for (const assignment of assignments) {
    const beat = assignment.taskInput.storyBeat;
    if (
      beat.kind !== "silent-scene" ||
      beat.preset.implementation.kind !== "reusable-scene"
    ) {
      continue;
    }
    const implementation = beat.preset.implementation;
    const definition = definitions.get(implementation.implementationId);
    if (definition === undefined) {
      throw new Error(
        `Reusable silent Scene implementation is unknown: ${implementation.implementationId}.`,
      );
    }
    const currentSourceFingerprint =
      await computeReusableSilentSceneSourceFingerprint({
        rootDir,
        implementationId: implementation.implementationId,
      });
    if (currentSourceFingerprint !== implementation.rendererSourceFingerprint) {
      throw new Error(
        "Reusable silent Scene Renderer source identity is stale.",
      );
    }
    const durationInFrames =
      assignment.taskInput.timingBeat.endFrame -
      assignment.taskInput.timingBeat.startFrame;
    if (
      durationInFrames !== beat.preset.durationInFrames ||
      definition.shots.at(-1)?.primaryRange.endFrame !== durationInFrames
    ) {
      throw new Error(
        "Reusable silent Scene duration does not match its implementation.",
      );
    }
    const taskInputFingerprint = assignment.taskInput.taskInputFingerprint;
    const visual = buildSceneVisualPlan({
      taskInputFingerprint,
      meaningId: assignment.meaningId,
      ...definition.visual,
      orderedShotIds: definition.orderedShotIds,
      visualResourceIds: [],
      recipeDecision: "empty",
    });
    const shots = buildShotPlanSet({
      taskInputFingerprint,
      meaningId: assignment.meaningId,
      sceneDurationInFrames: durationInFrames,
      shots: definition.shots.map((shot) => ({
        ...shot,
        visualResourceIds: [],
      })),
    });
    const anchors = buildSceneSyncAnchors({
      taskInputFingerprint,
      meaningId: assignment.meaningId,
      sceneDurationInFrames: durationInFrames,
      anchors: definition.anchors,
    });
    const selectedResources = [
      ...new Set(implementation.soundCues.map(({ resourceId }) => resourceId)),
    ]
      .map((resourceId) => selectedSfx({ catalog, resourceId }))
      .sort((left, right) =>
        left.selected.resourceId.localeCompare(right.selected.resourceId),
      );
    const selectedById = new Map(
      selectedResources.map((resource) => [
        resource.selected.resourceId,
        resource,
      ]),
    );
    const sound = buildSceneSoundPlan({
      taskInputFingerprint,
      meaningId: assignment.meaningId,
      sceneDurationInFrames: durationInFrames,
      ambience: null,
      cues: implementation.soundCues.map((cue) => {
        const resource = selectedById.get(cue.resourceId);
        if (resource === undefined) {
          throw new Error("Reusable silent Scene sound resource is missing.");
        }
        return {
          cueId: cue.cueId,
          resource: resource.selected,
          timing: {
            kind: "anchor" as const,
            eventId: cue.anchorId,
            offsetFrames: cue.offsetFrames,
          },
          durationInFrames: cue.durationInFrames,
          volume: cue.volume,
        };
      }),
    });
    const selection = buildShotRecipeSelection({
      taskInputFingerprint,
      selections: [],
    });
    const fidelity = buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: "empty",
    });
    const sceneRoot = assignment.taskInput.allowedDirectories.sceneRoot;
    const artifacts: readonly [string, unknown][] = [
      [`${sceneRoot}/task-input.generated.json`, assignment.taskInput],
      [`${sceneRoot}/visual-plan.json`, visual],
      [`${sceneRoot}/shot-plan.json`, shots],
      [`${sceneRoot}/sync-anchors.json`, anchors],
      [`${sceneRoot}/sound-plan.json`, sound],
      [
        `${sceneRoot}/selected-resources.json`,
        { schemaVersion: 1, selectedResources },
      ],
      [`${sceneRoot}/shot-recipe-selection.json`, selection],
      [`${sceneRoot}/generated/reference-fidelity.generated.json`, fidelity],
    ];
    await ensurePublicRoot({
      rootDir,
      relativePath: assignment.taskInput.allowedDirectories.publicAssetRoot,
      mode,
    });
    await writeOrCheckSceneText({
      destination: join(rootDir, sceneRoot, "Renderer.tsx"),
      value: renderProjectRenderer(definition),
      mode,
    });
    for (const [path, value] of artifacts) {
      await writeOrCheckSceneArtifact({
        destination: join(rootDir, path),
        value,
        mode,
      });
    }
    meaningIds.push(assignment.meaningId);
  }
  return meaningIds;
};
