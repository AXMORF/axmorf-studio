import assert from "node:assert/strict";
import test from "node:test";

import { buildProductionOwnerReceipt } from "../../src/contracts";
import { readProductionOwnerReceiptProgress } from "../../scripts/production/application/progress-query";
import { computeExpectedOwnerReceiptIdentities } from "../../scripts/production/domain/expected-owner-identities";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const sceneAssignments = [
  {
    meaningId: "authored",
    assignmentFingerprint: sha("1"),
    requirementsFingerprint: sha("a"),
    taskInput: {
      taskInputFingerprint: sha("b"),
      storyBeat: { kind: "narrated-scene" as const },
    },
  },
  {
    meaningId: "template",
    assignmentFingerprint: sha("2"),
    requirementsFingerprint: sha("a"),
    taskInput: {
      taskInputFingerprint: sha("c"),
      storyBeat: {
        kind: "silent-scene" as const,
        preset: { implementation: { kind: "template-copy" as const } },
      },
    },
  },
];
const globalVisualAssignment = {
  assignmentFingerprint: sha("3"),
  requirementsFingerprint: sha("a"),
};
const coverAssignment = { assignmentFingerprint: sha("4") };
const expected = computeExpectedOwnerReceiptIdentities({
  sceneAssignments,
  globalVisualAssignment,
  coverAssignment,
});

const receiptFor = (
  identity: (typeof expected.renderReadyRequired)[number] | (typeof expected.deliveryOnly)[number],
  status: "owner-ready" | "owner-failed" = "owner-ready",
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
    status,
    ...(status === "owner-failed"
      ? {
          error: {
            code: "COVER_OWNER_FAILED",
            description: "Cover owner failed.",
            redactionApplied: false,
          },
        }
      : {}),
  });

test("receipt progress projects zero, partial, complete, template exclusion, and Cover block", async () => {
  const stored = new Map<string, ReturnType<typeof receiptFor>>();
  const key = (ownerKind: string, meaningId: string | null) =>
    `${ownerKind}:${meaningId ?? "story"}`;
  const dependencies = {
    readRun: async () => ({
      run: { storyId: "story-example" },
      state: { state: "scene-inputs-frozen" },
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
    readProductionOwnerReceiptProgress({
      rootDir: "/repo",
      runId: "story-example-run-001",
      dependencies: dependencies as never,
    });

  assert.deepEqual(await read(), {
    expectedRenderReadyReceipts: 2,
    receivedRenderReadyReceipts: 0,
    expectedSceneReceipts: 1,
    receivedSceneReceipts: 0,
    globalVisualReceipt: "missing",
    coverReceipt: "missing",
    latestReceiptAt: null,
  });

  const scene = expected.renderReadyRequired[0];
  stored.set(key(scene.ownerKind, scene.meaningId), receiptFor(scene));
  assert.deepEqual(await read(), {
    expectedRenderReadyReceipts: 2,
    receivedRenderReadyReceipts: 1,
    expectedSceneReceipts: 1,
    receivedSceneReceipts: 1,
    globalVisualReceipt: "missing",
    coverReceipt: "missing",
    latestReceiptAt: "2026-08-18T00:00:00.000Z",
  });

  const globalVisual = expected.renderReadyRequired[1];
  const cover = expected.deliveryOnly[0];
  stored.set(
    key(globalVisual.ownerKind, globalVisual.meaningId),
    receiptFor(globalVisual),
  );
  stored.set(
    key(cover.ownerKind, cover.meaningId),
    receiptFor(cover, "owner-failed"),
  );
  assert.deepEqual(await read(), {
    expectedRenderReadyReceipts: 2,
    receivedRenderReadyReceipts: 2,
    expectedSceneReceipts: 1,
    receivedSceneReceipts: 1,
    globalVisualReceipt: "owner-ready",
    coverReceipt: "owner-failed",
    latestReceiptAt: "2026-08-18T00:00:00.000Z",
  });
});
