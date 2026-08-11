import { GlobalVisualAssignmentSchema } from "../../../src/contracts";
import { redactProductionErrorDescription } from "../domain/error-redaction";
import { readProductionRunStore } from "../adapters/run-store";
import {
  assertGlobalVisualResultState,
  loadStoredGlobalVisualAssignment,
  readExistingGlobalVisualResult,
} from "./global-visual-check";
import {
  createGlobalVisualFailureResult,
  writeGlobalVisualProductionResult,
} from "./global-visual-submit";
import type { GlobalVisualAssignmentResolver } from "./global-visual-check";

export const runProductionGlobalVisualFail = async ({
  rootDir,
  runId,
  code,
  description,
  resolveAssignment = loadStoredGlobalVisualAssignment,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly code: string;
  readonly description: string;
  readonly resolveAssignment?: GlobalVisualAssignmentResolver;
}) => {
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u.test(code) || code.length > 96) {
    throw new Error("GlobalVisual failure code is invalid.");
  }
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
  const redacted = redactProductionErrorDescription({
    error: description,
    fallback: "Global visual production failed.",
  });
  const result = createGlobalVisualFailureResult({
    assignment,
    code,
    description: redacted.description,
    redactionApplied: redacted.redactionApplied,
    commandId: "production-global-visual-fail",
  });
  const existing = await readExistingGlobalVisualResult({ rootDir, runId });
  if (
    existing !== null &&
    (existing.status !== "failure" ||
      existing.resultFingerprint !== result.resultFingerprint)
  ) {
    throw new Error("A conflicting GlobalVisual result already exists.");
  }
  return writeGlobalVisualProductionResult({ rootDir, result });
};
