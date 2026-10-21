import assert from "node:assert/strict";
import test from "node:test";

import {
  FILM_REVIEW_MEASUREMENT_MARKER,
  FilmReviewMeasurementSchema,
  minimumReadableFontSize,
  type FilmReviewMeasurement,
} from "@axmorf/studio/contracts";

import {
  renderFilmReviewFrames,
  renderFilmStill,
} from "../../scripts/films/media";
import {
  analyzeReviewReadability,
  extractReviewMeasurements,
} from "../../scripts/films/readability";

type Text = FilmReviewMeasurement["texts"][number];
const text = (overrides: Partial<Text> = {}): Text => ({
  snippet: "label",
  caption: false,
  fontSize: 40,
  rect: { x: 100, y: 100, width: 100, height: 20 },
  ...overrides,
});
const record = (
  overrides: Partial<FilmReviewMeasurement> = {},
): FilmReviewMeasurement => ({
  index: 0,
  frame: 10,
  width: 1080,
  height: 1920,
  texts: [],
  truncated: false,
  ...overrides,
});
const line = (value: FilmReviewMeasurement) =>
  `${FILM_REVIEW_MEASUREMENT_MARKER} ${JSON.stringify(value)}`;
const analyze = (texts: Text[]) =>
  analyzeReviewReadability({
    output: line(record({ texts })),
    frames: [10],
    width: 1080,
    height: 1920,
  });

test("review markers survive ANSI and Remotion tags; malformed and cut-off lines are counted", () => {
  const value = record({ texts: [text()], truncated: true });
  const result = extractReviewMeasurements(
    [
      "Bundling 100%",
      `\u001b[33m[Tab 0, review-measure.tsx:100] ${line(value)}\u001b[0m`,
      `${FILM_REVIEW_MEASUREMENT_MARKER} {bad json}`,
      `${FILM_REVIEW_MEASUREMENT_MARKER} {"index":0`,
      `${FILM_REVIEW_MEASUREMENT_MARKER} ${JSON.stringify({ ...value, width: "1080" })}`,
    ].join("\n"),
  );
  assert.deepEqual(result.records, [value]);
  assert.equal(result.badLines, 3);
});

test("measurement schema bounds text count, snippets and finite positive rects", () => {
  assert.equal(
    FilmReviewMeasurementSchema.safeParse(
      record({ texts: Array.from({ length: 120 }, () => text()) }),
    ).success,
    true,
  );
  for (const texts of [
    Array.from({ length: 121 }, () => text()),
    [text({ snippet: "x".repeat(25) })],
    [text({ fontSize: Infinity })],
    [text({ rect: { x: 0, y: 0, width: 0, height: 1 } })],
  ]) {
    assert.equal(
      FilmReviewMeasurementSchema.safeParse(record({ texts })).success,
      false,
    );
  }
});

test("small-text uses the shared delivered-resolution threshold with a strict lower boundary", () => {
  assert.equal(minimumReadableFontSize(1080, 1920), 26);
  assert.equal(minimumReadableFontSize(1920, 1080), 26);
  assert.equal(minimumReadableFontSize(640, 480), 12);
  const result = analyze([
    text({ snippet: "small", fontSize: 25.999 }),
    text({ snippet: "boundary", fontSize: 26 }),
    text({ snippet: "large", fontSize: 64 }),
    text({ snippet: "caption", caption: true, fontSize: 12 }),
  ]);
  assert.deepEqual(
    result.readabilityWarnings.map(({ rule, snippet }) => [rule, snippet]),
    [["small-text", "small"]],
  );
  assert.equal(
    result.readabilityWarnings[0]!.measurements[0]!.minimumFontSize,
    26,
  );
  assert.equal(
    result.readabilityWarnings[0]!.message,
    '"small" renders at 26px (minimum 26px for a 1080×1920 frame) on frames 10; enlarge it or make it clearly decorative.',
  );
});

test("outside-frame requires partial visibility and strictly more than one pixel overflow", () => {
  const result = analyze([
    text({
      snippet: "right",
      rect: { x: 981.001, y: 10, width: 100, height: 20 },
    }),
    text({
      snippet: "one-pixel",
      rect: { x: 981, y: 10, width: 100, height: 20 },
    }),
    text({
      snippet: "left",
      rect: { x: -1.01, y: 10, width: 100, height: 20 },
    }),
    text({ snippet: "top", rect: { x: 10, y: -2, width: 100, height: 20 } }),
    text({
      snippet: "bottom",
      rect: { x: 10, y: 1902, width: 100, height: 20 },
    }),
    text({
      snippet: "off-right",
      fontSize: 12,
      rect: { x: 1080, y: 10, width: 100, height: 20 },
    }),
    text({
      snippet: "off-left",
      fontSize: 12,
      rect: { x: -100, y: 10, width: 100, height: 20 },
    }),
    text({
      snippet: "off-top",
      fontSize: 12,
      rect: { x: 10, y: -20, width: 100, height: 20 },
    }),
    text({
      snippet: "off-bottom",
      fontSize: 12,
      rect: { x: 10, y: 1920, width: 100, height: 20 },
    }),
    text({
      snippet: "caption",
      caption: true,
      rect: { x: -20, y: 10, width: 100, height: 20 },
    }),
  ]);
  assert.deepEqual(
    result.readabilityWarnings.map(({ rule, snippet }) => [rule, snippet]),
    ["right", "left", "top", "bottom"].map((snippet) => [
      "text-outside-frame",
      snippet,
    ]),
  );
  assert.equal(
    result.readabilityWarnings[0]!.message,
    '"right" extends 1px outside the frame on frames 10; move or wrap it so it stays fully visible.',
  );
});

test("under-captions uses the padded block and includes exactly ten percent overlap", () => {
  const caption = text({
    snippet: "caption",
    caption: true,
    fontSize: 12,
    rect: { x: 190, y: 105, width: 50, height: 10 },
    captionRect: { x: 190, y: 100, width: 100, height: 20 },
  });
  const result = analyze([
    text({ snippet: "ten-percent" }),
    text({
      snippet: "below",
      rect: { x: 99.999, y: 100, width: 100, height: 20 },
    }),
    text({
      snippet: "overlap",
      rect: { x: 150, y: 100, width: 100, height: 20 },
    }),
    text({
      snippet: "touching",
      rect: { x: 90, y: 100, width: 100, height: 20 },
    }),
    caption,
  ]);
  assert.deepEqual(
    result.readabilityWarnings.map(({ rule, snippet }) => [rule, snippet]),
    [
      ["text-under-captions", "ten-percent"],
      ["text-under-captions", "overlap"],
    ],
  );
  assert.equal(
    result.readabilityWarnings[0]!.measurements[0]!.captionOverlapRatio,
    0.1,
  );
  assert.equal(
    result.readabilityWarnings[0]!.message,
    '"ten-percent" overlaps the caption box by 10% on frames 10; move it away from the captions.',
  );
  assert.deepEqual(analyze([text()]).readabilityWarnings, []);
});

test("rules merge the same snippet across frames and keep measured values without duplicate logs", () => {
  const a = record({
    texts: [
      text({ fontSize: 16, rect: { x: -5, y: 100, width: 100, height: 20 } }),
      text({
        caption: true,
        captionRect: { x: 80, y: 100, width: 100, height: 20 },
      }),
    ],
  });
  const b = record({
    index: 1,
    frame: 90,
    texts: [
      text({
        fontSize: 20,
        rect: { x: -8.24, y: 100, width: 100, height: 20 },
      }),
      text({
        snippet: "other",
        fontSize: 12,
        rect: { x: 100, y: 200, width: 100, height: 20 },
      }),
      text({
        caption: true,
        captionRect: { x: 60, y: 100, width: 100, height: 20 },
      }),
    ],
  });
  const result = analyzeReviewReadability({
    output: [line(b), line(a), line(a)].join("\n"),
    frames: [10, 90],
    width: 1080,
    height: 1920,
  });
  const small = result.readabilityWarnings.find(
    ({ rule, snippet }) => rule === "small-text" && snippet === "label",
  )!;
  assert.deepEqual(small.frames, [10, 90]);
  assert.deepEqual(
    small.measurements.map(({ frame, fontSize }) => [frame, fontSize]),
    [
      [10, 16],
      [90, 20],
    ],
  );
  assert.equal(
    small.message,
    '"label" renders at 16px (minimum 26px for a 1080×1920 frame) on frames 10, 90; enlarge it or make it clearly decorative.',
  );
  assert.equal(
    result.readabilityWarnings.find(
      ({ rule }) => rule === "text-outside-frame",
    )!.message,
    '"label" extends 8.2px outside the frame on frames 10, 90; move or wrap it so it stays fully visible.',
  );
  assert.equal(
    result.readabilityWarnings.find(
      ({ rule }) => rule === "text-under-captions",
    )!.message,
    '"label" overlaps the caption box by 32% on frames 10, 90; move it away from the captions.',
  );
  assert.equal(result.readabilityWarnings.length, 4);
  assert.equal(result.readability.measuredFrames, 2);
  assert.deepEqual(result.readability.missingFrames, []);
});

test("missing, mismatched and failed records remain hints; successful duplicates supersede errors", () => {
  const result = analyzeReviewReadability({
    output: [
      line(record({ error: "layout failed" })),
      line(record({ index: 1, frame: 20, error: "fonts failed" })),
      line(record({ index: 1, frame: 20 })),
      line(record({ index: 1, frame: 20, error: "late error" })),
      line(record({ index: 2, frame: 31 })),
      line(record({ index: 3, frame: 40, width: 540 })),
    ].join("\n"),
    frames: [10, 20, 30, 40, 50],
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(result.readability.missingFrames, [10, 30, 40, 50]);
  assert.equal(result.readability.measuredFrames, 1);
  assert.deepEqual(result.readability.errors, [
    { frame: 10, error: "layout failed" },
  ]);
  assert.deepEqual(result.readabilityWarnings, []);
});

test("truncated measurements are reported separately from missing frames", () => {
  const result = analyzeReviewReadability({
    output: line(record({ truncated: true })),
    frames: [10],
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(result.readability.truncatedFrames, [10]);
  assert.deepEqual(result.readability.missingFrames, []);
  assert.equal(result.readability.measuredFrames, 1);
});

test("only review uses warn logging and returns complete captured process output", async () => {
  const calls: (readonly string[])[] = [];
  const captured = { status: 0, stdout: line(record()), stderr: "stderr" };
  const runProcess = async (_command: string, args: readonly string[]) => {
    calls.push(args);
    return captured;
  };
  const result = await renderFilmReviewFrames({
    rootDir: process.cwd(),
    compositionId: "probe--review",
    propsPath: "/tmp/props.json",
    outputDirectory: "out/probe",
    count: 3,
    scale: 0.5,
    runProcess,
  });
  assert.deepEqual(result, captured);
  assert.ok(calls[0]!.includes("--log=warn"));
  assert.ok(calls[0]!.includes("--frames=0-2"));
  await renderFilmStill({
    rootDir: process.cwd(),
    compositionId: "probe--cover",
    outputPath: "out/cover.png",
    runProcess,
  });
  assert.ok(calls[1]!.includes("--log=error"));
});
