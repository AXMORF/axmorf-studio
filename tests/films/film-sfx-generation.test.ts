import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import legacyHashes from "../fixtures/film-sfx-v2-hashes.json";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  computeFilmSfxInputFingerprint,
  computeFilmSoundEffectFingerprint,
  resolveFilmSoundEffectPitch,
  createFingerprint,
  filmFrameFromSamples,
  FilmSoundEffectKindSchema,
  FilmSoundEffectSpecSchema,
  FilmSoundSpecSchema,
  FilmSpecSchema,
  resolveFilmSoundEffectFrames,
  type FilmSoundEffectSpec,
} from "@axmorf/studio/contracts";

import {
  filmPaths,
  loadFilmSpec,
  writeJsonFile,
} from "../../scripts/films/files";
import { assertFilmSfxConsistency, runFilmSfx } from "../../scripts/films/sfx";
import { buildFilmTiming } from "../../scripts/films/voice";
import {
  measureFilmSoundEffectWav,
  renderFilmSoundEffectWav,
} from "../../scripts/sound-effects/synth";

const effect = FilmSoundEffectSpecSchema.parse({
  id: "land",
  kind: "impact",
  frame: 30,
  durationFrames: 9,
  anchor: "start",
  for: "s01: evidence arrives",
});

test("sound plan is strict, unique and checks whole action spans for every anchor", () => {
  assert.equal(
    FilmSoundSpecSchema.safeParse({ effects: [effect, effect] }).success,
    false,
  );
  for (const change of [
    { durationFrames: 0 },
    { frame: -1 },
    { durationFrames: 2.5 },
    { kind: "recording" },
    { params: { brightness: 1.1 } },
    { params: { unused: 3 } },
    { for: " " },
    { id: "../escape" },
  ]) {
    assert.equal(
      FilmSoundEffectSpecSchema.safeParse({ ...effect, ...change }).success,
      false,
    );
  }
  assert.deepEqual(resolveFilmSoundEffectFrames(effect, 100), {
    startFrame: 30,
    endFrame: 39,
    alignmentFrame: 30,
  });
  assert.deepEqual(
    resolveFilmSoundEffectFrames({ ...effect, anchor: "end" }, 100),
    { startFrame: 21, endFrame: 30, alignmentFrame: 30 },
  );
  assert.deepEqual(
    resolveFilmSoundEffectFrames({ ...effect, anchor: "center" }, 100),
    { startFrame: 26, endFrame: 35, alignmentFrame: 30 },
  );
  assert.throws(
    () =>
      resolveFilmSoundEffectFrames({ ...effect, frame: 5, anchor: "end" }, 100),
    /outside the film/u,
  );
  assert.throws(
    () => resolveFilmSoundEffectFrames({ ...effect, frame: 95 }, 100),
    /outside the film/u,
  );
  assert.equal(
    resolveFilmSoundEffectFrames({ ...effect, frame: 100, anchor: "end" }, 100)
      .endFrame,
    100,
  );
});

for (const kind of FilmSoundEffectKindSchema.options) {
  test(`${kind}: deterministic PCM, action duration, anchors and each parameter changes output`, () => {
    const spec: FilmSoundEffectSpec = { ...effect, kind, durationFrames: 7 };
    const original = renderFilmSoundEffectWav(spec, 29);
    assert.deepEqual(renderFilmSoundEffectWav(spec, 29), original);
    const measured = measureFilmSoundEffectWav(original);
    assert.equal(measured.sampleFrameCount, Math.floor((7 * 48_000) / 29));
    assert.equal(
      filmFrameFromSamples(measured.sampleFrameCount, 29, 48_000),
      7,
    );
    assert.ok(measured.peak > 0.1 && measured.peak <= 10 ** (-1 / 20));
    for (const params of [
      { pitch: 7 },
      { brightness: 0.1 },
      { intensity: 0.2 },
      { tail: 0.9 },
      { stereo: 0 },
      { seed: 37 },
    ]) {
      assert.notDeepEqual(
        renderFilmSoundEffectWav({ ...spec, params }, 29),
        original,
        `${JSON.stringify(params)} must affect ${kind}`,
      );
    }
    const longer = measureFilmSoundEffectWav(
      renderFilmSoundEffectWav({ ...spec, durationFrames: 11 }, 29),
    );
    assert.equal(filmFrameFromSamples(longer.sampleFrameCount, 29, 48_000), 11);
    for (const anchor of ["start", "end", "center"] as const) {
      const aligned = resolveFilmSoundEffectFrames({ ...spec, anchor }, 100);
      assert.equal(aligned.endFrame - aligned.startFrame, 7);
      assert.equal(aligned.alignmentFrame, 30);
    }
    const mono = renderFilmSoundEffectWav(
      { ...spec, params: { stereo: 0 } },
      29,
    );
    for (let i = 44; i < mono.length; i += 4)
      assert.equal(mono.readInt16LE(i), mono.readInt16LE(i + 2));
  });
}

test("film:sfx caches verified PCM, regenerates changed specs and detects stale checks/metadata/provenance", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-film-sfx-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const filmId = "sfx-test";
  const paths = filmPaths(rootDir, filmId);
  const input = {
    schemaVersion: 1,
    filmId,
    render: { width: 640, height: 360, fps: 30 },
    timeline: { durationInFrames: 100 },
    narration: [],
    sound: { effects: [effect] },
    publish: { title: "SFX" },
  };
  await mkdir(paths.dir, { recursive: true });
  await writeJsonFile(paths.spec, input);
  let spec = await loadFilmSpec(rootDir, filmId);
  await writeJsonFile(
    paths.timing,
    buildFilmTiming({ spec, sentenceSamples: [], narration: null }),
  );
  await assert.rejects(
    assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }),
    /Run film:sfx/u,
  );
  let renders = 0;
  const renderEffect = (entry: FilmSoundEffectSpec, fps: number) => {
    renders += 1;
    return renderFilmSoundEffectWav(entry, fps);
  };
  const first = await runFilmSfx({ rootDir, filmId, renderEffect });
  assert.equal(first.generated, 1);
  assert.equal(first.cached, 0);
  const before = await readFile(join(paths.sfxDir, "land.wav"));
  const generated = await assertFilmSfxConsistency({
    rootDir,
    spec,
    durationInFrames: 100,
  });
  assert.equal(
    generated!.inputFingerprint,
    computeFilmSfxInputFingerprint({ spec, durationInFrames: 100 }),
  );
  const second = await runFilmSfx({ rootDir, filmId, renderEffect });
  assert.equal(second.cached, 1);
  assert.equal(renders, 1);
  assert.deepEqual(await readFile(join(paths.sfxDir, "land.wav")), before);

  // Byte corruption is reported by check, and repaired by explicit generation.
  await writeFile(
    join(paths.sfxDir, "land.wav"),
    Uint8Array.from(before.subarray(0, before.length - 4)),
  );
  await assert.rejects(
    assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }),
    /Run film:sfx/u,
  );
  await runFilmSfx({ rootDir, filmId, renderEffect });
  assert.equal(renders, 2);
  await writeJsonFile(paths.spec, {
    ...input,
    sound: { effects: [{ ...effect, params: { pitch: 5 } }] },
  });
  spec = await loadFilmSpec(rootDir, filmId);
  await assert.rejects(
    assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }),
    /older than film.json/u,
  );
  await runFilmSfx({ rootDir, filmId, renderEffect });
  assert.equal(renders, 3);
  const current = await assertFilmSfxConsistency({
    rootDir,
    spec,
    durationInFrames: 100,
  });
  await writeJsonFile(paths.sfx, {
    ...current,
    effects: current!.effects.map((entry) => ({
      ...entry,
      alignmentFrame: 99,
    })),
  });
  await assert.rejects(
    assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }),
    /alignment differs/u,
  );
  await runFilmSfx({ rootDir, filmId, renderEffect });
  const assets = JSON.parse(await readFile(paths.assets, "utf8"));
  assert.equal(assets.assets[0].origin, "original");
  assert.equal(assets.assets[0].license, "Apache-2.0");
  assert.equal(
    assets.assets[0].attribution,
    "land: original sound effect synthesized by AXMORF Studio film-sfx-v2 (Apache-2.0)",
  );
  await writeJsonFile(paths.assets, { ...assets, assets: [] });
  await assert.rejects(
    assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }),
    /license record/u,
  );
  await runFilmSfx({ rootDir, filmId, renderEffect });
  assert.ok(
    await assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }),
  );
  const withoutSound = FilmSpecSchema.parse({ ...input, sound: undefined });
  await assert.rejects(
    assertFilmSfxConsistency({
      rootDir,
      spec: withoutSound,
      durationInFrames: 100,
    }),
    /older than film.json/u,
  );
  await writeJsonFile(paths.spec, withoutSound);
  const removed = await runFilmSfx({ rootDir, filmId, renderEffect });
  assert.deepEqual(removed.effects, []);
  assert.equal(removed.generated, 0);
  assert.deepEqual(
    (await assertFilmSfxConsistency({
      rootDir,
      spec: withoutSound,
      durationInFrames: 100,
    }))!.effects,
    [],
  );
  assert.ok(
    (await readFile(join(paths.sfxDir, "land.wav"))).length > 44,
    "Removing a plan never deletes owned media implicitly",
  );
});

test("tonal SFX land on the score tonic; explicit pitches and unpitched foley stay authored", () => {
  const key = (tonic: string) => ({
    music: { score: { arrangement: { tonic, mode: "minor" } } },
  });
  for (const kind of [
    "chime",
    "shimmer",
    "swell",
    "riser",
    "impact",
    "thud",
    "tick",
    "stamp",
  ] as const) {
    const authored = { ...effect, kind };
    const tuned = resolveFilmSoundEffectPitch(authored, key("D"));
    assert.equal(typeof tuned.params?.pitch, "number");
    assert.notDeepEqual(
      renderFilmSoundEffectWav(tuned, 30),
      renderFilmSoundEffectWav(authored, 30),
    );
    const explicit = { ...authored, params: { pitch: 0 } };
    assert.equal(resolveFilmSoundEffectPitch(explicit, key("D")), explicit);
    assert.equal(resolveFilmSoundEffectPitch(authored, {}), authored);
    assert.notEqual(
      computeFilmSoundEffectFingerprint({
        effect: authored,
        fps: 30,
        spec: key("D"),
      }),
      computeFilmSoundEffectFingerprint({
        effect: authored,
        fps: 30,
        spec: key("E"),
      }),
    );
  }
  assert.equal(
    resolveFilmSoundEffectPitch({ ...effect, kind: "paper" }, key("D")).params,
    undefined,
  );
  const chime = resolveFilmSoundEffectPitch(
    { ...effect, kind: "chime", durationFrames: 30 },
    key("D"),
  );
  const audio = renderFilmSoundEffectWav(chime, 30);
  // Measure the actual PCM fundamental, independently of pitch resolution.
  const power = (frequency: number) => {
    let re = 0,
      im = 0;
    for (let i = 480; i < 9600; i++) {
      const sample = audio.readInt16LE(44 + i * 4);
      re += sample * Math.cos((2 * Math.PI * frequency * i) / 48000);
      im += sample * Math.sin((2 * Math.PI * frequency * i) / 48000);
    }
    return re * re + im * im;
  };
  const fundamental = 440 * 2 ** ((74 - 69) / 12); // D5
  assert.ok(power(fundamental) > power(783.991) * 100);
});

test("v1 generated films remain checkable without regeneration; explicit generation upgrades to tuned v2", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-old-sfx-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const filmId = "old-sfx";
  const paths = filmPaths(rootDir, filmId);
  const authored = { ...effect, kind: "chime" as const };
  const spec = FilmSpecSchema.parse({
    schemaVersion: 1,
    filmId,
    render: { width: 640, height: 360, fps: 30 },
    timeline: { durationInFrames: 100 },
    narration: [],
    music: {
      score: {
        engine: "studio-v2",
        arrangement: { tonic: "D", mode: "minor" },
      },
    },
    sound: { effects: [authored] },
    publish: { title: "Old sound" },
  });
  await mkdir(paths.dir, { recursive: true });
  await writeJsonFile(paths.spec, spec);
  await writeJsonFile(
    paths.timing,
    buildFilmTiming({ spec, sentenceSamples: [], narration: null }),
  );
  const current = await runFilmSfx({ rootDir, filmId });
  const generated = JSON.parse(await readFile(paths.sfx, "utf8"));
  const raw = renderFilmSoundEffectWav(authored, 30);
  const { sha256 } = await import("../../scripts/films/files");
  const checksum = sha256(raw);
  await writeFile(join(paths.sfxDir, "land.wav"), raw);
  const old = {
    ...generated,
    synthesizerVersion: "film-sfx-v1",
    inputFingerprint: createFingerprint({
      namespace: "film-sfx-input",
      version: 1,
      value: {
        synthesizerVersion: "film-sfx-v1",
        fps: 30,
        durationInFrames: 100,
        sound: spec.sound,
      },
    }),
    effects: [
      {
        ...generated.effects[0],
        checksum,
        inputFingerprint: createFingerprint({
          namespace: "film-sfx-effect",
          version: 1,
          value: {
            synthesizerVersion: "film-sfx-v1",
            fps: 30,
            effect: authored,
          },
        }),
      },
    ],
  };
  await writeJsonFile(paths.sfx, old);
  const assets = JSON.parse(await readFile(paths.assets, "utf8"));
  await writeJsonFile(paths.assets, {
    ...assets,
    assets: assets.assets.map((entry: Record<string, unknown>) => ({
      ...entry,
      checksum,
      creator: "AXMORF Studio film-sfx-v1",
      attribution: "Original v1 SFX",
    })),
  });
  assert.equal(
    (await assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }))!
      .synthesizerVersion,
    "film-sfx-v1",
  );
  assert.deepEqual(await readFile(join(paths.sfxDir, "land.wav")), raw);
  await writeJsonFile(paths.sfx, { ...old, synthesizerVersion: "unsupported" });
  await assert.rejects(
    assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }),
    /older than/u,
  );
  await writeJsonFile(paths.sfx, old);
  await assert.rejects(
    assertFilmSfxConsistency({
      rootDir,
      spec: {
        ...spec,
        sound: { effects: [{ ...authored, params: { pitch: 7 } }] },
      },
      durationInFrames: 100,
    }),
    /older than/u,
  );
  const upgraded = await runFilmSfx({ rootDir, filmId });
  assert.equal(upgraded.cached, 0);
  assert.equal(upgraded.generated, 1);
  assert.notDeepEqual(await readFile(join(paths.sfxDir, "land.wav")), raw);
  assert.equal(
    (await assertFilmSfxConsistency({ rootDir, spec, durationInFrames: 100 }))!
      .synthesizerVersion,
    "film-sfx-v2",
  );
  assert.equal(current.generated, 1);
});

test("all twelve existing v2 kinds retain exact PCM bytes across default and custom parameter profiles", () => {
  assert.equal(legacyHashes.length, 24);
  for (const snapshot of legacyHashes) {
    const spec = FilmSoundEffectSpecSchema.parse(snapshot.effect);
    const wav = renderFilmSoundEffectWav(spec, snapshot.fps);
    assert.equal(
      createHash("sha256").update(wav).digest("hex"),
      snapshot.sha256,
      `${spec.kind}: ${JSON.stringify(spec.params)}`,
    );
  }
});

test("paper foley generates registered original clips with exact start/end/center action alignment", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-paper-foley-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const filmId = "paper-foley";
  const paths = filmPaths(rootDir, filmId);
  const effects = [
    {
      id: "approve",
      kind: "stamp",
      frame: 30,
      durationFrames: 10,
      anchor: "start",
      for: "印章压下后回弹",
    },
    {
      id: "peel",
      kind: "tape",
      frame: 75,
      durationFrames: 15,
      anchor: "end",
      for: "撕开胶带至落点",
    },
    {
      id: "circle",
      kind: "pen",
      frame: 105,
      durationFrames: 18,
      anchor: "center",
      for: "红笔圈画金额",
    },
  ];
  const spec = FilmSpecSchema.parse({
    schemaVersion: 1,
    filmId,
    render: { width: 960, height: 540, fps: 30 },
    timeline: { durationInFrames: 180 },
    narration: [],
    music: null,
    sound: { effects },
    publish: { title: "Paper Foley" },
  });
  await mkdir(paths.dir, { recursive: true });
  await writeJsonFile(paths.spec, spec);
  await writeJsonFile(
    paths.timing,
    buildFilmTiming({ spec, sentenceSamples: [], narration: null }),
  );
  const report = await runFilmSfx({ rootDir, filmId });
  assert.equal(report.generated, 3);
  const generated = await assertFilmSfxConsistency({
    rootDir,
    spec,
    durationInFrames: 180,
  });
  assert.equal(generated!.effects.length, 3);
  for (const entry of generated!.effects) {
    const plan = spec.sound!.effects.find((e) => e.id === entry.id)!;
    const alignment = resolveFilmSoundEffectFrames(plan, 180);
    assert.equal(entry.startFrame, alignment.startFrame);
    assert.equal(entry.endFrame, alignment.endFrame);
    assert.equal(entry.alignmentFrame, plan.frame);
    assert.equal(entry.sampleFrameCount, plan.durationFrames * 1600);
  }
  assert.equal((await runFilmSfx({ rootDir, filmId })).cached, 3);
});

test("paper foley tunes only the stamp body; silent intensity and endpoint cleanup work for all new kinds", () => {
  const key = {
    music: { score: { arrangement: { tonic: "D", mode: "minor" } } },
  };
  for (const kind of ["stamp", "tape", "pen"] as const) {
    const spec = { ...effect, kind };
    const tuned = resolveFilmSoundEffectPitch(spec, key);
    assert.equal(tuned !== spec, kind === "stamp");
    const silent = renderFilmSoundEffectWav(
      { ...spec, params: { intensity: 0 } },
      30,
    );
    assert.equal(measureFilmSoundEffectWav(silent).peak, 0);
    const wav = renderFilmSoundEffectWav(spec, 30);
    assert.equal(wav.readInt16LE(44), 0);
    assert.equal(wav.readInt16LE(wav.length - 2), 0);
  }
});
