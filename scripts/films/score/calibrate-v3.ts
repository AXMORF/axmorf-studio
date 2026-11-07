/** Offline P8 acceptance fixture; reads existing narration, never calls TTS.
 * node --import tsx scripts/films/score/calibrate-v3.ts voice.wav timing.json output-dir
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  FilmSpecSchema,
  FilmTimingSchema,
  FilmMusicSchema,
  FilmSfxSchema,
  resolveFilmSoundEffectPitch,
  resolveFilmSoundEffectFrames,
  FILM_SFX_SYNTHESIZER_VERSION,
} from "@axmorf/studio/contracts";
import { decodeCanonicalPcmWav } from "../../narration/domain/pcm-wav";
import { resolveFilmRuntime } from "../../../packages/studio/src/remotion/film/context";
import { resolveFilmSoundtrack } from "../../../packages/studio/src/remotion/film/FilmSoundtrack";
import { resolveFilmSoundEffects } from "../../../packages/studio/src/remotion/film/FilmSoundEffects";
import {
  resolveSoundDuckingGain,
  resolveSoundVolume,
} from "../../../packages/studio/src/remotion/runtime/sound-design/audio-playback";
import {
  renderFilmSoundEffectWav,
  measureFilmSoundEffectWav,
} from "../../sound-effects/synth";
import { projectFilmMusicGrid, projectFilmMusicOnsets } from "../music";
import { generateScore, master } from "./synth-score.mjs";

const SR = 48000,
  FPS = 30,
  FRAMES = 900;
const digest = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest("hex");
const zeroHash = `sha256:${"0".repeat(64)}`;

export const calibrateV3 = async (
  voicePath: string,
  timingPath: string,
  outputDir: string,
) => {
  await mkdir(outputDir, { recursive: true });
  const guide = await readFile(
    resolve(".agents/skills/axmorf-film/references/music.md"),
    "utf8",
  );
  const example = JSON.parse(guide.match(/```json\n([\s\S]*?)```/u)![1]);
  const recipe = {
    ...example.music.score,
    engine: "studio-v3",
    fps: FPS,
    durationInFrames: FRAMES,
  };
  const first = generateScore(recipe),
    second = generateScore(recipe);
  assert.deepEqual(first.audio, second.audio);
  const mastered = master(first.audio, outputDir, true);
  assert.deepEqual(master(second.audio, outputDir, true), mastered);
  const header = mastered.subarray(0, 44);
  const encode = (samples: Float64Array) => {
    const bytes = Buffer.alloc(44 + samples.length * 2);
    bytes.set(header);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.writeUInt32LE(bytes.length - 44, 40);
    for (let i = 0; i < samples.length; i++) {
      assert.ok(
        Math.abs(samples[i]) <= 1,
        "Calibration mix must not clip before measurement.",
      );
      bytes.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
    }
    return bytes;
  };
  const decode = (wav: Buffer) =>
    Float64Array.from(
      { length: (wav.length - 44) / 2 },
      (_, i) => wav.readInt16LE(44 + i * 2) / 32768,
    );
  const measure = (samples: Float64Array) => {
    const result = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        "pipe:0",
        "-af",
        "ebur128=peak=true",
        "-f",
        "null",
        "-",
      ],
      { input: encode(samples), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    const summary = result.stderr.split("Summary:").at(-1)!;
    const lufs = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/u)?.[1]);
    const dbtp = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/u)?.[1]);
    assert.ok(Number.isFinite(lufs) && Number.isFinite(dbtp));
    return { lufs, dbtp };
  };
  const originalTiming = FilmTimingSchema.parse(
    JSON.parse(await readFile(timingPath, "utf8")),
  );
  const offset = 90 - originalTiming.sentences[0].startFrame;
  const sentences = originalTiming.sentences.slice(0, 6).map((entry) => ({
    ...entry,
    startFrame: entry.startFrame + offset,
    endFrame: entry.endFrame + offset,
  }));
  const voiceFrom = sentences[0].startFrame,
    voiceTo = sentences.at(-1)!.endFrame;
  const { rawPcm } = decodeCanonicalPcmWav(await readFile(voicePath));
  const voiceFrames = ((voiceTo - voiceFrom) * SR) / FPS;
  assert.ok(rawPcm.length >= voiceFrames * 2);
  const voiceSegment = Float64Array.from(
    { length: voiceFrames * 2 },
    (_, i) => rawPcm.readInt16LE(Math.floor(i / 2) * 2) / 32768,
  );
  const normalizationGain = 10 ** ((-16 - measure(voiceSegment).lufs) / 20);
  for (let i = 0; i < voiceSegment.length; i++)
    voiceSegment[i] *= normalizationGain;
  const narration = new Float64Array(((FRAMES * SR) / FPS) * 2);
  narration.set(voiceSegment, ((voiceFrom * SR) / FPS) * 2);
  const effects = [
    {
      id: "intro",
      kind: "impact",
      frame: 0,
      durationFrames: 12,
      anchor: "start",
      params: { intensity: 0.3 },
      for: "Opening impact",
    },
    {
      id: "evidence",
      kind: "tick",
      frame: 216,
      durationFrames: 5,
      anchor: "start",
      params: { intensity: 0.18 },
      for: "Evidence tick",
    },
    {
      id: "reveal",
      kind: "chime",
      frame: 576,
      durationFrames: 18,
      anchor: "start",
      params: { intensity: 0.3 },
      for: "Reveal confirmation",
    },
  ];
  const spec = FilmSpecSchema.parse({
    schemaVersion: 1,
    filmId: "v3-calibration",
    render: { width: 1920, height: 1080, fps: FPS },
    timeline: { durationInFrames: FRAMES, narrationStartFrame: voiceFrom },
    narration: [],
    music: {
      ...example.music,
      score: { ...example.music.score, engine: "studio-v3" },
    },
    sound: { effects },
    publish: { title: "Studio v3 calibration" },
  });
  const timing = FilmTimingSchema.parse({
    schemaVersion: 1,
    filmId: spec.filmId,
    inputFingerprint: zeroHash,
    fps: FPS,
    durationInFrames: FRAMES,
    narrationStartFrame: voiceFrom,
    narrationEndFrame: voiceTo,
    sentences,
    narration: {
      publicPath: "public/films/v3-calibration/narration.wav",
      checksum: zeroHash,
      sampleRate: SR,
      sampleFrameCount: voiceFrames,
    },
  });
  const grid = projectFilmMusicGrid({
    timeline: first.timeline,
    startFrame: 0,
    durationInFrames: FRAMES,
  });
  const music = FilmMusicSchema.parse({
    schemaVersion: 1,
    filmId: spec.filmId,
    inputFingerprint: zeroHash,
    publicPath: "public/films/v3-calibration/music.wav",
    checksum: digest(mastered),
    startFrame: 0,
    scoreDurationInFrames: first.timeline.durationInFrames,
    volume: spec.music!.volume,
    underSpeechVolume: spec.music!.underSpeechVolume,
    fadeOutFrames: 0,
    bpm: first.timeline.bpm,
    beatsPerBar: 4,
    ...grid,
    onsets: projectFilmMusicOnsets({
      timeline: first.timeline,
      startFrame: 0,
      durationInFrames: FRAMES,
    }),
    loop: false,
  });
  const sfxAudio = new Map<string, Float64Array>();
  const sfx = FilmSfxSchema.parse({
    schemaVersion: 1,
    filmId: spec.filmId,
    inputFingerprint: zeroHash,
    synthesizerVersion: FILM_SFX_SYNTHESIZER_VERSION,
    effects: spec.sound!.effects.map((effect) => {
      const audio = renderFilmSoundEffectWav(
        resolveFilmSoundEffectPitch(effect, spec),
        FPS,
      );
      const publicPath = `public/films/v3-calibration/sfx/${effect.id}.wav`;
      sfxAudio.set(publicPath, decode(audio));
      const measured = measureFilmSoundEffectWav(audio);
      return {
        id: effect.id,
        kind: effect.kind,
        for: effect.for,
        anchor: effect.anchor,
        inputFingerprint: zeroHash,
        publicPath,
        checksum: digest(audio),
        sampleRate: SR,
        sampleFrameCount: measured.sampleFrameCount,
        durationInFrames: effect.durationFrames,
        durationInSeconds: measured.durationInSeconds,
        ...resolveFilmSoundEffectFrames(effect, FRAMES),
      };
    }),
  });
  const runtime = resolveFilmRuntime({ spec, timing, music, sfx });
  const rawMusic = decode(mastered);
  const bed = new Float64Array(narration.length);
  for (const track of [
    ...resolveFilmSoundtrack(runtime).filter(
      (entry) => entry.contributionId === "music",
    ),
    ...resolveFilmSoundEffects(runtime),
  ]) {
    const source =
      track.contributionId === "music"
        ? rawMusic
        : sfxAudio.get(track.publicPath)!;
    for (
      let sample = 0;
      sample < ((track.endFrame - track.startFrame) * SR) / FPS;
      sample++
    ) {
      const frame = (sample * FPS) / SR;
      const gain =
        resolveSoundVolume(
          frame,
          track.endFrame - track.startFrame,
          track.volume,
          track,
        ) *
        resolveSoundDuckingGain(
          frame,
          track.volume,
          track.speechDucking,
          track.volumeDips,
        );
      const at = ((track.startFrame * SR) / FPS + sample) * 2;
      if (at < bed.length) {
        bed[at] += (source[sample * 2] ?? 0) * gain;
        bed[at + 1] += (source[sample * 2 + 1] ?? 0) * gain;
      }
    }
  }
  const mix = Float64Array.from(bed, (value, i) => value + narration[i]);
  const range = (samples: Float64Array, from: number, to: number) =>
    samples.subarray(((from * SR) / FPS) * 2, ((to * SR) / FPS) * 2);
  const speech = measure(range(bed, voiceFrom, voiceTo));
  const intro = measure(range(bed, 0, voiceFrom));
  const outro = measure(range(bed, voiceTo, FRAMES));
  const voice = measure(voiceSegment);
  const mixed = measure(mix);
  const sample = encode(rawMusic.subarray(0, narration.length));
  const report = {
    recipe,
    recommendedVolumes: {
      volume: spec.music!.volume,
      underSpeechVolume: spec.music!.underSpeechVolume,
    },
    rawMD5: [md5(first.audio), md5(second.audio)],
    masteredMD5: [md5(mastered), md5(master(second.audio, outputDir, true))],
    sampleMD5: md5(sample),
    voice,
    speech: { ...speech, gapLU: voice.lufs - speech.lufs },
    intro: { ...intro, gapLU: voice.lufs - intro.lufs },
    outro: { ...outro, gapLU: voice.lufs - outro.lufs },
    mixed,
    sourceVoice: resolve(voicePath),
    sourceVoiceTiming: resolve(timingPath),
    sentences,
    note: "Stereo narration normalized to -16 LUFS by linear gain. Bed includes v3 music plus three generated SFX at runtime default SFX volume/ducking. Runtime sentence ramps applied once; no offline speech sidechain. Sample is mastered music before playback volume, exactly 30 seconds.",
  };
  await writeFile(join(outputDir, "sample.wav"), sample);
  await writeFile(join(outputDir, "mix.wav"), encode(mix));
  await writeFile(join(outputDir, "bed.wav"), encode(bed));
  await writeFile(
    join(outputDir, "events.json"),
    JSON.stringify(music.onsets, null, 2) + "\n",
  );
  await writeFile(
    join(outputDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  assert.ok(
    report.speech.gapLU >= 12 && report.speech.gapLU <= 15,
    "Speech bed must be 12–15 LU below narration.",
  );
  for (const passage of [report.intro, report.outro])
    assert.ok(
      passage.gapLU >= 6 && passage.gapLU <= 8,
      "Music-only passages must be 6–8 LU below narration.",
    );
  assert.ok(report.mixed.dbtp <= -1, "Final mix must stay below -1 dBTP.");
  return report;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length !== 5)
    throw new Error("Usage: calibrate-v3.ts voice.wav timing.json output-dir");
  calibrateV3(process.argv[2], process.argv[3], process.argv[4]).then(
    (report) => process.stdout.write(JSON.stringify(report, null, 2) + "\n"),
    (error: unknown) => {
      process.stderr.write(String(error) + "\n");
      process.exitCode = 1;
    },
  );
}
