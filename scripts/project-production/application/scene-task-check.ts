import { checkProducerTaskWorkspace } from "./task-check";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  SceneOriginalityBaselineSchema,
  SceneTaskInputSchema,
} from "../../../src/contracts";
import { validateSceneArtifactBundle } from "../../scene-package/domain";
import { parseSceneSelectedResourcesFile } from "../../scene-package/generate";
import { validateRendererReadabilitySourceGraph } from "./readability-source-validator";
import { compileTypeScriptImportGraph } from "./typescript-compile";
import { fingerprintSceneRendererSource } from "../domain/scene-originality";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

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
    scene?: { taskInput?: unknown } | null;
    originalityBaseline?: unknown;
  };
  const taskInput = SceneTaskInputSchema.parse(context.scene?.taskInput);
  if (
    taskInput.storyId !== checked.task.storyId ||
    taskInput.meaningId !== checked.task.semanticId
  ) {
    throw new Error("Scene workspace context is cross-bound.");
  }
  if (
    checked.task.taskKind === "scene-owner" &&
    checked.task.validatorPolicyVersion === "scene-owner-validator-v3"
  ) {
    const baseline = SceneOriginalityBaselineSchema.parse(
      context.originalityBaseline,
    );
    if (baseline.storyId !== checked.task.storyId) {
      throw new Error("Scene originality baseline is cross-bound.");
    }
    const rendererFingerprint = fingerprintSceneRendererSource(
      await readFile(join(checked.workspace, "src/Renderer.tsx"), "utf8"),
    );
    if (baseline.rendererFingerprints.includes(rendererFingerprint)) {
      throw new Error(
        "Scene Renderer duplicates a historical Project Renderer.",
      );
    }
  }
  await validateRendererReadabilitySourceGraph({
    rootDir: checked.workspace,
    rendererPath: "src/Renderer.tsx",
    sourcePaths: ["src/Renderer.tsx"],
    sceneViewport: taskInput.sceneViewport,
  });
  const runtimeSourceRoot =
    input.locations.layoutKind === "repository"
      ? input.locations.runtimeResources
      : join(input.locations.runtimeResources, "source");
  const rendererPath = join(
    runtimeSourceRoot,
    `src/projects/${taskInput.storyId}/scenes/${taskInput.meaningId}/Renderer.tsx`,
  );
  const contractCheckPath = join(
    runtimeSourceRoot,
    `src/projects/${taskInput.storyId}/scenes/${taskInput.meaningId}/__scene-task-component-check.tsx`,
  );
  const virtualSceneSources = Object.fromEntries(
    await Promise.all(
      checked.task.declaredOutputSet
        .filter(
          (logicalPath) =>
            logicalPath.startsWith("src/") && /\.[cm]?tsx?$/u.test(logicalPath),
        )
        .map(async (logicalPath) => [
          join(dirname(rendererPath), ...logicalPath.slice("src/".length).split("/")),
          await readFile(join(checked.workspace, logicalPath), "utf8"),
        ] as const),
    ),
  );
  compileTypeScriptImportGraph({
    rootDir: runtimeSourceRoot,
    rootPath: contractCheckPath,
    typescriptLibRoot: join(
      input.locations.runtimeResources,
      "node_modules/typescript/lib",
    ),
    label: "Scene task compile",
    virtualSources: {
      ...virtualSceneSources,
      [contractCheckPath]: `import Renderer from "./Renderer";
import type {SceneRendererComponent} from "../../../../remotion/runtime/story-visual/types";
const renderer: SceneRendererComponent = Renderer;
void renderer;
`,
    },
  });
  const selectedResources = parseSceneSelectedResourcesFile(
    await readJson(join(checked.workspace, "src/selected-resources.json")),
  ).selectedResources;
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
  return checked;
};
