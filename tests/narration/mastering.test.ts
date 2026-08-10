import assert from "node:assert/strict";
import test from "node:test";

import {
  MasteredNarrationManifestSchema,
  buildMasteredNarrationManifest,
} from "../../src/contracts/mastered-narration";
import {
  masterNarrationBytes,
  parseLoudnormAnalysis,
} from "../../scripts/narration/mastering";
import type { ProcessRunner } from "../../scripts/narration/adapters/ffmpeg-normalizer";
import { createRawPcmFixture, createWavFixture } from "../fixtures/wav";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const analysis = ({
  integrated,
  peak,
}: {
  readonly integrated: number;
  readonly peak: number;
}) =>
  Buffer.from(
    JSON.stringify({
      input_i: integrated.toFixed(2),
      input_tp: peak.toFixed(2),
      input_lra: "3.30",
      input_thresh: "-26.87",
      target_offset: "0.43",
    }),
  );

test("parses finite FFmpeg loudnorm measurements and rejects malformed output", () => {
  assert.deepEqual(
    parseLoudnormAnalysis(
      `ffmpeg diagnostics\n${analysis({ integrated: -18.77, peak: -0.25 }).toString()}`,
    ),
    {
      inputI: -18.77,
      inputTp: -0.25,
      inputLra: 3.3,
      inputThreshold: -26.87,
      targetOffset: 0.43,
    },
  );
  assert.throws(() => parseLoudnormAnalysis("missing"), /JSON is missing/iu);
  assert.throws(
    () => parseLoudnormAnalysis('{"input_i":"inf"}'),
    /invalid integrated loudness/iu,
  );
});

test("two-pass mastering preserves canonical sample count and verifies output loudness", async () => {
  const sourceRaw = createRawPcmFixture([100, -100, 200, -200]);
  const outputRaw = createRawPcmFixture([200, -200, 400, -400]);
  const sourceWav = createWavFixture({ rawPcm: sourceRaw });
  const calls: readonly string[][] = [];
  let index = 0;
  const runProcess: ProcessRunner = async (_command, args) => {
    (calls as string[][]).push([...args]);
    index += 1;
    if (index === 1) {
      return {
        exitCode: 0,
        stdout: Buffer.alloc(0),
        stderr: analysis({ integrated: -18.77, peak: -0.25 }),
      };
    }
    if (index === 2) {
      return { exitCode: 0, stdout: outputRaw, stderr: Buffer.alloc(0) };
    }
    return {
      exitCode: 0,
      stdout: Buffer.alloc(0),
      stderr: analysis({ integrated: -16.12, peak: -1.5 }),
    };
  };

  const mastered = await masterNarrationBytes({
    sourcePath: "/tmp/source.wav",
    sourceWav,
    runProcess,
  });

  assert.equal(mastered.outputWav.length, sourceWav.length);
  assert.deepEqual(mastered.measurements, {
    integratedLoudnessLufs: -16.12,
    truePeakDbtp: -1.5,
    loudnessRangeLu: 3.3,
    thresholdLufs: -26.87,
  });
  assert.match(calls[1]?.join(" ") ?? "", /measured_I=-18\.77/u);
  assert.match(calls[1]?.join(" ") ?? "", /measured_TP=-0\.25/u);
  assert.deepEqual(calls[1]?.slice(-5), [
    "-acodec",
    "pcm_s16le",
    "-f",
    "s16le",
    "pipe:1",
  ]);
});

test("mastered narration contract binds seal, policy, measurements, checksum, and content path", () => {
  const manifest = buildMasteredNarrationManifest({
    storyId: "story-example",
    sealedNarrationFingerprint: sha("a"),
    sourceAudio: {
      localPath: `public/projects/story-example/narration/${"a".repeat(64)}/complete.wav`,
      checksum: sha("b"),
      pcm: { sampleRate: 48_000, channelLayout: "mono", sampleFormat: "s16le" },
      sampleFrameCount: 48_000,
    },
    outputAudio: {
      localPath:
        "public/projects/story-example/narration/pending/mastered/complete.wav",
      checksum: sha("c"),
      pcm: { sampleRate: 48_000, channelLayout: "mono", sampleFormat: "s16le" },
      sampleFrameCount: 48_000,
    },
    measurements: {
      integratedLoudnessLufs: -16.12,
      truePeakDbtp: -1.5,
      loudnessRangeLu: 3.3,
      thresholdLufs: -26.87,
    },
  });

  assert.match(
    manifest.outputAudio.localPath,
    new RegExp(
      `^public/projects/story-example/narration/${"a".repeat(64)}/mastered/[0-9a-f]{64}/complete\\.wav$`,
      "u",
    ),
  );
  assert.throws(
    () =>
      MasteredNarrationManifestSchema.parse({
        ...manifest,
        measurements: {
          ...manifest.measurements,
          integratedLoudnessLufs: -18,
        },
      }),
    /outside policy|fingerprint is stale/iu,
  );
  assert.throws(
    () =>
      MasteredNarrationManifestSchema.parse({
        ...manifest,
        outputAudio: {
          ...manifest.outputAudio,
          sampleFrameCount: 47_999,
        },
      }),
    /preserve the sealed sample count|fingerprint is stale/iu,
  );
});
