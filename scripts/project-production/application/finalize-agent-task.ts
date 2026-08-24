import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import {
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
} from "../../../src/contracts";
import { readTaskWorkspace } from "../adapters/task-workspace";
import type { ProductionLocations } from "./production-locations";
import { checkTaskByKind } from "./check-task";

const SelectedResourcesFileSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
  })
  .readonly();

const assertSafeParentChain = async (
  workspace: string,
  logicalPath: string,
) => {
  let current = workspace;
  for (const segment of logicalPath.split("/").slice(0, -1)) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Task output parent is unsafe.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
};

const assertSafeRegularFile = async (
  workspace: string,
  logicalPath: string,
) => {
  await assertSafeParentChain(workspace, logicalPath);
  const metadata = await lstat(join(workspace, logicalPath));
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Task output must be a regular file.");
  }
};

const readJson = async (workspace: string, logicalPath: string) => {
  await assertSafeRegularFile(workspace, logicalPath);
  return JSON.parse(await readFile(join(workspace, logicalPath), "utf8")) as unknown;
};

const writeCanonicalJson = async (
  workspace: string,
  logicalPath: string,
  value: unknown,
) => {
  const destination = join(workspace, logicalPath);
  const temporary = join(
    dirname(destination),
    `.${logicalPath.split("/").at(-1)}.${randomUUID()}.tmp`,
  );
  await assertSafeParentChain(workspace, logicalPath);
  await mkdir(dirname(destination), { recursive: true });
  await assertSafeParentChain(workspace, logicalPath);
  try {
    await assertSafeRegularFile(workspace, logicalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(temporary, `${serializeCanonicalJson(value)}\n`, {
    flag: "wx",
  });
  try {
    await assertSafeParentChain(workspace, logicalPath);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

const finalizeScene = async (workspace: string) => {
  const context = (await readJson(workspace, "inputs/context.json")) as {
    scene?: { taskInput?: unknown };
  };
  const input = SceneTaskInputSchema.parse(context.scene?.taskInput);
  const durationInFrames =
    input.timingBeat.endFrame - input.timingBeat.startFrame;
  const visual = (await readJson(workspace, "src/visual-plan.json")) as Record<
    string,
    unknown
  >;
  const shots = (await readJson(workspace, "src/shot-plan.json")) as Record<
    string,
    unknown
  >;
  const anchors = (await readJson(
    workspace,
    "src/sync-anchors.json",
  )) as Record<string, unknown>;
  const sound = (await readJson(workspace, "src/sound-plan.json")) as Record<
    string,
    unknown
  >;
  const rawSelection = (await readJson(
    workspace,
    "src/shot-recipe-selection.json",
  )) as { readonly selections?: unknown };
  const selections = z.array(z.unknown()).parse(rawSelection.selections);
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: input.taskInputFingerprint,
    selections,
  });
  const selectedResources = SelectedResourcesFileSchema.parse(
    await readJson(workspace, "src/selected-resources.json"),
  );
  let fidelity;
  const exactSelection = selection.selections.some(
    ({ mode }) => mode === "exact-demo-localized",
  );
  if (exactSelection) {
    const rawFidelity = z.record(z.string(), z.unknown()).parse(
      await readJson(
        workspace,
        "src/generated/reference-fidelity.generated.json",
      ),
    );
    if (rawFidelity.status !== "pass") {
      throw new Error(
        "Exact-demo-localized selection requires a pass fidelity receipt draft.",
      );
    }
    fidelity = buildPassFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      evidenceFingerprint: rawFidelity.evidenceFingerprint,
      items: z.array(z.unknown()).parse(rawFidelity.items),
    });
  } else {
    fidelity = buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: selection.selections.length === 0 ? "empty" : "inspiration-only",
    });
  }
  const finalized = {
    "src/visual-plan.json": buildSceneVisualPlan({
      ...visual,
      taskInputFingerprint: input.taskInputFingerprint,
      meaningId: input.meaningId,
    } as unknown as Parameters<typeof buildSceneVisualPlan>[0]),
    "src/shot-plan.json": buildShotPlanSet({
      ...shots,
      taskInputFingerprint: input.taskInputFingerprint,
      meaningId: input.meaningId,
      sceneDurationInFrames: durationInFrames,
    } as unknown as Parameters<typeof buildShotPlanSet>[0]),
    "src/sync-anchors.json": buildSceneSyncAnchors({
      ...anchors,
      taskInputFingerprint: input.taskInputFingerprint,
      meaningId: input.meaningId,
      sceneDurationInFrames: durationInFrames,
    } as unknown as Parameters<typeof buildSceneSyncAnchors>[0]),
    "src/sound-plan.json": buildSceneSoundPlan({
      ...sound,
      taskInputFingerprint: input.taskInputFingerprint,
      meaningId: input.meaningId,
      sceneDurationInFrames: durationInFrames,
    } as unknown as Parameters<typeof buildSceneSoundPlan>[0]),
    "src/shot-recipe-selection.json": selection,
    "src/selected-resources.json": selectedResources,
    "src/generated/reference-fidelity.generated.json": fidelity,
  } as const;
  for (const [logicalPath, value] of Object.entries(finalized)) {
    await writeCanonicalJson(workspace, logicalPath, value);
  }
};

const finalizeGlobalVisual = async (workspace: string) => {
  const rawPlan = (await readJson(
    workspace,
    "project/global-visual-plan.json",
  )) as Record<string, unknown>;
  const { planFingerprint: _planFingerprint, ...planInput } = rawPlan;
  void _planFingerprint;
  const selectedResources = SelectedResourcesFileSchema.parse(
    await readJson(workspace, "src/selected-resources.json"),
  );
  await Promise.all([
    writeCanonicalJson(
      workspace,
      "project/global-visual-plan.json",
      createGlobalVisualPlan(planInput),
    ),
    writeCanonicalJson(
      workspace,
      "src/selected-resources.json",
      selectedResources,
    ),
  ]);
};

export const readAgentTaskExecutionContract = async ({
  locations,
  taskRevision,
}: {
  readonly locations: ProductionLocations;
  readonly taskRevision: string;
}) => {
  const { task, workspace } = await readTaskWorkspace({
    locations,
    taskRevision,
  });
  if (
    task.taskKind !== "scene-owner" &&
    task.taskKind !== "global-visual-owner" &&
    task.taskKind !== "cover-owner"
  ) {
    throw new Error("Task does not expose an Agent execution contract.");
  }
  const contract = TaskExecutionContractSchema.parse(
    await readJson(workspace, "inputs/task-contract.json"),
  );
  if (contract.taskKind !== task.taskKind) {
    throw new Error("Task execution contract identity is stale.");
  }
  return contract;
};

export const finalizeAgentTaskWorkspace = async ({
  locations,
  taskRevision,
}: {
  readonly locations: ProductionLocations;
  readonly taskRevision: string;
}) => {
  const { task, workspace } = await readTaskWorkspace({
    locations,
    taskRevision,
  });
  await readAgentTaskExecutionContract({ locations, taskRevision });
  if (task.taskKind === "scene-owner") await finalizeScene(workspace);
  else if (task.taskKind === "global-visual-owner")
    await finalizeGlobalVisual(workspace);
  else if (task.taskKind !== "cover-owner")
    throw new Error("Task cannot be finalized by an Agent.");
  const checked = await checkTaskByKind({ locations, taskRevision });
  return {
    status: "agent-task-finalized" as const,
    taskRevision: task.taskRevision,
    taskKind: task.taskKind,
    checkStatus: checked.status,
  };
};
