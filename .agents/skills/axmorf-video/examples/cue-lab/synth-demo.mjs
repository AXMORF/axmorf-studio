import {createHash} from "node:crypto";
import {Buffer} from "node:buffer";
import {mkdir, readFile, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {URL} from "node:url";
import {parseArgs} from "node:util";
import {clamp, schedule} from "./timing.mjs";

const {values} = parseArgs({options: {output: {type: "string"}}, strict: true});
if (!values.output) throw new Error("Usage: node synth-demo.mjs --output <new-output-directory>");
const rawSheet = await readFile(new URL("./cue-sheet.json", import.meta.url));
const sheet = JSON.parse(rawSheet.toString("utf8"));
const events = schedule(sheet);
const sr = sheet.sampleRate;
const samples = Math.round(sheet.durationInFrames / sheet.fps * sr);
const beatSeconds = 60 / sheet.bpm;
const endSeconds = samples / sr;
const lastCueSeconds = events.at(-1).contactFrame / sheet.fps;
const music = [new Float32Array(samples), new Float32Array(samples)];
const effects = [new Float32Array(samples), new Float32Array(samples)];
const output = path.resolve(values.output);
const names = ["music.wav", "sfx.wav", "lesson.wav", "audio-events.json"];

// Refuse to overwrite even tutorial outputs; use a fresh directory for revisions.
await mkdir(output, {recursive: true});
for (const name of names) {
  try {
    await stat(path.join(output, name));
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  throw new Error(`Output already exists: ${path.join(output, name)}`);
}

const noise = (index, salt) => {
  const value = Math.sin((index + sheet.seed * 103 + salt * 31) * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
};

const place = (bus, startSample, duration, gain, pan, wave) => {
  const count = Math.round(duration * sr);
  const left = Math.cos((pan + 1) * Math.PI / 4);
  const right = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < count && startSample + i < samples; i++) {
    const value = wave(i / sr, i) * gain;
    bus[0][startSample + i] += value * left;
    bus[1][startSample + i] += value * right;
  }
};

const pluck = (hz, decay) => (t) => {
  const phase = 2 * Math.PI * hz * t;
  return (Math.sin(phase) + 0.28 * Math.sin(2 * phase) + 0.09 * Math.sin(3 * phase)) * Math.exp(-t / decay) * clamp(t / 0.004);
};

const roots = [130.8128, 97.9989, 110, 87.3071];
const melody = [261.6256, 329.6276, 391.9954, 329.6276, 440, 391.9954, 329.6276, 293.6648];
for (let beat = 0; beat * beatSeconds < lastCueSeconds; beat++) {
  const at = Math.round(beat * beatSeconds * sr);
  const root = roots[Math.floor(beat / 4) % roots.length];
  place(music, at, 0.7, beat < 2 ? 0.17 : 0.2, beat % 2 ? 0.25 : -0.25, pluck(melody[beat % melody.length], 0.17));
  if (beat >= 2 && beat % 2 === 0) {
    place(music, at, 0.65, 0.17, 0, pluck(root / 2, 0.25));
    place(music, at, 0.22, 0.12, 0, (t) => Math.sin(2 * Math.PI * (45 * t + 2.7 * (1 - Math.exp(-t / 0.03)))) * Math.exp(-t * 24) * clamp(t / 0.002));
  }
  if (beat >= 4) {
    const half = Math.round((beat + 0.5) * beatSeconds * sr);
    place(music, half, 0.055, 0.024, 0.45, (t, i) => noise(i, beat) * Math.sin(Math.PI * clamp(t / 0.055)) ** 2);
  }
  if (beat >= 7) {
    place(music, Math.round((beat + 0.5) * beatSeconds * sr), 0.35, 0.08, -0.35, pluck(melody[(beat + 3) % melody.length] * 2, 0.12));
  }
}
// A quieter cadence supports the last readable result rather than another loop.
for (const hz of [261.6256, 329.6276, 391.9954]) {
  place(music, events.at(-1).targetSample, 1.6, 0.06, 0, pluck(hz, 0.45));
}

const soundDuration = {paper: 0.09, pencil: 13 / sheet.fps, swell: 0.2, ding: 0.55};
for (const event of events) {
  const duration = soundDuration[event.sound];
  let gain;
  let wave;
  if (event.sound === "paper") {
    gain = 0.26;
    wave = (t, i) => (noise(i, 7) * 0.65 + Math.sin(2 * Math.PI * 165 * t) * 0.35) * Math.exp(-t * 62);
  } else if (event.sound === "pencil") {
    gain = 0.075;
    wave = (t, i) => noise(i, 13) * Math.sin(Math.PI * clamp(t / duration)) ** 2 * (0.65 + 0.35 * Math.sin(t * 89));
  } else if (event.sound === "swell") {
    gain = 0.17;
    // Envelope center is exactly sourceOffsetSeconds; it is not a sample-peak claim.
    wave = (t, i) => noise(i, 19) * Math.sin(Math.PI * clamp(t / duration)) ** 2;
  } else if (event.sound === "ding") {
    gain = 0.14;
    wave = (t) => (Math.sin(2 * Math.PI * 1046.502 * t) + 0.28 * Math.sin(2 * Math.PI * 1567.982 * t)) * Math.exp(-t * 10) * clamp(t / 0.002);
  } else throw new Error(`Unknown sound ${event.sound}`);
  place(effects, event.soundStartSample, duration, gain, 0, wave);
}

const mixed = [new Float32Array(samples), new Float32Array(samples)];
let peak = 0;
for (let channel = 0; channel < 2; channel++) {
  for (let i = 0; i < samples; i++) {
    const fade = clamp((endSeconds - i / sr) / 0.22);
    music[channel][i] *= fade;
    effects[channel][i] *= fade;
    mixed[channel][i] = music[channel][i] + effects[channel][i];
    peak = Math.max(peak, Math.abs(mixed[channel][i]));
  }
}
const gain = peak > 0 ? 0.7 / peak : 1;
for (const bus of [music, effects, mixed]) {
  for (const channel of bus) for (let i = 0; i < samples; i++) channel[i] *= gain;
}

const wav = (bus) => {
  const buffer = Buffer.alloc(44 + samples * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sr, 24);
  buffer.writeUInt32LE(sr * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) {
    for (let channel = 0; channel < 2; channel++) buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus[channel][i])) * 32767), 44 + i * 4 + channel * 2);
  }
  return buffer;
};

const hashes = {};
for (const [name, bus] of [["music.wav", music], ["sfx.wav", effects], ["lesson.wav", mixed]]) {
  const bytes = wav(bus);
  await writeFile(path.join(output, name), bytes, {flag: "wx"});
  hashes[name] = createHash("sha256").update(bytes).digest("hex");
}
const receipt = {
  kind: "standalone-cue-lab-audio-v1",
  cueSheetSha256: createHash("sha256").update(rawSheet).digest("hex"),
  fps: sheet.fps, bpm: sheet.bpm, sampleRate: sr, samplesPerChannel: samples,
  samplePeakDbfs: 20 * Math.log10(peak * gain),
  events, hashes,
  note: "Independent tutorial mix; neither a production music timeline nor listening/true-peak verification."
};
await writeFile(path.join(output, "audio-events.json"), `${JSON.stringify(receipt, null, 2)}\n`, {flag: "wx"});
process.stdout.write(`${JSON.stringify({output, ...receipt}, null, 2)}\n`);
