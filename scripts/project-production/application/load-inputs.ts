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
  SceneOriginalityBaselineSchema,
  SemanticTimingSchema,
  SealedNarrationManifestSchema,
  StoryIdSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VideoBriefSchema,
  VisualStyleSpecSchema,
  ResourceCatalogSchema,
  buildSceneTaskInputV7,
  buildSceneTaskInputV8,
  resolveStorySceneGroups,
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  buildSceneContinuityContract,
  resolveSceneViewport,
  resolveSceneAvailableResources,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  computeVisualStyleFingerprint,
  computeNoNarrationFingerprint,
  createFingerprint,
  isVisualStory,
  serializeCanonicalJson,
  validateSceneProductionBrief,
  validateStoryResourcePool,
  validateNarrativeArtifactBundle,
} from "@axmorf/studio/contracts";
import { generateProjectResourceCatalog } from "../../catalog/generate";
import { loadScopedProjectCatalogAuthorityDescriptors } from "../../catalog/project-files";
import { readScenePriorSourceIndex } from "../../projects/application/scene-prior-source";
import {
  readRegularJson,
  snapshotPolicyRoots,
  snapshotTaskPolicyFingerprints,
  snapshotWorkspaceConfiguration,
} from "../adapters/project-input-snapshot";
import type { RuntimePolicyManifest } from "../../../packages/studio/src/runtime/policy-manifest";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";

const fingerprint = (namespace: string, value: unknown) =>
  createFingerprint({ namespace, version: 1, value });

export const loadProjectProductionInputs = async ({
  rootDir,
  projectId: rawProjectId,
  runtimePolicyManifest,
  scope: suppliedScope,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runtimePolicyManifest?: RuntimePolicyManifest;
  readonly scope?: ProductionScope;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  if (scope.repositoryRoot !== rootDir || scope.storyId !== projectId) {
    throw new Error("Production input scope is cross-bound.");
  }
  const projectRoot = join(scope.projectSourceRoot, projectId);
  const priorSourceIndex = await readScenePriorSourceIndex({
    rootDir: scope.isolatedRoot,
    storyId: projectId,
  });
  const priorSourceByMeaning = new Map(
    priorSourceIndex?.scenes.map((scene) => [scene.meaningId, scene] as const),
  );
  const read = (path: string, label: string) =>
    readRegularJson(join(projectRoot, path), label);
  const storyFile = await read("story.json", "StorySpec");
  const story = StorySpecSchema.parse(storyFile.raw);
  const authoredFrames = story.timingSource === "authored-frames";
  const [
    briefFile,
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
    originalityBaselineFile,
    runtimePolicyFingerprint,
    taskPolicyFingerprints,
    workspaceConfigurationFingerprint,
  ] = await Promise.all([
    read("brief.json", "VideoBrief"),
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
    authoredFrames
      ? Promise.resolve(null)
      : read("generated/sealed-narration.generated.json", "SealedNarration"),
    authoredFrames
      ? Promise.resolve(null)
      : read(
          "generated/mastered-narration.generated.json",
          "MasteredNarration",
        ),
    read(
      "production/scene-originality-baseline.json",
      "Scene originality baseline",
    ),
    snapshotPolicyRoots({
      rootDir: scope.shared.runtimeRoot,
      runtimePolicyManifest,
    }),
    snapshotTaskPolicyFingerprints({
      rootDir: scope.shared.runtimeRoot,
      runtimePolicyManifest,
    }),
    runtimePolicyManifest === undefined
      ? Promise.resolve(null)
      : snapshotWorkspaceConfiguration({ rootDir: scope.shared.runtimeRoot }),
  ]);
  const brief = VideoBriefSchema.parse(briefFile.raw);
  const visualStory = isVisualStory(story);
  if (
    priorSourceIndex?.scenes.some(
      ({ meaningId }) =>
        !story.beats.some(
          (beat) =>
            beat.meaningId === meaningId &&
            !(
              beat.kind === "silent-scene" &&
              beat.preset.implementation.kind === "template-copy"
            ),
        ),
    )
  )
    throw new Error(
      "Scene prior source index contains an unknown or fixed template Scene.",
    );
  const narration = NarrationSpecSchema.nullable().parse(narrationFile.raw);
  const render = RenderSpecSchema.parse(renderFile.raw);
  const sound = ProjectSoundPlanSchema.parse(soundFile.raw);
  const visualStyle = VisualStyleSpecSchema.parse(styleFile.raw);
  const publishingIntent = PublishingIntentSchema.parse(publishingFile.raw);
  const requirements = AuthoringRequirementsSchema.parse(requirementsFile.raw);
  const timing = SemanticTimingSchema.parse(timingFile.raw);
  const sealedNarration =
    sealedFile === null
      ? null
      : SealedNarrationManifestSchema.nullable().parse(sealedFile.raw);
  const masteredNarration =
    masteredFile === null
      ? null
      : MasteredNarrationManifestSchema.nullable().parse(masteredFile.raw);
  if (visualStory && (sealedNarration !== null || masteredNarration !== null))
    throw new Error("Visual production cannot contain narration artifacts.");
  const originalityBaseline = SceneOriginalityBaselineSchema.parse(
    originalityBaselineFile.raw,
  );
  const catalog = ResourceCatalogSchema.parse(
    (
      await generateProjectResourceCatalog({
        rootDir: scope.isolatedRoot,
        projectId,
        mode: "check",
        ...(scope.kind === "live-project"
          ? {}
          : {
              loadDescriptors: () =>
                loadScopedProjectCatalogAuthorityDescriptors({
                  runtimeRoot: scope.shared.runtimeRoot,
                  projectRoot: scope.isolatedRoot,
                  projectId,
                }),
            }),
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
    ...(sealedNarration === null ? [] : [sealedNarration.storyId]),
    ...(masteredNarration === null ? [] : [masteredNarration.storyId]),
  ];
  if (storyIds.some((id) => id !== projectId))
    throw new Error("Project production inputs are cross-bound.");
  if (originalityBaseline.subjectStoryId !== projectId) {
    throw new Error("Scene originality baseline is cross-bound.");
  }
  if (
    masteredNarration !== null &&
    masteredNarration.sealedNarrationFingerprint !==
      sealedNarration?.sealedNarrationFingerprint
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
  const groups = resolveStorySceneGroups(story);
  const groupedBrief = (group: (typeof groups)[number]) => {
    const first = sceneBriefById.get(group.meaningId)!;
    if (group.beats.length === 1) return first;
    const brief = { ...first };
    delete brief.outgoingHandoff;
    const outgoingHandoff = sceneBriefById.get(
      group.beats.at(-1)!.meaningId,
    )?.outgoingHandoff;
    return {
      ...brief,
      ...(outgoingHandoff === undefined ? {} : { outgoingHandoff }),
    };
  };
  const sceneInputs = groups.map((group, index) => {
    const beat = aggregateSceneStoryBeat(group.beats);
    const meaningIds = group.beats.map((member) => member.meaningId);
    const timingBeat = aggregateSceneTimingBeat(
      timing.storyBeats,
      meaningIds,
      beat,
    );
    const coveredBriefs = group.beats.map(
      (member) => sceneBriefById.get(member.meaningId)!,
    );
    const snapshotCards = new Map<string, Set<string>>();
    for (const item of coveredBriefs)
      for (const selection of item.allowedSnapshotCards) {
        const cards =
          snapshotCards.get(selection.sourceId) ?? new Set<string>();
        selection.cardIds.forEach((id) => cards.add(id));
        snapshotCards.set(selection.sourceId, cards);
      }
    const authoredBrief =
      group.beats.length === 1
        ? groupedBrief(group)
        : {
            ...groupedBrief(group),
            candidateResourceIds: [
              ...new Set(
                coveredBriefs.flatMap((item) => item.candidateResourceIds),
              ),
            ].sort(),
            allowedSnapshotCards: [...snapshotCards].map(
              ([sourceId, cardIds]) => ({
                sourceId: sourceId as "video-shotcraft",
                cardIds: [...cardIds].sort(),
              }),
            ),
          };
    if (timingBeat === undefined || authoredBrief === undefined)
      throw new Error("Scene authoring input is incomplete.");
    const previousGroup = groups[index - 1];
    const nextGroup = groups[index + 1];
    const previousBeat =
      previousGroup === undefined
        ? null
        : aggregateSceneStoryBeat(previousGroup.beats);
    const nextBeat =
      nextGroup === undefined ? null : aggregateSceneStoryBeat(nextGroup.beats);
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
    const buildTask =
      group.beats.length > 1 ? buildSceneTaskInputV8 : buildSceneTaskInputV7;
    const taskInput = buildTask({
      storyId: projectId,
      meaningId: beat.meaningId,
      storyBeat: beat,
      sourceReferences: brief.sourceReferences,
      timingBeat,
      ...(group.beats.length > 1
        ? {
            coveredBeats: group.beats.map((storyBeat) => ({
              storyBeat,
              timingBeat: timing.storyBeats.find(
                (member) => member.meaningId === storyBeat.meaningId,
              )!,
            })),
          }
        : {}),
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
        handoffs: buildSceneContinuityContract({
          storyId: projectId,
          beat,
          brief: authoredBrief,
          previous:
            previousBeat === null
              ? null
              : {
                  beat: previousBeat,
                  brief: groupedBrief(previousGroup!),
                },
          next:
            nextBeat === null
              ? null
              : {
                  beat: nextBeat,
                  brief: groupedBrief(nextGroup!),
                },
        }),
      },
      allowedDirectories: {
        sceneRoot: `src/projects/${projectId}/scenes/${beat.meaningId}`,
        publicAssetRoot: `public/projects/${projectId}/scenes/${beat.meaningId}`,
      },
      sceneRequirements: requirements.additionalRequirements
        .filter(
          (requirement) =>
            requirement.owner === "scene-agent" &&
            (requirement.scope === "all-scenes" ||
              (requirement.scope === "scene" &&
                requirement.targetMeaningIds.some((id) =>
                  meaningIds.includes(id),
                ))),
        )
        .map(({ requirementId, category, statement, severity }) => ({
          requirementId,
          category,
          statement,
          severity,
        })),
      sceneViewport: resolveSceneViewport(requirements.readabilityPolicy),
      sceneCompositionBoundaryVersion:
        requirements.sceneBoundaryOwnership.sceneCompositionBoundaryVersion,
    });
    return {
      meaningId: beat.meaningId,
      beat,
      timingBeat,
      brief: authoredBrief,
      ...(group.beats.length > 1 ? { coveredBriefs } : {}),
      ...(story.filmPlan === undefined ? {} : { filmPlan: story.filmPlan }),
      narrationCues:
        beat.kind === "narrated-scene"
          ? timing.segments.flatMap((segment) =>
              segment.kind === "chunk" && meaningIds.includes(segment.meaningId)
                ? [
                    {
                      chunkId: segment.chunkId,
                      text: segment.ttsText,
                      startFrame:
                        segment.frameRange.startFrame - timingBeat.startFrame,
                      endFrame:
                        segment.frameRange.endFrame - timingBeat.startFrame,
                    },
                  ]
                : [],
            )
          : [],
      taskInput,
      availableResources: resolveSceneAvailableResources(
        catalog,
        taskInput.allowedResourceIds,
      ),
      ...(priorSourceByMeaning.has(beat.meaningId)
        ? { priorSource: priorSourceByMeaning.get(beat.meaningId)! }
        : {}),
      revisionInput: {
        meaningId: beat.meaningId,
        beatFingerprint: fingerprint("revision-story-beat", beat),
        timingFingerprint: fingerprint("revision-timing-beat", timingBeat),
        readabilityFingerprint:
          requirements.readabilityPolicy.policyFingerprint,
        briefFingerprint: fingerprint(
          "revision-scene-brief",
          group.beats.length > 1
            ? { authoredBrief, coveredBriefs }
            : authoredBrief,
        ),
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
  let generationFingerprint;
  if (visualStory) {
    generationFingerprint = computeNoNarrationFingerprint();
  } else if (authoredFrames) {
    generationFingerprint = fingerprint("revision-narration-generation", {
      story: story.beats.map((beat) =>
        beat.kind === "narrated-scene"
          ? { meaningId: beat.meaningId, ttsChunks: beat.ttsChunks }
          : beat.kind === "silent-scene"
            ? {
                meaningId: beat.meaningId,
                preset: beat.preset.presetFingerprint,
              }
            : {
                meaningId: beat.meaningId,
                durationInFrames: beat.durationInFrames,
              },
      ),
      narration,
      sealedNarrationFingerprint:
        sealedNarration?.sealedNarrationFingerprint ?? null,
      completeAudioChecksum: sealedNarration?.completeAudio.checksum ?? null,
      masteredNarrationFingerprint:
        masteredNarration?.masteredNarrationFingerprint ?? null,
      masteredAudioChecksum: masteredNarration?.outputAudio.checksum ?? null,
    });
  } else {
    if (sealedNarration === null || masteredNarration === null) {
      throw new Error("Narrated production inputs require sealed audio.");
    }
    generationFingerprint = fingerprint("revision-narration-generation", {
      story: story.beats.map((beat) => {
        if (beat.kind === "narrated-scene") {
          return { meaningId: beat.meaningId, ttsChunks: beat.ttsChunks };
        }
        if (beat.kind === "silent-scene") {
          return {
            meaningId: beat.meaningId,
            preset: beat.preset.presetFingerprint,
          };
        }
        throw new Error("Narrated production contains visual timing.");
      }),
      narration,
      sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
      completeAudioChecksum: sealedNarration.completeAudio.checksum,
      masteredNarrationFingerprint:
        masteredNarration.masteredNarrationFingerprint,
      masteredAudioChecksum: masteredNarration.outputAudio.checksum,
    });
  }
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
    workspaceConfigurationFingerprint,
    originalityBaseline,
    fingerprints: {
      story: fingerprint("revision-story", story),
      narration: visualStory
        ? computeNoNarrationFingerprint()
        : fingerprint("revision-narration", narration),
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
      originalityBaseline: originalityBaseline.baselineFingerprint,
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
