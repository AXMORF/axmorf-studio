import { checkProducerTaskWorkspace } from "./task-check";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  SceneOriginalityBaselineSchema,
  SceneTaskInputSchema,
  TaskExecutionContractSchema,
  buildSceneSourceGraph,
  findSceneOriginalityConflicts,
  ShotPlanSetSchema,
  SceneSyncAnchorSetSchema,
  validateSceneMotionPlan,
  SCENE_MOTION_REQUIREMENT_ID,
  SceneVisualPlanSchema,
  VisualStyleSpecSchema,
} from "@axmorf/studio/contracts";
import { validateSceneArtifactBundle } from "../../scene-package/domain";
import { parseSceneSelectedResourcesFile } from "../../scene-package/generate";
import { validateRendererReadabilitySourceGraph } from "./readability-source-validator";
import { validateSceneCapabilityUsage } from "./scene-capability-usage";
import { compileTypeScriptImportGraph } from "./typescript-compile";
import { checkSceneMotionConsumption } from "./scene-motion-consumption";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

const isSceneTypeScriptSource = (logicalPath: string) =>
  logicalPath.startsWith("src/") && /\.[cm]?tsx?$/u.test(logicalPath);

const sceneTypeScriptSourcePaths = (declaredOutputSet: readonly string[]) =>
  declaredOutputSet
    .filter(isSceneTypeScriptSource)
    .sort((left, right) => left.localeCompare(right));

export const checkSceneTask = async (
  input: Parameters<typeof checkProducerTaskWorkspace>[0],
) => {
  const checked = await checkProducerTaskWorkspace(input);
  if (
    checked.task.taskKind !== "scene-owner" &&
    checked.task.taskKind !== "scene-template"
  )
    throw new Error("Task is not a Scene task.");
  const context = JSON.parse(
    await readFile(join(checked.workspace, "inputs/context.json"), "utf8"),
  ) as {
    scene?: {
      taskInput?: unknown;
      availableResources?: unknown;
      narrationCues?: readonly { startFrame: number; endFrame: number }[];
      fps?: number;
      visualStyle?: unknown;
    } | null;
    originalityBaseline?: unknown;
  };
  const taskInput = SceneTaskInputSchema.parse(context.scene?.taskInput);
  if (
    taskInput.storyId !== checked.task.storyId ||
    taskInput.meaningId !== checked.task.semanticId
  ) {
    throw new Error("Scene workspace context is cross-bound.");
  }
  const sourcePaths = sceneTypeScriptSourcePaths(
    checked.task.declaredOutputSet,
  );
  if (
    checked.task.taskKind === "scene-owner" &&
    checked.task.declaredReadSet.includes("inputs/task-contract.json")
  ) {
    const contract = TaskExecutionContractSchema.parse(
      await readJson(join(checked.workspace, "inputs/task-contract.json")),
    );
    const scaffold = contract.outputs.find(
      ({ path }) => path === "src/Renderer.tsx",
    )?.example;
    if (
      typeof scaffold === "string" &&
      (await readFile(join(checked.workspace, "src/Renderer.tsx"), "utf8")) ===
        scaffold
    ) {
      throw new Error(
        "Scene Renderer still matches the task scaffold; author a StoryBeat-specific visual.",
      );
    }
  }
  await validateRendererReadabilitySourceGraph({
    rootDir: checked.workspace,
    rendererPath: "src/Renderer.tsx",
    sourcePaths,
    sceneViewport: taskInput.sceneViewport,
  });
  const rendererPath = `src/projects/${taskInput.storyId}/scenes/${taskInput.meaningId}/Renderer.tsx`;
  const contractCheckPath = `src/projects/${taskInput.storyId}/scenes/${taskInput.meaningId}/__scene-task-component-check.tsx`;
  const sceneSourceRoot = dirname(rendererPath);
  const sourceFiles = await Promise.all(
    sourcePaths.map(async (logicalPath) => {
      const relativeSourcePath = logicalPath.slice("src/".length);
      return {
        logicalPath,
        relativeSourcePath,
        projectPath: join(sceneSourceRoot, ...relativeSourcePath.split("/")),
        source: await readFile(join(checked.workspace, logicalPath), "utf8"),
      } as const;
    }),
  );
  const virtualSceneSources = Object.fromEntries(
    sourceFiles.map(({ projectPath, source }) => [projectPath, source]),
  );
  compileTypeScriptImportGraph({
    rootDir: input.runtimeRootDir ?? input.rootDir,
    rootPath: contractCheckPath,
    label: "Scene task compile",
    virtualSources: {
      ...virtualSceneSources,
      [contractCheckPath]: `import Renderer from "./Renderer";
import type {SceneRendererComponent} from "@axmorf/studio/remotion";
const renderer: SceneRendererComponent = Renderer;
void renderer;
`,
    },
  });
  if (checked.task.taskKind === "scene-owner") {
    if (
      !["scene-owner-validator-v4", "scene-owner-validator-v5"].includes(
        checked.task.validatorPolicyVersion,
      )
    ) {
      throw new Error("Scene owner task uses an unsupported validator policy.");
    }
    const baseline = SceneOriginalityBaselineSchema.parse(
      context.originalityBaseline,
    );
    if (baseline.subjectStoryId !== checked.task.storyId) {
      throw new Error("Scene originality baseline is cross-bound.");
    }
    const candidateGraph = buildSceneSourceGraph(
      sourceFiles.map(({ relativeSourcePath: path, source }) => ({
        path,
        source,
      })),
    );
    const conflicts = findSceneOriginalityConflicts({
      baseline,
      candidate: {
        owner: {
          storyId: checked.task.storyId,
          meaningId: taskInput.meaningId,
        },
        sourceGraphFingerprint: candidateGraph.sourceGraphFingerprint,
      },
    });
    if (conflicts.length > 0) {
      const owners = conflicts
        .map(({ owner }) => `${owner.storyId}/${owner.meaningId}`)
        .join(", ");
      throw new Error(
        `Scene source graph duplicates frozen historical ownership: ${owners}.`,
      );
    }
  }
  const selectedResources = parseSceneSelectedResourcesFile(
    await readJson(join(checked.workspace, "src/selected-resources.json")),
  ).selectedResources;
  if (context.scene?.availableResources !== undefined) {
    const available = parseSceneSelectedResourcesFile({
      schemaVersion: 1,
      selectedResources: context.scene.availableResources,
    }).selectedResources;
    for (const record of selectedResources) {
      const frozen = available.find(
        ({ selected }) => selected.resourceId === record.selected.resourceId,
      );
      if (
        frozen === undefined ||
        JSON.stringify(frozen) !== JSON.stringify(record)
      ) {
        throw new Error(
          `Scene selected resource differs from immutable capability or asset input: ${record.selected.resourceId}.`,
        );
      }
    }
  }
  validateSceneCapabilityUsage({ sources: sourceFiles, selectedResources });
  const motionShots = ShotPlanSetSchema.parse(
    await readJson(join(checked.workspace, "src/shot-plan.json")),
  );
  if (motionShots.motionPlan !== undefined) {
    const motionAnchors = SceneSyncAnchorSetSchema.parse(
      await readJson(join(checked.workspace, "src/sync-anchors.json")),
    );
    validateSceneMotionPlan({
      plan: motionShots.motionPlan,
      shots: motionShots.shots,
      anchors: motionAnchors.anchors,
      duration: motionShots.sceneDurationInFrames,
      narrationCues: context.scene?.narrationCues,
    });
  }
  validateSceneArtifactBundle({
    task: taskInput,
    visual: await readJson(join(checked.workspace, "src/visual-plan.json")),
    shots: await readJson(join(checked.workspace, "src/shot-plan.json")),
    anchors: await readJson(join(checked.workspace, "src/sync-anchors.json")),
    sound: await readJson(join(checked.workspace, "src/sound-plan.json")),
    selection: await readJson(
      join(checked.workspace, "src/shot-recipe-selection.json"),
    ),
    fidelityReceipt: await readJson(
      join(
        checked.workspace,
        "src/generated/reference-fidelity.generated.json",
      ),
    ),
    selectedResources,
  });
  let motionReview: ReturnType<typeof checkSceneMotionConsumption> | undefined;
  if (
    taskInput.sceneRequirements.some(
      ({ requirementId }) => requirementId === SCENE_MOTION_REQUIREMENT_ID,
    )
  ) {
    const fps = context.scene?.fps;
    if (fps === undefined || !Number.isFinite(fps) || fps <= 0)
      throw new Error(
        "Motion consumption requires the frozen Scene frame rate.",
      );
    motionReview = checkSceneMotionConsumption({
      rootDir: input.runtimeRootDir ?? input.rootDir,
      sources: sourceFiles,
      props: {
        storyId: taskInput.storyId,
        meaningId: taskInput.meaningId,
        sceneFrame: 0,
        durationInFrames: motionShots.sceneDurationInFrames,
        fps,
        viewportWidth: taskInput.sceneViewport.width,
        viewportHeight: taskInput.sceneViewport.height,
        storyBeat: taskInput.storyBeat,
        sourceReferences: taskInput.sourceReferences,
        timingBeat: taskInput.timingBeat,
        visualStyle: VisualStyleSpecSchema.parse(context.scene?.visualStyle),
        visualPlan: SceneVisualPlanSchema.parse(
          await readJson(join(checked.workspace, "src/visual-plan.json")),
        ),
        shots: motionShots,
        syncAnchors: SceneSyncAnchorSetSchema.parse(
          await readJson(join(checked.workspace, "src/sync-anchors.json")),
        ),
        visualResources: selectedResources.flatMap(
          ({ selected, descriptor }) =>
            descriptor.kind === "asset"
              ? [
                  {
                    resourceId: selected.resourceId,
                    src: `/${descriptor.localPath.replace(/^public\//u, "")}`,
                    descriptorFingerprint: selected.descriptorFingerprint,
                  },
                ]
              : [],
        ),
      },
    });
  }
  return {
    ...checked,
    ...(motionReview === undefined ? {} : { motionReview }),
  };
};
