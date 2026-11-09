import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";
import {
  barCameraChangeFrames,
  barCameraShots,
  FilmProvider,
  lastAtOrBefore,
  resolveBarCamera,
  resolveBeatPulse,
  resolveBeatPulseEvents,
  resolveBreathScale,
  resolveFilmRuntime,
  resolveImpact,
  resolveImpactLevel,
  IMPACT_LEVELS,
  resolveNarrationActive,
  resolveProducerWorldCamera,
  useBarCamera,
  useBeatPulse,
  useImpact,
  useNarrationActive,
  type FilmTimingView,
} from "../../packages/studio/src/remotion";

const music: NonNullable<FilmTimingView["music"]> = {
  bpm: 100,
  beatsPerBar: 4,
  framesPerBeat: 18,
  beatFrames: [0, 18, 36],
  barFrames: [0, 72],
  accentFrames: [36],
  sectionFrames: [0],
  onsets: {
    kick: [18],
    snare: [],
    clap: [],
    hat: [],
    bass: [],
    hits: [36],
    sections: [0],
  },
};
const shots = [
  { center: [960, 540] as const, zoom: 1 },
  { center: [1500, 540] as const, zoom: 2 },
  { center: [2000, 540] as const, zoom: 1.5 },
];
test("sorted-event binary search handles empty arrays, duplicates and both ends", () => {
  assert.equal(lastAtOrBefore(0, []), -Infinity);
  const events = [3, 3, 7, 10];
  for (const [frame, expected] of [
    [-1, -Infinity],
    [2, -Infinity],
    [3, 3],
    [6.9, 3],
    [7, 7],
    [100, 10],
  ])
    assert.equal(lastAtOrBefore(frame, events), expected);
  const large = Array.from({ length: 100000 }, (_, i) => i * 2);
  assert.equal(lastAtOrBefore(123457, large), 123456);
});
test("pulse begins at the event, decays exponentially, then ends after decayFrames", () => {
  assert.equal(resolveBeatPulse(5, []), 0);
  assert.equal(resolveBeatPulse(9, [10]), 0);
  assert.equal(resolveBeatPulse(10, [10]), 1);
  assert.equal(resolveBeatPulse(14, [10]), Math.exp(-1.5));
  assert.equal(resolveBeatPulse(18, [10]), Math.exp(-3));
  assert.equal(resolveBeatPulse(19, [10]), 0);
  assert.equal(resolveBeatPulse(16, [10, 16]), 1);
  assert.equal(resolveBeatPulse(12, [10], { decayFrames: 4 }), Math.exp(-1.5));
  assert.throws(() => resolveBeatPulse(10, [10], { decayFrames: 0 }));
});
test("kick selection falls back only for old tracks, and silence stays silent", () => {
  assert.deepEqual(resolveBeatPulseEvents(music), [18]);
  assert.deepEqual(
    resolveBeatPulseEvents({ ...music, onsets: undefined }),
    [0, 18, 36],
  );
  assert.deepEqual(
    resolveBeatPulseEvents({
      ...music,
      onsets: { ...music.onsets!, kick: [] },
    }),
    [],
  );
  assert.deepEqual(resolveBeatPulseEvents(null), []);
  for (const event of ["beat", "bar", "accent"] as const)
    assert.deepEqual(
      resolveBeatPulseEvents(music, event),
      music[`${event}Frames`],
    );
  assert.deepEqual(resolveBeatPulseEvents(music, [7, 9]), [7, 9]);
});
test("narration uses half-open sentence intervals, without treating pauses as speech", () => {
  const sentences = [
    { startFrame: 10, endFrame: 20 },
    { startFrame: 30, endFrame: 40 },
  ];
  for (const frame of [0, 9, 20, 29, 40])
    assert.equal(resolveNarrationActive(frame, sentences), false);
  for (const frame of [10, 19, 30, 39])
    assert.equal(resolveNarrationActive(frame, sentences), true);
  assert.equal(resolveNarrationActive(10, []), false);
  assert.equal(resolveBreathScale(1, true), 1.035);
  assert.equal(resolveBreathScale(1, false), 1.035);
  assert.equal(resolveBreathScale(0, false), 1);
  assert.equal(resolveBreathScale(1), 1.035);
});

test("v3 weighted accents, fills and breaks can drive pulses and impacts", () => {
  const accents = [
    { frame: 36, strength: 0.5 },
    { frame: 100, strength: 1 },
  ];
  const v3 = {
    ...music,
    onsets: {
      ...music.onsets!,
      accents,
      fills: [{ from: 20, to: 30 }],
      breaks: [{ from: 30, to: 36 }],
    },
  };
  assert.deepEqual(resolveBeatPulseEvents(v3, "accent"), [36, 100]);
  assert.deepEqual(resolveBeatPulseEvents(v3, "fill"), [20]);
  assert.deepEqual(resolveBeatPulseEvents(v3, "break"), [30]);
  assert.deepEqual(resolveBeatPulseEvents(music, "fill"), []);
  const full = resolveImpact(37, 36, 30);
  const half = resolveImpact(37, accents, 30);
  assert.equal(half.hit, full.hit * 0.5);
  assert.equal(half.shake, full.shake * 0.5);
  assert.equal(half.scale, 1 + (full.scale - 1) * 0.5);
  assert.deepEqual(
    resolveImpact(101, accents, 30),
    resolveImpact(101, 100, 30),
  );
});
test("bar spring steps start on the bar, hold the last shot, and adapt to a stable world anchor", () => {
  const options = { shots, bars: [10, 90, 170, 250], fps: 30 };
  assert.deepEqual(resolveBarCamera(0, options), shots[0]);
  assert.deepEqual(resolveBarCamera(10, options), shots[0]);
  const moving = resolveBarCamera(15, options);
  assert.ok(moving.center[0] > 960 && moving.center[0] < 1500);
  assert.deepEqual(resolveBarCamera(89, options), shots[1]);
  assert.deepEqual(resolveBarCamera(90, options), shots[1]);
  assert.deepEqual(resolveBarCamera(169, options), shots[2]);
  assert.deepEqual(resolveBarCamera(5000, options), shots[2]);
  assert.deepEqual(resolveBarCamera(5000, { ...options, bars: [] }), shots[0]);
  assert.deepEqual(
    resolveBarCamera(80, { ...options, shots: [shots[0]] }),
    shots[0],
  );
  assert.throws(() => resolveBarCamera(0, { ...options, shots: [] }));
  assert.deepEqual(barCameraChangeFrames(options.bars, shots), [10, 90]);
  assert.deepEqual(
    barCameraChangeFrames([0, 90], [shots[0], shots[0], shots[1]]),
    [90],
  );
  const adapted = barCameraShots(moving, shots[0]);
  assert.deepEqual(adapted[0], { frame: 0, ...shots[0] });
  assert.deepEqual(
    resolveProducerWorldCamera({
      shots: adapted,
      frame: 1,
      width: 1920,
      height: 1080,
      worldWidth: 3840,
      worldHeight: 1080,
    }),
    moving,
  );
  assert.deepEqual(resolveBarCamera(15, options), moving);
});
test("impact anticipates for six frames, starts its spring at the exact hit, and shakes for only six frames", () => {
  assert.deepEqual(resolveImpact(93, 100, 30), {
    strength: 1,
    pre: 0,
    hit: 0,
    scale: 1,
    shake: 0,
  });
  for (let frame = 94; frame < 100; frame++) {
    const state = resolveImpact(frame, 100, 30);
    assert.equal(state.pre, (frame - 94) / 6);
    assert.equal(state.hit, 0);
    assert.equal(state.shake, 0);
    assert.equal(state.scale, 1 - 0.04 * state.pre);
  }
  const at = resolveImpact(100, 100, 30);
  assert.equal(at.pre, 1);
  assert.equal(at.hit, 0); // spring starts at 0 on this frame, never during anticipation
  assert.equal(at.scale, 0.96);
  assert.notEqual(at.shake, 0);
  assert.ok(resolveImpact(101, 100, 30).hit > 0);
  assert.ok(
    Array.from(
      { length: 20 },
      (_, i) => resolveImpact(100 + i, 100, 30).hit,
    ).some((hit) => hit > 1),
  );
  assert.equal(resolveImpact(106, 100, 30).shake, 0);
  assert.ok(Math.abs(resolveImpact(200, 100, 30).scale - 1) < 1e-9);
  for (const frame of [93, 94, 99, 100, 101, 105, 106, 200])
    assert.deepEqual(
      resolveImpact(frame, [100, 220], 30),
      resolveImpact(frame, 100, 30),
    );
  assert.deepEqual(
    resolveImpact(214, [100, 220], 30),
    resolveImpact(214, 220, 30),
  );
  assert.deepEqual(resolveImpact(150, [], 30), {
    strength: 1,
    pre: 0,
    hit: 0,
    scale: 1,
    shake: 0,
  });
  // Out-of-order rendering has no state or nondeterministic random source.
  const later = resolveImpact(103, [100, 220], 30);
  resolveImpact(222, [100, 220], 30);
  assert.deepEqual(resolveImpact(103, [100, 220], 30), later);
  assert.equal(resolveImpact(97, 100, 30, { preFrames: 3 }).pre, 0);
});
test("impact exposes the selected strength, including the next anticipation and legacy defaults", () => {
  const events = [
    { frame: 100, strength: 0.3 },
    { frame: 110, strength: 0.95 },
  ];
  for (const frame of [94, 99, 100, 103])
    assert.equal(resolveImpact(frame, events, 30).strength, 0.3);
  for (const frame of [104, 109, 110, 120])
    assert.equal(resolveImpact(frame, events, 30).strength, 0.95);
  for (const at of [100, [100], []])
    assert.equal(resolveImpact(100, at, 30).strength, 1);
  assert.equal(resolveImpact(93, events, 30).strength, 1);
  assert.equal(
    resolveImpact(100, [{ frame: 100, strength: 0 }], 30).strength,
    0,
  );
});

test("impact levels lock the three treatments, inclusive boundaries and monotone amplitudes", () => {
  assert.deepEqual(resolveImpactLevel(0.49), {
    cameraImpulse: 0.02,
    subjectScale: 1.03,
    shakePixels: 3,
    flashOpacity: 0,
    particleCount: 6,
  });
  assert.deepEqual(resolveImpactLevel(0.5), {
    cameraImpulse: 0.05,
    subjectScale: 1.06,
    shakePixels: 8,
    flashOpacity: 0,
    particleCount: 18,
  });
  assert.deepEqual(resolveImpactLevel(0.9), {
    cameraImpulse: 0.12,
    subjectScale: 1.12,
    shakePixels: 16,
    flashOpacity: 0.5,
    particleCount: 40,
  });
  assert.equal(resolveImpactLevel(0.8999), IMPACT_LEVELS.section);
  assert.equal(resolveImpactLevel(1), IMPACT_LEVELS.drop);
  assert.ok(IMPACT_LEVELS.drop.subjectScale >= 1.08);
  assert.ok(
    IMPACT_LEVELS.drop.shakePixels >= 12 &&
      IMPACT_LEVELS.drop.shakePixels <= 20,
  );
  assert.ok(IMPACT_LEVELS.drop.flashOpacity <= 0.6);
  for (let i = 1; i <= 100; i++) {
    const previous = resolveImpactLevel((i - 1) / 100);
    const next = resolveImpactLevel(i / 100);
    for (const key of Object.keys(previous) as (keyof typeof previous)[])
      assert.ok(next[key] >= previous[key], `${key} must not decrease`);
  }
});
test("hooks preserve no-music behavior and accept the film-root frame inside sequences", () => {
  const runtime = resolveFilmRuntime({
    spec: {
      schemaVersion: 1,
      filmId: "rhythm-test",
      render: { width: 1920, height: 1080, fps: 30 },
      timeline: { durationInFrames: 300 },
      narration: [],
      music: null,
      publish: { title: "Rhythm" },
    },
    timing: null,
    music: null,
  });
  const Probe = () => {
    assert.equal(useBeatPulse({ events: [10], frame: 10 }), 0);
    assert.equal(useNarrationActive({ frame: 10 }), false);
    assert.deepEqual(useBarCamera(shots, { frame: 100 }), shots[0]);
    assert.deepEqual(
      useImpact([100, 220], { frame: 101 }),
      resolveImpact(101, [100, 220], 30),
    );
    return null;
  };
  renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.TimelineContext.Provider
        value={{
          frame: { test: 0 },
          playing: false,
          rootId: "test",
          imperativePlaying: { current: false },
          audioAndVideoTags: { current: [] },
        }}
      >
        <FilmProvider runtime={runtime}>
          <Probe />
        </FilmProvider>
      </Internals.TimelineContext.Provider>
    </Internals.CanUseRemotionHooksProvider>,
  );
});
