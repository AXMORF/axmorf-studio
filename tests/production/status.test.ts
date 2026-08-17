import assert from "node:assert/strict";
import test from "node:test";

import { buildProductionOwnerReceipt } from "../../src/contracts";
import { runProductionStatus } from "../../scripts/production/application/status";
import { computeExpectedOwnerReceiptIdentities } from "../../scripts/production/domain/expected-owner-identities";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const sceneAssignments = [
  {
    meaningId: "narrated-owner",
    assignmentFingerprint: sha("1"),
    requirementsFingerprint: sha("a"),
    taskInput: {
      taskInputFingerprint: sha("b"),
      storyBeat: { kind: "narrated-scene" as const },
    },
  },
  {
    meaningId: "silent-owner",
    assignmentFingerprint: sha("2"),
    requirementsFingerprint: sha("a"),
    taskInput: {
      taskInputFingerprint: sha("c"),
      storyBeat: {
        kind: "silent-scene" as const,
        preset: { implementation: { kind: "scene-owner" as const } },
      },
    },
  },
  {
    meaningId: "template-copy",
    assignmentFingerprint: sha("3"),
    requirementsFingerprint: sha("a"),
    taskInput: {
      taskInputFingerprint: sha("d"),
      storyBeat: {
        kind: "silent-scene" as const,
        preset: { implementation: { kind: "template-copy" as const } },
      },
    },
  },
];
const globalVisualAssignment = {
  assignmentFingerprint: sha("4"),
  requirementsFingerprint: sha("a"),
};
const coverAssignment = { assignmentFingerprint: sha("5") };
const expected = computeExpectedOwnerReceiptIdentities({
  sceneAssignments,
  globalVisualAssignment,
  coverAssignment,
});

const receiptFor = (
  identity:
    | (typeof expected.renderReadyRequired)[number]
    | (typeof expected.deliveryOnly)[number],
) =>
  buildProductionOwnerReceipt({
    runId: "story-example-run-001",
    storyId: "story-example",
    ...identity,
    inputFingerprints: [
      { artifactId: "assignment", fingerprint: identity.assignmentFingerprint },
    ],
    outputManifest: [],
    occurredAt: "2026-08-18T00:00:00.000Z",
    status: "owner-ready",
  });

test("production status uses expected owner identities and never reports template copies", async () => {
  const stored = new Map<string, ReturnType<typeof receiptFor>>();
  const key = (ownerKind: string, meaningId: string | null) =>
    `${ownerKind}:${meaningId ?? "story"}`;
  const dependencies = {
    readRun: async () => ({
      run: {
        runId: "story-example-run-001",
        storyId: "story-example",
        requirementsFingerprint: sha("a"),
      },
      state: { state: "waiting-for-owner-results", lastSequence: 3 },
    }),
    resolveAssignments: async () => ({
      assignments: sceneAssignments,
      globalVisualAssignment,
    }),
    resolveCover: async () => ({ assignment: coverAssignment }),
    readReceipt: async (request: {
      ownerKind: string;
      meaningId: string | null;
    }) => stored.get(key(request.ownerKind, request.meaningId)) ?? null,
  };

  const read = () =>
    runProductionStatus({
      rootDir: "/repo",
      runId: "story-example-run-001",
      dependencies: dependencies as never,
    });
  const missing = await read();
  assert.deepEqual(
    missing.missingRenderReadyOwnerAssignments.map((identity) => [
      identity.ownerKind,
      identity.meaningId,
    ]),
    [
      ["scene", "narrated-owner"],
      ["scene", "silent-owner"],
      ["global-visual", null],
    ],
  );
  assert.deepEqual(
    missing.missingDeliveryOwnerAssignments.map((identity) => [
      identity.ownerKind,
      identity.meaningId,
    ]),
    [["cover", null]],
  );
  assert.equal(
    missing.missingOwnerAssignments.some(
      (identity) => identity.meaningId === "template-copy",
    ),
    false,
  );

  for (const identity of expected.renderReadyRequired) {
    stored.set(key(identity.ownerKind, identity.meaningId), receiptFor(identity));
  }
  const coverBlocked = await read();
  assert.deepEqual(coverBlocked.missingRenderReadyOwnerAssignments, []);
  assert.deepEqual(
    coverBlocked.missingDeliveryOwnerAssignments.map(
      (identity) => identity.ownerKind,
    ),
    ["cover"],
  );
});
