import { lstat, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { z } from "zod";

import {
  ProducerTaskSpecSchema,
  SceneTaskInputSchema,
  SelectedResourceRefSchema,
  TaskExecutionContractSchema,
  buildNotApplicableFidelityReceipt,
  buildPassFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  createGlobalVisualPlan,
  serializeCanonicalJson,
  type ProducerTaskSpec,
  type TaskExecutionContract,
} from "@axmorf/studio/contracts";
import { writeTextFileAtomic } from "../../shared/atomic-file";
import { readTaskWorkspace } from "../adapters/task-workspace";
import { checkTaskByKind } from "./check-task";
import { assertTaskExecutionContractMatchesTask } from "./task-execution-contract";

export type AgentTaskFinalizationErrorCode =
  | "task-workspace-invalid"
  | "task-kind-unsupported"
  | "task-contract-invalid"
  | "task-contract-mismatch"
  | "task-output-invalid"
  | "task-finalization-failed"
  | "task-check-failed";

export class AgentTaskFinalizationError extends Error {
  readonly code: AgentTaskFinalizationErrorCode;

  constructor(
    code: AgentTaskFinalizationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentTaskFinalizationError";
    this.code = code;
  }
}

const SelectedResourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
  })
  .strict()
  .readonly();

const JsonObjectSchema = z.record(z.string(), z.unknown());

const asFinalizationError = (
  error: unknown,
  code: AgentTaskFinalizationErrorCode,
  message: string,
) =>
  error instanceof AgentTaskFinalizationError
    ? error
    : new AgentTaskFinalizationError(code, message, { cause: error });

const assertAgentTask = (task: ProducerTaskSpec) => {
  if (
    task.taskKind !== "scene-owner" &&
    task.taskKind !== "global-visual-owner" &&
    task.taskKind !== "cover-owner"
  ) {
    throw new AgentTaskFinalizationError(
      "task-kind-unsupported",
      "Only Agent-owned Scene, GlobalVisual, and Cover tasks can be finalized.",
    );
  }
};

const assertContainedLogicalPath = (workspace: string, logicalPath: string) => {
  const resolved = join(workspace, logicalPath);
  if (relative(workspace, resolved).split(sep).join("/") !== logicalPath) {
    throw new AgentTaskFinalizationError(
      "task-workspace-invalid",
      `Task path escapes its workspace: ${logicalPath}.`,
    );
  }
  return resolved;
};

const assertRegularDirectory = async (path: string, label: string) => {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    throw new AgentTaskFinalizationError(
      "task-workspace-invalid",
      `${label} is missing.`,
      { cause: error },
    );
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new AgentTaskFinalizationError(
      "task-workspace-invalid",
      `${label} must be a regular directory.`,
    );
  }
};

const assertRegularFile = async (
  workspace: string,
  logicalPath: string,
  code: AgentTaskFinalizationErrorCode,
) => {
  await assertRegularDirectory(workspace, "Task workspace");
  const segments = logicalPath.split("/");
  let current = workspace;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    await assertRegularDirectory(
      current,
      `Task path parent for ${logicalPath}`,
    );
  }
  const path = assertContainedLogicalPath(workspace, logicalPath);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    throw new AgentTaskFinalizationError(
      code,
      `Task file is missing: ${logicalPath}.`,
      { cause: error },
    );
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new AgentTaskFinalizationError(
      code,
      `Task file must be a regular file: ${logicalPath}.`,
    );
  }
  return path;
};

const readJsonFile = async (
  workspace: string,
  logicalPath: string,
  code: AgentTaskFinalizationErrorCode,
) => {
  const path = await assertRegularFile(workspace, logicalPath, code);
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new AgentTaskFinalizationError(
      code,
      `Task JSON is malformed: ${logicalPath}.`,
      { cause: error },
    );
  }
};

const loadAgentTaskWorkspace = async ({
  rootDir,
  taskRevision,
  requireOutputs,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly requireOutputs: boolean;
}) => {
  let loaded;
  try {
    loaded = await readTaskWorkspace({ rootDir, taskRevision });
  } catch (error) {
    throw asFinalizationError(
      error,
      "task-workspace-invalid",
      "Agent task workspace is unavailable or unsafe.",
    );
  }
  assertAgentTask(loaded.task);

  const rawStoredTask = await readJsonFile(
    loaded.workspace,
    "task.json",
    "task-workspace-invalid",
  );
  let storedTask: ProducerTaskSpec;
  try {
    storedTask = ProducerTaskSpecSchema.parse(rawStoredTask);
  } catch (error) {
    throw new AgentTaskFinalizationError(
      "task-workspace-invalid",
      "task.json does not satisfy the ProducerTaskSpec contract.",
      { cause: error },
    );
  }
  if (
    serializeCanonicalJson(storedTask) !== serializeCanonicalJson(loaded.task)
  ) {
    throw new AgentTaskFinalizationError(
      "task-workspace-invalid",
      "task.json changed while the task workspace was being read.",
    );
  }

  const rawContract = await readJsonFile(
    loaded.workspace,
    "inputs/task-contract.json",
    "task-contract-invalid",
  );
  let contract: TaskExecutionContract;
  try {
    contract = TaskExecutionContractSchema.parse(rawContract);
  } catch (error) {
    throw new AgentTaskFinalizationError(
      "task-contract-invalid",
      "inputs/task-contract.json does not satisfy TaskExecutionContract v1.",
      { cause: error },
    );
  }
  try {
    assertTaskExecutionContractMatchesTask({
      task: storedTask,
      contract,
    });
  } catch (error) {
    throw new AgentTaskFinalizationError(
      "task-contract-mismatch",
      "Task execution contract does not match task.json.",
      { cause: error },
    );
  }
  for (const logicalPath of contract.immutableInputs) {
    await assertRegularFile(
      loaded.workspace,
      logicalPath,
      "task-workspace-invalid",
    );
  }
  if (requireOutputs) {
    for (const { path } of contract.outputs) {
      await assertRegularFile(loaded.workspace, path, "task-output-invalid");
    }
  }
  return { ...loaded, task: storedTask, contract } as const;
};

export const readAgentTaskExecutionContract = async (input: {
  readonly rootDir: string;
  readonly taskRevision: string;
}) =>
  (
    await loadAgentTaskWorkspace({
      ...input,
      requireOutputs: false,
    })
  ).contract;

const finalizeSceneJson = async (workspace: string) => {
  const context = z
    .object({
      scene: z.object({ taskInput: SceneTaskInputSchema }).passthrough(),
    })
    .passthrough()
    .parse(
      await readJsonFile(
        workspace,
        "inputs/context.json",
        "task-workspace-invalid",
      ),
    );
  const taskInput = context.scene.taskInput;
  const durationInFrames =
    taskInput.timingBeat.endFrame - taskInput.timingBeat.startFrame;
  const visualDraft = JsonObjectSchema.parse(
    await readJsonFile(
      workspace,
      "src/visual-plan.json",
      "task-output-invalid",
    ),
  );
  const shotDraft = JsonObjectSchema.parse(
    await readJsonFile(workspace, "src/shot-plan.json", "task-output-invalid"),
  );
  const syncDraft = JsonObjectSchema.parse(
    await readJsonFile(
      workspace,
      "src/sync-anchors.json",
      "task-output-invalid",
    ),
  );
  const soundDraft = JsonObjectSchema.parse(
    await readJsonFile(workspace, "src/sound-plan.json", "task-output-invalid"),
  );
  const selectionDraft = z
    .object({ selections: z.array(z.unknown()).max(24).readonly() })
    .passthrough()
    .parse(
      await readJsonFile(
        workspace,
        "src/shot-recipe-selection.json",
        "task-output-invalid",
      ),
    );
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    selections: selectionDraft.selections,
  });
  const selectedResources = SelectedResourcesFileSchema.parse(
    await readJsonFile(
      workspace,
      "src/selected-resources.json",
      "task-output-invalid",
    ),
  );
  const exactSelection = selection.selections.some(
    ({ mode }) => mode === "exact-demo-localized",
  );
  let fidelity;
  if (exactSelection) {
    const rawFidelity = await readJsonFile(
      workspace,
      "src/generated/reference-fidelity.generated.json",
      "task-output-invalid",
    );
    const draft = z
      .object({
        status: z.literal("pass"),
        evidenceFingerprint: z.unknown(),
        items: z.array(z.unknown()).readonly(),
      })
      .passthrough()
      .parse(rawFidelity);
    fidelity = buildPassFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      evidenceFingerprint: draft.evidenceFingerprint,
      items: draft.items,
    });
  } else {
    fidelity = buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: selection.selections.length === 0 ? "empty" : "inspiration-only",
    });
  }

  return {
    "src/generated/reference-fidelity.generated.json": fidelity,
    "src/selected-resources.json": selectedResources,
    "src/shot-plan.json": buildShotPlanSet({
      ...shotDraft,
      taskInputFingerprint: taskInput.taskInputFingerprint,
      meaningId: taskInput.meaningId,
      sceneDurationInFrames: durationInFrames,
    } as unknown as Parameters<typeof buildShotPlanSet>[0]),
    "src/shot-recipe-selection.json": selection,
    "src/sound-plan.json": buildSceneSoundPlan({
      ...soundDraft,
      taskInputFingerprint: taskInput.taskInputFingerprint,
      meaningId: taskInput.meaningId,
      sceneDurationInFrames: durationInFrames,
    } as unknown as Parameters<typeof buildSceneSoundPlan>[0]),
    "src/sync-anchors.json": buildSceneSyncAnchors({
      ...syncDraft,
      taskInputFingerprint: taskInput.taskInputFingerprint,
      meaningId: taskInput.meaningId,
      sceneDurationInFrames: durationInFrames,
    } as unknown as Parameters<typeof buildSceneSyncAnchors>[0]),
    "src/visual-plan.json": buildSceneVisualPlan({
      ...visualDraft,
      taskInputFingerprint: taskInput.taskInputFingerprint,
      meaningId: taskInput.meaningId,
    } as unknown as Parameters<typeof buildSceneVisualPlan>[0]),
  } as const;
};

const finalizeGlobalVisualJson = async (workspace: string) => {
  const plan = JsonObjectSchema.parse(
    await readJsonFile(
      workspace,
      "project/global-visual-plan.json",
      "task-output-invalid",
    ),
  );
  const { planFingerprint: _planFingerprint, ...planInput } = plan;
  void _planFingerprint;
  return {
    "project/global-visual-plan.json": createGlobalVisualPlan(planInput),
    "src/selected-resources.json": SelectedResourcesFileSchema.parse(
      await readJsonFile(
        workspace,
        "src/selected-resources.json",
        "task-output-invalid",
      ),
    ),
  } as const;
};

const writeCanonicalOutputs = async (
  workspace: string,
  outputs: Readonly<Record<string, unknown>>,
) => {
  for (const [logicalPath, value] of Object.entries(outputs).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const destination = await assertRegularFile(
      workspace,
      logicalPath,
      "task-output-invalid",
    );
    await writeTextFileAtomic({
      destination,
      bytes: `${serializeCanonicalJson(value)}\n`,
      mode: "replace",
    });
    await assertRegularFile(workspace, logicalPath, "task-output-invalid");
  }
};

export const finalizeAgentTaskWorkspace = async ({
  rootDir,
  taskRevision,
  runtimeRootDir = rootDir,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly runtimeRootDir?: string;
}) => {
  const loaded = await loadAgentTaskWorkspace({
    rootDir,
    taskRevision,
    requireOutputs: true,
  });
  try {
    if (loaded.task.taskKind === "scene-owner") {
      await writeCanonicalOutputs(
        loaded.workspace,
        await finalizeSceneJson(loaded.workspace),
      );
    } else if (loaded.task.taskKind === "global-visual-owner") {
      await writeCanonicalOutputs(
        loaded.workspace,
        await finalizeGlobalVisualJson(loaded.workspace),
      );
    }
  } catch (error) {
    throw asFinalizationError(
      error,
      "task-finalization-failed",
      "Agent task derived outputs could not be finalized.",
    );
  }

  let checked;
  try {
    checked = await checkTaskByKind({
      rootDir,
      taskRevision,
      runtimeRootDir,
    });
  } catch (error) {
    throw asFinalizationError(
      error,
      "task-check-failed",
      "Agent task failed its fixed checker after finalization.",
    );
  }
  return {
    status: "agent-task-finalized" as const,
    taskRevision: loaded.task.taskRevision,
    taskKind: loaded.task.taskKind,
    checkStatus: checked.status,
  };
};
