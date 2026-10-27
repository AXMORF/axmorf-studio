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

import {
  STUDIO_INSTRUMENTS,
  arrangeStudioScore,
  synthesizeStudioTimeline,
} from "./studio-score.mjs";

const SR = 48_000;
const hash = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const sine = (cycles) => Math.sin(2 * Math.PI * cycles);

const instruments = ["kick", "hat", "bass", "pluck", "pad"];
const pitchClasses = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const checkFields = (value, allowed, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid ${label}: expected an object`);
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key))
      throw new Error(`Unknown ${label} field: ${key}`);
  }
};

const parseArrangement = (value, bars, allowedInstruments = instruments) => {
  checkFields(
    value,
    ["tonic", "mode", "progression", "swing", "sections"],
    "arrangement",
  );
  if (
    typeof value.tonic !== "string" ||
    !Object.hasOwn(pitchClasses, value.tonic)
  )
    throw new Error("Invalid arrangement tonic: use a note such as D or Bb");
  if (!["major", "minor"].includes(value.mode))
    throw new Error("Invalid arrangement mode: use major or minor");
  if (
    !Array.isArray(value.progression) ||
    value.progression.length < 1 ||
    value.progression.length > 16 ||
    value.progression.some(
      (degree) => !Number.isInteger(degree) || degree < 1 || degree > 7,
    )
  )
    throw new Error("Invalid arrangement progression: use scale degrees 1–7");
  const swing = value.swing === undefined ? 0 : value.swing;
  if (!Number.isFinite(swing) || swing < 0 || swing > 0.4)
    throw new Error("Invalid arrangement swing: use 0–0.4 beats of delay");
  if (
    !Array.isArray(value.sections) ||
    value.sections.length < 1 ||
    value.sections.length > bars
  )
    throw new Error("Invalid arrangement sections");
  let sectionBars = 0;
  let audible = false;
  for (const section of value.sections) {
    checkFields(
      section,
      ["bars", "instruments", "density", "energy"],
      "arrangement section",
    );
    if (!Number.isInteger(section.bars) || section.bars < 1)
      throw new Error("Invalid arrangement section bars");
    if (
      !Array.isArray(section.instruments) ||
      section.instruments.some((type) => !allowedInstruments.includes(type)) ||
      new Set(section.instruments).size !== section.instruments.length
    )
      throw new Error("Invalid arrangement section instruments");
    if (
      !Number.isFinite(section.density) ||
      section.density < 0 ||
      section.density > 1
    )
      throw new Error("Invalid arrangement section density: use 0–1");
    if (
      !Number.isFinite(section.energy) ||
      section.energy <= 0 ||
      section.energy > 1
    )
      throw new Error("Invalid arrangement section energy: use >0–1");
    sectionBars += section.bars;
    audible ||= section.instruments.length > 0;
  }
  if (sectionBars !== bars)
    throw new Error("Invalid arrangement: section bars must sum to score bars");
  if (!audible)
    throw new Error("Invalid arrangement: score cannot be all rests");
  return { ...value, swing };
};

const addAuthoredArrangement = (settings, arrangement, fpb, add) => {
  const scale =
    arrangement.mode === "major"
      ? [0, 2, 4, 5, 7, 9, 11]
      : [0, 2, 3, 5, 7, 8, 10];
  const tonic = 48 + pitchClasses[arrangement.tonic];
  const scaleNote = (degree) =>
    tonic + scale[degree % 7] + 12 * Math.floor(degree / 7);
  // One seeded two-bar phrase provides repeatable syncopation, not timing jitter.
  const variation = (bar, step, voice) => {
    let state =
      settings.seed ^
      Math.imul((bar % 2) + 1, 0x9e3779b1) ^
      Math.imul(step + 1, 0x85ebca6b) ^
      Math.imul(voice, 0xc2b2ae35);
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  let firstBar = 0;
  for (const section of arrangement.sections) {
    const voices = new Set(section.instruments);
    const endBar = firstBar + section.bars;
    const endFrame = Math.round(endBar * settings.beatsPerBar * fpb);
    const play = (type, at, note, gain, beats) => {
      if (!voices.has(type) || Math.round(at * fpb) >= endFrame) return;
      add(type, at, note, gain * section.energy, beats, endFrame);
    };
    for (let bar = firstBar; bar < endBar; bar++) {
      const degree =
        arrangement.progression[bar % arrangement.progression.length] - 1;
      const chord = [
        scaleNote(degree),
        scaleNote(degree + 2),
        scaleNote(degree + 4),
      ];
      const start = bar * settings.beatsPerBar;
      for (const note of chord)
        play("pad", start, note, 0.055, settings.beatsPerBar);
      for (let step = 0; step < settings.beatsPerBar * 2; step++) {
        const offbeat = step % 2 === 1;
        const at = start + step / 2 + (offbeat ? arrangement.swing : 0);
        const anchor = step === 0;
        const middle = step === Math.floor(settings.beatsPerBar / 2) * 2;
        const strong = anchor || middle;
        if (
          !offbeat &&
          (anchor ||
            variation(bar, step, 1) < section.density * (middle ? 1 : 0.55))
        )
          play(
            "kick",
            at,
            36,
            (settings.style === "electronic" ? 0.6 : 0.3) * (strong ? 1 : 0.7),
            0.5,
          );
        if (
          !offbeat &&
          (anchor ||
            variation(bar, step, 2) < section.density * (middle ? 1 : 0.6))
        )
          play(
            "bass",
            at,
            (middle && section.density > 0.6 ? chord[2] : chord[0]) - 12,
            0.25,
            strong ? 1.3 : 0.6,
          );
        if (
          anchor ||
          variation(bar, step, 3) < section.density * (offbeat ? 1 : 0.45)
        )
          play("hat", at, 60, offbeat ? 0.055 : 0.035, 0.2);
        if (
          anchor ||
          variation(bar, step, 4) < section.density * (offbeat ? 0.85 : 1)
        ) {
          const noteIndex =
            (Math.floor(step / 2) + (bar % 2) + (settings.seed % 3)) % 3;
          play(
            "pluck",
            at,
            chord[noteIndex] + 12,
            strong ? 0.2 : 0.14,
            section.density > 0.7 ? 0.8 : 1.8,
          );
        }
      }
    }
    firstBar = endBar;
  }
};

export const makeTimeline = (recipe) => {
  const defaults = {
    fps: 30,
    bpm: 100,
    beatsPerBar: 4,
    bars: 8,
    style: "organic",
    seed: 1,
  };
  checkFields(
    recipe,
    [...Object.keys(defaults), "arrangement", "engine"],
    "score",
  );
  const { arrangement: rawArrangement, engine, ...overrides } = recipe;
  if (engine !== undefined && engine !== "studio-v2")
    throw new Error('Invalid score engine: use "studio-v2"');
  const studio = engine === "studio-v2";
  if (studio && rawArrangement === undefined)
    throw new Error("The studio-v2 engine requires an authored arrangement");
  const settings = { ...defaults, ...overrides };
  for (const [key, min, max] of [
    ["fps", 1, 120],
    ["bpm", 50, 180],
    ["beatsPerBar", 2, 7],
    // studio-v2 scores can cover a whole film instead of looping a short phrase.
    ["bars", 1, studio ? 64 : 16],
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
  if (!["organic", "electronic", "drive"].includes(settings.style))
    throw new Error("Invalid score style");
  if (settings.style === "drive" && !studio)
    throw new Error('The drive style requires engine "studio-v2"');
  const arrangement =
    rawArrangement === undefined
      ? null
      : parseArrangement(
          rawArrangement,
          settings.bars,
          studio ? STUDIO_INSTRUMENTS : instruments,
        );
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
  const add = (type, beat, note, gain, beats, endFrame = Infinity) =>
    music.push({
      type,
      frame: Math.round(beat * fpb),
      // studio-v2 keeps the exact onset so drums do not drift by up to half a frame.
      ...(studio ? { beat: Number(beat.toFixed(6)) } : {}),
      durationInFrames: Math.min(
        Math.max(1, Math.round(beats * fpb)),
        endFrame - Math.round(beat * fpb),
      ),
      note,
      gain,
    });
  const marks = { sections: [], accents: [] };
  if (studio) {
    arrangeStudioScore(
      settings,
      { ...arrangement, tonicPitchClass: pitchClasses[arrangement.tonic] },
      fpb,
      add,
      marks,
    );
  } else if (arrangement) {
    addAuthoredArrangement(settings, arrangement, fpb, add);
  } else {
    // Preserve existing recipes; new scores can explicitly author harmony and sections.
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
          add(
            "pluck",
            at + 0.5,
            root + 12 + chord[(degree + 1) % 3],
            0.13,
            0.7,
          );
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
  }
  music.sort((a, b) => a.frame - b.frame);
  return {
    schemaVersion: 1,
    ...settings,
    ...(studio ? { engine } : {}),
    durationInFrames,
    beatFrames,
    ...(studio
      ? {
          sections: marks.sections,
          accentFrames: [...new Set(marks.accents)].sort((a, b) => a - b),
        }
      : {}),
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

/** Writes the same normalized 16-bit stereo PCM used by the original engine. */
const studioWav = (timeline) => {
  const { left, right, peak } = synthesizeStudioTimeline(timeline);
  const pcm = Buffer.alloc(left.length * 4);
  const scale = 26000 / Math.max(peak, 1e-9);
  for (let i = 0; i < left.length; i++) {
    pcm.writeInt16LE(Math.round(left[i] * scale), 4 * i);
    pcm.writeInt16LE(Math.round(right[i] * scale), 4 * i + 2);
  }
  return wav(pcm);
};

export const synthesizeTimeline = (timeline) => {
  if (timeline.engine === "studio-v2") return studioWav(timeline);
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

export const master = (raw, directory) => {
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
        ...(result.timeline.engine === "studio-v2"
          ? { volume: 0.24, underSpeechVolume: 0.09 }
          : { volume: 0.12 }),
      },
      bpm: result.timeline.bpm,
      durationInFrames: result.timeline.durationInFrames,
      ...(result.timeline.engine === "studio-v2"
        ? {
            sections: result.timeline.sections,
            accentFrames: result.timeline.accentFrames,
          }
        : {}),
      audioChecksum: result.timeline.audioChecksum,
    })}\n`,
  );
}
