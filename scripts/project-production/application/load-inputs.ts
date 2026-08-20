import { join } from "node:path";

import {
  GlobalVisualBriefSchema,
  NarrationSpecSchema,
  MasteredNarrationManifestSchema,
  AuthoringRequirementsSchema,
  ProjectAssetManifestSchema,
  ProjectSoundPlanSchema,
  PublishingIntentSchema,
  RenderSpecSchema,
  SceneProductionBriefSchema,
  SemanticTimingSchema,
  SealedNarrationManifestSchema,
  StoryIdSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VideoBriefSchema,
  VisualStyleSpecSchema,
  ResourceCatalogSchema,
  buildSceneTaskInputV6,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  computeVisualStyleFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  validateSceneProductionBrief,
  validateStoryResourcePool,
  validateNarrativeArtifactBundle,
} from "../../../src/contracts";
import { generateProjectResourceCatalog } from "../../catalog/generate";
import {
  readRegularJson,
  snapshotPolicyRoots,
  snapshotTaskPolicyFingerprints,
} from "../adapters/project-input-snapshot";

const fingerprint = (namespace: string, value: unknown) =>
  createFingerprint({ namespace, version: 1, value });

export const loadProjectProductionInputs = async ({
  rootDir,
  projectId: rawProjectId,
  catalogMode = "write",
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly catalogMode?: "write" | "check";
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const projectRoot = join(rootDir, "src/projects", projectId);
  const read = (path: string, label: string) =>
    readRegularJson(join(projectRoot, path), label);
  const [
    briefFile,
    storyFile,
    narrationFile,
    renderFile,
    soundFile,
    styleFile,
    publishingFile,
    requirementsFile,
    poolFile,
    sceneBriefFile,
    globalBriefFile,
    assetsFile,
    timingFile,
    sealedFile,
    masteredFile,
    runtimePolicyFingerprint,
    taskPolicyFingerprints,
  ] = await Promise.all([
    read("brief.json", "VideoBrief"),
    read("story.json", "StorySpec"),
    read("narration.json", "NarrationSpec"),
    read("render.json", "RenderSpec"),
    read("sound.json", "ProjectSoundPlan"),
    read("visual-style.json", "VisualStyleSpec"),
    read("publishing-intent.json", "PublishingIntent"),
    read("production/requirements.json", "AuthoringRequirements"),
    read("production/story-resource-pool.json", "StoryResourcePool"),
    read("production/scene-production-brief.json", "SceneProductionBrief"),
    read("production/global-visual-brief.json", "GlobalVisualBrief"),
    read("assets.manifest.json", "ProjectAssetManifest"),
    read("generated/semantic-timing.generated.json", "SemanticTiming"),
    read("generated/sealed-narration.generated.json", "SealedNarration"),
    read("generated/mastered-narration.generated.json", "MasteredNarration"),
    snapshotPolicyRoots({ rootDir }),
    snapshotTaskPolicyFingerprints({ rootDir }),
  ]);
  const brief = VideoBriefSchema.parse(briefFile.raw);
  const story = StorySpecSchema.parse(storyFile.raw);
  const narration = NarrationSpecSchema.parse(narrationFile.raw);
  const render = RenderSpecSchema.parse(renderFile.raw);
  const sound = ProjectSoundPlanSchema.parse(soundFile.raw);
  const visualStyle = VisualStyleSpecSchema.parse(styleFile.raw);
  const publishingIntent = PublishingIntentSchema.parse(publishingFile.raw);
  const requirements = AuthoringRequirementsSchema.parse(requirementsFile.raw);
  const timing = SemanticTimingSchema.parse(timingFile.raw);
  const sealedNarration = SealedNarrationManifestSchema.parse(sealedFile.raw);
  const masteredNarration = MasteredNarrationManifestSchema.parse(
    masteredFile.raw,
  );
  const catalog = ResourceCatalogSchema.parse(
    (
      await generateProjectResourceCatalog({
        rootDir,
        projectId,
        mode: catalogMode,
      })
    ).catalog,
  );
  const styleEntry = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (
    styleEntry === undefined ||
    visualStyle.resourceCatalogFingerprint !== catalog.catalogFingerprint
  )
    throw new Error("VisualStyleSpec is stale against the current Catalog.");
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  const resourcePool = validateStoryResourcePool({
    pool: StoryResourcePoolSchema.parse(poolFile.raw),
    catalog,
    requirementsFingerprint: requirements.requirementsFingerprint,
  });
  const sceneBrief = validateSceneProductionBrief({
    brief: SceneProductionBriefSchema.parse(sceneBriefFile.raw),
    story,
    requirements,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    pool: resourcePool,
  });
  const globalVisualBrief = GlobalVisualBriefSchema.parse(globalBriefFile.raw);
  const assetManifest = ProjectAssetManifestSchema.parse(assetsFile.raw);
  const storyIds = [
    brief.storyId,
    story.storyId,
    sound.storyId,
    visualStyle.storyId,
    publishingIntent.storyId,
    requirements.storyId,
    resourcePool.storyId,
    sceneBrief.storyId,
    assetManifest.projectId,
    timing.storyId,
    sealedNarration.storyId,
    masteredNarration.storyId,
  ];
  if (storyIds.some((id) => id !== projectId))
    throw new Error("Project production inputs are cross-bound.");
  if (
    masteredNarration.sealedNarrationFingerprint !==
    sealedNarration.sealedNarrationFingerprint
  ) {
    throw new Error("Mastered narration is stale against the active seal.");
  }
  validateNarrativeArtifactBundle({
    projectSource: { brief, story, narration, render },
    sealedNarration,
    semanticTiming: timing,
  });
  if (
    story.beats.length !== timing.storyBeats.length ||
    story.beats.some(
      (beat, index) => timing.storyBeats[index]?.meaningId !== beat.meaningId,
    )
  ) {
    throw new Error("Story and SemanticTiming order is stale.");
  }
  const sceneBriefById = new Map(
    sceneBrief.scenes.map((scene) => [scene.meaningId, scene] as const),
  );
  const storyFingerprint = computeStoryFingerprint(story);
  const renderFingerprint = computeRenderSpecFingerprint(render);
  const sceneInputs = story.beats.map((beat, index) => {
    const timingBeat = timing.storyBeats[index];
    const authoredBrief = sceneBriefById.get(beat.meaningId);
    if (timingBeat === undefined || authoredBrief === undefined)
      throw new Error("Scene authoring input is incomplete.");
    const previousBeat = story.beats[index - 1] ?? null;
    const nextBeat = story.beats[index + 1] ?? null;
    const allowedSnapshots = authoredBrief.allowedSnapshotCards.map(
      (selection) => {
        const snapshot = resourcePool.allowedSnapshots.find(
          ({ sourceId }) => sourceId === selection.sourceId,
        );
        if (snapshot === undefined)
          throw new Error(
            "Scene snapshot selection is outside the Story pool.",
          );
        return {
          sourceId: snapshot.sourceId,
          snapshotFingerprint: snapshot.snapshotFingerprint,
          allowedCardIds: selection.cardIds,
        };
      },
    );
    const taskInput = buildSceneTaskInputV6({
      storyId: projectId,
      meaningId: beat.meaningId,
      storyBeat: beat,
      sourceReferences: brief.sourceReferences,
      timingBeat,
      storyFingerprint,
      renderFingerprint,
      visualStyleFingerprint,
      resourceCatalogFingerprint: catalog.catalogFingerprint,
      allowedSnapshots,
      allowedResourceIds: authoredBrief.candidateResourceIds,
      continuity: {
        previousMeaningId: previousBeat?.meaningId ?? null,
        previousSummary: previousBeat?.narrativePurpose ?? null,
        nextMeaningId: nextBeat?.meaningId ?? null,
        nextSummary: nextBeat?.narrativePurpose ?? null,
        continuityBrief: authoredBrief.continuityBrief,
      },
      allowedDirectories: {
        sceneRoot: `src/projects/${projectId}/scenes/${beat.meaningId}`,
        publicAssetRoot: `public/projects/${projectId}/scenes/${beat.meaningId}`,
      },
      readabilityPolicy: requirements.readabilityPolicy,
      sceneCompositionBoundaryVersion:
        requirements.sceneBoundaryOwnership.sceneCompositionBoundaryVersion,
    });
    return {
      meaningId: beat.meaningId,
      beat,
      timingBeat,
      brief: authoredBrief,
      taskInput,
      revisionInput: {
        meaningId: beat.meaningId,
        beatFingerprint: fingerprint("revision-story-beat", beat),
        timingFingerprint: fingerprint("revision-timing-beat", timingBeat),
        readabilityFingerprint:
          requirements.readabilityPolicy.policyFingerprint,
        briefFingerprint: fingerprint("revision-scene-brief", authoredBrief),
        requirementsFingerprint: requirements.requirementsFingerprint,
        resourcePoolFingerprint: resourcePool.poolFingerprint,
        selectedResourcesFingerprint: fingerprint(
          "revision-scene-resources",
          authoredBrief.candidateResourceIds,
        ),
        templateInstanceFingerprint:
          beat.kind === "silent-scene" &&
          beat.preset.implementation.kind === "template-copy"
            ? beat.preset.implementation.instanceFingerprint
            : null,
      },
    } as const;
  });
  const generationFingerprint = fingerprint("revision-narration-generation", {
    story: story.beats.map((beat) =>
      beat.kind === "narrated-scene"
        ? { meaningId: beat.meaningId, ttsChunks: beat.ttsChunks }
        : { meaningId: beat.meaningId, preset: beat.preset.presetFingerprint },
    ),
    narration,
    sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
    completeAudioChecksum: sealedNarration.completeAudio.checksum,
    masteredNarrationFingerprint:
      masteredNarration.masteredNarrationFingerprint,
    masteredAudioChecksum: masteredNarration.outputAudio.checksum,
  });
  return {
    projectId,
    projectRoot,
    brief,
    story,
    narration,
    render,
    sound,
    visualStyle,
    publishingIntent,
    requirements,
    sealedNarration,
    masteredNarration,
    resourcePool,
    sceneBrief,
    globalVisualBrief,
    assetManifest,
    timing,
    catalog,
    visualStyleFingerprint,
    sceneInputs,
    runtimePolicyFingerprint,
    taskPolicyFingerprints,
    fingerprints: {
      story: fingerprint("revision-story", story),
      narration: fingerprint("revision-narration", narration),
      render: fingerprint("revision-render", render),
      visualStyle: fingerprint("revision-visual-style", visualStyle),
      publishingIntent: fingerprint("revision-publishing", publishingIntent),
      sound: fingerprint("revision-sound", sound),
      requirements: requirements.requirementsFingerprint,
      globalVisualBrief: fingerprint(
        "revision-global-visual-brief",
        globalVisualBrief,
      ),
      resourcePool: resourcePool.poolFingerprint,
      assetManifest: assetManifest.manifestFingerprint,
      narrationGeneration: generationFingerprint,
      canonicalInputFingerprint: fingerprint(
        "revision-canonical-inputs",
        serializeCanonicalJson({
          story,
          narration,
          render,
          visualStyle,
          publishingIntent,
        }),
      ),
    },
  } as const;
};
