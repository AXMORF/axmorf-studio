import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";

import {
  ProducerShotStage,
  resolveProducerShotPlane,
  resolveProducerShotStage,
} from "../../packages/studio/src/remotion/capabilities/camera";

const width = 1080;
const height = 1920;

// The plane maps world point p to screen: center + (p - focus) * size * scale.
const visibleWindow = (plane: ReturnType<typeof resolveProducerShotPlane>) => ({
  left:
    plane.focus[0] -
    (0.5 * width + Math.abs(plane.offset[0])) / (plane.scale * width),
  right:
    plane.focus[0] +
    (0.5 * width + Math.abs(plane.offset[0])) / (plane.scale * width),
  top:
    plane.focus[1] -
    (0.5 * height + Math.abs(plane.offset[1])) / (plane.scale * height),
  bottom:
    plane.focus[1] +
    (0.5 * height + Math.abs(plane.offset[1])) / (plane.scale * height),
});

test("shot stage interpolates eased arrivals and clamps focus inside the world", () => {
  const shots = [
    {
      frame: 0,
      focus: [0.5, 0.5] as const,
      zoom: 1,
      easing: "ease-in-out" as const,
    },
    { frame: 30, focus: [0, 1] as const, zoom: 2 },
  ];
  assert.deepEqual(resolveProducerShotStage(shots, 0), {
    focus: [0.5, 0.5],
    zoom: 1,
    rotation: 0,
  });
  const arrived = resolveProducerShotStage(shots, 30);
  assert.equal(arrived.zoom, 2);
  // A zoom of 2 shows half the world, so the requested corner clamps to a quarter inset.
  assert.deepEqual(arrived.focus, [0.25, 0.75]);
  const middle = resolveProducerShotStage(shots, 15);
  assert.ok(middle.zoom > 1 && middle.zoom < 2);
});

test("shot stage rejects zoom-out, unordered frames and excessive rotation", () => {
  assert.throws(
    () =>
      resolveProducerShotStage([{ frame: 0, focus: [0.5, 0.5], zoom: 0.8 }], 0),
    /zoom must be between 1 and 8/u,
  );
  assert.throws(
    () =>
      resolveProducerShotStage(
        [
          { frame: 10, focus: [0.5, 0.5], zoom: 1 },
          { frame: 10, focus: [0.5, 0.5], zoom: 1.2 },
        ],
        0,
      ),
    /strictly increasing/u,
  );
  assert.throws(
    () =>
      resolveProducerShotStage(
        [{ frame: 0, focus: [0.5, 0.5], zoom: 1, rotation: 12 }],
        0,
      ),
    /rotation must be between -8 and 8/u,
  );
});

test("background and subject planes stay full-bleed through zoom, rotation and drift", () => {
  const shots = [
    { frame: 0, focus: [0.5, 0.5] as const, zoom: 1 },
    { frame: 40, focus: [0.05, 0.95] as const, zoom: 1.8, rotation: -4 },
    { frame: 80, focus: [0.9, 0.1] as const, zoom: 3.5, rotation: 6 },
  ];
  for (const frame of [0, 13, 40, 57, 80]) {
    const state = resolveProducerShotStage(shots, frame);
    for (const depth of [0, 0.35, 0.7, 1]) {
      const plane = resolveProducerShotPlane({
        state,
        depth,
        width,
        height,
        frame,
        drift: { amplitudePx: 12, periodFrames: 90 },
      });
      assert.ok(plane.scale >= 1, `depth ${depth} never shrinks world content`);
      const window = visibleWindow(plane);
      const epsilon = 1e-9;
      assert.ok(
        window.left >= -epsilon && window.right <= 1 + epsilon,
        `x at ${frame}/${depth}`,
      );
      assert.ok(
        window.top >= -epsilon && window.bottom <= 1 + epsilon,
        `y at ${frame}/${depth}`,
      );
    }
  }
});

test("drift is deterministic and bounded by the short side", () => {
  const state = resolveProducerShotStage(
    [{ frame: 0, focus: [0.5, 0.5], zoom: 1 }],
    0,
  );
  const at = (frame: number) =>
    resolveProducerShotPlane({
      state,
      depth: 1,
      width,
      height,
      frame,
      drift: { amplitudePx: 10, periodFrames: 60 },
    });
  assert.deepEqual(at(17), at(17));
  assert.notDeepEqual(at(0).offset, at(15).offset);
  assert.throws(
    () =>
      resolveProducerShotPlane({
        state,
        depth: 1,
        width,
        height,
        frame: 0,
        drift: { amplitudePx: 200, periodFrames: 60 },
      }),
    /amplitudePx/u,
  );
});

test("ProducerShotStage renders layered planes and an unscaled overlay", () => {
  const markup = renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.TimelineContext.Provider
        value={{
          frame: {},
          playing: false,
          rootId: "test",
          imperativePlaying: { current: false },
          audioAndVideoTags: { current: [] },
        }}
      >
        <ProducerShotStage
          width={width}
          height={height}
          frame={0}
          shots={[{ frame: 0, focus: [0.5, 0.5], zoom: 1.5 }]}
          background={<div>backdrop</div>}
          subject={<div>subject</div>}
          foreground={<div>foreground</div>}
          overlay={<div>headline</div>}
        />
      </Internals.TimelineContext.Provider>
    </Internals.CanUseRemotionHooksProvider>,
  );
  for (const text of ["backdrop", "subject", "foreground", "headline"]) {
    assert.match(markup, new RegExp(text, "u"));
  }
  assert.equal((markup.match(/transform-origin:0 0/gu) ?? []).length, 3);
  assert.match(markup, /scale\(1\.5\)/u);
});
