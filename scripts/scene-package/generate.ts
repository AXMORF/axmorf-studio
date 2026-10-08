import { join } from "node:path";

import {
  ShotPlanSetSchema,
  validateMotionContinuity,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SceneTaskInputSchema,
  SemanticTimingSchema,
  SceneSelectedResourcesFileSchema,
  StorySpecSchema,
  aggregateSceneTimingBeat,
  buildSceneCoverageMap,
  resolveStorySceneGroups,
  serializeCanonicalJson,
  type SceneCoverageMap,
  type ScenePackage,
} from "@axmorf/studio/contracts";
import { collectRendererSourceGraph } from "../renderer-registry/domain";
import { buildScenePackage } from "./domain";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "./project-files";

export { SceneSelectedResourcesFileSchema } from "@axmorf/studio/contracts";

export const parseSceneSelectedResourcesFile = (value: unknown) =>
  SceneSelectedResourcesFileSchema.parse(value);

export const generateScenePackage = async ({
  mode,
  destination,
  input,
}: {
  readonly mode: SceneArtifactMode;
  readonly destination: string;
  readonly input: Parameters<typeof buildScenePackage>[0];
}): Promise<ScenePackage> => {
  const scenePackage = buildScenePackage(input);
  await writeOrCheckSceneArtifact({
    destination,
    value: ScenePackageSchema.parse(scenePackage),
    mode,
  });
  return scenePackage;
};

export const generateSceneCoverage = async ({
  mode,
  destination,
  input,
}: {
  readonly mode: SceneArtifactMode;
  readonly destination: string;
  readonly input: Parameters<typeof buildSceneCoverageMap>[0];
}): Promise<SceneCoverageMap> => {
  const coverage = buildSceneCoverageMap(input);
  await writeOrCheckSceneArtifact({
    destination,
    value: SceneCoverageMapSchema.parse(coverage),
    mode,
  });
  return coverage;
};

export const generateScenePackageFromProjectFiles = async ({
  rootDir,
  projectId,
  meaningId,
  mode,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly meaningId: string;
  readonly mode: SceneArtifactMode;
}) => {
  const sceneRoot = join(
    rootDir,
    "src/projects",
    projectId,
    "scenes",
    meaningId,
  );
  const [
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResourceInput,
    semanticTimingInput,
  ] = await Promise.all([
    readJsonFile(join(sceneRoot, "task-input.generated.json")),
    readJsonFile(join(sceneRoot, "visual-plan.json")),
    readJsonFile(join(sceneRoot, "shot-plan.json")),
    readJsonFile(join(sceneRoot, "sync-anchors.json")),
    readJsonFile(join(sceneRoot, "sound-plan.json")),
    readJsonFile(join(sceneRoot, "shot-recipe-selection.json")),
    readJsonFile(
      join(sceneRoot, "generated/reference-fidelity.generated.json"),
    ),
    readJsonFile(join(sceneRoot, "selected-resources.json")),
    readJsonFile(
      join(
        rootDir,
        "src/projects",
        projectId,
        "generated/semantic-timing.generated.json",
      ),
    ),
  ]);
  const taskRecord = SceneTaskInputSchema.parse(task);
  const semanticTiming = SemanticTimingSchema.parse(semanticTimingInput);
  const members = taskRecord.coveredBeats ?? [
    { storyBeat: taskRecord.storyBeat, timingBeat: taskRecord.timingBeat },
  ];
  const meaningIds = members.map(({ storyBeat }) => storyBeat.meaningId);
  if (
    taskRecord.storyId !== projectId ||
    taskRecord.meaningId !== meaningId ||
    semanticTiming.storyId !== projectId ||
    members.some(({ timingBeat: expected }) => {
      const current = semanticTiming.storyBeats.find(
        (beat) => beat.meaningId === expected.meaningId,
      );
      return (
        current === undefined ||
        serializeCanonicalJson(current) !== serializeCanonicalJson(expected)
      );
    })
  ) {
    throw new Error("Scene package SemanticTiming authority is cross-bound.");
  }
  const timingBeat = aggregateSceneTimingBeat(
    semanticTiming.storyBeats,
    meaningIds,
    taskRecord.storyBeat,
  );
  const ownedMeaningIds = new Set(meaningIds);
  const selectedResources = parseSceneSelectedResourcesFile(
    selectedResourceInput,
  ).selectedResources;
  const rendererSourceFingerprint = (
    await collectRendererSourceGraph({
      rootDir,
      projectId,
      rendererPath: `src/projects/${projectId}/scenes/${meaningId}/Renderer.tsx`,
    })
  ).sourceGraphFingerprint;
  return generateScenePackage({
    mode,
    destination: join(sceneRoot, "generated/scene-package.generated.json"),
    input: {
      narrationCues:
        taskRecord.storyBeat.kind === "narrated-scene"
          ? semanticTiming.captionCues
              .filter((cue) => ownedMeaningIds.has(cue.meaningId))
              .map((cue) => ({
                startFrame: cue.startFrame - timingBeat.startFrame,
                endFrame: cue.endFrame - timingBeat.startFrame,
              }))
          : undefined,
      task,
      visual,
      shots,
      anchors,
      sound,
      selection,
      fidelityReceipt,
      selectedResources,
      rendererBinding: {
        rendererId: `${projectId}-${meaningId}`,
        rendererSourceFingerprint,
      },
      current: {
        timingBeat,
        semanticTimingFingerprint: semanticTiming.fingerprint,
        visualStyleFingerprint: taskRecord.visualStyleFingerprint,
        resourceCatalogFingerprint: taskRecord.resourceCatalogFingerprint,
        snapshotFingerprints: taskRecord.allowedSnapshots.map(
          (snapshot) => snapshot.snapshotFingerprint,
        ),
        rendererSourceFingerprint,
        visualRuntimeVersion: "scene-visual-runtime-v3",
        sceneAudioRuntimeVersion: "scene-audio-runtime-v2",
      },
    },
  });
};

export const generateSceneCoverageFromProjectFiles = async ({
  rootDir,
  projectId,
  mode,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly mode: SceneArtifactMode;
}) => {
  const projectRoot = join(rootDir, "src/projects", projectId);
  const story = StorySpecSchema.parse(
    await readJsonFile(join(projectRoot, "story.json")),
  );
  if (story.storyId !== projectId) {
    throw new Error("Scene coverage Story belongs to another project.");
  }
  const storyBeatOrder = story.beats.map(({ meaningId }) => meaningId);
  const groups = resolveStorySceneGroups(story);
  const packages = [];
  for (const group of groups) {
    const scenePackage = await generateScenePackageFromProjectFiles({
      rootDir,
      projectId,
      meaningId: group.meaningId,
      mode: "check",
    });
    if (
      serializeCanonicalJson(
        scenePackage.coveredMeaningIds ?? [scenePackage.meaningId],
      ) !==
      serializeCanonicalJson(group.beats.map(({ meaningId }) => meaningId))
    )
      throw new Error(
        "Scene package ownership is stale against current Story groups.",
      );
    packages.push(scenePackage);
  }
  const motionPlans = await Promise.all(
    groups.map(
      async ({ meaningId }) =>
        ShotPlanSetSchema.parse(
          await readJsonFile(
            join(projectRoot, "scenes", meaningId, "shot-plan.json"),
          ),
        ).motionPlan,
    ),
  );
  validateMotionContinuity(motionPlans);
  const coverage = await generateSceneCoverage({
    mode,
    destination: join(projectRoot, "generated/scene-coverage.generated.json"),
    input: {
      storyId: projectId,
      storyBeatOrder,
      packages,
      fallbacks: [],
      stalePackages: [],
    },
  });
  if (coverage.entries.some(({ status }) => status !== "ready")) {
    throw new Error("Formal project coverage must contain only ready Scenes.");
  }
  return coverage;
};
