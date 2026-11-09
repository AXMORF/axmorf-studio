import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FILM_REVIEW_MEASUREMENT_MARKER,
  type FilmReviewMeasurement,
} from "@axmorf/studio/contracts";
import {
  decodeRgbPng,
  readReviewFramePixels,
  type ReviewFramePixels,
} from "../../scripts/films/frame-compare";
import { analyzeReviewReadability } from "../../scripts/films/readability";
import {
  contrastRatio,
  LOW_TEXT_CONTRAST_RATIO,
  measureTextContrast,
  relativeLuminance,
} from "../../scripts/films/text-contrast";

type Text = FilmReviewMeasurement["texts"][number];
const text: Text = {
  snippet: "训练账单",
  caption: false,
  fontSize: 40,
  color: [20, 20, 20, 1],
  rect: { x: 0, y: 0, width: 80, height: 40 },
};
const image = (
  pixel: (x: number, y: number) => number[],
): ReviewFramePixels => {
  const pixels = new Uint8Array(80 * 40 * 3);
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 80; x++) pixels.set(pixel(x, y), (y * 80 + x) * 3);
  return { width: 80, height: 40, pixels };
};
const measure = (pixels: ReviewFramePixels, overrides: Partial<Text> = {}) =>
  measureTextContrast({
    text: { ...text, ...overrides },
    image: pixels,
    width: 80,
    height: 40,
  });

const record = (
  overrides: Partial<FilmReviewMeasurement> = {},
): FilmReviewMeasurement => ({
  index: 0,
  frame: 190,
  width: 80,
  height: 40,
  texts: [text],
  truncated: false,
  ...overrides,
});
const line = (value: FilmReviewMeasurement) =>
  `${FILM_REVIEW_MEASUREMENT_MARKER} ${JSON.stringify(value)}`;

test("WCAG sRGB luminance and unrounded strict 3:1 review threshold", () => {
  assert.equal(relativeLuminance(0, 0, 0), 0);
  assert.equal(relativeLuminance(255, 255, 255), 1);
  assert.equal(contrastRatio(0, 1), 21);
  assert.equal(LOW_TEXT_CONTRAST_RATIO, 3);
  assert.ok(Math.abs(contrastRatio(0.1, 0.4) - 3) < 1e-12);
  assert.ok(contrastRatio(0.10001, 0.4) < 3);
  assert.ok(Math.abs(relativeLuminance(128, 128, 128) - 0.21586) < 0.00001);
});

test("local grid catches both dark-on-dark and a light/dark boundary hidden by the whole-rect average", () => {
  const split = measure(
    image((_x, y) => (y < 20 ? [40, 40, 40] : [245, 245, 245])),
  );
  assert.equal(split.worst!.row, 0);
  assert.ok(split.worst!.contrastRatio < 1.5);
  assert.ok(measure(image(() => [245, 245, 245])).worst!.contrastRatio > 10);
  const right = measure(
    image((x) => (x < 60 ? [245, 245, 245] : [40, 40, 40])),
  );
  assert.equal(right.worst!.column, 3);
  assert.ok(right.worst!.contrastRatio < 1.5);
});

test("identical colors are flagged instead of filtered into an unknown or pass", () => {
  const result = measure(image(() => [20, 20, 20]));
  assert.ok(Math.abs(result.worst!.contrastRatio - 1) < 1e-12);
  assert.equal(result.unknown, undefined);
});

test("glyph-core masking tolerates JPEG color noise without manufacturing low contrast", () => {
  const clean = measure(image(() => [245, 245, 245]));
  const glyphs = measure(
    image((x, y) => ((x + y) % 3 === 0 ? [23, 21, 20] : [245, 245, 245])),
  );
  assert.ok(
    Math.abs(glyphs.worst!.contrastRatio - clean.worst!.contrastRatio) < 1e-12,
  );
  assert.ok(glyphs.worst!.pixels < clean.worst!.pixels);
});

test("rendered plates, outlines and shadows contribute pixels instead of a style-based exemption", () => {
  assert.ok(
    measure(image(() => [42, 42, 42])).worst!.contrastRatio < 3,
    "a dark plate cannot exempt dark text",
  );
  assert.ok(
    measure(image(() => [240, 240, 240])).worst!.contrastRatio > 3,
    "a light plate supports dark text",
  );
  const white: Partial<Text> = { color: [255, 255, 255, 1] };
  assert.equal(
    measure(
      image(() => [255, 255, 255]),
      white,
    ).worst!.contrastRatio,
    1,
  );
  const outlined = measure(
    image((x) => (x % 5 === 0 ? [0, 0, 0] : [255, 255, 255])),
    white,
  );
  assert.equal(
    outlined.worst!.contrastRatio,
    21,
    "actual black outline pixels support white text",
  );
  const faintShadow = measure(
    image((x) => (x % 5 === 0 ? [200, 200, 200] : [255, 255, 255])),
    white,
  );
  assert.ok(
    faintShadow.worst!.contrastRatio < 3,
    "a faint shadow cannot exempt unreadable white text",
  );
});

test("opacity is composited against pixels; sampling uses actual image dimensions", () => {
  const white = image(() => [255, 255, 255]);
  assert.ok(measure(white).worst!.contrastRatio > 3);
  assert.ok(
    measure(white, { color: [20, 20, 20, 0.1] }).worst!.contrastRatio < 3,
  );
  const scaled = measureTextContrast({
    text: { ...text, rect: { x: 0, y: 0, width: 160, height: 80 } },
    image: white,
    width: 160,
    height: 80,
  });
  assert.deepEqual(scaled, measure(white));
});

test("incomplete pixels, absent colors and subpixel/clipped cells remain unknown without erasing a confirmed low cell", () => {
  const dark = image(() => [40, 40, 40]);
  assert.match(measure(dark, { color: undefined }).unknown!, /fill/u);
  assert.match(
    measure({ ...dark, pixels: new Uint8Array(1) }).unknown!,
    /incomplete/u,
  );
  assert.match(
    measure(dark, { rect: { x: -70, y: 0, width: 80, height: 40 } }).unknown!,
    /cells/u,
  );
  assert.ok(
    measure(dark, { rect: { x: -70, y: 0, width: 80, height: 40 } }).worst!
      .contrastRatio < 3,
  );
});

test("review aggregates frame evidence, annotates transitions and grouped morphs, and retains unknown separately", () => {
  const result = analyzeReviewReadability({
    output: [
      line(record()),
      line(
        record({
          index: 1,
          frame: 200,
          transitionWindow: true,
          texts: [{ ...text, textGroup: "number-roll" }],
        }),
      ),
      line(record({ index: 2, frame: 210 })),
    ].join("\n"),
    frames: [190, 200, 210],
    width: 80,
    height: 40,
    contrastFrames: new Map([
      [
        0,
        { image: image((_x, y) => (y < 20 ? [40, 40, 40] : [245, 245, 245])) },
      ],
      [1, { image: image(() => [40, 40, 40]) }],
      [2, { error: "pixel decoder failed" }],
    ]),
    contrastMs: 25,
  });
  const warnings = result.readabilityWarnings.filter(
    (w) => w.rule === "low-contrast-text",
  );
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0].frames, [190, 200]);
  assert.match(warnings[0].message, /训练账单.*f190 上左.*[\d.]+:1/u);
  assert.match(warnings[0].message, /转场窗口内：frames 200/u);
  assert.match(warnings[0].message, /同组形变（number-roll）：frames 200/u);
  assert.equal(warnings[0].measurements[1].textGroup, "number-roll");
  assert.deepEqual(
    result.readability.unknown.filter((u) => u.rule === "low-contrast-text"),
    [
      {
        rule: "low-contrast-text",
        frame: 210,
        snippet: text.snippet,
        reason: "pixel decoder failed",
      },
    ],
  );
  assert.equal(result.readability.contrast.measuredTexts, 2);
  assert.ok(result.readability.contrast.analysisMs >= 25);
});

test("contrast also checks captions; old telemetry and missing images never count as passes", () => {
  for (const caption of [false, true]) {
    const result = analyzeReviewReadability({
      output: line(record({ texts: [{ ...text, caption }] })),
      frames: [190],
      width: 80,
      height: 40,
      contrastFrames: new Map([[0, { image: image(() => [40, 40, 40]) }]]),
    });
    assert.equal(
      result.readabilityWarnings.filter((w) => w.rule === "low-contrast-text")
        .length,
      1,
    );
  }
  for (const color of [undefined, text.color]) {
    const result = analyzeReviewReadability({
      output: line(record({ texts: [{ ...text, color }] })),
      frames: [190],
      width: 80,
      height: 40,
    });
    assert.equal(result.readability.contrast.measuredTexts, 0);
    assert.equal(
      result.readability.unknown.filter((u) => u.rule === "low-contrast-text")
        .length,
      1,
    );
  }
});

// Minimal RGB PNG with explicit scanline filters; CRC is not consumed by the decoder.
const rgbPng = (filter = 0) => {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const pixels = [10, 32, 13, 255, 0, 1, 80, 90, 100, 60, 70, 80];
  const raw: number[] = [];
  for (let y = 0; y < 2; y++) {
    raw.push(filter);
    for (let x = 0; x < 6; x++) {
      const left = x >= 3 ? pixels[y * 6 + x - 3] : 0;
      const up = y ? pixels[x] : 0;
      const corner = x >= 3 && y ? pixels[x - 3] : 0;
      const p = left + up - corner;
      const dl = Math.abs(p - left),
        du = Math.abs(p - up),
        dc = Math.abs(p - corner);
      const predict =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : filter === 4
                ? dl <= du && dl <= dc
                  ? left
                  : du <= dc
                    ? up
                    : corner
                : 0;
      raw.push((pixels[y * 6 + x] - predict) & 255);
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

test("RGB PNG decodes all five filters using RGB byte strides", () => {
  for (const filter of [0, 1, 2, 3, 4]) {
    const decoded = decodeRgbPng(rgbPng(filter));
    assert.equal(decoded.width, 2);
    assert.equal(decoded.height, 2);
    assert.deepEqual(
      [...decoded.pixels],
      [10, 32, 13, 255, 0, 1, 80, 90, 100, 60, 70, 80],
    );
  }
  assert.throws(() => decodeRgbPng(Buffer.from("bad")), /PNG/u);
  assert.throws(() => decodeRgbPng(rgbPng(5)), /filter/u);
});

test("pixel reader decodes only an existing still using explicit software decoding and reports errors", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "contrast-test-"));
  const pixelsPath = join(scratch, "frame.png");
  try {
    const result = await readReviewFramePixels({
      rootDir: process.cwd(),
      imagePath: "/existing/review.jpeg",
      pixelsPath,
      runProcess: async (_command, args) => {
        assert.ok(args.includes("ffmpeg"));
        assert.deepEqual(
          args.slice(args.indexOf("-hwaccel"), args.indexOf("-hwaccel") + 2),
          ["-hwaccel", "none"],
        );
        assert.ok(args.includes("/existing/review.jpeg"));
        await writeFile(pixelsPath, rgbPng());
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.deepEqual(
      [...result.pixels],
      [10, 32, 13, 255, 0, 1, 80, 90, 100, 60, 70, 80],
    );
    await assert.rejects(
      readReviewFramePixels({
        rootDir: process.cwd(),
        imagePath: "/missing.jpeg",
        pixelsPath,
        runProcess: async () => ({
          status: 1,
          stdout: "",
          stderr: "decode unavailable",
        }),
      }),
      /decode unavailable/u,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
