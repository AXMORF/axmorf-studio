import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFilmMusicMixProfile,
  MUSIC_DIGITAL_SILENCE_MIN_SAMPLES,
} from "../../scripts/films/music-mix";

const wav = (
  frames: number,
  sample: (frame: number, channel: number) => number,
) => {
  const bytes = Buffer.alloc(44 + frames * 4);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(192000, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < 2; c++)
      bytes.writeInt16LE(Math.round(sample(i, c)), 44 + i * 4 + c * 2);
  return bytes;
};
const tone = (hz: number, frame: number, channel: number) =>
  10000 * Math.sin((2 * Math.PI * hz * frame) / 48000 + channel * 0.37);
const rms = (bytes: Buffer, channel = 0) => {
  let energy = 0,
    n = 0;
  for (let i = 4800; i < (bytes.length - 44) / 4; i++, n++)
    energy += bytes.readInt16LE(44 + i * 4 + channel * 2) ** 2;
  return Math.sqrt(energy / n);
};
test("voiceover peaking EQ cuts 2 kHz by 6 dB while preserving bass and treble", () => {
  for (const [hz, phase] of [100, 2000, 10000].flatMap((hz) => [
    [hz, 0],
    [hz, 0.37],
  ])) {
    const input = wav(
      48000,
      (f, c) => 10000 * Math.sin((2 * Math.PI * hz * f) / 48000 + c * phase),
    );
    const output = applyFilmMusicMixProfile(input, "voiceover");
    for (const channel of [0, 1]) {
      const db = 20 * Math.log10(rms(output, channel) / rms(input, channel));
      assert.ok(
        hz === 2000 ? Math.abs(db + 6) < 0.02 : db > -0.6 && db < 0,
        `${hz}: ${db}`,
      );
    }
    assert.equal(output.length, input.length);
    assert.deepEqual(output.subarray(0, 44), input.subarray(0, 44));
    assert.deepEqual(applyFilmMusicMixProfile(input, "voiceover"), output);
  }
});
test("stereo states are independent, with identical coefficients and no crosstalk", () => {
  const leftOnly = wav(48000, (f, c) => (c ? 0 : tone(2000, f, 0)));
  const rightOnly = wav(48000, (f, c) => (c ? tone(2000, f, 0) : 0));
  const left = applyFilmMusicMixProfile(leftOnly, "voiceover");
  const right = applyFilmMusicMixProfile(rightOnly, "voiceover");
  for (const [output, input, channel] of [
    [left, leftOnly, 0],
    [right, rightOnly, 1],
  ] as const)
    assert.ok(
      Math.abs(
        20 * Math.log10(rms(output, channel) / rms(input, channel)) + 6,
      ) < 0.02,
    );
  for (let i = 44; i < left.length; i += 4) {
    assert.equal(left.readInt16LE(i + 2), 0);
    assert.equal(right.readInt16LE(i), 0);
    assert.equal(left.readInt16LE(i), right.readInt16LE(i + 2));
  }
});
test("digital rests reset state and prevent pre-ringing or early onsets", () => {
  const burst = wav(100, (f) => (f < 10 ? 20000 : 0));
  const output = applyFilmMusicMixProfile(burst, "voiceover");
  assert.deepEqual(output.subarray(44 + 10 * 4), Buffer.alloc(90 * 4));
  const delayed = wav(200, (f) => (f < 100 ? 0 : f < 110 ? 20000 : 0));
  const result = applyFilmMusicMixProfile(delayed, "voiceover");
  assert.deepEqual(result.subarray(44, 444), Buffer.alloc(400));
  assert.deepEqual(result.subarray(444), output.subarray(44));
  const zeros = wav(500, () => 0);
  assert.deepEqual(applyFilmMusicMixProfile(zeros, "voiceover"), zeros);
});
test("omitted profile is an exact bypass; invalid profile PCM fails explicitly", () => {
  const input = wav(5, () => -32768);
  assert.equal(applyFilmMusicMixProfile(input, undefined), input);
  for (const [at, value] of [
    [22, 1],
    [24, 44100],
    [34, 32],
  ]) {
    const invalid = Buffer.from(input);
    invalid.writeUInt16LE(value, at);
    assert.throws(
      () => applyFilmMusicMixProfile(invalid, "voiceover"),
      /48 kHz stereo s16/,
    );
  }
});

test("zero crossings and zero runs shorter than 48 samples preserve filter state", () => {
  assert.equal(MUSIC_DIGITAL_SILENCE_MIN_SAMPLES, 48);
  for (const length of [1, 2, 24, 47]) {
    const signal = (f: number) => (f % (length + 1) === 0 ? 10000 : 0);
    const input = wav(300, (f) => signal(f));
    // A nonzero right channel prevents stereo silence classification; left history must match.
    const reference = wav(300, (f, c) => (c ? 1 : signal(f)));
    const actual = applyFilmMusicMixProfile(input, "voiceover");
    const expected = applyFilmMusicMixProfile(reference, "voiceover");
    for (let f = 0; f < 300; f++)
      assert.equal(
        actual.readInt16LE(44 + f * 4),
        expected.readInt16LE(44 + f * 4),
        `${length}: f${f}`,
      );
    assert.notEqual(actual.readInt16LE(48), 0);
  }
});

test("48-sample silence resets both boundaries while 47 samples retain the causal tail", () => {
  for (const length of [47, 48, 1600]) {
    const source = wav(10 + length + 10, (f) =>
      f < 10 || f >= 10 + length ? 10000 : 0,
    );
    const output = applyFilmMusicMixProfile(source, "voiceover");
    const rest = output.subarray(44 + 10 * 4, 44 + (10 + length) * 4);
    if (length >= 48) {
      assert.deepEqual(rest, Buffer.alloc(length * 4));
      const cold = applyFilmMusicMixProfile(
        wav(10, () => 10000),
        "voiceover",
      );
      assert.deepEqual(
        output.subarray(44 + (10 + length) * 4),
        cold.subarray(44),
      );
    } else assert.notDeepEqual(rest, Buffer.alloc(length * 4));
  }
});
