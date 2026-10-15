import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  FILM_BOOKEND_TEMPLATES,
  FilmSpecSchema,
  resolveFilmBookendFrames,
} from "@axmorf/studio/contracts";

import { AXMORF_SCENE_TEMPLATE_TIMING } from "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/timing";
import { resolveFilmRuntime } from "../../packages/studio/src/remotion/film/context";
import {
  decodeGrayPng,
  meanAbsoluteDifference,
} from "../../scripts/films/frame-compare";
import { findStillStretches } from "../../scripts/films/review";

const spec = {
  schemaVersion: 1,
  filmId: "bookend-check",
  render: { width: 1080, height: 1920, fps: 30 },
  timeline: { durationInFrames: 300 },
  narration: [],
  publish: { title: "Bookends" },
};

test("bookend durations follow the system scene templates", () => {
  for (const [id, { durationAt30Fps }] of Object.entries(
    FILM_BOOKEND_TEMPLATES,
  )) {
    assert.equal(
      durationAt30Fps,
      AXMORF_SCENE_TEMPLATE_TIMING[
        id as keyof typeof AXMORF_SCENE_TEMPLATE_TIMING
      ].durationInFrames,
    );
  }
});

test("bookends default to a dark theme with no sources and scale with fps", () => {
  const parsed = FilmSpecSchema.parse({
    ...spec,
    bookends: { intro: "axmorf-brand-reveal-v1", outro: null },
  });
  assert.deepEqual(parsed.bookends, {
    intro: "axmorf-brand-reveal-v1",
    outro: null,
    theme: "dark",
    sources: [],
  });
  assert.deepEqual(resolveFilmBookendFrames(parsed), {
    introFrames: 60,
    outroFrames: 0,
  });
  assert.deepEqual(
    resolveFilmBookendFrames({
      render: { fps: 60 },
      bookends: { ...parsed.bookends!, outro: "axmorf-source-follow-v1" },
    }),
    { introFrames: 120, outroFrames: 480 },
  );
  assert.deepEqual(resolveFilmBookendFrames(FilmSpecSchema.parse(spec)), {
    introFrames: 0,
    outroFrames: 0,
  });
  assert.equal(
    FilmSpecSchema.safeParse({
      ...spec,
      bookends: { intro: "axmorf-source-follow-v1", outro: null },
    }).success,
    false,
    "the outro template cannot open a film",
  );
});

test("the runtime keeps body frames and adds bookends to the delivered length", () => {
  const runtime = resolveFilmRuntime({
    spec: {
      ...spec,
      bookends: {
        intro: "axmorf-brand-reveal-v1",
        outro: "axmorf-source-follow-v1",
      },
    },
    timing: null,
    music: null,
  });
  assert.equal(runtime.durationInFrames, 300);
  assert.equal(runtime.totalDurationInFrames, 600);
});

/** Builds an 8-bit grayscale PNG using the given row filter. */
const grayPng = (width: number, rows: number[][], filter = 0) => {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([
      length,
      Buffer.from(type, "latin1"),
      data,
      Buffer.alloc(4),
    ]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  const raw = Buffer.concat(
    rows.map((row, index) => {
      const encoded = row.map((value, x) => {
        const left = x > 0 ? row[x - 1]! : 0;
        const up = index > 0 ? rows[index - 1]![x]! : 0;
        return (value - (filter === 1 ? left : filter === 2 ? up : 0)) & 0xff;
      });
      return Buffer.from([filter, ...encoded]);
    }),
  );
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

test("review frame signatures decode filtered grayscale PNGs", () => {
  const rows = [
    [10, 20, 30],
    [40, 50, 60],
  ];
  for (const filter of [0, 1, 2]) {
    assert.deepEqual(
      [...decodeGrayPng(grayPng(3, rows, filter)).pixels],
      rows.flat(),
    );
  }
  assert.equal(
    meanAbsoluteDifference(Uint8Array.from([0, 10]), Uint8Array.from([4, 6])),
    4,
  );
});

test("only long stretches without visible change are flagged", () => {
  const flat = new Uint8Array(16).fill(100);
  const nudged = new Uint8Array(16).fill(101);
  const changed = new Uint8Array(16).fill(140);
  const stretches = findStillStretches({
    fps: 30,
    frames: [
      { frame: 1521, signature: nudged },
      { frame: 1400, signature: flat },
      { frame: 1349, signature: changed },
      { frame: 1330, signature: changed },
    ],
  });
  assert.deepEqual(
    stretches.map(({ frames, seconds }) => ({ frames, seconds })),
    [{ frames: [1400, 1521], seconds: 4 }],
    "a short hold (1330→1349) and a real change (1349→1400) are not flagged",
  );
});
