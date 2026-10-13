import {
  AuthoringRequirementsSchema,
  NarrationSpecSchema,
  PendingSceneAuthoringSchema,
  ProjectSoundPlanSchema,
  RenderSpecSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VideoBriefSchema,
  VisualStyleSpecSchema,
  buildAuthoringRequirements,
  buildPendingSceneAuthoring,
  buildProjectSoundPlan,
  buildSilentScenePreset,
  buildStoryResourcePool,
  generateVisualSemanticTiming,
  generateAuthoredFrameTiming,
  isSceneOwnerBeat,
  isVisualStory,
  resolveCurrentAuthoringRequirements,
  serializeCanonicalJson,
  validateStoryResourcePool,
  type GeneratedArtworkImportInput,
  type ResourceCatalog,
} from "@axmorf/studio/contracts";
import { join } from "node:path";

import {
  checksumBytes,
  readOptionalFile,
  type AssetImportFile,
} from "../adapters/filesystem";

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

export const admitGeneratedArtwork = async ({
  rootDir,
  projectId,
  input,
  resourceId,
  previousCatalog,
  catalog,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly input: GeneratedArtworkImportInput;
  readonly resourceId: string;
  readonly previousCatalog: ResourceCatalog;
  readonly catalog: ResourceCatalog;
}): Promise<readonly AssetImportFile[]> => {
  const prefix = `src/projects/${projectId}/`;
  const previous = new Map<string, Uint8Array>();
  const read = async (relativePath: string): Promise<unknown> => {
    const bytes = await readOptionalFile(join(rootDir, prefix, relativePath));
    if (bytes === null)
      throw new Error(
        `Generated artwork requires configured Project authoring: ${relativePath}.`,
      );
    previous.set(relativePath, bytes);
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const [
    story,
    pending,
    pool,
    visualStyle,
    sound,
    requirements,
    brief,
    narration,
    render,
  ] = await Promise.all([
    read("story.json").then((value) => StorySpecSchema.parse(value)),
    read("production/pending-scene-production-brief.json").then((value) =>
      PendingSceneAuthoringSchema.parse(value),
    ),
    read("production/story-resource-pool.json").then((value) =>
      StoryResourcePoolSchema.parse(value),
    ),
    read("visual-style.json").then((value) =>
      VisualStyleSpecSchema.parse(value),
    ),
    read("sound.json").then((value) => ProjectSoundPlanSchema.parse(value)),
    read("production/requirements.json").then((value) =>
      AuthoringRequirementsSchema.parse(value),
    ),
    read("brief.json").then((value) => VideoBriefSchema.parse(value)),
    read("narration.json").then((value) =>
      NarrationSpecSchema.nullable().parse(value),
    ),
    read("render.json").then((value) => RenderSpecSchema.parse(value)),
  ]);
  if (
    [
      story.storyId,
      pending.storyId,
      pool.storyId,
      visualStyle.storyId,
      sound.storyId,
      requirements.storyId,
      brief.storyId,
    ].some((id) => id !== projectId)
  )
    throw new Error("Generated artwork authoring is cross-bound.");
  validateStoryResourcePool({
    pool,
    catalog: previousCatalog,
    requirementsFingerprint: requirements.requirementsFingerprint,
  });
  if (
    visualStyle.resourceCatalogFingerprint !==
    previousCatalog.catalogFingerprint
  )
    throw new Error("Project visual style is stale before artwork import.");
  const sourceChecksums = {
    videoBrief: checksumBytes(previous.get("brief.json")!),
    storySpec: checksumBytes(previous.get("story.json")!),
    narrationSpec: checksumBytes(previous.get("narration.json")!),
    renderSpec: checksumBytes(previous.get("render.json")!),
    projectSound: checksumBytes(previous.get("sound.json")!),
  };
  resolveCurrentAuthoringRequirements({
    requirements,
    source: { brief, story, narration, render, projectSound: sound },
    sourceChecksums,
  });
  if (
    pending.scenes.length !== story.beats.length ||
    pending.scenes.some(
      (scene, index) =>
        scene.meaningId !== story.beats[index]?.meaningId ||
        scene.candidateResourceIds.some(
          (id) => !pool.allowedResourceIds.includes(id),
        ),
    )
  )
    throw new Error("Pending Scene authoring is stale before artwork import.");
  const targets = new Set(input.sceneMeaningIds);
  for (const meaningId of targets) {
    const beat = story.beats.find((value) => value.meaningId === meaningId);
    if (beat === undefined || !isSceneOwnerBeat(beat))
      throw new Error(
        `Artwork target must be a current authored Scene beat: ${meaningId}.`,
      );
  }
  for (const [index, beat] of story.beats.entries()) {
    if (
      beat.kind === "silent-scene" &&
      (serializeCanonicalJson(pending.scenes[index]!.candidateResourceIds) !==
        serializeCanonicalJson(beat.preset.resourceIds) ||
        pending.scenes[index]!.visualIntent !== beat.preset.visualIntent ||
        pending.scenes[index]!.soundIntent !== beat.preset.soundIntent)
    )
      throw new Error("Silent Scene authoring is stale before artwork import.");
  }
  const addResource = (ids: readonly string[]) =>
    [...new Set([...ids, resourceId])].sort();
  const updatedStory = StorySpecSchema.parse({
    ...story,
    beats: story.beats.map((beat) =>
      beat.kind !== "silent-scene" || !targets.has(beat.meaningId)
        ? beat
        : {
            ...beat,
            preset: buildSilentScenePreset({
              presetId: beat.preset.presetId,
              durationInFrames: beat.preset.durationInFrames,
              visualIntent: beat.preset.visualIntent,
              soundIntent: beat.preset.soundIntent,
              implementation: beat.preset.implementation,
              resourceIds: addResource(beat.preset.resourceIds),
            }),
          },
    ),
  });
  const soundInput: Record<string, unknown> = { ...sound };
  delete soundInput.soundPlanFingerprint;
  const updatedSound = buildProjectSoundPlan({
    ...soundInput,
    contributions: sound.contributions.map((contribution) => {
      const before = previousCatalog.entries.find(
        ({ descriptor }) => descriptor.id === contribution.resourceId,
      );
      const after = catalog.entries.find(
        ({ descriptor }) => descriptor.id === contribution.resourceId,
      );
      if (
        before?.descriptorFingerprint !== contribution.descriptorFingerprint ||
        after === undefined
      )
        throw new Error(
          "Project sound resource is stale before artwork import.",
        );
      return {
        ...contribution,
        descriptorFingerprint: after.descriptorFingerprint,
      };
    }),
  });
  const output = new Map<string, Uint8Array | string>();
  const put = (path: string, value: unknown) => {
    const before = previous.get(path);
    output.set(
      path,
      before !== undefined &&
        serializeCanonicalJson(JSON.parse(new TextDecoder().decode(before))) ===
          serializeCanonicalJson(value)
        ? before
        : jsonBytes(value),
    );
  };
  put("story.json", updatedStory);
  put("sound.json", updatedSound);
  const bytes = (path: string) => {
    const value = output.get(path)!;
    return typeof value === "string" ? new TextEncoder().encode(value) : value;
  };
  const updatedRequirements = buildAuthoringRequirements({
    source: {
      brief,
      story: updatedStory,
      narration,
      render,
      projectSound: updatedSound,
    },
    sourceChecksums: {
      ...sourceChecksums,
      storySpec: checksumBytes(bytes("story.json")),
      projectSound: checksumBytes(bytes("sound.json")),
    },
    enhancementSelection: requirements.enhancementSelection,
    resourcePolicy: requirements.resourcePolicy,
    additionalRequirements: requirements.additionalRequirements,
    readability: { frozenPolicy: requirements.readabilityPolicy },
  });
  put("production/requirements.json", updatedRequirements);
  const poolInput: Record<string, unknown> = { ...pool };
  delete poolInput.poolFingerprint;
  put(
    "production/story-resource-pool.json",
    buildStoryResourcePool({
      ...poolInput,
      resourceCatalogFingerprint: catalog.catalogFingerprint,
      requirementsFingerprint: updatedRequirements.requirementsFingerprint,
      allowedResourceIds: addResource(pool.allowedResourceIds),
    }),
  );
  put(
    "visual-style.json",
    VisualStyleSpecSchema.parse({
      ...visualStyle,
      resourceCatalogFingerprint: catalog.catalogFingerprint,
    }),
  );
  const pendingInput: Record<string, unknown> = { ...pending };
  delete pendingInput.authoringFingerprint;
  put(
    "production/pending-scene-production-brief.json",
    buildPendingSceneAuthoring({
      ...pendingInput,
      scenes: pending.scenes.map((scene) =>
        targets.has(scene.meaningId)
          ? {
              ...scene,
              candidateResourceIds: addResource(scene.candidateResourceIds),
            }
          : scene,
      ),
    }),
  );
  // Visual timing includes silent preset identity; regenerate its deterministic projection without changing frame boundaries.
  if (
    isVisualStory(updatedStory) ||
    updatedStory.timingSource === "authored-frames"
  ) {
    const path = "generated/semantic-timing.generated.json";
    const before = await readOptionalFile(join(rootDir, prefix, path));
    if (before !== null) {
      previous.set(path, before);
      put(
        path,
        updatedStory.timingSource === "authored-frames"
          ? generateAuthoredFrameTiming({ story: updatedStory, render })
          : generateVisualSemanticTiming({ story: updatedStory, render }),
      );
    }
  }
  return [...output].map(([path, contents]) => ({
    path: `${prefix}${path}`,
    bytes: contents,
    previousBytes: previous.get(path) ?? null,
  }));
};
