import { checkProducerTaskWorkspace } from "./task-check";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  SceneOriginalityBaselineSchema,
  SceneTaskInputSchema,
  buildSceneSourceGraph,
  findSceneOriginalityConflicts,
} from "@axmorf/studio/contracts";
import { validateSceneArtifactBundle } from "../../scene-package/domain";
import { parseSceneSelectedResourcesFile } from "../../scene-package/generate";
import { validateRendererReadabilitySourceGraph } from "./readability-source-validator";
import { compileTypeScriptImportGraph } from "./typescript-compile";

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
  const sourcePaths = sceneTypeScriptSourcePaths(
    checked.task.declaredOutputSet,
  );
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
    if (checked.task.validatorPolicyVersion !== "scene-owner-validator-v4") {
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
