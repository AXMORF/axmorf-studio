import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "@axmorf/studio/contracts";
import { createSceneTaskInput } from "../fixtures/scene/scene-input";
import { validProjectCreateInput } from "../fixtures/project-create";

const subject = "The answer ribbon becomes a source-checking ribbon.";
const state = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  reveal: 1,
  value: 0,
};
const beat = (meaningId: string) => ({
  ...createSceneTaskInput().storyBeat,
  meaningId,
});
const brief = (
  meaningId: string,
  outgoingHandoff?: { subject: string; trackedState?: typeof state },
) => ({
  ...validProjectCreateInput.scenes[0],
  meaningId,
  ...(outgoingHandoff === undefined ? {} : { outgoingHandoff }),
});
const pair = (trackedState?: typeof state) => {
  const before = brief("before", {
    subject,
    ...(trackedState === undefined ? {} : { trackedState }),
  });
  const after = brief("after");
  const first = contracts.buildSceneContinuityContract({
    storyId: "synthetic-proof",
    beat: beat("before"),
    brief: before,
    previous: null,
    next: { beat: beat("after"), brief: after },
  });
  const second = contracts.buildSceneContinuityContract({
    storyId: "synthetic-proof",
    beat: beat("after"),
    brief: after,
    previous: { beat: beat("before"), brief: before },
    next: null,
  });
  assert.ok(first.outgoing.kind === "continuous");
  return { first: { ...first, outgoing: first.outgoing }, second };
};
const plan = (
  incoming: readonly unknown[],
  outgoing: readonly unknown[],
  kind: string,
  version = 2,
  boundary = state,
) =>
  contracts.SceneMotionPlanSchema.parse({
    schemaVersion: version,
    objects: [
      {
        objectId: "ribbon",
        meaning: subject,
        ...(version === 1
          ? {
              keyframes: [
                { frame: 0, state: boundary, easing: "linear" },
                { frame: 119, state: boundary, easing: "linear" },
              ],
            }
          : {}),
      },
    ],
    actions: [
      {
        actionId: "explain",
        shotId: "primary",
        kind: "hold",
        explanatoryPurpose: "Explain the source check",
        initialState: "Ribbon",
        resultingState: "Source checked",
        objectIds: ["ribbon"],
        frameRange: { startFrame: 0, endFrame: 120 },
        syncAnchorId: null,
        readingHoldFrames: 0,
      },
    ],
    handoff: { kind, reason: "A deliberate transition", incoming, outgoing },
  });

test("Independent Scene contracts freeze the same seam, subject and transition before dispatch", () => {
  const { first, second } = pair();
  assert.equal(first.outgoing.kind, "continuous");
  assert.deepEqual(first.outgoing, second.incoming);
  assert.equal(second.outgoing.kind, "end");
  assert.equal(pair().first.outgoing.continuityId, first.outgoing.continuityId);
  const changed = contracts.buildSceneContinuityContract({
    storyId: "another-story",
    beat: beat("before"),
    brief: brief("before", { subject }),
    previous: null,
    next: { beat: beat("after"), brief: brief("after") },
  });
  assert.ok(changed.outgoing.kind === "continuous");
  assert.notEqual(changed.outgoing.continuityId, first.outgoing.continuityId);
  assert.equal(
    contracts.computeSceneContinuityId(
      "synthetic-proof",
      "a".repeat(96),
      "b".repeat(96),
    ).length,
    72,
  );
});

test("Local validation rejects independently invented IDs and missing incoming promises before convergence", () => {
  const { first, second } = pair();
  const handoff = {
    continuityId: first.outgoing.continuityId,
    objectId: "ribbon",
  };
  assert.throws(
    () =>
      contracts.validateSceneMotionHandoffs(
        plan(
          [],
          [{ ...handoff, continuityId: "answer-strip-flow" }],
          "continuous",
        ),
        first,
      ),
    /frozen.*outgoing/u,
  );
  assert.throws(
    () => contracts.validateSceneMotionHandoffs(plan([], [], "end"), second),
    /frozen.*incoming/u,
  );
  const before = plan([], [handoff], "continuous");
  const after = plan([handoff], [], "end");
  assert.doesNotThrow(() =>
    contracts.validateSceneMotionHandoffs(before, first),
  );
  assert.doesNotThrow(() =>
    contracts.validateSceneMotionHandoffs(after, second),
  );
  assert.doesNotThrow(() =>
    contracts.validateMotionContinuity([before, after]),
  );
  assert.throws(
    () =>
      contracts.validateSceneMotionHandoffs(
        plan([], [], "motivated-cut"),
        first,
      ),
    /frozen.*kind/u,
  );
  assert.throws(
    () =>
      contracts.validateSceneMotionHandoffs(
        contracts.SceneMotionPlanSchema.parse({
          ...before,
          objects: [{ ...before.objects[0], meaning: "Another subject" }],
        }),
        first,
      ),
    /frozen.*subject/u,
  );
});

test("Optional tracked continuity freezes both poses and does not fabricate a pose for intent-only authoring", () => {
  const { first, second } = pair(state);
  const handoff = {
    continuityId: first.outgoing.continuityId,
    objectId: "ribbon",
  };
  const before = plan([], [handoff], "continuous", 1);
  const after = plan([handoff], [], "end", 1);
  assert.doesNotThrow(() =>
    contracts.validateSceneMotionHandoffs(before, first),
  );
  assert.doesNotThrow(() =>
    contracts.validateSceneMotionHandoffs(after, second),
  );
  assert.doesNotThrow(() =>
    contracts.validateMotionContinuity([before, after]),
  );
  assert.throws(
    () =>
      contracts.validateSceneMotionHandoffs(
        plan([handoff], [], "end", 1, { ...state, x: 0.1 }),
        second,
      ),
    /frozen.*pose/u,
  );
  assert.throws(
    () => contracts.validateSceneMotionHandoffs(before, pair().first),
    /trackedState/u,
  );
});

test("Unpromised transitions stay cuts, fixed template boundaries stay cuts and handoffs cannot escape the Story", () => {
  const plain = contracts.buildSceneContinuityContract({
    storyId: "synthetic-proof",
    beat: beat("before"),
    brief: brief("before"),
    previous: null,
    next: { beat: beat("after"), brief: brief("after") },
  });
  assert.equal(plain.outgoing.kind, "motivated-cut");
  assert.doesNotThrow(() =>
    contracts.validateSceneMotionHandoffs(plan([], [], "motivated-cut"), plain),
  );
  const template = { ...beat("fixed-boundary"), kind: "silent-scene" as const };
  assert.throws(
    () =>
      contracts.buildSceneContinuityContract({
        storyId: "synthetic-proof",
        beat: beat("before"),
        brief: brief("before", { subject }),
        previous: null,
        next: { beat: template, brief: brief("fixed-boundary") },
      }),
    /authored narrated/u,
  );
  assert.throws(
    () =>
      contracts.buildSceneContinuityContract({
        storyId: "synthetic-proof",
        beat: beat("before"),
        brief: brief("before", { subject }),
        previous: null,
        next: null,
      }),
    /authored narrated/u,
  );
});

test("Create and revision authoring accept a continuous seam but reject a promise after the last narrated Scene", () => {
  const scenes = [
    { ...validProjectCreateInput.scenes[0], outgoingHandoff: { subject } },
    { ...validProjectCreateInput.scenes[0], meaningId: "next" },
  ];
  const input = {
    ...validProjectCreateInput,
    story: {
      ...validProjectCreateInput.story,
      beats: [
        validProjectCreateInput.story.beats[0],
        {
          ...validProjectCreateInput.story.beats[0],
          meaningId: "next",
          ttsChunks: [{ chunkId: "next-01", ttsText: "Check the source." }],
        },
      ],
    },
    publishing: {
      ...validProjectCreateInput.publishing,
      chapters: [
        ...validProjectCreateInput.publishing.chapters,
        { meaningId: "next", name: "来源" },
      ],
    },
  };
  assert.doesNotThrow(() =>
    contracts.ProjectCreateInputSchema.parse({
      ...input,
      scenes,
    }),
  );
  const invalid = scenes.map((scene, index) =>
    index === scenes.length - 1
      ? { ...scene, outgoingHandoff: { subject } }
      : scene,
  );
  assert.throws(
    () =>
      contracts.ProjectCreateInputSchema.parse({
        ...input,
        scenes: invalid,
      }),
    /following narrated/u,
  );
  assert.throws(
    () =>
      contracts.ProjectRevisionEditableAuthoringSchema.parse({
        brief: input.brief,
        story: input.story,
        visualStyle: input.visualStyle,
        scenes: invalid,
        globalVisual: input.globalVisual,
        publishing: input.publishing,
      }),
    /following narrated/u,
  );
  assert.equal(
    "outgoingHandoff" in
      contracts.ProjectCreateInputSchema.parse(validProjectCreateInput)
        .scenes[0],
    false,
  );
});
