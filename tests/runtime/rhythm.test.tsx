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
  assert.equal(resolveBreathScale(1, true), 1.012);
  assert.equal(resolveBreathScale(1, false), 1.035);
  assert.equal(resolveBreathScale(0, false), 1);
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
