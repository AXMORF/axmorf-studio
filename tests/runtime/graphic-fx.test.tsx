import assert from "node:assert/strict";
import test from "node:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals, type SequenceProps } from "remotion";

import {
  ProducerBeatCamera,
  ProducerBeatCutSeries,
  ProducerChromaticSplit,
  ProducerCreditTitle,
  ProducerFlashCut,
  ProducerGlitchSlices,
  ProducerGradientMap,
  ProducerHalftoneOverlay,
  ProducerSpriteSheet,
  ProducerWhipIn,
  findProducerLastHit,
  parseProducerHexColor,
  resolveProducerBeatCamera,
  resolveProducerBeatCuts,
  resolveProducerBurstIntensity,
  resolveProducerDrawing,
  resolveProducerFlashOpacity,
  resolveProducerGlitchSlices,
  resolveProducerGradientMapTables,
  resolveProducerSpeedLines,
  resolveProducerWhip,
  selectProducerCutFrames,
} from "../../packages/studio/src/remotion";

const render = (children: ReactNode, frame = 0) =>
  renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.TimelineContext.Provider
        value={{
          frame: { test: frame },
          playing: false,
          rootId: "test",
          imperativePlaying: { current: false },
          audioAndVideoTags: { current: [] },
        }}
      >
        <Internals.SequenceContext.Provider
          value={{
            absoluteFrom: -frame,
            cumulatedFrom: 0,
            cumulatedNegativeFrom: 0,
            relativeFrom: -frame,
            parentFrom: 0,
            durationInFrames: 300,
            id: "test",
            width: 1280,
            height: 720,
            premounting: false,
            postmounting: false,
            premountDisplay: null,
            postmountDisplay: null,
          }}
        >
          {children}
        </Internals.SequenceContext.Provider>
      </Internals.TimelineContext.Provider>
    </Internals.CanUseRemotionHooksProvider>,
  );

test("gradient map tables follow dark-to-light stops per channel", () => {
  assert.deepEqual(parseProducerHexColor("#f0a"), [1, 0, 2 / 3]);
  assert.deepEqual(resolveProducerGradientMapTables(["#000000", "#ff8000"]), {
    red: "0 1",
    green: "0 0.502",
    blue: "0 0",
  });
  assert.throws(
    () => resolveProducerGradientMapTables(["#000"]),
    /between 2 and 8/u,
  );
  assert.throws(
    () => resolveProducerGradientMapTables(["#000", "red"]),
    /#rgb or #rrggbb/u,
  );
});

test("glitch tears are deterministic, stepped and stay inside the box", () => {
  const options = { seed: "op", intensity: 1, slices: 8, holdFrames: 3 };
  const first = resolveProducerGlitchSlices({ ...options, frame: 30 });
  assert.deepEqual(
    first,
    resolveProducerGlitchSlices({ ...options, frame: 30 }),
  );
  // Frames inside one hold window share a pattern; the next window changes it.
  assert.deepEqual(
    first,
    resolveProducerGlitchSlices({ ...options, frame: 32 }),
  );
  assert.notDeepEqual(
    first,
    resolveProducerGlitchSlices({ ...options, frame: 33 }),
  );
  assert.equal(first.length, 8);
  for (const tear of first) {
    assert.ok(tear.top >= 0 && tear.top + tear.height <= 1);
    assert.ok(Math.abs(tear.offsetPx) <= 80);
  }
  assert.deepEqual(
    resolveProducerGlitchSlices({ ...options, frame: 30, intensity: 0 }),
    [],
  );
  assert.throws(
    () => resolveProducerGlitchSlices({ ...options, frame: 30, intensity: 2 }),
    /between 0 and 1/u,
  );
});

test("bursts and flashes peak on their frame and decay to nothing", () => {
  const bursts = [10, 40];
  assert.equal(
    resolveProducerBurstIntensity({ frame: 9, intensity: 0.8, bursts }),
    0,
  );
  assert.equal(
    resolveProducerBurstIntensity({ frame: 10, intensity: 0.8, bursts }),
    0.8,
  );
  assert.equal(
    resolveProducerBurstIntensity({ frame: 13, intensity: 0.8, bursts }),
    0.4,
  );
  assert.equal(
    resolveProducerBurstIntensity({ frame: 16, intensity: 0.8, bursts }),
    0,
  );
  assert.equal(
    resolveProducerBurstIntensity({ frame: 99, intensity: 0.5 }),
    0.5,
  );

  assert.equal(
    resolveProducerFlashOpacity({ frame: 20, frames: [20], decayFrames: 4 }),
    1,
  );
  assert.equal(
    resolveProducerFlashOpacity({ frame: 22, frames: [20], decayFrames: 4 }),
    0.5,
  );
  assert.equal(
    resolveProducerFlashOpacity({ frame: 24, frames: [20], decayFrames: 4 }),
    0,
  );
  assert.throws(
    () => resolveProducerFlashOpacity({ frame: 0, frames: [5, 5] }),
    /strictly increasing/u,
  );
});

test("beat cuts come from the music grid and reject unreadably short shots", () => {
  const beats = [0, 12, 24, 36, 48, 60, 72];
  assert.deepEqual(
    selectProducerCutFrames({
      grid: beats,
      fromFrame: 12,
      toFrame: 72,
      every: 2,
    }),
    [12, 36, 60],
  );
  assert.deepEqual(
    resolveProducerBeatCuts({ cutFrames: [12, 36, 60], endFrame: 80 }),
    [
      { index: 0, startFrame: 12, endFrame: 36 },
      { index: 1, startFrame: 36, endFrame: 60 },
      { index: 2, startFrame: 60, endFrame: 80 },
    ],
  );
  assert.throws(
    () => resolveProducerBeatCuts({ cutFrames: [0, 2], endFrame: 20 }),
    /lasts 2 frames/u,
  );
  assert.throws(
    () => resolveProducerBeatCuts({ cutFrames: [0, 10], endFrame: 10 }),
    /after the last cut/u,
  );
});

test("filter treatments wrap any subtree with a scoped SVG filter", () => {
  const split = render(
    <ProducerChromaticSplit amountPx={12} angle={90}>
      <span>主体</span>
    </ProducerChromaticSplit>,
  );
  assert.match(split, /<filter id="axmorf-chromatic-[\w-]+"/u);
  assert.match(split, /<feOffset[^>]*dx="0"[^>]*dy="12"/u);
  assert.match(split, /filter:url\(#axmorf-chromatic-[\w-]+\)/u);
  assert.match(split, /主体/u);
  // Animating through zero keeps the same tree instead of remounting media.
  assert.match(
    render(
      <ProducerChromaticSplit amountPx={0}>
        <span>主体</span>
      </ProducerChromaticSplit>,
    ),
    /filter:none/u,
  );

  const mapped = render(
    <ProducerGradientMap
      stops={["#120036", "#ff2bd6", "#5ff8ff"]}
      amount={0.75}
    >
      <span>伪彩</span>
    </ProducerGradientMap>,
  );
  assert.match(mapped, /tableValues="0.0706 1 0.3725"/u);
  assert.match(mapped, /k2="0.75"/u);
  assert.match(mapped, /k3="0.25"/u);
});

test("halftone overlay is a full-bleed dot pattern that drifts with the frame", () => {
  const still = render(<ProducerHalftoneOverlay fade="edges" />, 0);
  assert.match(still, /<svg[^>]*width="100%"[^>]*height="100%"/u);
  assert.match(still, /<pattern[^>]*rotate\(18\) translate\(0 0\)/u);
  assert.match(still, /mask="url\(#axmorf-halftone-[\w-]+-mask\)"/u);
  assert.match(
    render(
      <ProducerHalftoneOverlay driftPxPerFrame={0.5} spacingPx={14} />,
      31,
    ),
    /translate\(1.5 0\)/u,
  );
  assert.throws(
    () => render(<ProducerHalftoneOverlay spacingPx={10} radiusPx={6} />),
    /at most half of spacingPx/u,
  );
});

test("glitch copies exist only during a burst and are hidden from readers", () => {
  const shot = (frame: number) =>
    render(
      <ProducerGlitchSlices seed="cut" bursts={[10]} slices={4}>
        <span>画面</span>
      </ProducerGlitchSlices>,
      frame,
    );
  assert.equal(shot(5).match(/画面/gu)?.length, 1);
  const torn = shot(10);
  assert.equal(torn.match(/画面/gu)?.length, 5);
  assert.equal(torn.match(/aria-hidden="true"/gu)?.length, 4);
  assert.match(torn, /clip-path:inset\(/u);
});

test("flash cuts render only while visible", () => {
  assert.equal(render(<ProducerFlashCut frames={[10]} />, 9), "");
  assert.match(
    render(<ProducerFlashCut frames={[10]} peak={0.8} />, 10),
    /opacity:0.8/u,
  );
});

test("beat cut series places each shot in its own Sequence and cycles shots", () => {
  // Sequence needs a registered composition, so inspect the element tree directly.
  const tree = ProducerBeatCutSeries({
    cutFrames: [0, 10, 20],
    endFrame: 30,
    shots: [<span key="a">镜头A</span>, <span key="b">镜头B</span>],
  }) as ReactElement<{ children: ReactElement<SequenceProps>[] }>;
  assert.deepEqual(
    tree.props.children.map(({ props }) => [
      props.from,
      props.durationInFrames,
      (props.children as ReactElement).key,
    ]),
    [
      [0, 10, "a"],
      [10, 10, "b"],
      [20, 10, "a"],
    ],
  );
  assert.throws(
    () => ProducerBeatCutSeries({ cutFrames: [0], endFrame: 10, shots: [] }),
    /at least one shot/u,
  );
});

test("credit title staggers name landings and keeps type above the readable minimum", () => {
  const credit = (frame: number) =>
    render(
      <ProducerCreditTitle
        role="总导演"
        names={["危天行", "ASKASK"]}
        sizePx={120}
        fill="gold"
        echo={{ color: "#e3262f" }}
        startFrame={10}
        staggerFrames={8}
      />,
      frame,
    );
  const before = credit(9);
  assert.match(before, /总导演/u);
  assert.match(before, /font-size:38px/u);
  assert.match(before, /background-clip:text/u);
  // The echo is a decorative mirrored copy.
  assert.equal(before.match(/aria-hidden="true"/gu)?.length, 1);
  assert.match(before, /translateY\(7px\) scaleY\(-1\)/u);
  const firstLanded = credit(16);
  assert.match(
    firstLanded,
    /opacity:1;transform:scale\(1\.0000\)[^"]*"[^>]*>危天行/u,
  );
  assert.match(
    firstLanded,
    /opacity:0;transform:scale\(1\.3200\)[^"]*"[^>]*>ASKASK/u,
  );
  const fade = (frame: number) =>
    render(
      <ProducerCreditTitle
        role="导演"
        names={["名字"]}
        sizePx={100}
        entrance="fade"
        weight={600}
      />,
      frame,
    );
  // A restrained credit lifts in with a short blur instead of scaling.
  assert.match(
    fade(0),
    /font-weight:600;[^"]*opacity:0;transform:translateY\(8\.00px\);filter:blur\(6\.00px\)/u,
  );
  assert.match(
    fade(12),
    /opacity:1;transform:translateY\(0\.00px\);filter:none/u,
  );
  assert.doesNotMatch(fade(12), /scale\(/u);
  assert.match(
    render(
      <ProducerCreditTitle names={["名"]} sizePx={80} orientation="vertical" />,
    ),
    /writing-mode:vertical-rl/u,
  );
  assert.throws(
    () => render(<ProducerCreditTitle names={["名"]} sizePx={20} />),
    /at least minFontSizePx/u,
  );
});

test("drawings hold on twos or advance on a musical grid", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 7, 8].map((frame) =>
      resolveProducerDrawing(frame, 4, { holdFrames: 2 }),
    ),
    [0, 0, 1, 1, 2, 3, 0],
  );
  const beats = [10, 22, 34];
  assert.deepEqual(
    [0, 10, 21, 22, 40].map((frame) =>
      resolveProducerDrawing(frame, 4, { onFrames: beats }),
    ),
    [0, 0, 0, 1, 2],
  );
  // Grid timing clamps on the last drawing unless asked to loop.
  assert.equal(resolveProducerDrawing(99, 2, { onFrames: beats }), 1);
  assert.equal(
    resolveProducerDrawing(99, 2, { onFrames: beats, loop: true }),
    0,
  );
  assert.deepEqual(findProducerLastHit(21, beats), { index: 0, frame: 10 });
  assert.equal(findProducerLastHit(9, beats), null);
  assert.throws(
    () => resolveProducerDrawing(0, 0, { holdFrames: 2 }),
    /positive integer/u,
  );
});

test("the beat camera punches and shakes only right after its hits", () => {
  const camera = (frame: number) =>
    resolveProducerBeatCamera({
      frame,
      punches: [10],
      shakes: [20],
      punch: 0.04,
    });
  assert.deepEqual(camera(9), { scale: 1, x: 0, y: 0 });
  assert.equal(camera(10).scale, 1.04);
  assert.ok(camera(13).scale > 1 && camera(13).scale < 1.04);
  assert.equal(camera(16).scale, 1);
  assert.ok(Math.abs(camera(20).x) > 0 || Math.abs(camera(20).y) > 0);
  assert.deepEqual(camera(20), camera(20));
  assert.deepEqual(camera(26), { scale: 1, x: 0, y: 0 });
  assert.throws(
    () => resolveProducerBeatCamera({ frame: 0, punch: 1 }),
    /between 0 and 0.3/u,
  );
});

test("whips settle on time and speed lines redraw on their hold", () => {
  assert.deepEqual(resolveProducerWhip({ frame: 0, direction: -1 }), {
    offset: -0.35,
    blurPx: 28,
  });
  assert.deepEqual(resolveProducerWhip({ frame: 5 }), { offset: 0, blurPx: 0 });
  const lines = (frame: number) =>
    resolveProducerSpeedLines({ frame, seed: "hit", count: 12 });
  assert.equal(lines(0).length, 12);
  assert.deepEqual(lines(0), lines(1));
  assert.notDeepEqual(lines(1), lines(2));
});

test("sprite sheets crop one cell and whips blur only while moving", () => {
  // Img needs a registered composition, so inspect the element tree directly.
  const sprite = ProducerSpriteSheet({
    src: "sheet.png",
    columns: 3,
    rows: 2,
    cell: 4,
    sheetWidth: 1536,
    sheetHeight: 1024,
    style: { left: 100, width: 300 },
  }) as ReactElement<{
    style: Record<string, unknown>;
    children: ReactElement<{ style: Record<string, unknown> }>;
  }>;
  assert.equal(sprite.props.style.aspectRatio, "512 / 512");
  assert.equal(sprite.props.style.width, 300);
  assert.deepEqual(
    (({ maxWidth, width, height, left, top }) => ({
      maxWidth,
      width,
      height,
      left,
      top,
    }))(sprite.props.children.props.style),
    {
      maxWidth: "none",
      width: "300%",
      height: "200%",
      left: "-100%",
      top: "-100%",
    },
  );
  assert.throws(
    () =>
      ProducerSpriteSheet({
        src: "s.png",
        columns: 2,
        rows: 2,
        cell: 4,
        sheetWidth: 2,
        sheetHeight: 2,
      }),
    /between 0 and 3/u,
  );
  assert.match(
    render(
      <ProducerWhipIn>
        <span>镜头</span>
      </ProducerWhipIn>,
      0,
    ),
    /translateX\(35\.000%\);filter:blur\(28\.0px\)/u,
  );
  assert.match(
    render(
      <ProducerWhipIn>
        <span>镜头</span>
      </ProducerWhipIn>,
      5,
    ),
    /translateX\(0\.000%\);filter:none/u,
  );
  assert.match(
    render(
      <ProducerBeatCamera punches={[0]} punch={0.05}>
        <span>镜头</span>
      </ProducerBeatCamera>,
      0,
    ),
    /scale\(1\.0500\)/u,
  );
});
