import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FilmMotionReviewSchema,
  FILM_CONTACT_SHEET_ID,
} from "@axmorf/studio/contracts";
import {
  renderStrongAccentStrips,
  selectStrongAccentStrips,
} from "../../scripts/films/strong-accent-strips";

const options = {
  rootDir: "/unused",
  filmId: "probe",
  scratch: "/unused",
  width: 1920,
  height: 1080,
  durationInFrames: 100,
  timeoutMs: 120_000,
};

test("strong accent strips include every frame in [f-8,f+4], include .9, deduplicate and clip to the body", () => {
  const selected = selectStrongAccentStrips(
    [
      { frame: 99, strength: 1 },
      { frame: 20, strength: 0.9 },
      { frame: 20, strength: 0.95 },
      { frame: 40, strength: 0.8999 },
      { frame: 0, strength: 1 },
      { frame: -1, strength: 1 },
      { frame: 100, strength: 1 },
    ],
    100,
  );
  assert.deepEqual(selected, [
    { frame: 0, strength: 1, frames: [0, 1, 2, 3, 4] },
    {
      frame: 20,
      strength: 0.95,
      frames: Array.from({ length: 13 }, (_, i) => 12 + i),
    },
    {
      frame: 99,
      strength: 1,
      frames: Array.from({ length: 9 }, (_, i) => 91 + i),
    },
  ]);
  assert.deepEqual(selectStrongAccentStrips(null, 100), []);
  const many = Array.from({ length: 40 }, (_, i) => ({
    frame: 10 + i * 20,
    strength: 1,
  }));
  assert.equal(
    selectStrongAccentStrips(many, 1000).length,
    40,
    "Do not silently cap the strong accents at a contact-sheet budget.",
  );
});

test("every strong accent gets a labeled contact sheet and output path, with shared overlap frames rendered once", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-strips-"));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const scratch = join(rootDir, "scratch");
  await mkdir(scratch);
  let renderedFrames: readonly number[] = [],
    renderCalls = 0;
  const sheets: {
    cells: { image: string; label: string }[];
    columns: number;
    cellWidth: number;
    cellHeight: number;
  }[] = [];
  const result = await renderStrongAccentStrips({
    ...options,
    rootDir,
    scratch,
    accents: [
      { frame: 10, strength: 1 },
      { frame: 15, strength: 0.9 },
    ],
    renderFrames: async (frames, onImage) => {
      renderCalls++;
      renderedFrames = frames;
      for (const frame of frames) {
        const source = join(scratch, `${frame}.jpeg`);
        await writeFile(source, `frame ${frame}`);
        await onImage(frame, source);
      }
    },
    renderSheet: async ({
      compositionId,
      propsPath,
      outputPath,
      timeoutMs,
    }) => {
      assert.equal(compositionId, FILM_CONTACT_SHEET_ID);
      assert.equal(timeoutMs, 120_000);
      sheets.push(JSON.parse(await readFile(propsPath, "utf8")));
      await writeFile(outputPath, "sheet");
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(renderCalls, 1);
  assert.deepEqual(
    renderedFrames,
    Array.from({ length: 18 }, (_, i) => i + 2),
  );
  assert.deepEqual(
    result.map((s) => s.frame),
    [10, 15],
  );
  assert.deepEqual(
    result.map((s) => s.image),
    [
      "out/films/probe/review/strong-accent-strips/f10.jpeg",
      "out/films/probe/review/strong-accent-strips/f15.jpeg",
    ],
  );
  for (const [i, strip] of result.entries()) {
    const props = sheets[i];
    assert.equal(props.columns, 3);
    assert.equal(props.cellWidth, 480);
    assert.equal(props.cellHeight, 270);
    assert.deepEqual(
      props.cells.map((c) => c.image),
      strip.frames.map(
        (f) => `films/probe/review/strong-accent-strips/frame-${f}.jpeg`,
      ),
    );
    assert.ok(
      props.cells.every((c, j) => c.label.startsWith(`f${strip.frames[j]} · `)),
    );
    assert.match(props.cells[strip.frames.indexOf(strip.frame)].label, /重音/u);
    assert.equal(await readFile(join(rootDir, strip.image), "utf8"), "sheet");
  }
  for (const frame of renderedFrames) {
    for (const directory of [
      "out/films/probe/review/strong-accent-strips",
      "public/films/probe/review/strong-accent-strips",
    ])
      assert.equal(
        await readFile(join(rootDir, directory, `frame-${frame}.jpeg`), "utf8"),
        `frame ${frame}`,
      );
  }
  assert.deepEqual(
    FilmMotionReviewSchema.shape.motion.shape["strong-accent-strip"].parse(
      result,
    ),
    result,
  );
});

test("without strength metadata or strong accents, strip export does no rendering", async () => {
  for (const accents of [null, [], [{ frame: 10, strength: 0.89 }]]) {
    const result = await renderStrongAccentStrips({
      ...options,
      accents,
      renderFrames: async () => assert.fail("must not render"),
      renderSheet: async () => assert.fail("must not render"),
    });
    assert.deepEqual(result, []);
  }
});

test("missing requested images and renderer failures are reported, without empty sheets or retries", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-strips-fail-"));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const scratch = join(rootDir, "scratch");
  await mkdir(scratch);
  let calls = 0;
  await assert.rejects(
    renderStrongAccentStrips({
      ...options,
      rootDir,
      scratch,
      accents: [{ frame: 10, strength: 1 }],
      renderFrames: async () => {
        calls++;
      },
      renderSheet: async () =>
        assert.fail("missing frames must not produce a sheet"),
    }),
    /frames are missing/u,
  );
  await assert.rejects(
    renderStrongAccentStrips({
      ...options,
      rootDir,
      scratch,
      accents: [{ frame: 10, strength: 1 }],
      renderFrames: async () => {
        calls++;
        throw new Error("render diagnostic");
      },
    }),
    /render diagnostic/u,
  );
  assert.equal(calls, 2);
});
