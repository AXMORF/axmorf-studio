import assert from "node:assert/strict";
import test from "node:test";

import { computeExpectedOwnerReceiptIdentities } from "../../scripts/production/domain/expected-owner-identities";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("expected owner identities exclude template copies and separate the Cover delivery gate", () => {
  const result = computeExpectedOwnerReceiptIdentities({
    sceneAssignments: [
      {
        meaningId: "narrated",
        assignmentFingerprint: sha("1"),
        requirementsFingerprint: sha("a"),
        taskInput: {
          taskInputFingerprint: sha("b"),
          storyBeat: { kind: "narrated-scene" },
        },
      },
      {
        meaningId: "silent-owner",
        assignmentFingerprint: sha("2"),
        requirementsFingerprint: sha("a"),
        taskInput: {
          taskInputFingerprint: sha("c"),
          storyBeat: {
            kind: "silent-scene",
            preset: { implementation: { kind: "scene-owner" } },
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
            kind: "silent-scene",
            preset: { implementation: { kind: "template-copy" } },
          },
        },
      },
    ],
    globalVisualAssignment: {
      assignmentFingerprint: sha("4"),
      requirementsFingerprint: sha("a"),
    },
    coverAssignment: { assignmentFingerprint: sha("5") },
  });

  assert.deepEqual(result.renderReadyRequired, [
    {
      ownerKind: "scene",
      meaningId: "narrated",
      assignmentFingerprint: sha("1"),
      taskInputFingerprint: sha("b"),
      requirementsFingerprint: sha("a"),
    },
    {
      ownerKind: "scene",
      meaningId: "silent-owner",
      assignmentFingerprint: sha("2"),
      taskInputFingerprint: sha("c"),
      requirementsFingerprint: sha("a"),
    },
    {
      ownerKind: "global-visual",
      meaningId: null,
      assignmentFingerprint: sha("4"),
      taskInputFingerprint: null,
      requirementsFingerprint: sha("a"),
    },
  ]);
  assert.deepEqual(result.deliveryOnly, [
    {
      ownerKind: "cover",
      meaningId: null,
      assignmentFingerprint: sha("5"),
      taskInputFingerprint: null,
      requirementsFingerprint: null,
    },
  ]);
});

test("expected owner Scene identities are sorted by meaningId", () => {
  const result = computeExpectedOwnerReceiptIdentities({
    sceneAssignments: [
      {
        meaningId: "zeta",
        assignmentFingerprint: sha("1"),
        requirementsFingerprint: sha("a"),
        taskInput: {
          taskInputFingerprint: sha("b"),
          storyBeat: { kind: "narrated-scene" },
        },
      },
      {
        meaningId: "alpha",
        assignmentFingerprint: sha("2"),
        requirementsFingerprint: sha("a"),
        taskInput: {
          taskInputFingerprint: sha("c"),
          storyBeat: { kind: "narrated-scene" },
        },
      },
    ],
    globalVisualAssignment: {
      assignmentFingerprint: sha("4"),
      requirementsFingerprint: sha("a"),
    },
    coverAssignment: { assignmentFingerprint: sha("5") },
  });

  assert.deepEqual(
    result.renderReadyRequired.map(
      ({ ownerKind, meaningId }) => `${ownerKind}:${meaningId ?? "story"}`,
    ),
    ["scene:alpha", "scene:zeta", "global-visual:story"],
  );
});
