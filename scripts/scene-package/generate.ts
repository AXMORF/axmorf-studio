import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  SceneCoverageMapSchema,
  ScenePackageSchema,
  Sha256DigestSchema,
  buildSceneCoverageMap,
  type SceneCoverageMap,
  type ScenePackage,
} from "../../src/contracts";
import { checksumExternalBytes } from "../external-references/project-files";
import { buildScenePackage } from "./domain";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "./project-files";

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
    rendererBytes,
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
    readFile(join(sceneRoot, "Renderer.tsx")),
  ]);
  const taskRecord = task as {
    timingBeat: unknown;
    semanticTimingFingerprint: unknown;
    visualStyleFingerprint: unknown;
    resourceCatalogFingerprint: unknown;
    allowedSnapshots: readonly { readonly snapshotFingerprint: unknown }[];
  };
  const selectedResources = (
    selectedResourceInput as {
      readonly selectedResources: Parameters<
        typeof buildScenePackage
      >[0]["selectedResources"];
    }
  ).selectedResources;
  const rendererSourceFingerprint = Sha256DigestSchema.parse(
    checksumExternalBytes(rendererBytes),
  );
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
        timingBeat: taskRecord.timingBeat,
        semanticTimingFingerprint: taskRecord.semanticTimingFingerprint,
        visualStyleFingerprint: taskRecord.visualStyleFingerprint,
        resourceCatalogFingerprint: taskRecord.resourceCatalogFingerprint,
        snapshotFingerprints: taskRecord.allowedSnapshots.map(
          (snapshot) => snapshot.snapshotFingerprint,
        ),
        rendererSourceFingerprint,
        visualRuntimeVersion: "story-visual-runtime-v1",
        sceneAudioRuntimeVersion: "scene-audio-runtime-v1",
      },
    },
  });
};
