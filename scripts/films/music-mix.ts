import type { FilmMusicSpec } from "@axmorf/studio/contracts";

import { canonicalizeWav, TRACK_SAMPLE_RATE } from "./music-track";

/**
 * Static spectral space for speech, before source mastering (not a sidechain).
 * RBJ peaking EQ: https://www.w3.org/TR/audio-eq-cookbook/ .
 * No profile is a byte-identical bypass, including the original WAV header.
 */
export const applyFilmMusicMixProfile = (
  wav: Buffer,
  profile: FilmMusicSpec["mixProfile"],
): Buffer => {
  if (profile === undefined) return wav;
  const pcm = canonicalizeWav(wav);
  if (
    pcm.readUInt16LE(20) !== 1 ||
    pcm.readUInt16LE(22) !== 2 ||
    pcm.readUInt32LE(24) !== TRACK_SAMPLE_RATE ||
    pcm.readUInt32LE(28) !== TRACK_SAMPLE_RATE * 4 ||
    pcm.readUInt16LE(32) !== 4 ||
    pcm.readUInt16LE(34) !== 16 ||
    pcm.length !== wav.length ||
    pcm.readUInt32LE(40) % 4 !== 0
  )
    throw new Error(
      "Music mix profile requires canonical 48 kHz stereo s16 PCM WAV.",
    );

  const a = 10 ** (-6 / 40);
  const w0 = (2 * Math.PI * 2000) / TRACK_SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * (2 / 3));
  const a0 = 1 + alpha / a;
  const b0 = (1 + alpha * a) / a0;
  const b1 = (-2 * Math.cos(w0)) / a0;
  const b2 = (1 - alpha * a) / a0;
  const a1 = b1;
  const a2 = (1 - alpha / a) / a0;
  const output = Buffer.from(pcm);
  const x1 = [0, 0],
    x2 = [0, 0],
    y1 = [0, 0],
    y2 = [0, 0];
  for (let at = 44; at < pcm.length; at += 4) {
    // Preserve authored digital rests and discard the causal filter's tail.
    // Reset only when BOTH channels are zero; a silent channel cannot alter its peer.
    if (pcm.readInt16LE(at) === 0 && pcm.readInt16LE(at + 2) === 0) {
      x1.fill(0);
      x2.fill(0);
      y1.fill(0);
      y2.fill(0);
      continue;
    }
    for (let channel = 0; channel < 2; channel++) {
      const offset = at + channel * 2;
      const x = pcm.readInt16LE(offset);
      const y =
        b0 * x +
        b1 * x1[channel] +
        b2 * x2[channel] -
        a1 * y1[channel] -
        a2 * y2[channel];
      if (!Number.isFinite(y)) throw new Error("Non-finite music EQ output.");
      x2[channel] = x1[channel];
      x1[channel] = x;
      y2[channel] = y1[channel];
      y1[channel] = y;
      // Round to nearest integer, then explicitly saturate to the s16 range.
      output.writeInt16LE(
        Math.max(-32768, Math.min(32767, Math.round(y))),
        offset,
      );
    }
  }
  return output;
};
