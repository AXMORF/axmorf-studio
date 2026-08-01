import assert from "node:assert/strict";
import test from "node:test";

import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
} from "../../src/contracts/generation-input";
import { NarrationSpecSchema } from "../../src/contracts/narration";
import {
  STORY_CHECK_IDS,
  StoryCheckReportSchema,
  validateStoryCheckReport,
} from "../../src/contracts/story-check";
import { StorySpecSchema } from "../../src/contracts/story";
import {
  validNarrationSpec,
  validStorySpec,
} from "../fixtures/narrative";

const story = StorySpecSchema.parse(validStorySpec);
const narration = NarrationSpecSchema.parse(validNarrationSpec);

const checks = STORY_CHECK_IDS.map((checkId) => ({
  checkId,
  status: "pass" as const,
  note: `Checked ${checkId}.`,
}));

const validStoryCheckReport = {
  schemaVersion: 1,
  storyId: story.storyId,
  storyFingerprint: computeStoryFingerprint(story),
  generationInputFingerprint: computeGenerationInputFingerprint(
    story,
    narration,
  ),
  voiceProfileId: narration.voiceProfileId,
  decision: "proceed",
  checks,
} as const;

test("a proceed report covers each required StoryCheck exactly once", () => {
  assert.doesNotThrow(() =>
    validateStoryCheckReport({
      story,
      narration,
      report: validStoryCheckReport,
    }),
  );
});

test("warnings do not create a user approval gate", () => {
  const warningReport = {
    ...validStoryCheckReport,
    checks: checks.map((check) =>
      check.checkId === "pronunciation-risks"
        ? { ...check, status: "warn" as const }
        : check,
    ),
  };

  assert.equal(
    validateStoryCheckReport({ story, narration, report: warningReport })
      .decision,
    "proceed",
  );
});

test("fail findings require revise and block external generation", () => {
  const failedChecks = checks.map((check) =>
    check.checkId === "narrative-completeness"
      ? { ...check, status: "fail" as const }
      : check,
  );
  const invalidProceedReport = {
    ...validStoryCheckReport,
    checks: failedChecks,
  };
  const reviseReport = {
    ...invalidProceedReport,
    decision: "revise" as const,
  };

  assert.throws(() =>
    validateStoryCheckReport({
      story,
      narration,
      report: invalidProceedReport,
    }),
  );
  assert.equal(
    validateStoryCheckReport({ story, narration, report: reviseReport })
      .decision,
    "revise",
  );
});

test("StoryCheck fails closed when source or voice selection is stale", () => {
  const changedStory = StorySpecSchema.parse({
    ...story,
    title: `${story.title} changed`,
  });
  const changedNarration = NarrationSpecSchema.parse({
    ...narration,
    voiceProfileId: "different-voice",
  });

  assert.throws(
    () =>
      validateStoryCheckReport({
        story: changedStory,
        narration,
        report: validStoryCheckReport,
      }),
    /story fingerprint is stale/i,
  );
  assert.throws(
    () =>
      validateStoryCheckReport({
        story,
        narration: changedNarration,
        report: validStoryCheckReport,
      }),
    /generation input fingerprint is stale/i,
  );
});

test("RenderSpec is not part of StoryCheck", () => {
  assert.equal("render" in validStoryCheckReport, false);
  assert.throws(() =>
    StoryCheckReportSchema.parse({
      ...validStoryCheckReport,
      render: { fps: 30 },
    }),
  );
});

test("required checks reject duplicate, missing, unknown, and out-of-order IDs", () => {
  const invalidChecks = [
    [checks[0], checks[0], ...checks.slice(2)],
    checks.slice(0, -1),
    [
      ...checks.slice(0, -1),
      { checkId: "unknown-check", status: "pass", note: "Unknown." },
    ],
    [checks[1], checks[0], ...checks.slice(2)],
  ];

  for (const candidateChecks of invalidChecks) {
    assert.throws(() =>
      StoryCheckReportSchema.parse({
        ...validStoryCheckReport,
        checks: candidateChecks,
      }),
    );
  }
});

test("notes must remain non-empty after trimming", () => {
  assert.throws(() =>
    StoryCheckReportSchema.parse({
      ...validStoryCheckReport,
      checks: checks.map((check, index) =>
        index === 0 ? { ...check, note: "   " } : check,
      ),
    }),
  );
});
