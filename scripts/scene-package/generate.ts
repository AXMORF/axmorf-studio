import { join } from "node:path";
import { z } from "zod";

import {
  ResourceDescriptorSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SceneTaskInputSchema,
  SemanticTimingSchema,
  SelectedResourceRefSchema,
  StorySpecSchema,
  buildSceneCoverageMap,
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

export const SceneSelectedResourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedResources: z
      .array(
        z
          .object({
            selected: SelectedResourceRefSchema,
            descriptor: ResourceDescriptorSchema,
          })
          .strict(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

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
  const timingBeat = semanticTiming.storyBeats.find(
    (beat) => beat.meaningId === meaningId,
  );
  if (semanticTiming.storyId !== projectId || timingBeat === undefined) {
    throw new Error("Scene package SemanticTiming authority is cross-bound.");
  }
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
  const packages = [];
  for (const meaningId of storyBeatOrder) {
    packages.push(
      await generateScenePackageFromProjectFiles({
        rootDir,
        projectId,
        meaningId,
        mode: "check",
      }),
    );
  }
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
