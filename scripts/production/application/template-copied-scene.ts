import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  SceneTemplateInstanceSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  type ResourceCatalog,
  type SceneAssignment,
  type SelectedResourceRef,
} from "../../../src/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "../../external-references/project-files";
import { collectRendererSourceGraph } from "../../renderer-registry/domain";
import {
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../../scene-package/project-files";

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
    throw new Error(`Copied Scene SFX is not runtime-approved: ${resourceId}.`);
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

const verifyCopiedFiles = async ({
  rootDir,
  files,
}: {
  readonly rootDir: string;
  readonly files: readonly Readonly<{
    repositoryPath: string;
    checksum: string;
  }>[];
}) => {
  for (const file of files) {
    const bytes = await readExternalRegularFile(rootDir, file.repositoryPath);
    if (checksumExternalBytes(bytes) !== file.checksum) {
      throw new Error(`Copied Scene file is stale: ${file.repositoryPath}.`);
    }
  }
};

const readCopiedInstance = async ({
  rootDir,
  assignment,
}: {
  readonly rootDir: string;
  readonly assignment: SceneAssignment;
}) => {
  const sceneRoot = assignment.taskInput.allowedDirectories.sceneRoot;
  const instancePath = join(rootDir, sceneRoot, "scene-template-instance.json");
  const instance = SceneTemplateInstanceSchema.parse(
    JSON.parse(await readFile(instancePath, "utf8")),
  );
  const beat = assignment.taskInput.storyBeat;
  if (
    beat.kind !== "silent-scene" ||
    beat.preset.implementation.kind !== "template-copy"
  ) {
    throw new Error("Copied Scene assignment implementation is invalid.");
  }
  const implementation = beat.preset.implementation;
  if (
    instance.storyId !== assignment.storyId ||
    instance.meaningId !== assignment.meaningId ||
    instance.templateId !== implementation.templateId ||
    instance.templateFingerprint !== implementation.templateFingerprint ||
    instance.instanceFingerprint !== implementation.instanceFingerprint ||
    instance.rendererSourceGraphFingerprint !==
      implementation.rendererSourceFingerprint ||
    instance.durationInFrames !== beat.preset.durationInFrames
  ) {
    throw new Error("Copied Scene instance identity is stale.");
  }
  await verifyCopiedFiles({
    rootDir,
    files: [...instance.copiedSourceFiles, ...instance.copiedAssetFiles],
  });
  const rendererPath = `${sceneRoot}/Renderer.tsx`;
  const graph = await collectRendererSourceGraph({
    rootDir,
    projectId: assignment.storyId,
    rendererPath,
  });
  if (
    graph.sourceGraphFingerprint !== instance.rendererSourceGraphFingerprint
  ) {
    throw new Error("Copied Scene Renderer source identity is stale.");
  }
  const publicRoot = join(
    rootDir,
    assignment.taskInput.allowedDirectories.publicAssetRoot,
  );
  const metadata = await lstat(publicRoot);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Copied Scene public root must be a real directory.");
  }
  return instance;
};

export const materializeTemplateCopiedScenes = async ({
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
      beat.preset.implementation.kind !== "template-copy"
    ) {
      continue;
    }
    const instance = await readCopiedInstance({ rootDir, assignment });
    const durationInFrames =
      assignment.taskInput.timingBeat.endFrame -
      assignment.taskInput.timingBeat.startFrame;
    if (
      durationInFrames !== instance.durationInFrames ||
      instance.shots.at(-1)?.primaryRange.endFrame !== durationInFrames
    ) {
      throw new Error("Copied Scene duration does not match its instance.");
    }
    const taskInputFingerprint = assignment.taskInput.taskInputFingerprint;
    const visual = buildSceneVisualPlan({
      taskInputFingerprint,
      meaningId: assignment.meaningId,
      ...instance.visual,
      recipeDecision: "empty",
    });
    const shots = buildShotPlanSet({
      taskInputFingerprint,
      meaningId: assignment.meaningId,
      sceneDurationInFrames: durationInFrames,
      shots: instance.shots,
    });
    const anchors = buildSceneSyncAnchors({
      taskInputFingerprint,
      meaningId: assignment.meaningId,
      sceneDurationInFrames: durationInFrames,
      anchors: instance.anchors,
    });
    const selectedResources = [
      ...new Set(instance.soundCues.map(({ resourceId }) => resourceId)),
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
      cues: instance.soundCues.map((cue) => {
        const resource = selectedById.get(cue.resourceId);
        if (resource === undefined) {
          throw new Error("Copied Scene sound resource is missing.");
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
