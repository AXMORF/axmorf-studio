import type { FilmSoundEffectSpec } from "@axmorf/studio/contracts";

import { createNoise, sine } from "./primitives";

export const FILM_SFX_SAMPLE_RATE = 48_000;

/** Fixed PCM layout keeps measurement, hashing and caching independent of codecs. */
export const measureFilmSoundEffectWav = (wav: Buffer) => {
  if (
    wav.length < 48 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 16) !== "WAVEfmt " ||
    wav.readUInt32LE(4) !== wav.length - 8 ||
    wav.readUInt32LE(16) !== 16 ||
    wav.readUInt16LE(20) !== 1 ||
    wav.readUInt16LE(22) !== 2 ||
    wav.readUInt32LE(24) !== FILM_SFX_SAMPLE_RATE ||
    wav.readUInt32LE(28) !== FILM_SFX_SAMPLE_RATE * 4 ||
    wav.readUInt16LE(32) !== 4 ||
    wav.readUInt16LE(34) !== 16 ||
    wav.toString("ascii", 36, 40) !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44 ||
    (wav.length - 44) % 4 !== 0
  )
    throw new Error(
      "Sound effects must be complete 48 kHz stereo 16-bit PCM WAV files.",
    );
  const sampleFrameCount = (wav.length - 44) / 4;
  let peak = 0;
  for (let offset = 44; offset < wav.length; offset += 2)
    peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)) / 32768);
  return {
    sampleRate: FILM_SFX_SAMPLE_RATE,
    sampleFrameCount,
    durationInSeconds: sampleFrameCount / FILM_SFX_SAMPLE_RATE,
    peak,
  };
};

/**
 * Offline original foley. Every envelope is expressed in action-relative time;
 * pitch remains musical (semitones), while tail stays inside the action span.
 * No resampling of a pre-made clip, external recordings, or random global state.
 */
export const renderFilmSoundEffectWav = (
  effect: FilmSoundEffectSpec,
  fps: number,
): Buffer => {
  const sampleFrameCount = Math.floor(
    (effect.durationFrames * FILM_SFX_SAMPLE_RATE) / fps,
  );
  if (!Number.isInteger(fps) || fps <= 0 || sampleFrameCount < 2)
    throw new Error("Invalid sound effect duration or fps.");
  const params = effect.params ?? {};
  const pitch = 2 ** ((params.pitch ?? 0) / 12);
  const brightness = params.brightness ?? 0.5;
  const intensity = params.intensity ?? 0.7;
  const tail = params.tail ?? 0.5;
  const stereo = params.stereo ?? 0.35;
  const noise = createNoise(params.seed);
  const samples = new Float64Array(sampleFrameCount * 2);
  let low = 0;
  let band = 0;
  let maximum = 0;
  for (let i = 0; i < sampleFrameCount; i += 1) {
    const t = i / FILM_SFX_SAMPLE_RATE;
    const u = i / (sampleFrameCount - 1);
    const white = noise();
    low += Math.min(0.8, 0.014 * pitch * (0.5 + brightness)) * (white - low);
    band += Math.min(0.95, 0.14 * pitch * (0.4 + brightness)) * (white - band);
    const hiss = band - low + brightness * 0.2 * white;
    const decay = Math.exp(-u / (0.07 + tail * 0.45));
    const harmonic = (hz: number) =>
      sine(hz * pitch * t) + brightness * 0.18 * sine(hz * 2.01 * pitch * t);
    const shimmer =
      harmonic(1567.982) + 0.55 * harmonic(2349.318) + 0.3 * harmonic(3135.964);
    let sample: number;
    switch (effect.kind) {
      case "riser":
        sample =
          u ** (3 - tail * 1.8) *
          (0.75 * hiss + 0.2 * sine(pitch * (160 * t + 1400 * t * u)));
        break;
      case "impact":
        sample =
          decay *
          (sine(pitch * (42 * t + 90 * 0.04 * (1 - Math.exp(-t / 0.04)))) +
            0.35 * hiss);
        break;
      case "whoosh":
        sample =
          Math.sin(Math.PI * u) ** (2.8 - tail * 1.8) *
          (hiss + 0.13 * sine(pitch * (280 * t + 1200 * t * u)));
        break;
      case "tick":
        sample = decay ** 2 * (harmonic(2100) + 0.4 * hiss);
        break;
      case "glitch":
        sample =
          decay *
          (0.6 * Math.sign(sine(pitch * 1700 * t)) + 0.4 * hiss) *
          (Math.floor(u * 19) % 3 === 0 ? 0.12 : 1);
        break;
      case "shimmer":
        sample = decay * Math.min(1, u * 24) * (shimmer + 0.08 * hiss);
        break;
      case "swell":
        sample =
          u ** (3.4 - tail * 2) *
          (harmonic(140) + 0.28 * harmonic(281) + 0.35 * low + 0.08 * hiss);
        break;
      case "thud":
        sample =
          decay *
          (harmonic(48) + 0.48 * low + 0.12 * hiss) *
          Math.exp(-u * 1.3);
        break;
      case "paper":
        sample =
          decay *
          (0.25 + 0.75 * Math.abs(sine(u * (5.5 + tail * 4)))) *
          (hiss + 0.1 * harmonic(420));
        break;
      case "stamp":
        // A short padded press: tuned low body plus dull paper contact. The
        // noise is not retuned independently; pitch moves the tonal body/filter.
        sample =
          decay ** 1.8 *
          (0.84 * harmonic(64) + 0.42 * low + 0.3 * hiss * Math.exp(-t * 90));
        break;
      case "tape": {
        // Filtered pull with deterministic little adhesive releases. Duration
        // follows the tear, while tail controls the pull/peel envelope.
        const crackle = Math.abs(white) > 0.78 ? white : 0;
        const peel =
          0.18 +
          0.82 *
            Math.abs(sine(pitch * (55 + brightness * 95) * t)) ** (1 + tail);
        sample =
          Math.sin(Math.PI * u) ** (1.6 - tail) *
          peel *
          (hiss + 0.32 * crackle);
        break;
      }
      case "pen": {
        // Band-pass friction, modulated into strokes over the authored action;
        // no pitched oscillator, so automatic musical tuning is unnecessary.
        const stroke = 0.16 + 0.84 * Math.max(0, sine(u * (3 + tail * 3))) ** 2;
        sample =
          Math.sin(Math.PI * u) ** (1.3 - tail * 0.7) *
          stroke *
          (band - low) *
          (0.7 + 0.3 * Math.abs(sine(pitch * 43 * t)));
        break;
      }
      case "clank":
        sample =
          decay *
          (harmonic(330) +
            0.65 * harmonic(867.9) +
            0.35 * harmonic(1432) +
            0.15 * hiss);
        break;
      case "chime":
        sample =
          decay *
          (harmonic(783.991) + 0.72 * harmonic(1174.659) + 0.025 * hiss);
        break;
      case "click":
        sample =
          decay ** 3 *
          (0.52 * harmonic(1280) + 0.2 * harmonic(3366.4) + 0.65 * hiss);
        break;
    }
    const edge = Math.min(1, u * 200) * Math.min(1, (1 - u) * 80);
    const pan = stereo * (2 * u - 1);
    const left = sample * edge * Math.sqrt((1 - pan) / 2);
    const right = sample * edge * Math.sqrt((1 + pan) / 2);
    samples[i * 2] = left;
    samples[i * 2 + 1] = right;
    maximum = Math.max(maximum, Math.abs(left), Math.abs(right));
  }
  const wav = Buffer.alloc(44 + sampleFrameCount * 4);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(FILM_SFX_SAMPLE_RATE, 24);
  wav.writeUInt32LE(FILM_SFX_SAMPLE_RATE * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(sampleFrameCount * 4, 40);
  // Leave at least 2 dB of sample headroom even at intensity=1.
  const gain = maximum > 0 ? (0.78 * intensity) / maximum : 0;
  for (let i = 0; i < samples.length; i += 1)
    wav.writeInt16LE(Math.round(samples[i] * gain * 32767), 44 + i * 2);
  return wav;
};
