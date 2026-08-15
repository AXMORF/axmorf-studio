import {
  GlobalVisualAssignmentSchema,
  GlobalVisualProductionResultSchema,
  buildGlobalVisualProductionResult,
  createProductionError,
  serializeCanonicalJson,
  type GlobalVisualAssignment,
  type GlobalVisualProductionResult,
} from "../../../src/contracts";
import { redactProductionErrorDescription } from "../domain/error-redaction";
import {
  getProductionRunPaths,
  readProductionRunStore,
} from "../adapters/run-store";
import { writeTextFileAtomic } from "../../shared/atomic-file";
import {
  assertGlobalVisualResultState,
  loadCurrentGlobalVisualAssignment,
  readExistingGlobalVisualResult,
  runProductionGlobalVisualCheck,
  type GlobalVisualAssignmentResolver,
  type GlobalVisualValidator,
} from "./global-visual-check";
import { validateGlobalVisualFromProjectFiles } from "./global-visual-validator";

export const writeGlobalVisualProductionResult = async ({
  rootDir,
  result: rawResult,
}: {
  readonly rootDir: string;
  readonly result: GlobalVisualProductionResult;
}) => {
  const result = GlobalVisualProductionResultSchema.parse(rawResult);
  const resultPath = getProductionRunPaths({
    rootDir,
    runId: result.runId,
  }).globalVisualResult;
  const write = await writeTextFileAtomic({
    destination: resultPath,
    bytes: `${serializeCanonicalJson(result)}\n`,
    mode: "create",
  });
  return { result, resultPath, written: write.written } as const;
};

export const createGlobalVisualFailureResult = ({
  assignment,
  code,
  description,
  redactionApplied,
  commandId,
}: {
  readonly assignment: GlobalVisualAssignment;
  readonly code: string;
  readonly description: string;
  readonly redactionApplied: boolean;
  readonly commandId:
    | "production-global-visual-submit"
    | "production-global-visual-fail";
}) =>
  buildGlobalVisualProductionResult({
    status: "failure",
    runId: assignment.runId,
    storyId: assignment.storyId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    error: createProductionError({
      kind: "expected",
      code,
      stageId: "scenes",
      scope: "global-visual",
      meaningId: null,
      summary: "Global visual production did not complete.",
      description,
      retryable: false,
      remediation:
        "Inspect the frozen GlobalVisual assignment and start a fresh production run after correcting the owned input.",
      commandId,
      inputFingerprint: assignment.assignmentFingerprint,
      redactionApplied,
    }),
  });

export const runProductionGlobalVisualSubmit = async ({
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
  const existing = await readExistingGlobalVisualResult({ rootDir, runId });
  try {
    const validated = await validateGlobalVisual({ rootDir, assignment });
    const success = buildGlobalVisualProductionResult({
      status: "success",
      runId: assignment.runId,
      storyId: assignment.storyId,
      assignmentFingerprint: assignment.assignmentFingerprint,
      requirementsFingerprint: assignment.requirementsFingerprint,
      globalVisualPackage: {
        repositoryPath: `src/projects/${assignment.storyId}/global-visual/generated/global-visual-package.generated.json`,
        packageFingerprint: validated.globalVisualPackage.packageFingerprint,
      },
      globalVisualPlanFingerprint:
        validated.globalVisualPackage.globalVisualPlanFingerprint,
      rendererSourceGraphFingerprint:
        validated.globalVisualPackage.rendererSourceGraphFingerprint,
      selectedResourcesFingerprint:
        validated.globalVisualPackage.selectedResourcesFingerprint,
      mechanicalCheckFingerprint: validated.mechanicalCheckFingerprint,
    });
    if (
      existing !== null &&
      (existing.status !== "success" ||
        existing.resultFingerprint !== success.resultFingerprint)
    ) {
      throw new Error("A conflicting GlobalVisual result already exists.");
    }
    return writeGlobalVisualProductionResult({ rootDir, result: success });
  } catch (error) {
    if (existing?.status === "success") throw error;
    const redacted = redactProductionErrorDescription({
      error,
      fallback: "GlobalVisual submit validation failed.",
    });
    const failure = createGlobalVisualFailureResult({
      assignment,
      code: /(?:resource.*outside|outside.*resource|allowlist)/iu.test(
        redacted.description,
      )
        ? "RESOURCE_NOT_ALLOWED"
        : "GLOBAL_VISUAL_SUBMIT_FAILED",
      description: redacted.description,
      redactionApplied: redacted.redactionApplied,
      commandId: "production-global-visual-submit",
    });
    if (
      existing !== null &&
      (existing.status !== "failure" ||
        existing.resultFingerprint !== failure.resultFingerprint)
    ) {
      throw new Error("A conflicting GlobalVisual result already exists.");
    }
    await writeGlobalVisualProductionResult({ rootDir, result: failure });
    throw error;
  }
};

export { runProductionGlobalVisualCheck };
