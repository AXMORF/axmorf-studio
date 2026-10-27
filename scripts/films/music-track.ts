import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FilmMusicTrack } from "@axmorf/studio/contracts";

import { runHostProcess } from "../narration/adapters/ffmpeg-normalizer";
import { resolveMediaToolCommand } from "../shared/media-tool-command";

/** Same PCM layout the score engine writes, so mastering treats both alike. */
export const TRACK_SAMPLE_RATE = 48_000;

export type TrackDecoder = (input: {
  readonly rootDir: string;
  readonly sourcePath: string;
  readonly trimStartSeconds: number;
}) => Promise<Buffer>;

/** Decodes a registered audio file to 48 kHz stereo 16-bit WAV with Remotion's FFmpeg. */
export const decodeTrackWithFfmpeg: TrackDecoder = async ({
  rootDir,
  sourcePath,
  trimStartSeconds,
}) => {
  const scratch = await mkdtemp(join(tmpdir(), "axmorf-film-track-"));
  try {
    const output = join(scratch, "track.wav");
    const { command, args } = await resolveMediaToolCommand({
      rootDir,
      tool: "ffmpeg",
      args: [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        trimStartSeconds.toFixed(3),
        "-i",
        sourcePath,
        "-vn",
        "-ac",
        "2",
        "-ar",
        String(TRACK_SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        "-map_metadata",
        "-1",
        "-y",
        output,
      ],
    });
    const result = await runHostProcess(command, args);
    if (result.exitCode !== 0) {
      throw new Error(
        `FFmpeg could not decode the music track: ${result.stderr.toString("utf8").trim()}`,
      );
    }
    return await readFile(output);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/** Finds the PCM data chunk of a 16-bit WAV and mixes it to mono floats. */
export const readWavMono = (
  wav: Buffer,
): { readonly sampleRate: number; readonly samples: Float32Array } => {
  if (
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Music track is not a WAV file.");
  }
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === "fmt ") {
      channels = wav.readUInt16LE(at + 10);
      sampleRate = wav.readUInt32LE(at + 12);
      bits = wav.readUInt16LE(at + 22);
    } else if (id === "data") {
      if (bits !== 16 || channels < 1)
        throw new Error("Music track must decode to 16-bit PCM.");
      const frames = Math.floor(
        Math.min(size, wav.length - at - 8) / (2 * channels),
      );
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++)
          sum += wav.readInt16LE(at + 8 + 2 * (i * channels + c));
        samples[i] = sum / channels / 32768;
      }
      return { sampleRate, samples };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("Music track WAV has no PCM data.");
};

/**
 * Rewrites a decoded WAV as a canonical 44-byte-header file. FFmpeg may add
 * LIST chunks, and mastering checks sample counts against that layout.
 */
export const canonicalizeWav = (wav: Buffer): Buffer => {
  let format: Buffer | null = null;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === "fmt ") format = wav.subarray(at + 8, at + 8 + 16);
    if (id === "data") {
      if (format === null)
        throw new Error("Music track WAV has no format chunk.");
      const data = wav.subarray(
        at + 8,
        at + 8 + Math.min(size, wav.length - at - 8),
      );
      const header = Buffer.alloc(44);
      header.write("RIFF", 0, "ascii");
      header.writeUInt32LE(36 + data.length, 4);
      header.write("WAVEfmt ", 8, "ascii");
      header.writeUInt32LE(16, 16);
      format.copy(header, 20);
      header.write("data", 36, "ascii");
      header.writeUInt32LE(data.length, 40);
      return Buffer.concat([header, data]);
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("Music track WAV has no PCM data.");
};

export type TrackTempoEstimate = {
  readonly bpm: number;
  readonly firstDownbeatSeconds: number;
  /** 0–1: how strongly the onsets repeat at this tempo. Below ~0.25, check by ear. */
  readonly confidence: number;
};

/**
 * Suggests a tempo and first downbeat from onset strength. A suggestion only:
 * the author writes the values into film.json, so the grid never changes on rerun.
 */
export const estimateTrackTempo = (
  samples: Float32Array,
  sampleRate: number,
  beatsPerBar = 4,
): TrackTempoEstimate => {
  const hop = Math.max(1, Math.round(sampleRate / 100));
  const envelope: number[] = [];
  let previous = 0;
  let last = 0;
  for (let start = 0; start + hop <= samples.length; start += hop) {
    let energy = 0;
    for (let i = start; i < start + hop; i++) {
      // A first difference favours transients (drums) over sustained tones.
      const d = samples[i]! - last;
      last = samples[i]!;
      energy += d * d;
    }
    const level = Math.log1p(energy * 1000);
    envelope.push(Math.max(0, level - previous));
    previous = level;
  }
  const rate = sampleRate / hop;
  const n = envelope.length;
  if (n < rate * 4)
    throw new Error("Music track is too short to estimate a tempo (need 4 s).");
  const mean = envelope.reduce((sum, value) => sum + value, 0) / n;
  const centered = envelope.map((value) => value - mean);
  const variance =
    centered.reduce((sum, value) => sum + value * value, 0) / n || 1;
  const correlation = (lag: number) => {
    const whole = Math.floor(lag);
    const fraction = lag - whole;
    let sum = 0;
    let count = 0;
    for (let i = 0; i + whole + 1 < n; i++) {
      sum +=
        centered[i]! *
        ((1 - fraction) * centered[i + whole]! +
          fraction * centered[i + whole + 1]!);
      count++;
    }
    return count ? sum / count / variance : 0;
  };
  let best = { bpm: 120, score: -Infinity };
  for (let tenths = 600; tenths <= 2000; tenths += 5) {
    const bpm = tenths / 10;
    const lag = (rate * 60) / bpm;
    // Reward the beat, the bar and the half-bar, so octave errors are rarer.
    const score =
      correlation(lag) +
      0.5 * correlation(lag * 2) +
      0.25 * correlation(lag * beatsPerBar);
    if (score > best.score) best = { bpm, score };
  }
  // The scoring leans slow; when the onsets also repeat at double speed, prefer
  // it: a doubled grid still lands on every real beat, a halved one misses half.
  const baseLag = (rate * 60) / best.bpm;
  if (
    best.bpm < 100 &&
    best.bpm * 2 <= 200 &&
    correlation(baseLag / 2) >= 0.5 * correlation(baseLag)
  ) {
    best = { bpm: best.bpm * 2, score: best.score };
  }
  const period = (rate * 60) / best.bpm;
  const strength = (offset: number, step: number) => {
    let sum = 0;
    for (let t = offset; t < n; t += step) sum += envelope[Math.round(t)] ?? 0;
    return sum;
  };
  let beatPhase = 0;
  let beatScore = -Infinity;
  for (let i = 0; i < 48; i++) {
    const offset = (period * i) / 48;
    const score = strength(offset, period);
    if (score > beatScore) {
      beatScore = score;
      beatPhase = offset;
    }
  }
  // The downbeat is the strongest of the bar's beats.
  let downbeat = beatPhase;
  let downScore = -Infinity;
  for (let b = 0; b < beatsPerBar; b++) {
    const offset = beatPhase + b * period;
    const score = strength(offset, period * beatsPerBar);
    if (score > downScore) {
      downScore = score;
      downbeat = offset;
    }
  }
  return {
    bpm: best.bpm,
    firstDownbeatSeconds: Number((downbeat / rate).toFixed(3)),
    confidence: Number(
      Math.max(0, Math.min(1, correlation(period))).toFixed(3),
    ),
  };
};

/**
 * Projects an authored track grid onto absolute film frames. Beats before the
 * first downbeat count as a pickup; the grid repeats if the track loops.
 */
export const buildTrackGrid = ({
  track,
  trackDurationInFrames,
  fps,
  startFrame,
  durationInFrames,
}: {
  readonly track: FilmMusicTrack & {
    readonly bpm: number;
    readonly firstDownbeatSeconds: number;
  };
  readonly trackDurationInFrames: number;
  readonly fps: number;
  readonly startFrame: number;
  readonly durationInFrames: number;
}) => {
  const framesPerBeat = (60 * fps) / track.bpm;
  const first = track.firstDownbeatSeconds * fps;
  const pickup = Math.floor(first / framesPerBeat + 1e-9);
  const beats: { frame: number; index: number }[] = [];
  for (let k = -pickup; ; k++) {
    const frame = Math.round(first + k * framesPerBeat);
    if (frame >= trackDurationInFrames) break;
    if (frame >= 0) beats.push({ frame, index: k });
  }
  const sectionBars = track.sectionBars ?? [];
  const sections = sectionBars
    .map((bar) => Math.round(first + bar * track.beatsPerBar * framesPerBeat))
    .filter((frame) => frame < trackDurationInFrames);
  const passes = Math.max(
    1,
    Math.ceil((durationInFrames - startFrame) / trackDurationInFrames),
  );
  const project = (frames: readonly number[]) => {
    const result: number[] = [];
    for (let pass = 0; pass < passes; pass++) {
      for (const frame of frames) {
        const absolute = startFrame + pass * trackDurationInFrames + frame;
        if (absolute < durationInFrames) result.push(absolute);
      }
    }
    return result;
  };
  const sectionFrames = project(sections);
  return {
    beatFrames: project(beats.map(({ frame }) => frame)),
    barFrames: project(
      beats
        .filter(({ index }) => index >= 0 && index % track.beatsPerBar === 0)
        .map(({ frame }) => frame),
    ),
    sectionFrames,
    // Section starts after the opening are the arrivals worth landing a reveal on.
    accentFrames: sectionFrames.filter((frame) => frame > startFrame),
  };
};
