import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthoringValidationError,
  AuthoringSchemaValidationError,
  ProjectCreateInputSchema,
  AuthoringRequirementSchema,
  collectCaptionAuthoringIssues,
} from "@axmorf/studio/contracts";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import { validProjectCreateInput } from "../fixtures/project-create";

test("root and packaged CLIs share structured authoring failure serialization", () => {
  const story = {
    ...validProjectCreateInput.story,
    beats: [
      {
        ...validProjectCreateInput.story.beats[0],
        ttsChunks: [{ chunkId: "opening-01", ttsText: "专".repeat(37) }],
      },
    ],
  };
  const report = reportCliFailure(
    new AuthoringValidationError(
      collectCaptionAuthoringIssues({ story, pathPrefix: ["story"] }),
    ),
  );

  assert.equal(report.exitCode, 2);
  assert.deepEqual(JSON.parse(report.serialized), report.failure);
  assert.deepEqual(report.failure, {
    status: "error",
    code: "authoring-validation-failed",
    message: "Project authoring input failed validation.",
    issues: [
      {
        path: "$.story.beats[0].ttsChunks[0].ttsText",
        code: "caption-display-budget-exceeded",
        message:
          "TTS chunk opening-01 uses 74 half-units and exceeds the 72 half-units caption budget.",
        ownerAction:
          "Split this text into adjacent ttsChunks while preserving narration order, then validate the same raw input again.",
        details: {
          algorithmId: "caption-display-unit-v1",
          chunkId: "opening-01",
          displayHalfUnits: 74,
          maxDisplayHalfUnits: 72,
        },
      },
    ],
  });
});

test("unclassified failures remain operational errors", () => {
  assert.deepEqual(reportCliFailure(new Error("boom")), {
    failure: { status: "error", code: "command-failed", message: "boom" },
    serialized: '{"status":"error","code":"command-failed","message":"boom"}',
    exitCode: 1,
  });
});

test("packaged CLI preserves structured Agent authored-output finalization diagnostics", () => {
  const error = Object.assign(
    new Error(
      "Agent-authored output failed schema validation: src/shot-plan.json.",
    ),
    {
      name: "AgentTaskFinalizationError",
      code: "task-output-invalid",
      diagnostic: {
        file: "src/shot-plan.json",
        path: ["shots", 0],
        code: "custom",
        message: "Shot order identities ranges or anchors are invalid.",
        failureOwner: "agent-output",
        repairHint: "Correct src/shot-plan.json and rerun finalize.",
      },
    },
  );
  const report = reportCliFailure(error);
  assert.equal(report.exitCode, 2);
  assert.deepEqual(JSON.parse(report.serialized), {
    status: "error",
    code: "task-output-invalid",
    message: error.message,
    diagnostic: error.diagnostic,
  });
});

test("invalid requirement strings return actionable structured errors without accepting invalid input", () => {
  const result = ProjectCreateInputSchema.safeParse({
    ...validProjectCreateInput,
    production: {
      ...validProjectCreateInput.production,
      additionalRequirements: ["explain math limits"],
    },
  });
  assert.equal(result.success, false);
  if (result.success) throw new Error("Expected strict rejection");
  const report = reportCliFailure(
    new AuthoringSchemaValidationError(result.error),
  );
  const failure = JSON.parse(report.serialized);
  assert.equal(report.exitCode, 2);
  assert.equal(failure.code, "schema-validation-failed");
  assert.equal(
    failure.issues[0].path,
    "$.production.additionalRequirements[0]",
  );
  assert.equal(failure.issues[0].code, "invalid_type");
  assert.equal(failure.truncated, false);
  AuthoringRequirementSchema.parse(failure.issues[0].example[0]);
  assert.equal(
    ProjectCreateInputSchema.safeParse({
      ...validProjectCreateInput,
      production: {
        ...validProjectCreateInput.production,
        additionalRequirements: failure.issues[0].example,
      },
    }).success,
    true,
  );
});

test("stored-contract corruption remains an operational failure without draft repair instructions", () => {
  const result = ProjectCreateInputSchema.safeParse({});
  if (result.success) throw new Error("Expected invalid stored contract");
  const report = reportCliFailure(result.error);
  assert.equal(report.failure.code, "command-failed");
  assert.equal(report.exitCode, 1);
  assert.doesNotMatch(
    report.serialized,
    /ownerAction|schema-validation-failed/,
  );
});
