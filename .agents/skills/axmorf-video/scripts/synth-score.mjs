import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const SR = 48_000;
const hash = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const sine = (cycles) => Math.sin(2 * Math.PI * cycles);

export const makeTimeline = (recipe) => {
  const defaults = {
    fps: 30,
    bpm: 100,
    beatsPerBar: 4,
    bars: 8,
    style: "organic",
    seed: 1,
  };
  const settings = { ...defaults, ...recipe };
  for (const key of Object.keys(settings)) {
    if (!Object.hasOwn(defaults, key))
      throw new Error(`Unknown score field: ${key}`);
  }
  for (const [key, min, max] of [
    ["fps", 1, 120],
    ["bpm", 50, 180],
    ["beatsPerBar", 2, 7],
    ["bars", 1, 16],
    ["seed", 1, 0xffffffff],
  ]) {
    if (
      !Number.isFinite(settings[key]) ||
      settings[key] < min ||
      settings[key] > max ||
      (key !== "bpm" && !Number.isInteger(settings[key]))
    )
      throw new Error(`Invalid ${key}`);
  }
  if (!["organic", "electronic"].includes(settings.style))
    throw new Error("Invalid score style");
  const fpb = (60 * settings.fps) / settings.bpm;
  if (fpb < 1)
    throw new Error(
      "The selected fps cannot resolve this tempo; choose a slower BPM",
    );
  const durationInFrames = Math.round(
    settings.bars * settings.beatsPerBar * fpb,
  );
  const beatFrames = Array.from(
    { length: settings.bars * settings.beatsPerBar },
    (_, i) => Math.round(i * fpb),
  );
  const music = [];
  const add = (type, beat, note, gain, beats) =>
    music.push({
      type,
      frame: Math.round(beat * fpb),
      durationInFrames: Math.max(1, Math.round(beats * fpb)),
      note,
      gain,
    });
  // C-G-Am-F; varied register and instrumentation, rather than reused audio samples.
  const roots = [48, 43, 45, 41];
  const chords = [
    [0, 4, 7],
    [0, 4, 7],
    [0, 3, 7],
    [0, 4, 7],
  ];
  for (let bar = 0; bar < settings.bars; bar++) {
    const root = roots[bar % 4];
    const chord = chords[bar % 4];
    for (let beat = 0; beat < settings.beatsPerBar; beat++) {
      const at = bar * settings.beatsPerBar + beat;
      add("kick", at, 36, settings.style === "electronic" ? 0.7 : 0.3, 0.5);
      add("bass", at, root - 12, 0.28, 0.8);
      add("hat", at + 0.5, 60, 0.075, 0.2);
      const degree = (beat + bar + (settings.seed % 3)) % 3;
      add("pluck", at, root + 12 + chord[degree], 0.2, 1.4);
      if (settings.style === "electronic")
        add("pluck", at + 0.5, root + 12 + chord[(degree + 1) % 3], 0.13, 0.7);
    }
    for (const interval of chord)
      add(
        "pad",
        bar * settings.beatsPerBar,
        root + interval,
        0.045,
        settings.beatsPerBar,
      );
  }
  music.sort((a, b) => a.frame - b.frame);
  return {
    schemaVersion: 1,
    ...settings,
    durationInFrames,
    beatFrames,
    music: music.filter((event) => event.frame < durationInFrames),
  };
};

const wav = (data) => {
  const result = Buffer.alloc(44 + data.length);
  result.write("RIFF");
  result.writeUInt32LE(result.length - 8, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(2, 22);
  result.writeUInt32LE(SR, 24);
  result.writeUInt32LE(SR * 4, 28);
  result.writeUInt16LE(4, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(data.length, 40);
  data.copy(result, 44);
  return result;
};

export const synthesizeTimeline = (timeline) => {
  const count = Math.round((timeline.durationInFrames / timeline.fps) * SR);
  const left = new Float32Array(count);
  const right = new Float32Array(count);
  let state = timeline.seed >>> 0;
  const noise = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x80000000 - 1;
  };
  for (const event of timeline.music) {
    const start = Math.round((event.frame / timeline.fps) * SR);
    const duration = event.durationInFrames / timeline.fps;
    const frequency = 440 * 2 ** ((event.note - 69) / 12);
    const pan = event.type === "pluck" ? ((event.note % 3) - 1) * 0.28 : 0;
    for (let i = 0; i < Math.round(duration * SR); i++) {
      const t = i / SR;
      let value;
      if (event.type === "kick")
        value =
          sine(48 * t + 55 * 0.018 * (1 - Math.exp(-t / 0.018))) *
          Math.exp(-t / 0.08);
      else if (event.type === "hat") value = noise() * Math.exp(-t / 0.025);
      else if (event.type === "bass")
        value =
          (sine(frequency * t) + 0.2 * sine(2 * frequency * t)) *
          Math.exp(-t / 0.2);
      else if (event.type === "pad")
        value =
          (sine(frequency * t) + 0.3 * sine(frequency * 1.004 * t)) *
          Math.sin((Math.PI * t) / duration) ** 2;
      else if (timeline.style === "organic")
        value =
          sine(frequency * t) * Math.exp(-t / 0.19) +
          0.3 * sine(frequency * 2.76 * t) * Math.exp(-t / 0.06);
      else
        value =
          (sine(frequency * t) + 0.25 * sine(2 * frequency * t)) *
          Math.exp(-t / 0.11);
      // End each event smoothly, and wrap its tail into the beginning of the loop.
      const envelope = Math.min(1, t / 0.003, (duration - t) / 0.01);
      const sample = value * envelope * event.gain;
      const index = (start + i) % count;
      left[index] += sample * (1 - pan);
      right[index] += sample * (1 + pan);
    }
  }
  const pcm = Buffer.alloc(count * 4);
  let peak = 0;
  for (let i = 0; i < count; i++) {
    left[i] = Math.tanh(left[i]);
    right[i] = Math.tanh(right[i]);
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  for (let i = 0; i < count; i++) {
    pcm.writeInt16LE(
      Math.round((left[i] / Math.max(peak, 1e-9)) * 26000),
      4 * i,
    );
    pcm.writeInt16LE(
      Math.round((right[i] / Math.max(peak, 1e-9)) * 26000),
      4 * i + 2,
    );
  }
  return wav(pcm);
};

const master = (raw, directory) => {
  const source = join(directory, "raw.wav");
  const output = join(directory, "master.wav");
  writeFileSync(source, raw);
  const run = (args) => {
    const result = spawnSync("ffmpeg", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`FFmpeg mastering failed: ${result.stderr}`);
    return result;
  };
  const first = run([
    "-hide_banner",
    "-i",
    source,
    "-af",
    "loudnorm=I=-14:TP=-2.7:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const json = first.stderr.match(/\{[\s\S]*\}/u);
  if (!json) throw new Error("FFmpeg did not report loudness measurements");
  const measured = JSON.parse(json[0]);
  for (const key of [
    "input_i",
    "input_tp",
    "input_lra",
    "input_thresh",
    "target_offset",
  ]) {
    if (!Number.isFinite(Number(measured[key])))
      throw new Error(`Invalid loudness measurement: ${key}`);
  }
  const filter = `loudnorm=I=-14:TP=-2.7:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  run([
    "-hide_banner",
    "-i",
    source,
    "-af",
    filter,
    "-ar",
    String(SR),
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    "-map_metadata",
    "-1",
    output,
  ]);
  // FFmpeg may write LIST chunks. Freeze a canonical header while preserving PCM.
  const bytes = readFileSync(output);
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = bytes.readUInt32LE(at + 4);
    if (at + 8 + size > bytes.length)
      throw new Error("Mastered WAV is truncated");
    if (bytes.toString("ascii", at, at + 4) === "data") {
      if (size !== raw.length - 44)
        throw new Error("Mastering changed the loop sample count");
      return wav(bytes.subarray(at + 8, at + 8 + size));
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("Mastered WAV has no PCM data");
};

export const generateScore = (recipe) => {
  const timeline = makeTimeline(recipe);
  const audio = synthesizeTimeline(timeline);
  return { timeline: { ...timeline, audioChecksum: hash(audio) }, audio };
};

const ensureOutputDirectory = (root, id) => {
  let path = root;
  for (const segment of ["public", "assets", "generated-score", id]) {
    path = join(path, segment);
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error("Unsafe score output directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      mkdirSync(path);
    }
  }
  return path;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (
    process.argv.length !== 6 ||
    process.argv[2] !== "--input" ||
    process.argv[4] !== "--id" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(process.argv[5])
  ) {
    throw new Error(
      "Usage: node synth-score.mjs --input inputs/score.json --id <score-id>",
    );
  }
  const result = generateScore(
    JSON.parse(readFileSync(process.argv[3], "utf8")),
  );
  const temporary = mkdtempSync(join(tmpdir(), "axmorf-score-"));
  try {
    result.audio = master(result.audio, temporary);
    result.timeline.audioChecksum = hash(result.audio);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const output = ensureOutputDirectory(process.cwd(), process.argv[5]);
  for (const [name, bytes] of [
    ["music.wav", result.audio],
    ["timeline.json", `${JSON.stringify(result.timeline, null, 2)}\n`],
  ]) {
    const path = join(output, name);
    try {
      writeFileSync(path, bytes, { flag: "wx" });
    } catch (error) {
      if (
        error.code !== "EEXIST" ||
        lstatSync(path).isSymbolicLink() ||
        !readFileSync(path).equals(Buffer.from(bytes))
      )
        throw error;
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      status: "score-synthesized",
      backgroundMusic: {
        mode: "synthesized",
        sourcePath: `public/assets/generated-score/${process.argv[5]}/music.wav`,
        timelinePath: `public/assets/generated-score/${process.argv[5]}/timeline.json`,
        volume: 0.12,
      },
      bpm: result.timeline.bpm,
      durationInFrames: result.timeline.durationInFrames,
      audioChecksum: result.timeline.audioChecksum,
    })}\n`,
  );
}
