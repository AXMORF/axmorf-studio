import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthoringValidationError,
  ProjectCreateInputSchema,
  buildAuthoringValidationFailure,
  collectCaptionAuthoringIssues,
  formatJsonPath,
  measureCaptionDisplayBudget,
  resolveSceneReadabilityPolicy,
  validateStoryCaptionReadability,
} from "@axmorf/studio/contracts";
import { validProjectCreateInput } from "../fixtures/project-create";

const storyWithCaption = (ttsText: string) => ({
  ...validProjectCreateInput.story,
  beats: [
    {
      ...validProjectCreateInput.story.beats[0],
      ttsChunks: [{ chunkId: "opening-01", ttsText }],
    },
  ],
});

test("caption measurement is the shared half-unit authority", () => {
  assert.deepEqual(
    measureCaptionDisplayBudget({
      chunkId: "opening-01",
      ttsText: `${"A".repeat(4)}${"专".repeat(34)}`,
    }),
    {
      chunkId: "opening-01",
      ttsText: `${"A".repeat(4)}${"专".repeat(34)}`,
      displayHalfUnits: 72,
      maxDisplayHalfUnits: 72,
      exceedsBudget: false,
    },
  );
  assert.equal(
    measureCaptionDisplayBudget({
      chunkId: "opening-01",
      ttsText: "专".repeat(37),
    }).displayHalfUnits,
    74,
  );
});

test("caption authoring policy stays outside generic Story schemas and is rechecked by production requirements", () => {
  const story = storyWithCaption("专".repeat(37));
  assert.doesNotThrow(() =>
    ProjectCreateInputSchema.parse({ ...validProjectCreateInput, story }),
  );
  assert.throws(
    () =>
      validateStoryCaptionReadability({
        story,
        policy: resolveSceneReadabilityPolicy({
          width: 1080,
          height: 1920,
        }),
      }),
    /74 half-units.*72 half-units/iu,
  );
});

test("caption authoring issues preserve semantic paths and machine details", () => {
  const createIssues = collectCaptionAuthoringIssues({
    story: storyWithCaption("专".repeat(37)),
    pathPrefix: ["story"],
  });
  const revisionIssues = collectCaptionAuthoringIssues({
    story: storyWithCaption("专".repeat(37)),
    pathPrefix: ["patch", "story"],
  });

  assert.deepEqual(createIssues, [
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
  ]);
  assert.equal(
    revisionIssues[0]?.path,
    "$.patch.story.beats[0].ttsChunks[0].ttsText",
  );
});

test("JSONPath formatting is deterministic for property and array segments", () => {
  assert.equal(
    formatJsonPath(["patch", "story", "not-an-identifier", 2]),
    '$.patch.story["not-an-identifier"][2]',
  );
  assert.throws(() => formatJsonPath(["beats", -1]), /non-negative/iu);
});

test("authoring validation failures retain structured field issues", () => {
  const issues = collectCaptionAuthoringIssues({
    story: storyWithCaption("专".repeat(37)),
    pathPrefix: ["story"],
  });
  const failure = buildAuthoringValidationFailure(
    new AuthoringValidationError(issues),
  );
  assert.equal(failure.status, "error");
  assert.equal(failure.code, "authoring-validation-failed");
  assert.deepEqual(failure.issues, issues);
});
