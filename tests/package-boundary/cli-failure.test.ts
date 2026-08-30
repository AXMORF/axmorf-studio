import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthoringValidationError,
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
        ttsChunks: [
          { chunkId: "opening-01", ttsText: "专".repeat(37) },
        ],
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
    serialized:
      '{"status":"error","code":"command-failed","message":"boom"}',
    exitCode: 1,
  });
});
