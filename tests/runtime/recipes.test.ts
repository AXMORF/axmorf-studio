import assert from "node:assert/strict";
import test from "node:test";
import {
  matchAxiomGlyphs,
  splitAxiomGlyphs,
  resolveAxiomMorph,
  resolveNumberRoll,
  resolveBarGrow,
  resolveCameraMove,
  resolveParticleField,
  resolveParallaxLayers,
  resolveProducerRecipeTiming,
  PRODUCER_RECIPE_CATALOG,
  type AxiomTextLayout,
  type CameraMoveOptions,
} from "../../packages/studio/src/remotion/capabilities/recipes";
import { resolveFilmSoundEffects } from "../../packages/studio/src/remotion/film/FilmSoundEffects";
import { filmTrackFixture } from "../films/film-track-fixture";
const timing = { startFrame: 10, durationInFrames: 60 };
// Explicit layout fixtures keep the frame resolver independent of browser measurement.
const layout = (text: string): AxiomTextLayout => ({
  width: splitAxiomGlyphs(text).length * 50,
  glyphs: splitAxiomGlyphs(text).map((text, i) => ({
    text,
    x: i * 50,
    width: 50,
  })),
});
const morph = {
  ...timing,
  mode: "reform" as const,
  text: layout("人人 AI"),
  nextText: layout("AI 人人人"),
};
const particles = {
  ...timing,
  mode: "assemble" as const,
  path: "M 20 30 L 120 30 L 120 130",
  width: 200,
  height: 200,
  count: 3,
};
const camera: CameraMoveOptions = {
  ...timing,
  preset: "reveal-pan",
  width: 400,
  height: 200,
  worldWidth: 1600,
  worldHeight: 800,
  from: [400, 400],
  to: [1000, 400],
};
const resolvers = [
  (frame: number) => resolveAxiomMorph(frame, morph),
  (frame: number) =>
    resolveNumberRoll(frame, { ...timing, value: 1234.56, decimals: 2 }),
  (frame: number) =>
    resolveBarGrow(frame, { ...timing, values: [20], staggerInFrames: 0 }),
  (frame: number) => resolveCameraMove(frame, camera),
  (frame: number) => resolveParticleField(frame, particles),
  (frame: number) => resolveParallaxLayers(frame, camera),
];
for (const [i, id] of Object.keys(PRODUCER_RECIPE_CATALOG).entries()) {
  test(`${id}: absolute phase boundaries, cue roles and direct FilmSoundEffects integration`, () => {
    const t = resolveProducerRecipeTiming(10, timing);
    for (const [frame, phase] of [
      [9, "before"],
      [t.anticipate, "anticipate"],
      [t.move, "move"],
      [t.land, "land"],
      [t.land + 1, "settle"],
      [t.settle, "hold"],
    ] as const)
      assert.equal(resolvers[i](frame).phase, phase);
    const state = resolvers[i](t.land);
    assert.equal(state.land, t.land);
    assert.equal(resolvers[i](t.settle).progress, 1);
    assert.deepEqual(
      state.sfxCues.map((c) => [c.frame, c.sfx]),
      PRODUCER_RECIPE_CATALOG[
        id as keyof typeof PRODUCER_RECIPE_CATALOG
      ].sfxCues.map((c) => [t[c.at], c.role]),
    );
    assert.equal(
      resolveFilmSoundEffects(filmTrackFixture(), state.sfxCues).length,
      state.sfxCues.length,
    );
    assert.deepEqual(resolvers[i](32.5), resolvers[i](32.5));
  });
}
test("shared curve has anticipation, exact contact, overshoot, rebound and exact rest", () => {
  const t = resolveProducerRecipeTiming(10, timing);
  assert.ok(resolveProducerRecipeTiming(14, timing).progress < 0);
  assert.equal(resolveProducerRecipeTiming(t.move, timing).progress, 0);
  assert.equal(resolveProducerRecipeTiming(t.land, timing).progress, 1);
  assert.ok(resolveProducerRecipeTiming(t.land + 3, timing).progress > 1);
  assert.ok(resolveProducerRecipeTiming(t.settle - 3, timing).progress < 1);
  assert.equal(resolveProducerRecipeTiming(100, timing).progress, 1);
});
test("all recipe resolvers reject unsafe timing and non-finite frames", () => {
  for (const resolve of resolvers) assert.throws(() => resolve(NaN));
  for (const invalid of [
    { startFrame: -1, durationInFrames: 60 },
    { startFrame: 1.5, durationInFrames: 60 },
    { startFrame: 0, durationInFrames: 11 },
    { startFrame: Number.MAX_SAFE_INTEGER, durationInFrames: 60 },
  ])
    assert.throws(() => resolveProducerRecipeTiming(0, invalid));
});
test("AxiomMorph matches repeated Chinese and English graphemes FIFO without reuse", () => {
  assert.deepEqual(matchAxiomGlyphs(layout("人人 AI"), layout("AI 人人人")), [
    3,
    4,
    2,
    0,
    1,
    null,
  ]);
  assert.deepEqual(matchAxiomGlyphs(layout("ABBA"), layout("BAABA")), [
    1,
    0,
    3,
    2,
    null,
  ]);
  assert.deepEqual(splitAxiomGlyphs("中e\u0301👩‍💻"), ["中", "e\u0301", "👩‍💻"]);
  const before = resolveAxiomMorph(9, morph),
    after = resolveAxiomMorph(100, morph);
  const shared = before.glyphs.find((g) => g.key === "new-0:null")!;
  assert.equal(shared.x, morph.text.glyphs[3].x - morph.text.width / 2);
  assert.equal(
    after.glyphs.find((g) => g.key === "new-0:null")!.x,
    -morph.nextText.width / 2,
  );
  assert.equal(shared.opacity, 1);
});
test("AxiomMorph modes assemble/scatter/shatter/reform reach exact visible endpoints", () => {
  for (const mode of ["assemble", "scatter", "shatter", "reform"] as const) {
    const first = resolveAxiomMorph(9, { ...morph, mode });
    const last = resolveAxiomMorph(100, { ...morph, mode });
    if (mode === "assemble") {
      assert.ok(first.glyphs.every((g) => g.opacity === 0));
      assert.ok(last.glyphs.every((g) => g.opacity === 1 && g.y === 0));
    }
    if (mode === "scatter" || mode === "shatter") {
      assert.ok(first.glyphs.every((g) => g.opacity === 1 && g.y === 0));
      assert.ok(last.glyphs.every((g) => g.opacity === 0));
    }
    if (mode === "shatter") {
      assert.equal(first.glyphs.length, morph.text.glyphs.length * 8);
      assert.ok(first.glyphs.every((g) => g.clip?.startsWith("polygon")));
    }
  }
  assert.notDeepEqual(
    resolveAxiomMorph(40, morph),
    resolveAxiomMorph(40, { ...morph, seed: "other" }),
  );
});
test("AxiomMorph validates mode, layout, target, spread and fragment cap", () => {
  for (const patch of [
    { mode: "bad" },
    { nextText: undefined },
    { text: layout("") },
    { spread: 0 },
    { fragments: 3 },
    { fragments: 5 },
    { text: { width: 50, glyphs: [{ text: "ab", x: 0, width: 50 }] } },
    { text: { width: 50, glyphs: [{ text: "a", x: 0, width: 80 }] } },
  ])
    assert.throws(() =>
      resolveAxiomMorph(0, { ...morph, ...patch } as typeof morph),
    );
});
test("NumberRoll preserves grouping, decimals, sign, currency and suffix; lands exactly", () => {
  const options = {
    ...timing,
    value: -1234.5,
    decimals: 2,
    prefix: "¥",
    suffix: " kg",
  };
  const t = resolveNumberRoll(0, options);
  assert.equal(t.formatted, "¥−1,234.50 kg");
  const affixes = resolveNumberRoll(30, {
    ...timing,
    value: 2,
    prefix: "2026 / ",
    suffix: " m2",
  });
  assert.equal(affixes.columns.filter((c) => c.digit !== null).length, 1);
  assert.equal(
    resolveNumberRoll(0, { ...options, grouping: false }).formatted,
    "¥−1234.50 kg",
  );
  const landed = resolveNumberRoll(t.land, options);
  assert.equal(landed.displayText, landed.formatted);
  assert.equal(
    resolveNumberRoll(t.settle + 5, options).displayText,
    landed.formatted,
  );
  assert.ok(resolveNumberRoll(t.land + 2, options).offsetInEm > 0);
  assert.equal(resolveNumberRoll(t.settle, options).offsetInEm, 0);
});
for (const { value, decimals, grouping, prefix, suffix } of [
  { value: 21038, decimals: 0, grouping: true, prefix: "$", suffix: "" },
  {
    value: 1234.56,
    decimals: 2,
    grouping: true,
    prefix: "¥ ",
    suffix: " / 次",
  },
  {
    value: 9999.999,
    decimals: 3,
    grouping: false,
    prefix: "2026 / ",
    suffix: " m2",
  },
  { value: 0.00000001, decimals: 8, grouping: true, prefix: "", suffix: " kg" },
  { value: 0, decimals: 2, grouping: true, prefix: "$", suffix: "" },
  { value: 1.239, decimals: 2, grouping: true, prefix: "$", suffix: "" },
  { value: -1.234, decimals: 2, grouping: true, prefix: "$", suffix: "" },
  { value: -1234.5, decimals: 2, grouping: true, prefix: "¥", suffix: " kg" },
  {
    value: 999999999999999,
    decimals: 8,
    grouping: true,
    prefix: "",
    suffix: "",
  },
]) {
  test(`NumberRoll every displayed frame is monotone and bounded: ${prefix}${value}${suffix}`, () => {
    for (const turns of [1, 2, 6]) {
      const options = {
        ...timing,
        value,
        decimals,
        grouping,
        prefix,
        suffix,
        turns,
      };
      let previous = -Infinity;
      for (
        let frame = 0;
        frame <= timing.startFrame + timing.durationInFrames + 10;
        frame++
      ) {
        const state = resolveNumberRoll(frame, options);
        // Parse the actual rendered columns, excluding even numeric affixes.
        const display = state.columns
          .map((column) => column.character)
          .join("");
        assert.equal(display, state.displayText);
        const numeric = display.slice(
          prefix.length,
          suffix ? -suffix.length : undefined,
        );
        const current = Number(numeric.replaceAll(",", "").replace("−", "-"));
        assert.ok(Number.isFinite(current));
        assert.ok(current >= previous, `f${frame}: ${current} < ${previous}`);
        assert.ok(current <= value, `f${frame}: ${current} > ${value}`);
        if (frame >= state.land)
          assert.equal(
            current,
            Number(
              state.formatted
                .slice(prefix.length, suffix ? -suffix.length : undefined)
                .replaceAll(",", "")
                .replace("−", "-"),
            ),
          );
        previous = current;
      }
    }
  });
}
test("NumberRoll rounds downward at the chosen precision without exceeding the factual target", () => {
  assert.equal(
    resolveNumberRoll(100, { ...timing, value: 1.239, decimals: 2 })
      .displayText,
    "1.23",
  );
  assert.equal(
    resolveNumberRoll(100, { ...timing, value: -1.234, decimals: 2 })
      .displayText,
    "−1.24",
  );
});
test("NumberRoll validates precision, magnitude and turn count", () => {
  for (const patch of [
    { value: Infinity },
    { value: 1e15 },
    { decimals: 9 },
    { decimals: -1 },
    { turns: 0 },
    { turns: 7 },
  ])
    assert.throws(() =>
      resolveNumberRoll(0, { ...timing, value: 12, ...patch }),
    );
});
test("BarGrow staggers within the authored window, each bar has its own contact cue", () => {
  const options = {
    ...timing,
    values: [0, 20, 40],
    maxValue: 40,
    staggerInFrames: 5,
  };
  const state = resolveBarGrow(100, options);
  assert.deepEqual(
    state.bars.map((b) => b.height),
    [0, 0.5, 1],
  );
  assert.deepEqual(
    state.bars.map((b) => b.land),
    [46, 51, 56],
  );
  assert.deepEqual(
    state.sfxCues.map((c) => c.frame),
    [46, 51, 56],
  );
  assert.equal(state.land, 56);
  assert.equal(resolveBarGrow(56, options).phase, "land");
  assert.equal(resolveBarGrow(56, options).progress, 1);
  assert.equal(state.bars.at(-1)!.settle, 69);
  assert.equal(resolveBarGrow(0, options).bars[2].height, 0);
  assert.ok(resolveBarGrow(53, options).bars[1].height > 0.5);
});
test("BarGrow rejects negative or excessive values, empty sets and impossible stagger", () => {
  for (const patch of [
    { values: [] },
    { values: [-1] },
    { values: [NaN] },
    { maxValue: 10 },
    { staggerInFrames: 60 },
    { ticks: 0 },
  ])
    assert.throws(() =>
      resolveBarGrow(0, { ...timing, values: [20, 30], ...patch }),
    );
});
test("CameraMove five presets share timing and reuse world bounds and path-by-length", () => {
  for (const preset of [
    "push-in",
    "pull-out",
    "reveal-pan",
    "parallax-drift",
    "pan-along-path",
  ] as const) {
    const options = {
      ...camera,
      preset,
      path: [
        [400, 400],
        [500, 400],
        [1000, 400],
      ] as const,
    };
    const first = resolveCameraMove(0, options),
      last = resolveCameraMove(100, options);
    assert.deepEqual(first.state.center, [400, 400]);
    assert.equal(last.state.zoom, preset === "push-in" ? 1.5 : 1);
    assert.equal(first.state.zoom, preset === "pull-out" ? 1.5 : 1);
    if (!["push-in", "pull-out"].includes(preset))
      assert.deepEqual(last.state.center, [1000, 400]);
    assert.equal(first.fast, false);
    assert.equal(last.fast, false);
  }
  assert.equal(resolveCameraMove(35, camera).fast, true);
  const clamped = resolveCameraMove(100, { ...camera, to: [10000, 400] });
  assert.equal(clamped.state.center[0], 1400);
});
test("CameraMove rejects invalid presets, world dimensions, path, zoom and endpoints", () => {
  for (const patch of [
    { preset: "bad" },
    { worldWidth: 100 },
    { zoom: 7 },
    { width: NaN },
    { to: [NaN, 0] },
    { preset: "pan-along-path" },
    { preset: "pan-along-path", path: [[0, 0]] },
  ])
    assert.throws(() =>
      resolveCameraMove(0, { ...camera, ...patch } as CameraMoveOptions),
    );
});
test("ParticleField samples SVG outline by length and is deterministic in both directions", () => {
  assert.deepEqual(
    resolveParticleField(100, particles).particles.map((p) => [p.x, p.y]),
    [
      [20, 30],
      [120, 30],
      [120, 130],
    ],
  );
  assert.deepEqual(
    resolveParticleField(0, { ...particles, mode: "scatter" }).particles.map(
      (p) => [p.x, p.y],
    ),
    [
      [20, 30],
      [120, 30],
      [120, 130],
    ],
  );
  assert.notDeepEqual(
    resolveParticleField(0, particles).particles,
    resolveParticleField(0, { ...particles, seed: "other" }).particles,
  );
});
test("ParticleField rejects count over budget, malformed/empty paths and bad dimensions", () => {
  for (const patch of [
    { count: 401 },
    { count: 1 },
    { width: 0 },
    { height: NaN },
    { path: "bad" },
    { path: "M0 0" },
    { mode: "bad" },
  ])
    assert.throws(() =>
      resolveParticleField(0, { ...particles, ...patch } as typeof particles),
    );
});
test("ParallaxLayers delegates world projection and keeps a fixed initial anchor", () => {
  const options = { ...camera, depths: [0, 0.5, 1, 1.5] };
  const state = resolveParallaxLayers(100, options);
  assert.deepEqual(
    state.planes.map((p) => p.translate[0]),
    [-200, -500, -800, -1100],
  );
  assert.deepEqual(state.shots[0].center, [400, 400]);
  assert.ok(state.planes.every((p) => p.scale === 1));
});
test("ParallaxLayers validates depths through the existing world-camera contract", () => {
  for (const depths of [[], [-1], [2.1], [NaN], Array(17).fill(1)])
    assert.throws(() => resolveParallaxLayers(0, { ...camera, depths }));
});

test("components can share the root clock inside a Sequence; camera blur sample cap is enforced", async () => {
  const { createElement: h } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Internals } = await import("remotion");
  const { NumberRoll, CameraMove, BarGrow, ParticleField, ParallaxLayers } =
    await import("../../packages/studio/src/remotion/capabilities/recipes");
  const render = (node: import("react").ReactNode) =>
    renderToStaticMarkup(
      h(
        Internals.CanUseRemotionHooksProvider,
        null,
        h(
          Internals.TimelineContext.Provider,
          {
            value: {
              frame: { test: 0 },
              playing: false,
              rootId: "test",
              imperativePlaying: { current: false },
              audioAndVideoTags: { current: [] },
            },
          },
          node,
        ),
      ),
    );
  const number = render(h(NumberRoll, { ...timing, value: 42, frame: 100 }));
  assert.match(number, /aria-label="42"/);
  assert.deepEqual(
    [...number.matchAll(/<span[^>]*>([0-9])<\/span>/g)].map((m) => m[1]),
    ["4", "2"],
  );
  assert.notEqual(number, render(h(NumberRoll, { ...timing, value: 42 })));
  const layers = [{ depth: 1, content: h("span", null, "subject") }];
  const cam = render(h(CameraMove, { ...camera, layers, frame: 100 }));
  assert.match(cam, /translate\(-800\.00px, -300\.00px\)/);
  assert.equal(
    render(h(CameraMove, { ...camera, layers, frame: 100, motionBlur: true })),
    cam,
  );
  assert.throws(
    () => render(h(CameraMove, { ...camera, layers, blurSamples: 9 })),
    /blurSamples/,
  );
  assert.match(
    render(h(BarGrow, { ...timing, values: [20], frame: 100 })),
    /data-recipe="BarGrow"/,
  );
  assert.match(
    render(h(ParticleField, { ...particles, frame: 100 })),
    /cx="20" cy="30"/,
  );
  assert.match(
    render(h(ParallaxLayers, { ...camera, layers, frame: 100 })),
    /subject/,
  );
});
