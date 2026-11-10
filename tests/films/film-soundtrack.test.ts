import assert from "node:assert/strict";
import test from "node:test";
import { resolveFilmSoundtrack } from "../../packages/studio/src/remotion/film/FilmSoundtrack";
import {
  resolveSoundDuckingGain,
  resolveSoundVolume,
} from "../../packages/studio/src/remotion/runtime/sound-design/audio-playback";
import { filmTrackFixture } from "./film-track-fixture";

const film = filmTrackFixture();

test("omitting new options preserves every field of legacy soundtrack output", () => {
  assert.deepEqual(resolveFilmSoundtrack(film), [
    {
      contributionId: "narration",
      publicPath: "public/films/track-tests/narration.wav",
      startFrame: 15,
      endFrame: 150,
      volume: 1,
      loop: false,
    },
    {
      contributionId: "music",
      publicPath: "public/films/track-tests/music.wav",
      startFrame: 10,
      endFrame: 300,
      volume: 0.24,
      loop: true,
      sourceDurationInSeconds: 4,
      fadeOutFrames: 45,
      speechDucking: {
        volume: 0.09,
        rampFrames: 8,
        ranges: [
          [5, 35],
          [90, 140],
        ],
      },
    },
  ]);
  assert.deepEqual(
    resolveFilmSoundtrack(film, {}),
    resolveFilmSoundtrack(film),
  );
  assert.deepEqual(
    resolveFilmSoundtrack(film, { musicDips: [] }),
    resolveFilmSoundtrack(film),
  );
});

test("dips combine with narration by minimum volume, with shared ramps", () => {
  const music = resolveFilmSoundtrack(film, {
    musicDips: [
      { from: 25, to: 35, volume: 0.03 },
      { from: 100, to: 140, volume: 0.15 },
    ],
  })[1];
  const volume = (frame: number) =>
    music.volume *
    resolveSoundDuckingGain(
      frame - music.startFrame,
      music.volume,
      music.speechDucking,
      music.volumeDips,
    );
  assert.equal(volume(30), 0.03);
  assert.equal(volume(110), 0.09);
  assert.equal(volume(70), 0.24);
  assert.ok(volume(23) > 0.03 && volume(23) < 0.09);
  assert.equal(music.volumeDips?.[0].rampFrames, 8);
});

test("ending defaults to the last valid accent or body end, or obeys explicit landing", () => {
  const music = resolveFilmSoundtrack(film, { ending: {} })[1];
  assert.equal(music.endFrame, 240);
  assert.equal(music.fadeOutFrames, 45);
  assert.equal(resolveSoundVolume(229, 230, music.volume, music), 0);
  assert.equal(
    resolveFilmSoundtrack(film, { ending: { landFrame: 200 } })[1].endFrame,
    200,
  );
  assert.equal(
    resolveFilmSoundtrack(
      { ...film, music: { ...film.music!, accentFrames: [] } },
      { ending: {} },
    )[1].endFrame,
    300,
  );
  const sfx = resolveFilmSoundtrack(film, {
    ending: { landFrame: 200, sfx: "low-impact" },
  })[2];
  assert.equal(sfx.endFrame, 200);
  assert.equal(sfx.startFrame, 182);
  assert.equal(
    resolveFilmSoundtrack({ ...film, music: null }, { ending: {} }).length,
    1,
  );
});

test("invalid dip and ending ranges throw; short ending clamps the fade", () => {
  for (const dip of [
    { from: -1, to: 20, volume: 0.1 },
    { from: 30, to: 20, volume: 0.1 },
    { from: 0, to: 301, volume: 0.1 },
    { from: 0, to: 20, volume: 2 },
  ])
    assert.throws(() => resolveFilmSoundtrack(film, { musicDips: [dip] }));
  for (const landFrame of [-1, 0, 10, 301, 20.5])
    assert.throws(() => resolveFilmSoundtrack(film, { ending: { landFrame } }));
  assert.equal(
    resolveFilmSoundtrack(film, { ending: { landFrame: 20 } })[1].fadeOutFrames,
    10,
  );
});

test("without ending, a score starting after the body still leaves narration alone", () => {
  const futureScore = { ...film, music: { ...film.music!, startFrame: 400 } };
  assert.deepEqual(resolveFilmSoundtrack(futureScore), [
    resolveFilmSoundtrack(film)[0],
  ]);
});
