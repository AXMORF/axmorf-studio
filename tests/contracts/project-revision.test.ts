import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectRevisionInputSchema,
  computeProjectRevisionCandidateId,
} from "../../src/contracts";
import { validProjectCreateInput } from "../fixtures/project-create";

const baseRevisionId = `revision-${"a".repeat(64)}`;
const revisionInput = {
  schemaVersion: 1,
  contractVersion: "project-revision-input-v1",
  storyId: validProjectCreateInput.storyId,
  baseRevisionId,
  patch: {
    scenes: [
      {
        ...validProjectCreateInput.scenes[0],
        visualIntent: "Show a revised measured timeline.",
      },
    ],
  },
} as const;

test("Project revision accepts a strict authored patch and has deterministic candidate identity", () => {
  const parsed = ProjectRevisionInputSchema.parse(revisionInput);
  assert.equal(parsed.patch.scenes?.[0]?.meaningId, "opening");
  assert.equal(
    computeProjectRevisionCandidateId(parsed),
    computeProjectRevisionCandidateId({
      ...revisionInput,
      patch: { scenes: revisionInput.patch.scenes },
    }),
  );
});

test("Project revision rejects wrappers, empty patches, and cross-Project authoring", () => {
  for (const invalid of [
    { command: "project-revise", input: revisionInput },
    { ...revisionInput, patch: {} },
    {
      ...revisionInput,
      patch: {
        brief: {
          ...validProjectCreateInput.brief,
          storyId: "another-story",
        },
      },
    },
  ]) {
    assert.throws(() => ProjectRevisionInputSchema.parse(invalid));
  }
});
