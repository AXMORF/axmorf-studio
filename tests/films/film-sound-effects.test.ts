import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { FilmAssetSchema } from "../../packages/studio/src/contracts/film";
import { ProducerAssetManifestSchema } from "../../packages/studio/src/contracts/assets";
import manifest from "../../packages/studio/src/remotion/catalog/assets.manifest.json";
import {
  resolveFilmSoundEffects,
  FILM_SFX_DEFAULT_VOLUME,
  FILM_SFX_UNDER_SPEECH_GAIN,
  type FilmSoundEffectCue,
} from "../../packages/studio/src/remotion/film/FilmSoundEffects";
import {
  soundEffectDefinitions,
  soundEffectPublicPath,
  renderSoundEffectWav,
} from "../../scripts/sound-effects/generate";
import { filmTrackFixture } from "./film-track-fixture";

const film = filmTrackFixture();
const cue = (frame = 32) =>
  ({
    frame,
    sfx: "soft-impact",
    for: "Visible landing",
  }) satisfies FilmSoundEffectCue;

test("sound effects snap to beat, bar, accent and section, within shift and anchor window", () => {
  for (const [snap, frame, target] of [
    ["beat", 32, 30],
    ["bar", 59, 60],
    ["accent", 32, 30],
    ["section", 118, 120],
    ["none", 32, 32],
  ] as const) {
    assert.equal(
      resolveFilmSoundEffects(film, [{ ...cue(frame), snap }])[0].startFrame,
      target,
    );
  }
  assert.equal(
    resolveFilmSoundEffects(film, [
      { ...cue(), snap: "beat", maxShiftFrames: 1 },
    ])[0].startFrame,
    32,
  );
  assert.equal(
    resolveFilmSoundEffects(film, [
      { ...cue(), snap: "beat", minFrame: 31, maxFrame: 33 },
    ])[0].startFrame,
    32,
  );
  assert.equal(
    resolveFilmSoundEffects({ ...film, music: null }, [
      { ...cue(), snap: "beat" },
    ])[0].startFrame,
    32,
  );
});

test("end anchoring uses measured duration, snaps the end, and stays inside the body", () => {
  const [swell] = resolveFilmSoundEffects(film, [
    {
      endFrame: 119,
      sfx: "riser-short",
      snap: "section",
      for: "Reveal anticipation",
    },
  ]);
  assert.equal(swell.endFrame, 120);
  assert.equal(swell.startFrame, 96);
  assert.throws(() =>
    resolveFilmSoundEffects(film, [
      { endFrame: 10, sfx: "riser-short", for: "Too early" },
    ]),
  );
  const [tail] = resolveFilmSoundEffects(film, [cue(299)]);
  assert.equal(tail.endFrame, 300);
  assert.equal(tail.startFrame, 299);
});

test("aliases and shared IDs deduplicate by resolved sound and start; speech uses named gain constants", () => {
  const sounds = resolveFilmSoundEffects(film, [
    cue(),
    { ...cue(), sfx: "asset.axmorf.sfx.soft-impact-v1" },
    cue(60),
  ]);
  assert.equal(sounds.length, 2);
  assert.equal(sounds[0].volume, FILM_SFX_DEFAULT_VOLUME);
  assert.equal(
    sounds[0].speechDucking?.volume,
    FILM_SFX_DEFAULT_VOLUME * FILM_SFX_UNDER_SPEECH_GAIN,
  );
  assert.deepEqual(sounds[0].speechDucking?.ranges, [
    [-17, 13],
    [68, 118],
  ]);
  assert.equal(
    resolveFilmSoundEffects(film, [{ ...cue(), sfx: "soft-whoosh" }])[0].sfxId,
    "asset.axmorf.sfx.whoosh-short-v1",
  );
});

test("registered shared descriptor and film audio use existing license and path validation", () => {
  const shared = ProducerAssetManifestSchema.parse(manifest).assets.find(
    (a) => a.id === "asset.axmorf.sfx.soft-impact-v1",
  )!;
  assert.equal(
    resolveFilmSoundEffects(film, [{ ...cue(), sfx: shared }])[0].publicPath,
    shared.localPath,
  );
  assert.throws(() =>
    resolveFilmSoundEffects(film, [
      {
        ...cue(),
        sfx: { ...shared, status: "blocked", allowedUse: "blocked" },
      },
    ]),
  );
  const asset = FilmAssetSchema.parse({
    publicPath: "public/films/track-tests/landing.wav",
    checksum: `sha256:${"d".repeat(64)}`,
    kind: "audio",
    origin: "original",
    creator: "AXMORF",
    license: "Apache-2.0",
  });
  assert.equal(
    resolveFilmSoundEffects(film, [
      { ...cue(), sfx: { asset, durationInSeconds: 0.3 } },
    ])[0].endFrame,
    41,
  );
  assert.throws(() =>
    resolveFilmSoundEffects(film, [
      {
        ...cue(),
        sfx: {
          asset: { ...asset, origin: "licensed" },
          durationInSeconds: 0.3,
        },
      },
    ]),
  );
});

test("missing assets, invalid cues and invalid volumes fail explicitly", () => {
  for (const invalid of [
    { ...cue(), sfx: "missing" },
    { ...cue(), frame: -1 },
    { ...cue(), frame: 300 },
    { ...cue(), frame: 0.5 },
    { ...cue(), volume: 2 },
    { ...cue(), maxShiftFrames: -1 },
    { ...cue(), minFrame: 40 },
    { ...cue(), for: "" },
  ])
    assert.throws(() => resolveFilmSoundEffects(film, [invalid]));
});

test("six cinematic sounds reproduce byte-for-byte and ship with complete verified metadata", async () => {
  const parsed = ProducerAssetManifestSchema.parse(manifest);
  for (const def of soundEffectDefinitions.slice(-6)) {
    const path = soundEffectPublicPath(def);
    const bytes = await readFile(
      `packages/studio/src/runtime/workspace-seed/files/${path}`,
    );
    assert.deepEqual(bytes, renderSoundEffectWav(def));
    assert.deepEqual(bytes, renderSoundEffectWav(def));
    const asset = parsed.assets.find((a) => a.localPath === path)!;
    assert.ok(asset);
    assert.equal(
      asset.checksum,
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    );
    assert.equal(asset.license.id, "Apache-2.0");
    assert.equal(asset.license.verificationStatus, "verified");
    assert.equal(asset.media?.sampleRate, 48000);
    assert.equal(asset.media?.codec, "pcm_s16le");
    assert.equal(asset.media?.sizeBytes, bytes.length);
    assert.equal(
      asset.media?.durationInSeconds,
      (bytes.length - 44) / (48000 * 4),
    );
  }
});
