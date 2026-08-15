import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProviderAudio } from "../../scripts/narration/adapters/ffmpeg-normalizer";
import {
  CANONICAL_NARRATION_PCM,
  concatenateCanonicalPcm,
  createExplicitPausePcm,
  decodeCanonicalPcmWav,
  encodeCanonicalPcmWav,
  measureCanonicalPcmWav,
  sha256Bytes,
} from "../../scripts/narration/domain/pcm-wav";
import { createRawPcmFixture, createWavFixture } from "../fixtures/wav";

test("sampleFrameCount counts channel frames rather than interleaved samples", () => {
  const wav = encodeCanonicalPcmWav(Buffer.alloc(48_000 * 2));
  assert.equal(measureCanonicalPcmWav(wav).sampleFrameCount, 48_000);
  assert.deepEqual(measureCanonicalPcmWav(wav).pcm, CANONICAL_NARRATION_PCM);
});

test("explicit pauses use round-half-up sample conversion", () => {
  assert.equal(createExplicitPausePcm(250).sampleFrameCount, 12_000);
  assert.equal(createExplicitPausePcm(300).sampleFrameCount, 14_400);
  assert.equal(createExplicitPausePcm(400).sampleFrameCount, 19_200);
  assert.deepEqual(
    createExplicitPausePcm(300).rawPcm,
    Buffer.alloc(14_400 * 2),
  );
});

test("canonical concatenation preserves natural zero samples inside chunks", () => {
  const chunkWithNaturalSilence = encodeCanonicalPcmWav(
    createRawPcmFixture([120, 0, 0, -120]),
  );
  const explicitPause = createExplicitPausePcm(1).wav;
  const chunkB = encodeCanonicalPcmWav(createRawPcmFixture([60, -60]));
  const combined = concatenateCanonicalPcm([
    chunkWithNaturalSilence,
    explicitPause,
    chunkB,
  ]);
  const expectedRawPcm = Buffer.concat(
    [
      createRawPcmFixture([120, 0, 0, -120]),
      Buffer.alloc(48 * 2),
      createRawPcmFixture([60, -60]),
    ].map((part) => Uint8Array.from(part)),
  );

  assert.deepEqual(decodeCanonicalPcmWav(combined).rawPcm, expectedRawPcm);
});

test("normalizer applies provider-neutral speech rate before canonical PCM", async () => {
  const captured: { command?: string; args?: readonly string[] } = {};
  const rawPcm = createRawPcmFixture([1, 2, 3]);
  const wav = await normalizeProviderAudio({
    sourceBytes: Buffer.from("provider bytes"),
    speechRate: 1.15,
    runProcess: async (command, args) => {
      captured.command = command;
      captured.args = args;
      return { exitCode: 0, stdout: rawPcm, stderr: Buffer.alloc(0) };
    },
  });

  assert.equal(captured.command, "ffmpeg");
  assert.deepEqual(captured.args?.slice(6, 8), ["-af", "atempo=1.15"]);
  assert.deepEqual(captured.args?.slice(-10), [
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(CANONICAL_NARRATION_PCM.sampleRate),
    "-acodec",
    "pcm_s16le",
    "-f",
    "s16le",
    "pipe:1",
  ]);
  assert.equal(
    captured.args?.some((argument) => /silenceremove|atrim/.test(argument)),
    false,
  );
  assert.deepEqual(decodeCanonicalPcmWav(wav).rawPcm, rawPcm);
});

test("WAV decoding rejects malformed and noncanonical audio", () => {
  assert.throws(() => encodeCanonicalPcmWav(Buffer.alloc(3)), /even/i);
  assert.throws(() => decodeCanonicalPcmWav(Buffer.from("short")), /WAV/i);
  assert.throws(
    () =>
      decodeCanonicalPcmWav(
        createWavFixture({
          rawPcm: createRawPcmFixture([1]),
          audioFormat: 3,
        }),
      ),
    /PCM/i,
  );
  assert.throws(
    () =>
      decodeCanonicalPcmWav(
        createWavFixture({
          rawPcm: createRawPcmFixture([1]),
          bitsPerSample: 8,
        }),
      ),
    /s16le/i,
  );
  const truncated = createWavFixture({
    rawPcm: createRawPcmFixture([1, 2]),
  }).subarray(0, 45);
  assert.throws(() => decodeCanonicalPcmWav(truncated), /truncated/i);
});

test("normalizer rejects empty input process failures and empty PCM", async () => {
  await assert.rejects(
    () =>
      normalizeProviderAudio({
        sourceBytes: Buffer.from("provider"),
        speechRate: 2.1,
      }),
    /speech rate/i,
  );
  await assert.rejects(
    () =>
      normalizeProviderAudio({
        sourceBytes: Buffer.alloc(0),
        runProcess: async () => ({
          exitCode: 0,
          stdout: Buffer.alloc(2),
          stderr: Buffer.alloc(0),
        }),
      }),
    /empty provider audio/i,
  );
  await assert.rejects(
    () =>
      normalizeProviderAudio({
        sourceBytes: Buffer.from("provider"),
        runProcess: async () => ({
          exitCode: 1,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from("decode failed"),
        }),
      }),
    /FFmpeg normalization failed/i,
  );
  await assert.rejects(
    () =>
      normalizeProviderAudio({
        sourceBytes: Buffer.from("provider"),
        runProcess: async () => ({
          exitCode: 0,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        }),
      }),
    /empty PCM/i,
  );
});

test("checksums bind exact bytes", () => {
  assert.match(sha256Bytes(Buffer.from("audio")), /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(
    sha256Bytes(Buffer.from("audio")),
    sha256Bytes(Buffer.from("audio changed")),
  );
});
