import assert from "node:assert/strict";
import test from "node:test";

import {
  mapProducerSemanticFrame,
  projectProducerWorldPoint2D,
  resolveProducerFollow2D,
  resolveProducerGather2D,
  resolveProducerPointMorph2D,
  resolveProducerSettle,
  resolveProducerWorldCamera2D,
  retimeProducerSemanticEvents,
  unprojectProducerWorldPoint2D,
  type ProducerSemanticTimeAnchor,
  type ProducerWorldCamera2DKeyframe,
} from "../../packages/studio/src/remotion/capabilities/motion/continuous";

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
};

const anchors = [
  { id: "open", sourceFrame: 0, targetFrame: 0 },
  { id: "reveal", sourceFrame: 20, targetFrame: 35 },
  { id: "resolve", sourceFrame: 80, targetFrame: 65 },
  { id: "close", sourceFrame: 100, targetFrame: 120 },
] as const satisfies readonly ProducerSemanticTimeAnchor[];

test("world camera projects a shared coordinate system and round-trips rotation and zoom", () => {
  const viewport = { width: 800, height: 600 };
  const camera = { position: [100, 200] as const, zoom: 2, rotation: 90 };
  assert.deepEqual(
    projectProducerWorldPoint2D(camera.position, camera, viewport),
    [400, 300],
  );
  const point = projectProducerWorldPoint2D([110, 200], camera, viewport);
  close(point[0], 400);
  close(point[1], 280);
  const original = unprojectProducerWorldPoint2D(point, camera, viewport);
  close(original[0], 110);
  close(original[1], 200);
  const rotated = { position: [-340, 92] as const, zoom: 0.6, rotation: -27.5 };
  const sample = [-485.25, 774.75] as const;
  const inverse = unprojectProducerWorldPoint2D(
    projectProducerWorldPoint2D(sample, rotated, viewport),
    rotated,
    viewport,
  );
  close(inverse[0], sample[0]);
  close(inverse[1], sample[1]);
});

test("world camera supports unbounded world positions and deterministic fractional sampling", () => {
  const keyframes = [
    { frame: 0, position: [0, 0], zoom: 1, rotation: 0 },
    { frame: 30, position: [2400, -1200], zoom: 2, rotation: 90 },
  ] as const satisfies readonly ProducerWorldCamera2DKeyframe[];
  const state = resolveProducerWorldCamera2D(keyframes, 15.25);
  close(state.position[0], 1220);
  close(state.position[1], -610);
  close(state.zoom, 1 + 15.25 / 30);
  resolveProducerWorldCamera2D(keyframes, 3);
  resolveProducerWorldCamera2D(keyframes, 50);
  assert.deepEqual(resolveProducerWorldCamera2D(keyframes, 15.25), state);
  assert.deepEqual(
    resolveProducerWorldCamera2D(keyframes, -0.25).position,
    [0, 0],
  );
  assert.deepEqual(
    resolveProducerWorldCamera2D(keyframes, 50).position,
    [2400, -1200],
  );
  assert.deepEqual(keyframes[1].position, [2400, -1200]);
});

test("settle is critically damped and independent of the frame sampling order", () => {
  const options = { from: -20, to: 80, startFrame: 10, timeConstantFrames: 8 };
  assert.equal(resolveProducerSettle({ ...options, frame: 0 }), -20);
  assert.equal(resolveProducerSettle({ ...options, frame: 10 }), -20);
  const sampled = resolveProducerSettle({ ...options, frame: 18.5 });
  const time = 8.5 / 8;
  close(sampled, -20 + 100 * (1 - (1 + time) * Math.exp(-time)));
  resolveProducerSettle({ ...options, frame: 45 });
  resolveProducerSettle({ ...options, frame: 11 });
  assert.equal(resolveProducerSettle({ ...options, frame: 18.5 }), sampled);
  let previous = -20;
  for (let frame = 10; frame < 200; frame += 0.5) {
    const value = resolveProducerSettle({ ...options, frame });
    assert.ok(value >= previous && value <= 80);
    previous = value;
  }
  assert.ok(resolveProducerSettle({ ...options, frame: 200 }) < 80);
  assert.equal(resolveProducerSettle({ ...options, frame: 1000 }), 80);
});

test("follow solves linear target movement and a later hold without retained history", () => {
  const keyframes = [
    { frame: 0, position: [0, 0] as const },
    { frame: 20, position: [200, -100] as const },
  ];
  const options = { timeConstantFrames: 5, offset: [10, 30] as const };
  const sampled = resolveProducerFollow2D(keyframes, 12.25, options);
  const x = 10 * (12.25 - 5 + 5 * Math.exp(-12.25 / 5));
  close(sampled[0], x + 10);
  close(sampled[1], -x / 2 + 30);
  const endX = 10 * (20 - 5 + 5 * Math.exp(-4));
  const hold = resolveProducerFollow2D(keyframes, 30, options);
  close(hold[0], 200 + (endX - 200) * Math.exp(-2) + 10);
  resolveProducerFollow2D(keyframes, 2, options);
  assert.deepEqual(resolveProducerFollow2D(keyframes, 12.25, options), sampled);
  assert.deepEqual(resolveProducerFollow2D(keyframes, -0.5, options), [10, 30]);
  const one = [{ frame: 4, position: [12, 19] as const }];
  assert.deepEqual(
    resolveProducerFollow2D(one, 50, { timeConstantFrames: 2 }),
    [12, 19],
  );
});

test("follow is invariant when a linear target segment is split into additional keyframes", () => {
  const coarse = [
    { frame: 3, position: [10, 20] as const },
    { frame: 23, position: [210, -80] as const },
  ];
  const split = [
    coarse[0],
    { frame: 13, position: [110, -30] as const },
    coarse[1],
  ];
  const options = { timeConstantFrames: 7 };
  for (const frame of [3, 3.001, 8.25, 13, 19.75, 23, 39]) {
    const first = resolveProducerFollow2D(coarse, frame, options);
    const second = resolveProducerFollow2D(split, frame, options);
    close(first[0], second[0]);
    close(first[1], second[1]);
  }
});

test("point morph retains caller-defined correspondence and gather completes inside its window", () => {
  const from = [
    [0, 0],
    [10, 20],
    [40, -20],
  ] as const;
  const to = [
    [20, 10],
    [30, 20],
    [100, 30],
  ] as const;
  const window = { startFrame: 10, endFrame: 20 };
  assert.deepEqual(resolveProducerPointMorph2D(from, to, 12.5, window), [
    [5, 2.5],
    [15, 20],
    [55, -7.5],
  ]);
  assert.deepEqual(resolveProducerPointMorph2D(from, to, -0.25, window), from);
  assert.deepEqual(resolveProducerPointMorph2D(from, to, 30, window), to);
  const gathered = resolveProducerGather2D(from, [100, 100], 16, {
    ...window,
    staggerInFrames: 2,
  });
  assert.deepEqual(gathered[0], [100, 100]);
  close(gathered[1][0], 70);
  close(gathered[2][0], 60);
  assert.deepEqual(
    resolveProducerGather2D(from, [100, 100], 20, {
      ...window,
      staggerInFrames: 2,
    }),
    [
      [100, 100],
      [100, 100],
      [100, 100],
    ],
  );
  assert.deepEqual(from, [
    [0, 0],
    [10, 20],
    [40, -20],
  ]);
});

test("semantic retiming preserves exact anchors and has an invertible monotonic fractional mapping", () => {
  for (const anchor of anchors) {
    assert.equal(
      mapProducerSemanticFrame(anchors, anchor.sourceFrame),
      anchor.targetFrame,
    );
    assert.equal(
      mapProducerSemanticFrame(anchors, anchor.targetFrame, "target-to-source"),
      anchor.sourceFrame,
    );
  }
  assert.equal(mapProducerSemanticFrame(anchors, 10.5), 18.375);
  let previous = -1;
  for (let source = 0; source <= 100; source += 0.25) {
    const target = mapProducerSemanticFrame(anchors, source);
    assert.ok(target > previous);
    close(
      mapProducerSemanticFrame(anchors, target, "target-to-source"),
      source,
    );
    previous = target;
  }
  const at = mapProducerSemanticFrame(anchors, 32.25);
  mapProducerSemanticFrame(anchors, 4);
  mapProducerSemanticFrame(anchors, 100);
  assert.equal(mapProducerSemanticFrame(anchors, 32.25), at);
});

test("event retiming preserves IDs, payload and input order without rounding or mutating input", () => {
  const events = [
    { id: "impact", frame: 50, sound: "impact.wav" },
    { id: "reveal", frame: 20, sound: "chime.wav" },
    { id: "counter", frame: 10.5, sound: "tick.wav" },
  ];
  const transformed = retimeProducerSemanticEvents(anchors, events);
  assert.deepEqual(transformed, [
    { id: "impact", frame: 50, sound: "impact.wav" },
    { id: "reveal", frame: 35, sound: "chime.wav" },
    { id: "counter", frame: 18.375, sound: "tick.wav" },
  ]);
  assert.deepEqual(
    retimeProducerSemanticEvents(anchors, transformed, "target-to-source"),
    events,
  );
  assert.equal(events[1].frame, 20);
  assert.notEqual(transformed[0], events[0]);
});

test("a semantic reading and its sound cue retain the same authored meaning after retiming", () => {
  const events = retimeProducerSemanticEvents(anchors, [
    { id: "halfway", frame: 40 },
  ]);
  assert.equal(events[0].frame, 45);
  const sourceFrame = mapProducerSemanticFrame(
    anchors,
    events[0].frame,
    "target-to-source",
  );
  const authoredCount = (sourceFrame / 80) * 400;
  assert.equal(authoredCount, 200);
  const fractionalSource = mapProducerSemanticFrame(
    anchors,
    45.25,
    "target-to-source",
  );
  assert.equal(fractionalSource, 40.5);
  assert.equal((fractionalSource / 80) * 400, 202.5);
});

test("semantic mapping rejects malformed anchors and out-of-domain frames or events", () => {
  const changed = (patch: Partial<ProducerSemanticTimeAnchor>) => [
    anchors[0],
    { ...anchors[1], ...patch },
    anchors[2],
    anchors[3],
  ];
  for (const invalid of [
    [],
    [anchors[0]],
    changed({ id: "open" }),
    changed({ id: " " }),
    changed({ sourceFrame: 0 }),
    changed({ targetFrame: 0 }),
    changed({ sourceFrame: -1 }),
    changed({ targetFrame: Infinity }),
    changed({ sourceFrame: Number.NaN }),
    changed({ targetFrame: 70 }),
  ]) {
    assert.throws(() => mapProducerSemanticFrame(invalid, 10));
  }
  for (const frame of [-1, 101, Infinity, Number.NaN]) {
    assert.throws(() => mapProducerSemanticFrame(anchors, frame));
  }
  assert.throws(() =>
    mapProducerSemanticFrame(anchors, 121, "target-to-source"),
  );
  assert.throws(() =>
    retimeProducerSemanticEvents(anchors, [
      { id: "hit", frame: 20 },
      { id: "hit", frame: 30 },
    ]),
  );
  assert.throws(() =>
    retimeProducerSemanticEvents(anchors, [{ id: "", frame: 20 }]),
  );
  assert.throws(() =>
    retimeProducerSemanticEvents(anchors, [{ id: "late", frame: 101 }]),
  );
  assert.throws(() =>
    mapProducerSemanticFrame(anchors, 20, "sideways" as never),
  );
  assert.throws(() =>
    retimeProducerSemanticEvents(anchors, [], "sideways" as never),
  );
  const shifted = anchors.map((anchor) => ({
    ...anchor,
    sourceFrame: anchor.sourceFrame + 10,
    targetFrame: anchor.targetFrame + 20,
  }));
  assert.throws(() => mapProducerSemanticFrame(shifted, 9.999));
  assert.throws(() =>
    mapProducerSemanticFrame(shifted, 19.999, "target-to-source"),
  );
});

test("interpolation remains finite at opposite numeric extremes and preserves tiny positive zoom", () => {
  const settled = resolveProducerSettle({
    from: -Number.MAX_VALUE,
    to: Number.MAX_VALUE,
    frame: 50,
    startFrame: 0,
    timeConstantFrames: 10,
  });
  assert.ok(
    Number.isFinite(settled) && settled > 0 && settled < Number.MAX_VALUE,
  );
  const camera = resolveProducerWorldCamera2D(
    [
      {
        frame: 0,
        position: [-Number.MAX_VALUE, 0],
        zoom: Number.MIN_VALUE,
        rotation: 0,
      },
      {
        frame: 1,
        position: [Number.MAX_VALUE, 0],
        zoom: Number.MIN_VALUE,
        rotation: 0,
      },
    ],
    0.5,
  );
  assert.equal(camera.position[0], 0);
  assert.equal(camera.zoom, Number.MIN_VALUE);
  assert.throws(() =>
    projectProducerWorldPoint2D(
      [Number.MAX_VALUE, 0],
      { position: [-Number.MAX_VALUE, 0], zoom: 1, rotation: 0 },
      { width: 800, height: 600 },
    ),
  );
  assert.throws(() =>
    unprojectProducerWorldPoint2D(
      [Number.MAX_VALUE, 0],
      { position: [0, 0], zoom: Number.MIN_VALUE, rotation: 0 },
      { width: 800, height: 600 },
    ),
  );
});

test("motion primitives reject invalid geometry, frame windows and response constants", () => {
  const camera = { position: [0, 0] as const, zoom: 1, rotation: 0 };
  const viewport = { width: 800, height: 600 };
  for (const zoom of [0, -1, Infinity, Number.NaN]) {
    assert.throws(() =>
      projectProducerWorldPoint2D([0, 0], { ...camera, zoom }, viewport),
    );
  }
  assert.throws(() =>
    unprojectProducerWorldPoint2D([0, 0], camera, { ...viewport, width: 0 }),
  );
  assert.throws(() =>
    projectProducerWorldPoint2D([0, Infinity], camera, viewport),
  );
  assert.throws(() => resolveProducerWorldCamera2D([], 0));
  assert.throws(() =>
    resolveProducerWorldCamera2D(
      [
        { ...camera, frame: 1 },
        { ...camera, frame: 1 },
      ],
      1,
    ),
  );
  assert.throws(() =>
    resolveProducerWorldCamera2D([{ ...camera, frame: 0 }], Number.NaN),
  );
  assert.throws(() =>
    resolveProducerFollow2D([{ frame: 0, position: [0, 0] }], 5, {
      timeConstantFrames: 0,
    }),
  );
  assert.throws(() =>
    resolveProducerSettle({
      from: 0,
      to: 1,
      frame: 2,
      startFrame: 0,
      timeConstantFrames: -1,
    }),
  );
  assert.throws(() =>
    resolveProducerPointMorph2D(
      [[0, 0]],
      [
        [1, 1],
        [2, 2],
      ],
      1,
      { startFrame: 0, endFrame: 2 },
    ),
  );
  assert.throws(() =>
    resolveProducerPointMorph2D([[0, 0]], [[1, 1]], 1, {
      startFrame: 2,
      endFrame: 2,
    }),
  );
  assert.throws(() =>
    resolveProducerGather2D(
      [
        [0, 0],
        [1, 1],
      ],
      [2, 2],
      1,
      { startFrame: 0, endFrame: 2, staggerInFrames: 2 },
    ),
  );
});
