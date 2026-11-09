import assert from "node:assert/strict";
import test from "node:test";
import {
  FilmReviewMeasurementSchema,
  FILM_REVIEW_MEASUREMENT_MARKER,
  type FilmReviewMeasurement,
  type FilmReviewGraphics,
} from "@axmorf/studio/contracts";
import { analyzeReviewReadability } from "../../scripts/films/readability";

type ObjectMeasurement = FilmReviewGraphics["objects"][number];
const object = (
  id: number,
  overrides: Partial<ObjectMeasurement> = {},
): ObjectMeasurement => ({
  id,
  label: `object-${id}`,
  role: "subject",
  kind: "prop",
  ancestors: [],
  rect: { x: 0, y: 0, width: 100, height: 100 },
  ...overrides,
});
const graphics = (
  overrides: Partial<FilmReviewGraphics> = {},
): FilmReviewGraphics => ({
  objects: [],
  unlabeledArea: 0,
  unlabeledCount: 0,
  truncated: false,
  unknown: [],
  ...overrides,
});
const record = (
  overrides: Partial<FilmReviewMeasurement> = {},
): FilmReviewMeasurement => ({
  index: 0,
  frame: 10,
  width: 1000,
  height: 500,
  texts: [],
  truncated: false,
  graphics: graphics(),
  ...overrides,
});
const analyze = (records: FilmReviewMeasurement[], frames = [10]) =>
  analyzeReviewReadability({
    output: records
      .map(
        (value) => `${FILM_REVIEW_MEASUREMENT_MARKER} ${JSON.stringify(value)}`,
      )
      .join("\n"),
    frames,
    width: 1000,
    height: 500,
  });

test("graphic overlap is strictly above 15% of the smaller box; touching, repeated labels, ancestors and relations are excluded", () => {
  for (const [name, b, expected] of [
    [
      "boundary",
      object(1, { rect: { x: 85, y: 0, width: 100, height: 100 } }),
      false,
    ],
    [
      "above",
      object(1, { rect: { x: 84.99, y: 0, width: 100, height: 100 } }),
      true,
    ],
    [
      "smaller",
      object(1, { rect: { x: 50, y: 0, width: 20, height: 20 } }),
      true,
    ],
    [
      "touch",
      object(1, { rect: { x: 100, y: 0, width: 100, height: 100 } }),
      false,
    ],
    ["same meaning", object(1, { label: "object-0" }), false],
    ["descendant", object(1, { ancestors: [0] }), false],
    ["ancestor", object(1), false],
    ["relation", object(1, { role: "relation" }), false],
    ["background", object(1, { role: "background" }), false],
  ] as const) {
    const a = object(0, name === "ancestor" ? { ancestors: [1] } : {});
    const result = analyze([
      record({ graphics: graphics({ objects: [a, b] }) }),
    ]);
    assert.equal(
      result.graphicWarnings.some((w) => w.rule === "graphic-overlap"),
      expected,
      name,
    );
    assert.deepEqual(result.graphics.unknown, []);
  }
});

test("subject limit counts instances, not labels; exactly three subjects is allowed", () => {
  const base = [object(0), object(1), object(2)];
  const compliant = analyze([
    record({
      graphics: graphics({
        objects: [
          ...base,
          object(4, { role: "relation" }),
          object(5, { role: "background" }),
        ],
      }),
    }),
  ]);
  assert.equal(
    compliant.graphicWarnings.some((w) => w.rule === "too-many-subjects"),
    false,
  );
  const result = analyze([
    record({
      graphics: graphics({
        objects: [...base, object(3, { label: "object-0" })],
      }),
    }),
  ]);
  assert.equal(
    result.graphicWarnings.find((w) => w.rule === "too-many-subjects")
      ?.subjectCount,
    4,
  );
  assert.equal(result.graphics.frames[0].subjectCount, 4);
});

test("unlabeled area is strictly above 10%, preserving sum-of-bounds evidence even above a frame's area", () => {
  for (const [unlabeledArea, expected] of [
    [50_000, false],
    [50_001, true],
    [600_000, true],
  ] as const) {
    const result = analyze([
      record({ graphics: graphics({ unlabeledArea, unlabeledCount: 2 }) }),
    ]);
    assert.equal(
      result.graphicWarnings.some((w) => w.rule === "unlabeled-graphic"),
      expected,
    );
    assert.equal(
      result.graphics.frames[0].unlabeledAreaRatio,
      unlabeledArea / 500_000,
    );
    if (expected)
      assert.match(
        result.graphicWarnings[0].message,
        /说不出代表什么.*data-axmorf-object/u,
      );
  }
});

test("frame inventory retains labels/roles and transition evidence; transition overlap is still reported", () => {
  const objects = [object(0, { label: "电表" }), object(1, { label: "账单" })];
  const result = analyze(
    [
      record({ graphics: graphics({ objects }) }),
      record({
        index: 1,
        frame: 20,
        graphics: graphics({ objects }),
        transitionWindow: true,
      }),
    ],
    [10, 20],
  );
  assert.deepEqual(
    result.graphics.frames.map((f) => [f.frame, f.objects.map((o) => o.label)]),
    [
      [10, ["电表", "账单"]],
      [20, ["电表", "账单"]],
    ],
  );
  assert.match(
    result.graphicWarnings[1].message,
    /f20.*电表.*账单.*转场窗口内/u,
  );
  assert.equal(result.graphicWarnings[0].transitionWindow, false);
});

test("missing, failed, legacy, mismatched, invalid and truncated graphics remain unknown without losing confirmed hints", () => {
  const result = analyze(
    [
      record({ graphics: undefined }),
      record({ index: 1, frame: 20, error: "layout failed" }),
      record({ index: 2, frame: 31 }),
      record({
        index: 3,
        frame: 40,
        graphics: graphics({
          truncated: true,
          unknown: ["masked art"],
          unlabeledArea: 60_000,
        }),
      }),
    ],
    [10, 20, 30, 40, 50],
  );
  assert.deepEqual(
    [...new Set(result.graphics.unknown.map((u) => u.frame))],
    [10, 20, 30, 40, 50],
  );
  assert.equal(result.graphicWarnings.length, 1);
  assert.equal(result.graphicWarnings[0].frame, 40);
  assert.equal(result.graphics.measuredFrames, 1);
  const bad = record({ graphics: graphics({ unlabeledArea: -1 }) });
  assert.equal(analyze([bad]).readability.badLines, 1);
  assert.equal(analyze([bad]).graphics.unknown.length, 1);
});

test("graphics telemetry accepts older records and rejects invalid roles, ids, labels and unbounded arrays", () => {
  assert.ok(
    FilmReviewMeasurementSchema.safeParse(record({ graphics: undefined }))
      .success,
  );
  for (const value of [
    graphics({ objects: [object(-1)] }),
    graphics({ objects: [object(0, { label: "" })] }),
    graphics({ objects: [object(0, { label: "x".repeat(161) })] }),
    graphics({ objects: [object(0, { role: "invalid" as "subject" })] }),
    graphics({ objects: [object(0, { kind: "invalid" as "card" })] }),
    graphics({ objects: Array.from({ length: 121 }, (_, i) => object(i)) }),
    graphics({ unlabeledArea: Infinity }),
  ])
    assert.equal(
      FilmReviewMeasurementSchema.safeParse(record({ graphics: value }))
        .success,
      false,
    );
});

test("text-card-only groups consecutive matching samples, resets on missing/unknown frames and accepts legacy prop kinds", () => {
  const cards = [
    object(0, { kind: "card" }),
    object(1, { role: "background" }),
    object(2, { role: "relation" }),
  ];
  const frames = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  const kinds = [
    cards,
    cards,
    [],
    cards,
    cards,
    cards,
    cards,
    [object(0)],
    cards,
    cards,
  ];
  const records = frames.map((frame, index) =>
    record({
      index,
      frame,
      graphics:
        index === 4
          ? undefined
          : graphics({ objects: kinds[index], truncated: index === 6 }),
      transitionWindow: index === 1,
    }),
  );
  const result = analyze(records, frames);
  const warnings = result.graphicWarnings.filter(
    (w) => w.rule === "text-card-only",
  );
  assert.deepEqual(
    warnings.map((w) => w.frames),
    [
      [0, 10],
      [30, 30],
      [50, 50],
      [80, 90],
    ],
  );
  assert.deepEqual(warnings[0].sampledFrames, [0, 10]);
  assert.equal(warnings[0].transitionWindow, true);
  assert.match(
    warnings[0].message,
    /连续命中采样段.*不推定未采样帧.*转场窗口/u,
  );
  assert.ok(result.graphics.unknown.some((u) => u.frame === 40));
  assert.ok(result.graphics.unknown.some((u) => u.frame === 60));
  for (const kind of ["illustration", "diagram", "prop"] as const) {
    assert.equal(
      analyze([
        record({
          graphics: graphics({ objects: [...cards, object(3, { kind })] }),
        }),
      ]).graphicWarnings.some((w) => w.rule === "text-card-only"),
      false,
    );
  }
  const legacy = JSON.parse(
    JSON.stringify(record({ graphics: graphics({ objects: [object(0)] }) })),
  );
  delete legacy.graphics.objects[0].kind;
  assert.equal(
    FilmReviewMeasurementSchema.parse(legacy).graphics?.objects[0].kind,
    "prop",
  );
  assert.equal(analyze([legacy]).graphicWarnings.length, 0);
  const uncertain = analyze([
    record({ graphics: graphics({ objects: cards, unknown: ["masked art"] }) }),
  ]);
  assert.equal(uncertain.graphicWarnings.length, 0);
  assert.equal(uncertain.graphics.unknown.length, 1);
});
