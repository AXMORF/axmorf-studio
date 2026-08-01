import { createHash } from "node:crypto";

import { Sha256DigestSchema } from "../../../src/contracts/primitives";
import { pauseMsToSampleFrames } from "../../../src/contracts/semantic-timing";

export const CANONICAL_NARRATION_PCM = {
  sampleRate: 48_000,
  channelLayout: "mono",
  sampleFormat: "s16le",
} as const;

const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SAMPLE_FRAME = 2;
const MAX_WAV_DATA_BYTES = 0xffff_ffff;

const assertAllocatableByteLength = (byteLength: bigint, label: string): number => {
  if (byteLength < 0n || byteLength > BigInt(MAX_WAV_DATA_BYTES)) {
    throw new Error(`${label} exceeds the WAV v1 safe size.`);
  }
  const value = Number(byteLength);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} exceeds the safe integer range.`);
  }
  return value;
};

export const encodeCanonicalPcmWav = (rawPcm: Buffer): Buffer => {
  if (rawPcm.length % PCM_BYTES_PER_SAMPLE_FRAME !== 0) {
    throw new Error("Canonical s16le PCM byte length must be even.");
  }
  const dataByteLength = assertAllocatableByteLength(
    BigInt(rawPcm.length),
    "Canonical PCM",
  );
  if (dataByteLength > MAX_WAV_DATA_BYTES - 36) {
    throw new Error("Canonical PCM exceeds the RIFF/WAVE size limit.");
  }
  const wav = Buffer.alloc(WAV_HEADER_BYTES + dataByteLength);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataByteLength, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(CANONICAL_NARRATION_PCM.sampleRate, 24);
  wav.writeUInt32LE(CANONICAL_NARRATION_PCM.sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataByteLength, 40);
  wav.set(Uint8Array.from(rawPcm), WAV_HEADER_BYTES);
  return wav;
};

export type DecodedCanonicalPcmWav = {
  readonly pcm: typeof CANONICAL_NARRATION_PCM;
  readonly sampleFrameCount: number;
  readonly rawPcm: Buffer;
};

export const decodeCanonicalPcmWav = (
  wav: Buffer,
): DecodedCanonicalPcmWav => {
  if (
    wav.length < 12 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Input is not a valid RIFF/WAV file.");
  }
  const declaredEnd = wav.readUInt32LE(4) + 8;
  if (declaredEnd > wav.length) {
    throw new Error("WAV file is truncated before its declared RIFF end.");
  }

  let format: Buffer | undefined;
  let data: Buffer | undefined;
  let offset = 12;
  while (offset + 8 <= declaredEnd) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkLength = wav.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > declaredEnd || chunkEnd > wav.length) {
      throw new Error(`WAV ${chunkId} chunk is truncated.`);
    }
    if (chunkId === "fmt " && format === undefined) {
      format = wav.subarray(chunkStart, chunkEnd);
    }
    if (chunkId === "data" && data === undefined) {
      data = wav.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd + (chunkLength % 2);
  }

  if (format === undefined || format.length < 16) {
    throw new Error("WAV file is missing a complete fmt chunk.");
  }
  if (data === undefined) {
    throw new Error("WAV file is missing a data chunk.");
  }
  if (format.readUInt16LE(0) !== 1) {
    throw new Error("Canonical WAV must use integer PCM format 1.");
  }
  if (
    format.readUInt16LE(2) !== 1 ||
    format.readUInt32LE(4) !== CANONICAL_NARRATION_PCM.sampleRate
  ) {
    throw new Error("Canonical WAV must be 48 kHz mono PCM.");
  }
  if (
    format.readUInt32LE(8) !== CANONICAL_NARRATION_PCM.sampleRate * 2 ||
    format.readUInt16LE(12) !== 2 ||
    format.readUInt16LE(14) !== 16
  ) {
    throw new Error("Canonical WAV must use s16le samples.");
  }
  if (data.length % PCM_BYTES_PER_SAMPLE_FRAME !== 0) {
    throw new Error("Canonical WAV data byte length must be even.");
  }
  const sampleFrameCount = data.length / PCM_BYTES_PER_SAMPLE_FRAME;
  if (!Number.isSafeInteger(sampleFrameCount)) {
    throw new Error("Canonical WAV sampleFrameCount exceeds the safe range.");
  }

  return {
    pcm: CANONICAL_NARRATION_PCM,
    sampleFrameCount,
    rawPcm: Buffer.from(Uint8Array.from(data)),
  };
};

export const measureCanonicalPcmWav = (wav: Buffer) => {
  const { pcm, sampleFrameCount } = decodeCanonicalPcmWav(wav);
  return { pcm, sampleFrameCount } as const;
};

export const createExplicitPausePcm = (pauseMs: number) => {
  const sampleFrameCount = pauseMsToSampleFrames(
    pauseMs,
    CANONICAL_NARRATION_PCM.sampleRate,
  );
  const byteLength = assertAllocatableByteLength(
    BigInt(sampleFrameCount) * BigInt(PCM_BYTES_PER_SAMPLE_FRAME),
    "Explicit pause PCM",
  );
  const rawPcm = Buffer.alloc(byteLength);
  return {
    rawPcm,
    sampleFrameCount,
    wav: encodeCanonicalPcmWav(rawPcm),
  } as const;
};

export const concatenateCanonicalPcm = (parts: readonly Buffer[]): Buffer => {
  if (parts.length === 0) {
    throw new Error("At least one canonical PCM part is required.");
  }
  const decoded = parts.map(decodeCanonicalPcmWav);
  const totalBytes = decoded.reduce(
    (sum, part) => sum + BigInt(part.rawPcm.length),
    0n,
  );
  const safeTotalBytes = assertAllocatableByteLength(
    totalBytes,
    "Concatenated canonical PCM",
  );
  return encodeCanonicalPcmWav(
    Buffer.concat(
      decoded.map((part) => Uint8Array.from(part.rawPcm)),
      safeTotalBytes,
    ),
  );
};

export const sha256Bytes = (bytes: Buffer) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(Uint8Array.from(bytes))
      .digest("hex")}`,
  );
