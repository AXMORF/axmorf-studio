import {
  ResourceCatalogSchema,
  SceneTaskInputSchema,
  SceneTemplateInstanceSchema,
  SelectedResourceRefSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  serializeCanonicalJson,
  validateSelectedResourceRef,
  type ProducerTaskSpec,
  type ResourceCatalog,
  type SceneTaskInput,
} from "@axmorf/studio/contracts";
import { validateSceneArtifactBundle } from "../../scene-package/domain";
import {
  bindTemplateTaskOutputSet,
  expectedTemplateSceneOutputSet,
} from "../domain/template-scene-output";
import {
  ensureFixedTaskArtifact,
  readTemplateSceneFiles,
} from "./prepare-fixed-tasks";

type TemplateFiles = Readonly<Record<string, Uint8Array | string>>;

const canonical = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const parseTemplateInstance = (templateFiles: TemplateFiles) => {
  const bytes = templateFiles["src/scene-template-instance.json"];
  if (bytes === undefined) {
    throw new Error("Scene template instance file is missing.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(
      typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes),
    );
  } catch (error) {
    throw new Error("Scene template instance contains malformed JSON.", {
      cause: error,
    });
  }
  return SceneTemplateInstanceSchema.parse(raw);
};

export const buildTemplateSceneArtifactFiles = ({
  taskInput: rawTaskInput,
  catalog: rawCatalog,
  templateFiles,
}: {
  readonly taskInput: SceneTaskInput;
  readonly catalog: ResourceCatalog;
  readonly templateFiles: TemplateFiles;
}) => {
  const taskInput = SceneTaskInputSchema.parse(rawTaskInput);
  const catalog = ResourceCatalogSchema.parse(rawCatalog);
  const instance = parseTemplateInstance(templateFiles);
  if (
    taskInput.storyBeat.kind !== "silent-scene" ||
    taskInput.storyBeat.preset.implementation.kind !== "template-copy" ||
    instance.storyId !== taskInput.storyId ||
    instance.meaningId !== taskInput.meaningId ||
    instance.instanceFingerprint !==
      taskInput.storyBeat.preset.implementation.instanceFingerprint ||
    JSON.stringify(instance.resourceIds) !==
      JSON.stringify(taskInput.storyBeat.preset.resourceIds)
  ) {
    throw new Error("Scene template instance is stale against its fixed task.");
  }

  const catalogById = new Map(
    catalog.entries.map((entry) => [entry.descriptor.id, entry] as const),
  );
  const visualResourceIds = new Set([
    ...instance.visual.visualResourceIds,
    ...instance.shots.flatMap((shot) => shot.visualResourceIds),
  ]);
  const soundResourceIds = new Set(
    instance.soundCues.map(({ resourceId }) => resourceId),
  );
  const selectedResources = instance.resourceIds.map((resourceId) => {
    const entry = catalogById.get(resourceId);
    if (entry === undefined || entry.descriptor.kind !== "asset") {
      throw new Error("Scene template resource is unavailable in the Catalog.");
    }
    const visual = visualResourceIds.has(resourceId);
    const sound = soundResourceIds.has(resourceId);
    if (visual === sound) {
      throw new Error(
        "Scene template resource must have exactly one runtime role.",
      );
    }
    const role = visual ? "scene-visual" : entry.descriptor.mediaRole;
    if (
      (visual && entry.descriptor.mediaRole !== "scene-visual") ||
      (!visual && role !== "sound-effect" && role !== "background-music")
    ) {
      throw new Error("Scene template resource role is incompatible.");
    }
    const selected = SelectedResourceRefSchema.parse({
      schemaVersion: 1,
      resourceId,
      kind: "asset",
      role,
      descriptorFingerprint: entry.descriptorFingerprint,
      catalogFingerprint: catalog.catalogFingerprint,
    });
    validateSelectedResourceRef({
      selected,
      descriptor: entry.descriptor,
      currentCatalogFingerprint: catalog.catalogFingerprint,
    });
    return { selected, descriptor: entry.descriptor } as const;
  });
  const selectedById = new Map(
    selectedResources.map(({ selected }) => [selected.resourceId, selected]),
  );
  const durationInFrames =
    taskInput.timingBeat.endFrame - taskInput.timingBeat.startFrame;
  const visual = buildSceneVisualPlan({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    ...instance.visual,
    recipeDecision: "empty",
  });
  const shots = buildShotPlanSet({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    sceneDurationInFrames: durationInFrames,
    shots: instance.shots,
  });
  const anchors = buildSceneSyncAnchors({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    sceneDurationInFrames: durationInFrames,
    anchors: instance.anchors,
  });
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    sceneDurationInFrames: durationInFrames,
    contributions: instance.soundCues.map((cue) => {
      const resource = selectedById.get(cue.resourceId);
      if (resource === undefined) {
        throw new Error("Scene template sound cue resource is unavailable.");
      }
      return {
        contributionId: cue.cueId,
        resource,
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
    taskInputFingerprint: taskInput.taskInputFingerprint,
    selections: [],
  });
  const fidelityReceipt = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  validateSceneArtifactBundle({
    task: taskInput,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources,
  });

  const files: Record<string, Uint8Array | string> = {
    ...templateFiles,
    "src/generated/reference-fidelity.generated.json":
      canonical(fidelityReceipt),
    "src/selected-resources.json": canonical({
      schemaVersion: 1,
      selectedResources,
    }),
    "src/shot-plan.json": canonical(shots),
    "src/shot-recipe-selection.json": canonical(selection),
    "src/sound-plan.json": canonical(sound),
    "src/sync-anchors.json": canonical(anchors),
    "src/visual-plan.json": canonical(visual),
  };
  const expectedOutputs = expectedTemplateSceneOutputSet({
    storyId: instance.storyId,
    meaningId: instance.meaningId,
    copiedRepositoryPaths: [
      ...instance.copiedSourceFiles,
      ...instance.copiedAssetFiles,
    ].map(({ repositoryPath }) => repositoryPath),
  });
  const actualOutputs = Object.keys(files).sort();
  if (JSON.stringify(actualOutputs) !== JSON.stringify(expectedOutputs)) {
    throw new Error("Scene template producer output set is not canonical.");
  }
  return Object.fromEntries(
    Object.entries(files).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
};

export const bindTemplateSceneTask = ({
  task,
  taskInput,
  catalog,
  templateFiles,
}: {
  readonly task: ProducerTaskSpec;
  readonly taskInput: SceneTaskInput;
  readonly catalog: ResourceCatalog;
  readonly templateFiles: TemplateFiles;
}) => {
  const files = buildTemplateSceneArtifactFiles({
    taskInput,
    catalog,
    templateFiles,
  });
  return {
    task: bindTemplateTaskOutputSet(task, Object.keys(files)),
    files,
  } as const;
};

export const ensureTemplateSceneArtifact = async ({
  rootDir,
  task,
  contextBytes,
  taskInput,
  catalog,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly contextBytes: string;
  readonly taskInput: SceneTaskInput;
  readonly catalog: ResourceCatalog;
}) => {
  if (task.taskKind !== "scene-template" || task.semanticId === null) {
    throw new Error("Task is not a fixed Scene template task.");
  }
  const templateFiles = await readTemplateSceneFiles({
    rootDir,
    projectId: task.storyId,
    meaningId: task.semanticId,
  });
  const prepared = bindTemplateSceneTask({
    task,
    taskInput,
    catalog,
    templateFiles,
  });
  const attestation = await ensureFixedTaskArtifact({
    rootDir,
    task: prepared.task,
    files: { "inputs/context.json": contextBytes, ...prepared.files },
  });
  return { ...prepared, attestation } as const;
};
