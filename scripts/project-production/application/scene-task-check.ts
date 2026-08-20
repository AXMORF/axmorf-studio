import { checkProducerTaskWorkspace } from "./task-check";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AuthoringRequirementsSchema,
  SceneTaskInputSchema,
} from "../../../src/contracts";
import { validateSceneArtifactBundle } from "../../scene-package/domain";
import { parseSceneSelectedResourcesFile } from "../../scene-package/generate";
import { validatePolicyAwareRendererSourceGraph } from "./readability-source-validator";
import { compileTypeScriptImportGraph } from "./typescript-compile";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

export const checkSceneTask = async (input: Parameters<typeof checkProducerTaskWorkspace>[0]) => {
  const checked = await checkProducerTaskWorkspace(input);
  if (checked.task.taskKind !== "scene-owner" && checked.task.taskKind !== "scene-template") throw new Error("Task is not a Scene task.");
  const context = JSON.parse(await readFile(join(checked.workspace, "inputs/context.json"), "utf8")) as {
    requirements?: unknown;
    scene?: { taskInput?: unknown } | null;
  };
  const requirements = AuthoringRequirementsSchema.parse(context.requirements);
  const taskInput = SceneTaskInputSchema.parse(context.scene?.taskInput);
  if (
    taskInput.storyId !== checked.task.storyId ||
    taskInput.meaningId !== checked.task.semanticId
  ) {
    throw new Error("Scene workspace context is cross-bound.");
  }
  await validatePolicyAwareRendererSourceGraph({
    rootDir: checked.workspace,
    rendererPath: "src/Renderer.tsx",
    sourcePaths: ["src/Renderer.tsx"],
    policy: requirements.readabilityPolicy,
  });
  const rendererSource = await readFile(
    join(checked.workspace, "src/Renderer.tsx"),
    "utf8",
  );
  const rendererPath = `src/projects/${taskInput.storyId}/scenes/${taskInput.meaningId}/Renderer.tsx`;
  const contractCheckPath = `src/projects/${taskInput.storyId}/scenes/${taskInput.meaningId}/__scene-task-component-check.tsx`;
  compileTypeScriptImportGraph({
    rootDir: input.rootDir,
    rootPath: contractCheckPath,
    label: "Scene task compile",
    virtualSources: {
      [rendererPath]: rendererSource,
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
