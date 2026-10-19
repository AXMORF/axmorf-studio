import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import test from "node:test";

import {
  masterNarrationBytes,
  parseLoudnormAnalysis,
} from "../../scripts/narration/mastering";
import type { ProcessRunner } from "../../scripts/narration/adapters/ffmpeg-normalizer";
import { createRawPcmFixture, createWavFixture } from "../fixtures/wav";

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
      await writeFile(args.at(-1)!, createWavFixture({ rawPcm: outputRaw }));
      return {
        exitCode: 0,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      };
    }
    return {
      exitCode: 0,
      stdout: Buffer.alloc(0),
      stderr: analysis({ integrated: -18.12, peak: -1.5 }),
    };
  };

  const mastered = await masterNarrationBytes({
    sourcePath: "/tmp/source.wav",
    sourceWav,
    targetLoudnessLufs: -18,
    runProcess,
  });

  assert.equal(mastered.outputWav.length, sourceWav.length);
  assert.deepEqual(mastered.measurements, {
    integratedLoudnessLufs: -18.12,
    truePeakDbtp: -1.5,
    loudnessRangeLu: 3.3,
    thresholdLufs: -26.87,
  });
  assert.equal(mastered.masteringPolicy.targetIntegratedLoudnessLufs, -18);
  assert.match(calls[0]?.join(" ") ?? "", /loudnorm=I=-17\.75:/u);
  assert.match(calls[1]?.join(" ") ?? "", /loudnorm=I=-17\.75:/u);
  assert.match(calls[1]?.join(" ") ?? "", /measured_I=-18\.77/u);
  assert.match(calls[1]?.join(" ") ?? "", /measured_TP=-0\.25/u);
  assert.deepEqual(calls[1]?.slice(-5, -1), [
    "-acodec",
    "pcm_s16le",
    "-f",
    "wav",
  ]);
  assert.equal(basename(calls[1]?.at(-1) ?? ""), "mastered.wav");
});

test("two-pass mastering biases peak-limited speech toward the requested target", async () => {
  const sourceRaw = createRawPcmFixture([100, -100, 200, -200]);
  const outputRaw = createRawPcmFixture([200, -200, 400, -400]);
  const sourceWav = createWavFixture({ rawPcm: sourceRaw });
  const calls: string[][] = [];
  let index = 0;
  const runProcess: ProcessRunner = async (_command, args) => {
    calls.push([...args]);
    index += 1;
    if (index === 1) {
      return {
        exitCode: 0,
        stdout: Buffer.alloc(0),
        stderr: analysis({ integrated: -19.11, peak: -0.81 }),
      };
    }
    if (index === 2) {
      await writeFile(args.at(-1)!, createWavFixture({ rawPcm: outputRaw }));
      return {
        exitCode: 0,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      };
    }
    const usedBiasedTarget = calls[1]?.join(" ").includes("loudnorm=I=-17.75:");
    return {
      exitCode: 0,
      stdout: Buffer.alloc(0),
      stderr: analysis({
        integrated: usedBiasedTarget ? -18.42 : -18.54,
        peak: -1.49,
      }),
    };
  };

  const mastered = await masterNarrationBytes({
    sourcePath: "/tmp/source.wav",
    sourceWav,
    targetLoudnessLufs: -18,
    runProcess,
  });

  assert.match(calls[0]?.join(" ") ?? "", /loudnorm=I=-17\.75:/u);
  assert.match(calls[1]?.join(" ") ?? "", /loudnorm=I=-17\.75:/u);
  assert.equal(mastered.masteringPolicy.targetIntegratedLoudnessLufs, -18);
});
