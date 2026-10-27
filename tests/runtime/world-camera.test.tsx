import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";

import {
  ProducerWorldCamera,
  resolveProducerPathPoint,
  resolveProducerWorldCamera,
  resolveProducerWorldPlane,
} from "../../packages/studio/src/remotion";

const frame = {
  width: 1080,
  height: 1920,
  worldWidth: 3240,
  worldHeight: 1920,
};

test("the world camera pans across a world wider than the frame and stays inside it", () => {
  const shots = [
    { frame: 0, center: [540, 960] as const },
    { frame: 60, center: [2700, 960] as const, easing: "ease-in-out" as const },
    { frame: 90, center: [2700, 700] as const, zoom: 2 },
  ];
  assert.deepEqual(resolveProducerWorldCamera({ ...frame, shots, frame: 0 }), {
    center: [540, 960],
    zoom: 1,
  });
  const middle = resolveProducerWorldCamera({ ...frame, shots, frame: 30 });
  assert.ok(middle.center[0] > 1500 && middle.center[0] < 1700);
  // At zoom 1 the frame is the world's full height, so the centre cannot move vertically.
  assert.equal(
    resolveProducerWorldCamera({ ...frame, shots, frame: 60 }).center[1],
    960,
  );
  const pushed = resolveProducerWorldCamera({ ...frame, shots, frame: 90 });
  assert.deepEqual(pushed, { center: [2700, 700], zoom: 2 });
  // A centre past the world's edge is clamped so no empty edge shows.
  assert.deepEqual(
    resolveProducerWorldCamera({
      ...frame,
      shots: [{ frame: 0, center: [9999, -50] }],
      frame: 0,
    }).center,
    [2700, 960],
  );
  assert.throws(
    () =>
      resolveProducerWorldCamera({
        ...frame,
        worldWidth: 900,
        shots,
        frame: 0,
      }),
    /at least as large as the frame/u,
  );
});

test("layers move with depth so far planes drift and near planes sweep", () => {
  const anchor = [540, 960] as const;
  const state = { center: [1540, 960] as const, zoom: 1 };
  const plane = (depth: number) =>
    resolveProducerWorldPlane({
      state,
      depth,
      anchor,
      width: 1080,
      height: 1920,
    });
  // The subject moves the full 1000px, a half-depth backdrop 500px, a foreground 1500px.
  assert.deepEqual(plane(1).translate, [540 - 1540, 0]);
  assert.deepEqual(plane(0.5).translate, [540 - 1040, 0]);
  assert.deepEqual(plane(1.5).translate, [540 - 2040, 0]);
  assert.equal(plane(0).translate[0], 0);
  const zoomed = resolveProducerWorldPlane({
    state: { center: [540, 960], zoom: 2 },
    depth: 0.5,
    anchor,
    width: 1080,
    height: 1920,
  });
  assert.equal(zoomed.scale, 1.5);
});

test("path points advance by length, so a camera can follow a ray at even speed", () => {
  const path = [
    [0, 0],
    [300, 0],
    [300, 100],
  ] as const;
  assert.deepEqual(resolveProducerPathPoint(path, 0), [0, 0]);
  assert.deepEqual(resolveProducerPathPoint(path, 0.5), [200, 0]);
  assert.deepEqual(resolveProducerPathPoint(path, 1), [300, 100]);
  assert.deepEqual(resolveProducerPathPoint(path, 2), [300, 100]);
  assert.throws(
    () => resolveProducerPathPoint([[0, 0]], 0.5),
    /at least two points/u,
  );
});

test("ProducerWorldCamera lays every layer out at world size and moves them by depth", () => {
  const html = renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.TimelineContext.Provider
        value={{
          frame: { test: 30 },
          playing: false,
          rootId: "test",
          imperativePlaying: { current: false },
          audioAndVideoTags: { current: [] },
        }}
      >
        <ProducerWorldCamera
          {...frame}
          frame={30}
          shots={[
            { frame: 0, center: [540, 960] },
            { frame: 30, center: [1540, 960] },
          ]}
          layers={[
            { depth: 0.5, content: <span>远景</span> },
            { depth: 1, content: <span>主体</span> },
          ]}
          overlay={<span>标题</span>}
        />
      </Internals.TimelineContext.Provider>
    </Internals.CanUseRemotionHooksProvider>,
  );
  assert.match(html, /width:3240px;height:1920px/u);
  assert.match(
    html,
    /translate\(-500\.00px, 0\.00px\) scale\(1\.0000\)[^>]*>.*远景/u,
  );
  assert.match(html, /translate\(-1000\.00px, 0\.00px\)[^>]*>.*主体/u);
  assert.match(html, /标题/u);
});
