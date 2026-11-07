import assert from "node:assert/strict";
import test from "node:test";
import { FilmSfxSchema } from "../../packages/studio/src/contracts/film-sfx";
import { FilmSpecSchema } from "../../packages/studio/src/contracts/film";
import { resolveFilmSoundEffects } from "../../packages/studio/src/remotion/film/FilmSoundEffects";
import { resolveFilmSoundtrack } from "../../packages/studio/src/remotion/film/FilmSoundtrack";
import { resolveFilmRuntime } from "../../packages/studio/src/remotion/film/context";
import { filmTrackFixture } from "./film-track-fixture";
import { analyzeMotion } from "../../scripts/films/motion";

const checksum = `sha256:${"a".repeat(64)}`;
const base = filmTrackFixture();
const effect = {
  id: "reveal",
  kind: "riser" as const,
  for: "Visible reveal anticipation",
  frame: 120,
  durationFrames: 29,
  anchor: "end" as const,
};
const spec = FilmSpecSchema.parse({
  ...base.spec,
  sound: { effects: [effect] },
});
const sfx = FilmSfxSchema.parse({
  schemaVersion: 1,
  filmId: spec.filmId,
  inputFingerprint: checksum,
  synthesizerVersion: "film-sfx-v1",
  effects: [
    {
      id: effect.id,
      kind: effect.kind,
      for: effect.for,
      anchor: effect.anchor,
      inputFingerprint: checksum,
      publicPath: `public/films/${spec.filmId}/sfx/reveal.wav`,
      checksum,
      sampleRate: 48000,
      sampleFrameCount: 46400,
      durationInFrames: 29,
      durationInSeconds: 46400 / 48000,
      startFrame: 91,
      endFrame: 120,
      alignmentFrame: 120,
    },
  ],
});
const film = { ...base, spec, sfx };

test("omitted cues play the generated plan at exact measured frames; explicit empty cues stay silent", () => {
  const resolved = resolveFilmSoundEffects(film);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].sfxId, "plan:reveal");
  assert.equal(resolved[0].startFrame, 91);
  assert.equal(resolved[0].endFrame, 120);
  assert.equal(resolved[0].for, effect.for);
  assert.deepEqual(resolveFilmSoundEffects(film, []), []);
  assert.deepEqual(resolveFilmSoundEffects(base), []);
  assert.throws(
    () => resolveFilmSoundEffects({ ...film, sfx: null }),
    /film:sfx/,
  );
});

test("plan refs retain cue start/end anchoring, snap and deduplication", () => {
  const cues = [
    {
      sfx: "plan:reveal",
      endFrame: 119,
      snap: "section" as const,
      for: effect.for,
    },
    { sfx: "plan:reveal", frame: 91, for: effect.for },
  ];
  const resolved = resolveFilmSoundEffects(film, cues);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].startFrame, 91);
  assert.equal(resolved[0].endFrame, 120);
  assert.throws(
    () =>
      resolveFilmSoundEffects(film, [
        { sfx: "plan:missing", frame: 100, for: "missing" },
      ]),
    /film:sfx/,
  );
  assert.equal(
    resolveFilmSoundtrack(film, {
      ending: { landFrame: 200, sfx: "plan:reveal" },
    }).at(-1)!.startFrame,
    171,
  );
});

test("runtime ignores obsolete SFX after sound is removed and validates manifest ownership", () => {
  const input = { spec, timing: base.timing, music: base.music, sfx };
  assert.deepEqual(resolveFilmRuntime(input).sfx, sfx);
  assert.equal(resolveFilmRuntime({ ...input, spec: base.spec }).sfx, null);
  assert.throws(
    () =>
      resolveFilmRuntime({ ...input, sfx: { ...sfx, filmId: "another-film" } }),
    /belong/,
  );
});

test("authored score endings never restart the score", () => {
  const music = { ...base.music!, loop: false };
  const track = resolveFilmSoundtrack({ ...film, music })[1];
  assert.equal(track.loop, false);
});

test("review counts the default generated plan and suppresses no-sound-effects", () => {
  const cues = resolveFilmSoundEffects(film).map((cue) => ({
    frame: cue.startFrame,
    endFrame: cue.endFrame,
    sfx: cue.sfxId,
    for: cue.for,
  }));
  const result = analyzeMotion({
    records: [
      {
        index: 0,
        frame: 0,
        truncated: false,
        events: [{ type: "sound-effects", cues }],
      },
    ],
    frames: [0],
    curve: { fps: 30, sampleSeconds: 0.5, samples: [], seconds: [], cuts: [] },
    durationInFrames: 1200,
    fps: 30,
    hasNarration: true,
    legacyAudio: false,
    music: film.music,
    stillWarnings: [],
  });
  assert.equal(result.summary.cueCount, 1);
  assert.equal(
    result.motionWarnings.some(
      (warning) => warning.rule === "no-sound-effects",
    ),
    false,
  );
});
