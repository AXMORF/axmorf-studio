import { MeaningIdSchema, SceneAssignmentSchema } from "../../../src/contracts";
import { redactProductionErrorDescription } from "../adapters/error-redaction";
import { readProductionRunStore } from "../adapters/run-store";
import {
  createSceneFailureResult,
  loadStoredSceneAssignment,
  readExistingSceneResult,
  writeSceneProductionResult,
} from "./scene-submit";

type SceneAssignmentResolver = typeof loadStoredSceneAssignment;

export const runProductionSceneFail = async ({
  rootDir,
  runId,
  meaningId: rawMeaningId,
  code,
  description,
  clock = () => new Date(),
  resolveAssignment = loadStoredSceneAssignment,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningId: string;
  readonly code: string;
  readonly description: string;
  readonly clock?: () => Date;
  readonly resolveAssignment?: SceneAssignmentResolver;
}) => {
  const meaningId = MeaningIdSchema.parse(rawMeaningId);
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u.test(code) || code.length > 96) {
    throw new Error("Scene failure code is invalid.");
  }
  const loaded = await readProductionRunStore({ rootDir, runId });
  if (
    loaded.state.state !== "scene-inputs-frozen" &&
    loaded.state.state !== "scenes-running"
  ) {
    throw new Error("Scene failures require frozen Scene inputs.");
  }
  const assignment = SceneAssignmentSchema.parse(
    await resolveAssignment({ rootDir, runId, meaningId }),
  );
  if (
    assignment.runId !== loaded.run.runId ||
    assignment.storyId !== loaded.run.storyId ||
    assignment.meaningId !== meaningId
  ) {
    throw new Error("SceneAssignment identity does not match the run.");
  }
  const redacted = redactProductionErrorDescription({
    error: description,
    fallback: "Scene production failed.",
  });
  const existing = await readExistingSceneResult({
    rootDir,
    runId,
    meaningId,
  });
  const result = createSceneFailureResult({
    assignment,
    code,
    description: redacted.description,
    redactionApplied: redacted.redactionApplied,
    occurredAt: existing?.occurredAt ?? clock().toISOString(),
    commandId: "production-scene-fail",
  });
  if (
    existing !== null &&
    (existing.status !== "failure" ||
      existing.resultFingerprint !== result.resultFingerprint)
  ) {
    throw new Error("A conflicting Scene production result already exists.");
  }
  return writeSceneProductionResult({ rootDir, result });
};
