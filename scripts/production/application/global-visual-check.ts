import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  GlobalVisualAssignmentSchema,
  GlobalVisualProductionResultSchema,
  type GlobalVisualAssignment,
  type GlobalVisualProductionResult,
} from "../../../src/contracts";
import { readJsonFile } from "../../scene-package/project-files";
import {
  getProductionRunPaths,
  readProductionRunStore,
} from "../adapters/run-store";
import { resolveCurrentSceneAssignments } from "./scene-freeze";
import {
  validateGlobalVisualFromProjectFiles,
  type GlobalVisualValidation,
} from "./global-visual-validator";

export type GlobalVisualAssignmentResolver = (request: {
  readonly rootDir: string;
  readonly runId: string;
}) => Promise<GlobalVisualAssignment>;

export type GlobalVisualValidator = (request: {
  readonly rootDir: string;
  readonly assignment: GlobalVisualAssignment;
  readonly mode?: "write" | "check";
}) => Promise<GlobalVisualValidation>;

const assignmentPath = (storyId: string) =>
  `src/projects/${storyId}/production/global-visual-assignment.generated.json`;

export const loadStoredGlobalVisualAssignment: GlobalVisualAssignmentResolver =
  async ({ rootDir, runId }) => {
    const loaded = await readProductionRunStore({ rootDir, runId });
    const assignment = GlobalVisualAssignmentSchema.parse(
      await readJsonFile(join(rootDir, assignmentPath(loaded.run.storyId))),
    );
    if (assignment.runId !== runId) {
      throw new Error("Stored GlobalVisualAssignment does not match the run.");
    }
    return assignment;
  };

export const loadCurrentGlobalVisualAssignment: GlobalVisualAssignmentResolver =
  async ({ rootDir, runId }) => {
    const [stored, current] = await Promise.all([
      loadStoredGlobalVisualAssignment({ rootDir, runId }),
      resolveCurrentSceneAssignments({ rootDir, runId }),
    ]);
    if (
      current.globalVisualAssignment === null ||
      current.globalVisualAssignment.assignmentFingerprint !==
        stored.assignmentFingerprint
    ) {
      throw new Error("GlobalVisualAssignment is missing or stale.");
    }
    return current.globalVisualAssignment;
  };

export const readExistingGlobalVisualResult = async ({
  rootDir,
  runId,
}: {
  readonly rootDir: string;
  readonly runId: string;
}): Promise<GlobalVisualProductionResult | null> => {
  const path = getProductionRunPaths({ rootDir, runId }).globalVisualResult;
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("GlobalVisual result must be a regular file.");
    }
    return GlobalVisualProductionResultSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const assertGlobalVisualResultState = (state: string) => {
  if (state !== "scene-inputs-frozen" && state !== "scenes-running") {
    throw new Error("GlobalVisual results require frozen visual inputs.");
  }
};

export const runProductionGlobalVisualCheck = async ({
  rootDir,
  runId,
  resolveAssignment = loadCurrentGlobalVisualAssignment,
  validateGlobalVisual = validateGlobalVisualFromProjectFiles,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly resolveAssignment?: GlobalVisualAssignmentResolver;
  readonly validateGlobalVisual?: GlobalVisualValidator;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  assertGlobalVisualResultState(loaded.state.state);
  const assignment = GlobalVisualAssignmentSchema.parse(
    await resolveAssignment({ rootDir, runId }),
  );
  if (
    assignment.runId !== loaded.run.runId ||
    assignment.storyId !== loaded.run.storyId ||
    assignment.requirementsFingerprint !== loaded.run.requirementsFingerprint
  ) {
    throw new Error("GlobalVisualAssignment identity does not match the run.");
  }
  if ((await readExistingGlobalVisualResult({ rootDir, runId })) !== null) {
    throw new Error(
      "GlobalVisual check requires no existing production result.",
    );
  }
  const validated = await validateGlobalVisual({ rootDir, assignment });
  return {
    runId,
    storyId: assignment.storyId,
    status: "ready-to-submit" as const,
    assignmentFingerprint: assignment.assignmentFingerprint,
    packageFingerprint: validated.globalVisualPackage.packageFingerprint,
    rendererSourceGraphFingerprint:
      validated.globalVisualPackage.rendererSourceGraphFingerprint,
    mechanicalCheckFingerprint: validated.mechanicalCheckFingerprint,
  } as const;
};
