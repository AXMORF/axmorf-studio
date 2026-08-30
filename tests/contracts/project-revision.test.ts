import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_REVISION_BASE_SNAPSHOT_SCOPES,
  ProjectRevisionCandidateRecordSchema,
  ProjectRevisionContinuationResultSchema,
  ProjectRevisionInputSchema,
  ProjectRevisionValidationResultSchema,
  buildProjectRevisionCandidateRecord,
  buildProjectRevisionPromotionRetryCommand,
  computeProjectRevisionCandidateId,
} from "../../packages/studio/src/contracts/project-revision";
import { validProjectCreateInput } from "../fixtures/project-create";

const baseRevisionId = `revision-${"a".repeat(64)}`;
const baseDeliveryBuildId = `delivery-${"b".repeat(64)}`;
const expectedRevisionId = `revision-${"c".repeat(64)}`;
const expectedDeliveryBuildId = `delivery-${"d".repeat(64)}`;

const revisionInput = {
  schemaVersion: 1,
  contractVersion: "project-revision-input-v1",
  storyId: validProjectCreateInput.storyId,
  baseRevisionId,
  baseDeliveryBuildId,
  patch: {
    brief: {
      ...validProjectCreateInput.brief,
      audience: "A revised audience with a narrower goal.",
    },
  },
} as const;

const emptyBaseTrees = PROJECT_REVISION_BASE_SNAPSHOT_SCOPES.map((scope) => ({
  scope,
  entries: [],
}));

const continuationResultBase = () => {
  const candidateId = computeProjectRevisionCandidateId(revisionInput);
  return {
    schemaVersion: 1,
    contractVersion: "project-revision-continuation-v1",
    storyId: revisionInput.storyId,
    candidateId,
    base: {
      revisionId: baseRevisionId,
      deliveryBuildId: baseDeliveryBuildId,
    },
    expected: {
      revisionId: expectedRevisionId,
      deliveryBuildId: expectedDeliveryBuildId,
    },
    production: {
      status: "project-production-complete",
      attemptId: "00000000-0000-4000-8000-000000000001",
      state: "succeeded",
      deliveryStatus: "verified",
      revisionId: expectedRevisionId,
      deliveryBuildId: expectedDeliveryBuildId,
    },
  } as const;
};

test("Project revision input is strict and binds deterministic identity to both current IDs", () => {
  const parsed = ProjectRevisionInputSchema.parse(revisionInput);
  const candidateId = computeProjectRevisionCandidateId(parsed);
  assert.equal(candidateId, computeProjectRevisionCandidateId(revisionInput));
  assert.notEqual(
    candidateId,
    computeProjectRevisionCandidateId({
      ...revisionInput,
      baseDeliveryBuildId: `delivery-${"c".repeat(64)}`,
    }),
  );
  assert.notEqual(
    candidateId,
    computeProjectRevisionCandidateId({
      ...revisionInput,
      baseRevisionId: `revision-${"d".repeat(64)}`,
    }),
  );
});

test("Project revision rejects wrappers, empty patches, unknown sections, and cross-Project values", () => {
  for (const invalid of [
    { command: "project-revise", input: revisionInput },
    { ...revisionInput, patch: {} },
    { ...revisionInput, patch: { unsupported: true } },
    {
      ...revisionInput,
      patch: {
        brief: { ...revisionInput.patch.brief, storyId: "other-story" },
      },
    },
  ]) {
    assert.throws(() => ProjectRevisionInputSchema.parse(invalid));
  }
});

test("Project revision exposes only narrow authored Story and style fields", () => {
  assert.doesNotThrow(() =>
    ProjectRevisionInputSchema.parse({
      ...revisionInput,
      patch: { story: validProjectCreateInput.story },
    }),
  );
  assert.throws(() =>
    ProjectRevisionInputSchema.parse({
      ...revisionInput,
      patch: {
        story: {
          ...validProjectCreateInput.story,
          beats: [
            {
              kind: "silent-scene",
              meaningId: "intro",
              narrativePurpose: "Attempt to edit a fixed boundary.",
            },
          ],
        },
      },
    }),
  );
  assert.throws(() =>
    ProjectRevisionInputSchema.parse({
      ...revisionInput,
      patch: {
        visualStyle: {
          ...validProjectCreateInput.visualStyle,
          resourceCatalogFingerprint: `sha256:${"f".repeat(64)}`,
        },
      },
    }),
  );
});

test("Project revision validation results require canonical changed sections", () => {
  const result = {
    schemaVersion: 1,
    contractVersion: "project-revision-input-v1",
    status: "project-revision-valid",
    storyId: revisionInput.storyId,
    candidateId: computeProjectRevisionCandidateId(revisionInput),
    baseRevisionId,
    baseDeliveryBuildId,
  } as const;
  assert.throws(() =>
    ProjectRevisionValidationResultSchema.parse({
      ...result,
      changedSections: ["story", "brief"],
    }),
  );
  assert.throws(() =>
    ProjectRevisionValidationResultSchema.parse({
      ...result,
      changedSections: ["brief", "brief"],
    }),
  );
});

test("Project revision continuation strictly reports complete and promotion-pending terminals", () => {
  const base = continuationResultBase();
  assert.doesNotThrow(() =>
    ProjectRevisionContinuationResultSchema.parse({
      ...base,
      status: "project-revision-complete",
      promotion: { status: "project-revision-promoted" },
    }),
  );
  const retryCommand = buildProjectRevisionPromotionRetryCommand({
    storyId: base.storyId,
    candidateId: base.candidateId,
    expectedRevisionId: base.expected.revisionId,
    expectedDeliveryBuildId: base.expected.deliveryBuildId,
  });
  assert.doesNotThrow(() =>
    ProjectRevisionContinuationResultSchema.parse({
      ...base,
      status: "project-revision-promotion-pending",
      promotion: {
        status: "project-revision-promotion-failed",
        failure: {
          code: "project-revision-promotion-failed",
          message:
            "Candidate production succeeded, but promotion did not complete.",
        },
      },
      retryCommand,
    }),
  );
});

test("Project revision continuation rejects stale tuples, unsafe failures, and retry drift", () => {
  const base = continuationResultBase();
  const pending = {
    ...base,
    status: "project-revision-promotion-pending",
    promotion: {
      status: "project-revision-promotion-failed",
      failure: {
        code: "project-revision-promotion-failed",
        message:
          "Candidate production succeeded, but promotion did not complete.",
      },
    },
    retryCommand: buildProjectRevisionPromotionRetryCommand({
      storyId: base.storyId,
      candidateId: base.candidateId,
      expectedRevisionId: base.expected.revisionId,
      expectedDeliveryBuildId: base.expected.deliveryBuildId,
    }),
  } as const;
  for (const invalid of [
    {
      ...pending,
      production: { ...pending.production, revisionId: baseRevisionId },
    },
    {
      ...pending,
      promotion: {
        ...pending.promotion,
        failure: {
          ...pending.promotion.failure,
          message: "Promotion failed at /home/user/private/token.txt",
        },
      },
    },
    { ...pending, retryCommand: `${pending.retryCommand} --force` },
    { ...pending, unexpected: true },
  ]) {
    assert.throws(() => ProjectRevisionContinuationResultSchema.parse(invalid));
  }
});

test("candidate record distinguishes patched sections from future effective changes", () => {
  const record = buildProjectRevisionCandidateRecord({
    input: revisionInput,
    baseTrees: emptyBaseTrees,
  });
  assert.deepEqual(record.patchedSections, ["brief"]);
  assert.equal(record.baseSnapshot.storyId, revisionInput.storyId);
  assert.equal(record.baseSnapshot.baseRevisionId, baseRevisionId);
  assert.equal(record.baseSnapshot.baseDeliveryBuildId, baseDeliveryBuildId);
  assert.deepEqual(
    record.baseSnapshot.trees.map(({ scope }) => scope),
    PROJECT_REVISION_BASE_SNAPSHOT_SCOPES,
  );

  assert.throws(() =>
    ProjectRevisionCandidateRecordSchema.parse({
      ...record,
      patchedSections: ["story"],
    }),
  );
  assert.throws(() =>
    ProjectRevisionCandidateRecordSchema.parse({
      ...record,
      baseSnapshot: {
        ...record.baseSnapshot,
        baseDeliveryBuildId: `delivery-${"e".repeat(64)}`,
      },
    }),
  );
});

test("candidate record rejects non-canonical or incomplete base manifests", () => {
  assert.throws(() =>
    buildProjectRevisionCandidateRecord({
      input: revisionInput,
      baseTrees: emptyBaseTrees.slice(1),
    }),
  );
  assert.throws(() =>
    buildProjectRevisionCandidateRecord({
      input: revisionInput,
      baseTrees: PROJECT_REVISION_BASE_SNAPSHOT_SCOPES.map((scope) => ({
        scope,
        entries:
          scope === "source"
            ? [
                { logicalPath: "z.json", kind: "directory" as const },
                { logicalPath: "a.json", kind: "directory" as const },
              ]
            : [],
      })),
    }),
  );
});
