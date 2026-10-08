import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRhythmSummary,
  inspectReferenceSamplingCapabilities,
  meanAbsolutePixelDifference,
  parseReferenceVideoProbe,
  planReferenceSamples,
  planReferencePreviewDimensions,
  selectReferencePreviewFrames,
  validateReferenceInputPath,
} from "../../scripts/reference-analysis/domain";
import {
  isReferenceAnalysisScriptEntrypoint,
  parseReferenceAnalysisArguments,
} from "../../scripts/reference-analysis/cli";

const probe = (stream: unknown = {}, format: unknown = {}) =>
  JSON.stringify({
    streams: [
      {
        width: 1280,
        height: 720,
        avg_frame_rate: "30000/1001",
        r_frame_rate: "30/1",
        duration: "8",
        ...Object(stream),
      },
    ],
    format: { duration: "8.05", ...Object(format) },
  });

test("reference input is an exact public-relative file path", () => {
  for (const path of [
    "public/reference.mp4",
    "public/references/本地 clip.mp4",
  ])
    assert.equal(validateReferenceInputPath(path), path);
  for (const path of [
    "reference.mp4",
    "/public/reference.mp4",
    "https://example.test/reference.mp4",
    "public",
    "public/",
    "public//reference.mp4",
    "public/./reference.mp4",
    "public/../reference.mp4",
    "public\\reference.mp4",
    "public/reference\u0000.mp4",
  ])
    assert.throws(() => validateReferenceInputPath(path), /public-relative/u);
});

test("reference CLI accepts bounded detection thresholds and rejects extra arguments", () => {
  assert.deepEqual(
    parseReferenceAnalysisArguments(["--input", "public/ref.mp4"]),
    {
      inputPath: "public/ref.mp4",
      threshold: 0.3,
    },
  );
  for (const threshold of ["0", "0.3", ".3", "1"])
    assert.equal(
      parseReferenceAnalysisArguments([
        "--input",
        "public/ref.mp4",
        "--threshold",
        threshold,
      ]).threshold,
      Number(threshold),
    );
  for (const threshold of ["-0.1", "1.1", "NaN", "Infinity", "", " ", "0x1"])
    assert.throws(() =>
      parseReferenceAnalysisArguments([
        "--input",
        "public/ref.mp4",
        "--threshold",
        threshold,
      ]),
    );
  for (const args of [
    [],
    ["--url", "https://example.test"],
    ["--input", "public/ref.mp4", "--camera"],
    ["--input", "public/ref.mp4", "--threshold", "0.3", "--threshold", "0.2"],
  ])
    assert.throws(() => parseReferenceAnalysisArguments(args));
  assert.equal(
    isReferenceAnalysisScriptEntrypoint(
      "file:///workspace/dist/cli/main.js",
      "/workspace/dist/cli/main.js",
    ),
    false,
  );
  assert.equal(
    isReferenceAnalysisScriptEntrypoint(
      "file:///workspace/scripts/reference-analysis/cli.ts",
      "/workspace/scripts/reference-analysis/cli.ts",
    ),
    true,
  );
});

test("reference probe preserves rational fps and video-stream duration", () => {
  assert.deepEqual(parseReferenceVideoProbe(probe()), {
    width: 1280,
    height: 720,
    fps: 30000 / 1001,
    frameRate: { numerator: 30000, denominator: 1001 },
    durationSeconds: 8,
    durationSource: "video-stream",
  });
  const fallback = parseReferenceVideoProbe(
    probe({ avg_frame_rate: "0/0", duration: "N/A" }),
  );
  assert.equal(fallback.fps, 30);
  assert.equal(fallback.durationSeconds, 8.05);
  assert.equal(fallback.durationSource, "container-format");
});

test("reference probe rejects invalid or absent video metadata", () => {
  for (const raw of [
    "not-json",
    JSON.stringify({ streams: [] }),
    JSON.stringify({ streams: [{}, {}] }),
    probe({ width: 0 }),
    probe({ height: 1.5 }),
    probe({ avg_frame_rate: "invalid" }),
    probe({ avg_frame_rate: "30/0" }),
    probe({ duration: "0" }, { duration: "0" }),
    probe({ duration: "N/A" }, { duration: "N/A" }),
  ])
    assert.throws(() => parseReferenceVideoProbe(raw), /metadata/u);
});

test("sampling capability parser requires actual supported filters, encoder and gray conversion", () => {
  assert.deepEqual(
    inspectReferenceSamplingCapabilities({
      filters: " ... format V->V\n ..C scale V->V\n",
      encoders: " VF...D rawvideo\n VF...D png\n",
      pixelFormats: "IO... gray 1 8 8\nIO... rgb24 3 24 8-8-8\n",
      muxers: "  E image2\n",
    }),
    [],
  );
  assert.deepEqual(
    inspectReferenceSamplingCapabilities({
      filters: "Unknown filter 'scale'.\nformat\n",
      encoders: " V..... png\n",
      pixelFormats: "I.... gray 1 8 8\n",
      muxers: "  E mp4\n",
    }),
    [
      "ffmpeg-filter:scale",
      "ffmpeg-filter:format",
      "ffmpeg-encoder:rawvideo",
      "ffmpeg-pixel-format:gray",
      "ffmpeg-pixel-format:rgb24",
      "ffmpeg-muxer:image2",
    ],
  );
});

test("sample planning is bounded to 120 frames and at most two requests per second", () => {
  const short = planReferenceSamples(2, 30);
  assert.deepEqual(short.sampleTimesSeconds, [0, 0.5, 1, 1.5]);
  assert.equal(short.unsampledTailSeconds, 0.5);
  const long = planReferenceSamples(600, 30);
  assert.equal(long.sampleTimesSeconds.length, 120);
  assert.equal(long.samplingIntervalSeconds, 5);
  assert.equal(long.sampleTimesSeconds.at(-1), 595);
  assert.deepEqual(planReferenceSamples(2, 1).sampleTimesSeconds, [0, 1]);
  assert.deepEqual(planReferenceSamples(0.1, 30).sampleTimesSeconds, [0]);
  assert.throws(() => planReferenceSamples(0, 30));
  assert.throws(() => planReferenceSamples(3, Number.NaN));
});

test("sample difference uses normalized mean absolute grayscale pixel values", () => {
  assert.equal(
    meanAbsolutePixelDifference(Uint8Array.of(0, 255), Uint8Array.of(255, 0)),
    1,
  );
  assert.equal(
    meanAbsolutePixelDifference(Uint8Array.of(0, 255), Uint8Array.of(0, 255)),
    0,
  );
  assert.equal(
    meanAbsolutePixelDifference(Uint8Array.of(0, 0), Uint8Array.of(0, 255)),
    0.5,
  );
  assert.throws(() =>
    meanAbsolutePixelDifference(new Uint8Array(), new Uint8Array()),
  );
  assert.throws(() =>
    meanAbsolutePixelDifference(Uint8Array.of(0), Uint8Array.of(0, 1)),
  );
});

test("rhythm summary reports midpoint estimates and neutral distribution bins", () => {
  const rhythm = buildRhythmSummary(
    [
      { startSeconds: 0, endSeconds: 2 },
      { startSeconds: 4, endSeconds: 6 },
    ],
    8,
  );
  assert.deepEqual(rhythm.estimatedShotDurationsSeconds, [1, 4, 3]);
  assert.equal(rhythm.candidateCutCount, 2);
  assert.equal(rhythm.estimatedShotCount, 3);
  assert.equal(rhythm.candidateCutsPerMinute, 15);
  assert.equal(rhythm.cutTimeEstimation, "tested-nominal-bracket-midpoint");
  assert.deepEqual(rhythm.estimatedDurationStatistics, {
    minimumSeconds: 1,
    maximumSeconds: 4,
    meanSeconds: 8 / 3,
    medianSeconds: 3,
  });
  assert.deepEqual(
    rhythm.estimatedDurationDistribution.map(({ count }) => count),
    [0, 1, 2, 0],
  );
  assert.deepEqual(
    buildRhythmSummary([], 2).estimatedShotDurationsSeconds,
    [2],
  );
  for (const interval of [
    { startSeconds: -1, endSeconds: 1 },
    { startSeconds: 3, endSeconds: 2 },
    { startSeconds: 3, endSeconds: 8 },
    { startSeconds: 0, endSeconds: Number.NaN },
  ])
    assert.throws(() => buildRhythmSummary([interval], 8));
});

test("rational nominal grids and previews retain explicit bounds without source PTS claims", () => {
  const plan = planReferenceSamples(65, 30000 / 1001);
  assert.equal(plan.gridClock, "nominal-average-fps-requested-seek");
  assert.equal(plan.decodedFrameTimestampsMeasured, false);
  assert.ok(plan.sampleFrameIndices.length <= 120);
  assert.ok(plan.sampleFrameIndices.every(Number.isSafeInteger));
  assert.ok(
    plan.sampleTimesSeconds.every(
      (time, index) => time === plan.sampleFrameIndices[index] / (30000 / 1001),
    ),
  );
  assert.ok(plan.sampleTimesSeconds.at(-1)! < 65);
  assert.deepEqual(planReferencePreviewDimensions(1080, 1920), {
    width: 288,
    height: 512,
    maximumLongEdge: 512,
  });
  assert.deepEqual(planReferencePreviewDimensions(100, 50), {
    width: 100,
    height: 50,
    maximumLongEdge: 512,
  });
  const chosen = selectReferencePreviewFrames(
    [0, 10, 20, 30],
    [{ beforeFrame: 14, afterFrame: 15 }],
  );
  assert.deepEqual(chosen, [0, 10, 14, 15, 20, 30]);
  const bounded = selectReferencePreviewFrames(
    Array.from({ length: 120 }, (_, index) => index * 10),
    Array.from({ length: 12 }, (_, index) => ({
      beforeFrame: index * 10 + 3,
      afterFrame: index * 10 + 4,
    })),
  );
  assert.ok(bounded.length <= 24);
  assert.ok(bounded.includes(0) && bounded.includes(1190));
  assert.throws(
    () => planReferenceSamples(Number.MAX_SAFE_INTEGER, 30),
    /safe integer/u,
  );
});
