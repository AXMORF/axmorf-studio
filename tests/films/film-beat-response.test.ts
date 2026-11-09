import assert from "node:assert/strict";
import test from "node:test";
import {
  FilmReviewMotionSchema,
  type FilmReviewMotionEvent,
} from "@axmorf/studio/contracts";
import { analyzeBeatResponses } from "../../scripts/films/beat-response";

type Event = FilmReviewMotionEvent;
const track: Event = {
  type: "scene-track",
  scenes: [
    {
      id: "meter",
      chapter: "proof",
      boundaryFrame: 0,
      endFrame: 60,
      enter: null,
    },
    {
      id: "receipt",
      chapter: "proof",
      boundaryFrame: 60,
      endFrame: 120,
      enter: null,
    },
    {
      id: "result",
      chapter: "answer",
      boundaryFrame: 120,
      endFrame: 180,
      enter: null,
    },
  ],
};
const response = (
  kind: string,
  frames = [0, 120],
  object = "receipt",
  scope: "object" | "global" = "object",
): Event => ({ type: "rhythm-response", object, kind, frames, scope });
const analyze = (
  events: Event[],
  complete = true,
  music: { sectionFrames: number[] } | null = null,
) => analyzeBeatResponses({ events, complete, music, durationInFrames: 180 });

test("three distinct object actions per chapter pass; repeated logs do not inflate diversity", () => {
  const events = [
    track,
    response("boil"),
    response("stamp", [60, 135], "stamp"),
    response("pen", [90, 150], "pen"),
  ];
  const result = analyze([...events, ...events.slice(1)]);
  assert.deepEqual(result.motionWarnings, []);
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(
    result.summary?.map((s) => [s.chapter, s.kinds.length, s.objects]),
    [
      ["proof", 3, ["receipt", "stamp", "pen"]],
      ["answer", 3, ["receipt", "stamp", "pen"]],
    ],
  );
});
test("one kind across many objects and many global kinds never count as variety", () => {
  const result = analyze([
    track,
    response("lift"),
    response("lift", [30, 140], "pen"),
    response("global-scale"),
    response("global-light"),
    response("vignette", [0, 120], "global"),
    response("breath-scale", [0, 120], "renamed"),
  ]);
  assert.equal(result.motionWarnings.length, 2);
  assert.equal(result.summary?.[0].kinds.length, 1);
  assert.equal(result.summary?.[0].globalKinds.length, 4);
  assert.match(result.motionWarnings[0].message, /proof.*receipt.*pen.*全局/u);
});
test("global-only chapters warn even when a caller pretends the scope is object", () => {
  const result = analyze([
    track,
    response("global-scale"),
    response("global-light"),
  ]);
  assert.equal(result.motionWarnings.length, 2);
  assert.deepEqual(result.summary?.[0].kinds, []);
  assert.deepEqual(result.summary?.[0].objects, []);
});
test("half-open chapter boundaries do not borrow reactions from the next chapter", () => {
  const result = analyze([
    track,
    response("lift", [0]),
    response("stamp", [60]),
    response("pen", [120]),
  ]);
  assert.deepEqual(
    result.summary?.map((s) => [s.chapter, s.kinds]),
    [
      ["proof", ["lift", "stamp"]],
      ["answer", ["pen"]],
    ],
  );
  assert.deepEqual(
    result.motionWarnings.map((w) => w.frames),
    [
      [0, 120],
      [120, 180],
    ],
  );
});
test("score sections support films without scene tracks; missing/truncated/legacy telemetry is unknown", () => {
  const actions = [response("lift"), response("stamp"), response("pen")];
  const sections = analyze(actions, true, { sectionFrames: [0, 120] });
  assert.deepEqual(sections.motionWarnings, []);
  assert.equal(sections.summary?.length, 2);
  for (const result of [
    analyze([track]),
    analyze([track, ...actions], false),
    analyze(actions),
    analyze([track, track, ...actions]),
    analyze([track, response("lift", [])]),
  ]) {
    assert.ok(result.unknown.length);
    assert.equal(result.motionWarnings.length, 0);
  }
  const partial = analyze([track, response("lift", [0])]);
  assert.equal(partial.motionWarnings.length, 1);
  assert.match(partial.unknown[0].reason, /answer/u);
});
test("response telemetry is bounded, strict and backward-compatible", () => {
  const record = {
    index: 0,
    frame: 0,
    events: [response("stamp")],
    truncated: false,
  };
  assert.ok(FilmReviewMotionSchema.safeParse(record).success);
  assert.ok(
    FilmReviewMotionSchema.safeParse({
      ...record,
      events: [{ type: "rhythm", kind: "pulse", frames: [0] }],
    }).success,
  );
  assert.equal(
    FilmReviewMotionSchema.safeParse({
      ...record,
      events: [{ ...response("stamp"), object: "" }],
    }).success,
    false,
  );
  assert.equal(
    FilmReviewMotionSchema.safeParse({
      ...record,
      events: [{ ...response("stamp"), frames: [-1] }],
    }).success,
    false,
  );
});
