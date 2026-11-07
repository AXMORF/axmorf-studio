import assert from "node:assert/strict";
import test from "node:test";
import {
  visualizeAudio,
  type MediaUtilsAudioData,
} from "@remotion/media-utils";
import {
  filmMusicLogAmplitude,
  resolveFilmMusicEnergyBands,
  resolveFilmMusicEnergyWindow,
  resolveFilmMusicSourceFrame,
} from "../../packages/studio/src/remotion/film/useFilmMusicEnergy";

test("music energy uses bounded logarithmic amplitude and physical frequency bands", () => {
  assert.equal(filmMusicLogAmplitude(0), 0);
  assert.equal(filmMusicLogAmplitude(0.0001), 0);
  assert.equal(filmMusicLogAmplitude(0.01), 0.5);
  assert.equal(filmMusicLogAmplitude(1), 1);
  assert.equal(filmMusicLogAmplitude(2), 1);
  assert.equal(filmMusicLogAmplitude(Number.NaN), 0);
  const spectrum = Array.from({ length: 1024 }, (_, index) => {
    const hz = (index * 48000) / 2048;
    return hz >= 20 && hz < 250 ? 0.01 : 0;
  });
  assert.deepEqual(resolveFilmMusicEnergyBands(spectrum, 48000), {
    low: 0.5,
    mid: 0,
    high: 0,
  });
  assert.deepEqual(resolveFilmMusicEnergyBands([], 48000), {
    low: 0,
    mid: 0,
    high: 0,
  });
  assert.throws(() => resolveFilmMusicEnergyBands(spectrum, 0));
});

test("energy source clock matches nonzero starts, legacy loops and authored non-loop endings", () => {
  const music = { startFrame: 10, scoreDurationInFrames: 120 };
  assert.equal(resolveFilmMusicSourceFrame(music, 9), null);
  assert.equal(resolveFilmMusicSourceFrame(music, 10), 0);
  assert.equal(resolveFilmMusicSourceFrame(music, 131), 1);
  assert.equal(
    resolveFilmMusicSourceFrame({ ...music, loop: false }, 129),
    119,
  );
  assert.equal(
    resolveFilmMusicSourceFrame({ ...music, loop: false }, 130),
    null,
  );
});

const audio = (start: number, end: number): MediaUtilsAudioData => ({
  sampleRate: 48000,
  channelWaveforms: [
    Float32Array.from(
      { length: end - start },
      (_, index) =>
        Math.sin(((start + index) * Math.PI * 2 * 110) / 48000) * 0.5,
    ),
  ],
  durationInSeconds: 10,
  numberOfChannels: 1,
  resultId: `fixture:${start}:${end}`,
  isRemote: false,
});

test("complete fixed PCM neighborhoods make energy independent of Range window arrival and render order", () => {
  const frame = 151;
  const fps = 30;
  const full = resolveFilmMusicEnergyWindow(audio(0, 480000), frame, fps, 0)!;
  const partial = resolveFilmMusicEnergyWindow(
    audio(240000, 480000),
    frame,
    fps,
    5,
  );
  assert.equal(partial, null, "missing the previous frame's PCM must wait");
  const windows = resolveFilmMusicEnergyWindow(
    audio(192000, 384000),
    frame,
    fps,
    4,
  )!;
  assert.deepEqual(
    full.audioData.channelWaveforms,
    windows.audioData.channelWaveforms,
  );
  const energy = (window: typeof full) =>
    resolveFilmMusicEnergyBands(
      visualizeAudio({
        ...window,
        frame,
        fps,
        numberOfSamples: 1024,
        smoothing: true,
      }),
      48000,
    );
  assert.deepEqual(energy(full), energy(windows));
  assert.deepEqual(energy(windows), energy(full));
  assert.ok(energy(full).low > energy(full).high);
});

test("PCM neighborhoods at file boundaries are padded deterministically", () => {
  const source = audio(0, 480000);
  for (const frame of [0, 299]) {
    const window = resolveFilmMusicEnergyWindow(source, frame, 30, 0)!;
    assert.ok(window.audioData.channelWaveforms[0].length >= 2048);
    assert.deepEqual(
      window,
      resolveFilmMusicEnergyWindow(source, frame, 30, 0),
    );
  }
});

test("noncontiguous Range windows wait instead of reading a later window as the missing middle", () => {
  const frame = 315;
  const fps = 30;
  const previous = audio(240000, 480000).channelWaveforms[0];
  const next = audio(720000, 960000).channelWaveforms[0];
  const joined = new Float32Array(previous.length + next.length);
  joined.set(previous);
  joined.set(next, previous.length);
  const missingMiddle: MediaUtilsAudioData = {
    ...audio(0, 0),
    durationInSeconds: 20,
    resultId: "local-score.wav-windows-1,3",
    channelWaveforms: [joined],
  };
  assert.equal(
    resolveFilmMusicEnergyWindow(missingMiddle, frame, fps, 5),
    null,
  );
  const contiguous: MediaUtilsAudioData = {
    ...audio(240000, 960000),
    durationInSeconds: 20,
    resultId: "local-score.wav-windows-1,2,3",
  };
  const full: MediaUtilsAudioData = {
    ...audio(0, 960000),
    durationInSeconds: 20,
  };
  assert.deepEqual(
    resolveFilmMusicEnergyWindow(contiguous, frame, fps, 5)!.audioData
      .channelWaveforms,
    resolveFilmMusicEnergyWindow(full, frame, fps, 0)!.audioData
      .channelWaveforms,
  );
});
