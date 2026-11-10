import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  computeFilmTimingInputFingerprint,
  FilmTimingSchema,
  splitFilmCaptionClauses,
} from "@axmorf/studio/contracts";
import { resolveKaraokeLines } from "../../packages/studio/src/remotion/film/caption-karaoke";
import {
  captionSpec,
  captionTiming,
  caption,
  renderCaptionFixture,
} from "../fixtures/film-captions";
import {
  CAPTION_ENERGY_WINDOW_MS,
  CAPTION_MIN_PAUSE_MS,
  CAPTION_SILENCE_PEAK_RATIO,
  estimateFilmCaptionTiming,
  matchCaptionBoundaries,
} from "../../scripts/films/caption-timing";
import { encodeCanonicalPcmWav } from "../../scripts/narration/domain/pcm-wav";
import { analyzeFilmCaptions } from "../../scripts/films/captions";
import { filmPaths, sha256, writeJsonFile } from "../../scripts/films/files";
import { runFilmCli } from "../../scripts/films/cli";
import { buildFilmTiming } from "../../scripts/films/voice";

const audio = (durations: readonly number[]) => {
  const pcm = Buffer.alloc(durations.reduce((a, b) => a + b, 0) * 96);
  let offset = 0;
  durations.forEach((ms, i) => {
    for (let at = offset; at < offset + ms * 48; at++)
      pcm.writeInt16LE(i % 2 ? (at % 2 ? 5000 : -5000) : 0, at * 2);
    offset += ms * 48;
  });
  return encodeCanonicalPcmWav(pcm);
};
const wav = audio([100, 300, 200, 300, 100]);
const sampleTiming = (text = "前句，后句。", fps = 30) =>
  buildFilmTiming({
    spec: {
      ...captionSpec,
      render: { ...captionSpec.render, fps },
      timeline: { narrationStartFrame: 15, tailFrames: 2 },
      narration: [{ id: "hours", text }],
    },
    sentenceSamples: [48_000],
    narration: null,
  });

test("shared clause splitting retains punctuation runs and protects display numbers", () => {
  assert.deepEqual(
    splitFilmCaptionClauses("你好？！这是 8,415 个 H100，约 $2.5。"),
    ["你好？！", "这是 8,415 个 H100，", "约 $2.5。"],
  );
  assert.deepEqual(splitFilmCaptionClauses("甲、乙；丙：丁！戊？己。"), [
    "甲、",
    "乙；",
    "丙：",
    "丁！",
    "戊？",
    "己。",
  ]);
});

test("PCM estimates use interior pauses, exclude edge padding and follow cumulative sample frame rounding", () => {
  assert.equal(CAPTION_ENERGY_WINDOW_MS, 10);
  assert.equal(CAPTION_MIN_PAUSE_MS, 120);
  assert.equal(CAPTION_SILENCE_PEAK_RATIO, 0.06);
  for (const fps of [24, 25, 30, 60]) {
    const original = sampleTiming(undefined, fps);
    const before = JSON.stringify(original);
    const result = estimateFilmCaptionTiming(original, wav);
    assert.deepEqual(result.timing.sentences[0].clauses, [
      {
        text: "前句，",
        startFrame: 15 + Math.ceil(0.1 * fps),
        endFrame: 15 + Math.ceil(0.4 * fps),
        source: "pause",
      },
      {
        text: "后句。",
        startFrame: 15 + Math.ceil(0.6 * fps),
        endFrame: 15 + Math.ceil(0.9 * fps),
        source: "pause",
      },
    ]);
    assert.equal(result.diagnostics[0].detectedPauses, 1);
    assert.equal(result.timing.sentences[0].estimated, undefined);
    assert.equal(JSON.stringify(original), before);
    assert.equal(result.timing.inputFingerprint, original.inputFingerprint);
    assert.deepEqual(estimateFilmCaptionTiming(original, wav), result);
  }
});

test("missing pauses retain measured boundaries and interpolate only inside adjacent anchors", () => {
  const timing = sampleTiming("甲，乙乙，丙。");
  const { timing: result, diagnostics } = estimateFilmCaptionTiming(
    timing,
    wav,
  );
  const sentence = result.sentences[0];
  assert.equal(sentence.estimated, "proportional");
  assert.equal(diagnostics[0].punctuationBoundaries, 2);
  assert.equal(diagnostics[0].detectedPauses, 1);
  assert.deepEqual(
    sentence.clauses?.map((c) => [c.startFrame, c.endFrame, c.source]),
    [
      [18, 27, "pause"],
      [33, 39, "proportional"],
      [39, 42, "proportional"],
    ],
  );
  assert.equal(
    estimateFilmCaptionTiming(sampleTiming("一整句。"), wav).timing.sentences[0]
      .estimated,
    undefined,
  );
  const silent = estimateFilmCaptionTiming(sampleTiming(), audio([1000]));
  assert.equal(silent.timing.sentences[0].estimated, "proportional");
  assert.deepEqual(
    silent.timing.sentences[0].clauses?.map((c) => [c.startFrame, c.endFrame]),
    [
      [15, 30],
      [30, 45],
    ],
  );
  const shortGap = estimateFilmCaptionTiming(
    sampleTiming(),
    audio([100, 350, 100, 350, 100]),
  );
  assert.equal(shortGap.diagnostics[0].detectedPauses, 0);
  assert.throws(
    () => estimateFilmCaptionTiming(timing, Buffer.alloc(44)),
    /RIFF/,
  );
});

test("optimal pause matching handles excess, missing, empty and tied candidates deterministically", () => {
  // A nearest-first greedy choice would consume .45 for .4, then .9 for .5.
  assert.deepEqual(
    matchCaptionBoundaries([0.4, 0.5], [0.1, 0.45, 0.9]),
    [0, 1],
  );
  assert.deepEqual(
    matchCaptionBoundaries([0.2, 0.4], [0.01, 0.21, 0.45]),
    [1, 2],
  );
  assert.deepEqual(matchCaptionBoundaries([0.1, 0.45, 0.9], [0.4, 0.5]), [
    0,
    1,
    null,
  ]);
  assert.deepEqual(matchCaptionBoundaries([0.25, 0.75], [0.5]), [0, null]);
  assert.deepEqual(matchCaptionBoundaries([0.5], [0.25, 0.75]), [0]);
  assert.deepEqual(matchCaptionBoundaries([0.3, 0.6], []), [null, null]);
  assert.deepEqual(matchCaptionBoundaries([], [0.3, 0.6]), []);
});

test("excess pauses are ignored without discarding correctly matched boundaries", () => {
  const timing = sampleTiming();
  const result = estimateFilmCaptionTiming(
    timing,
    audio([50, 200, 150, 150, 150, 250, 50]),
  );
  const diagnostic = result.diagnostics[0];
  assert.equal(diagnostic.detectedPauses, 2);
  assert.equal(diagnostic.matchedBoundaries, 1);
  assert.equal(diagnostic.ignoredPauses, 1);
  assert.equal(diagnostic.source, "pause");
  assert.equal(result.timing.sentences[0].estimated, undefined);
  assert.ok(
    result.timing.sentences[0].clauses!.every((c) => c.source === "pause"),
  );
  assert.equal(diagnostic.boundaries[0].pauseIndex, 1);
  // No punctuation means every interior silence is irrelevant to clause timing.
  const one = estimateFilmCaptionTiming(sampleTiming("整句。"), wav);
  assert.equal(one.diagnostics[0].ignoredPauses, 1);
  assert.equal(one.diagnostics[0].source, "pause");
});

test("several missing boundaries remain monotone between retained pauses at every tested fps", () => {
  for (const fps of [24, 25, 30, 60]) {
    const original = sampleTiming("甲，乙，丙，丁，戊。", fps);
    const { timing: result, diagnostics } = estimateFilmCaptionTiming(
      original,
      wav,
    );
    assert.equal(diagnostics[0].source, "mixed");
    assert.equal(diagnostics[0].matchedBoundaries, 1);
    assert.equal(
      diagnostics[0].boundaries.filter((b) => b.source === "proportional")
        .length,
      3,
    );
    assert.equal(result.sentences[0].estimated, "proportional");
    let end = original.sentences[0].startFrame;
    for (const c of result.sentences[0].clauses!) {
      assert.ok(c.startFrame >= end && c.endFrame >= c.startFrame);
      end = c.endFrame;
    }
    assert.ok(end <= original.sentences[0].endFrame);
    assert.deepEqual(estimateFilmCaptionTiming(original, wav).timing, result);
  }
});

test("optional metadata parses old timing byte-for-byte and rejects overlapping/outside estimates", () => {
  assert.equal(
    JSON.stringify(FilmTimingSchema.parse(captionTiming)),
    JSON.stringify(captionTiming),
  );
  const result = estimateFilmCaptionTiming(sampleTiming(), wav).timing;
  for (const bounds of [
    [0, 20],
    [25, 50],
    [29, 28],
  ]) {
    const edited = structuredClone(result);
    Object.assign(edited.sentences[0].clauses![1], {
      startFrame: bounds[0],
      endFrame: bounds[1],
    });
    assert.equal(FilmTimingSchema.safeParse(edited).success, false);
  }
});

test("karaoke aligns different display/spoken spellings by clause and freezes through the pause", () => {
  const sentence = {
    ...sampleTiming().sentences[0],
    caption: "8,415 个 H100，$2.5。",
    clauses: [
      {
        text: "前句，",
        startFrame: 18,
        endFrame: 27,
        source: "pause" as const,
      },
      {
        text: "后句。",
        startFrame: 33,
        endFrame: 42,
        source: "pause" as const,
      },
    ],
  };
  const lines = ["8,415 个 H100，", "$2.5。"];
  assert.deepEqual(
    resolveKaraokeLines(sentence, lines, 15).map((l) =>
      l.map((f) => f.progress),
    ),
    [[0], [0]],
  );
  assert.deepEqual(
    resolveKaraokeLines(sentence, lines, 30).map((l) =>
      l.map((f) => f.progress),
    ),
    [[1], [0]],
  );
  assert.deepEqual(
    resolveKaraokeLines(sentence, lines, 37.5).map((l) =>
      l.map((f) => f.progress),
    ),
    [[1], [0.5]],
  );
  assert.deepEqual(
    resolveKaraokeLines(sentence, lines, 45).map((l) =>
      l.map((f) => f.progress),
    ),
    [[1], [1]],
  );
});

test("a clause crossing two lines finishes line one first; fallback sweeps whole sentence", () => {
  const sentence = {
    ...captionTiming.sentences[0],
    text: "甲乙丙丁。",
    caption: "甲乙丙丁。",
  };
  const lines = ["甲乙", "丙丁。"];
  assert.deepEqual(
    resolveKaraokeLines(sentence, lines, 12).map((l) => l[0].progress),
    [1, 0],
  );
  const progress = resolveKaraokeLines(sentence, lines, 18).map(
    (l) => l[0].progress,
  );
  assert.equal(progress[0], 1);
  assert.ok(Math.abs(progress[1] - 1 / 3) < 1e-9);
  const mismatch = {
    ...sentence,
    text: "甲，乙。",
    clauses: [
      { text: "甲，", startFrame: 0, endFrame: 10, source: "pause" as const },
      { text: "乙。", startFrame: 20, endFrame: 30, source: "pause" as const },
    ],
  };
  assert.deepEqual(
    resolveKaraokeLines(mismatch, lines, 18),
    resolveKaraokeLines(sentence, lines, 18),
  );
  const spaceCopy = {
    ...sentence,
    caption: "甲， 后半句。",
    text: "甲，后半句。",
    clauses: mismatch.clauses,
  };
  assert.equal(
    resolveKaraokeLines(spaceCopy, [spaceCopy.caption], 18)[0]
      .map((f) => f.text)
      .join(""),
    spaceCopy.caption,
  );
});

test("opt-in rendering uses continuous gradient fills, color overrides, custom render and unchanged defaults", () => {
  for (const variant of ["box", "paper"] as const) {
    assert.equal(
      renderCaptionFixture({ variant }),
      renderCaptionFixture({ variant, highlight: "none" }),
    );
    const html = renderCaptionFixture(
      { variant, highlight: "karaoke" },
      caption,
      undefined,
      1920,
      1080,
      15,
    );
    assert.match(html, /linear-gradient\(to right/);
    assert.match(html, /background-clip:text/);
    assert.match(html, /-webkit-text-fill-color:transparent/);
    assert.doesNotMatch(html, /animation:|transition:|scale\(/);
    assert.match(html, variant === "paper" ? /#9c3426/ : /#ffe08a/);
  }
  assert.match(
    renderCaptionFixture(
      { highlight: "karaoke", sungColor: "red", unsungColor: "blue" },
      caption,
      undefined,
      1920,
      1080,
      15,
    ),
    /linear-gradient\(to right, red 50%, blue 50%\)/,
  );
  assert.match(
    renderCaptionFixture(
      { highlight: "karaoke", render: (_s, p) => <b>{p}</b> },
      caption,
      undefined,
      1920,
      1080,
      15,
    ),
    /<b>0.5<\/b>/,
  );
  assert.doesNotMatch(
    renderCaptionFixture(
      { highlight: "karaoke" },
      caption,
      undefined,
      1920,
      1080,
      30,
    ),
    /data-axmorf-captions/,
  );
});

test("clause mismatch review is advisory, while display numerals do not introduce extra clauses", () => {
  const warnings = analyzeFilmCaptions({
    narration: [
      {
        id: "match",
        text: "八千小时，二点五美元。",
        caption: "8,000 小时，$2.5。",
      },
      {
        id: "mismatch",
        text: "八千小时，二点五美元。",
        caption: "8,000 小时 / $2.5。",
      },
    ],
  }).captionWarnings;
  assert.deepEqual(
    warnings.map((w) => [w.rule, w.sentenceId]),
    [["karaoke-clause-mismatch", "mismatch"]],
  );
});

test("film captions CLI is idempotent and never changes audio, voice inputs or sentence timing", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "film-karaoke-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const paths = filmPaths(rootDir, captionSpec.filmId);
  const original = sampleTiming();
  const spec = {
    ...captionSpec,
    timeline: { narrationStartFrame: 15, tailFrames: 2 },
    narration: [{ id: "hours", text: "前句，后句。" }],
  };
  original.narration = {
    publicPath: `public/films/${spec.filmId}/narration.wav`,
    checksum: sha256(wav),
    sampleRate: 48000,
    sampleFrameCount: 48000,
  };
  await writeJsonFile(paths.spec, spec);
  await writeJsonFile(paths.timing, original);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(paths.publicDir, { recursive: true });
  await writeFile(paths.narrationWav, Uint8Array.from(wav));
  const stdout: string[] = [];
  const contextCli = {
    rootDir,
    env: {},
    stdout: (s: string) => stdout.push(s),
  };
  await runFilmCli(["captions", "--film", spec.filmId], contextCli);
  const first = await readFile(paths.timing, "utf8");
  const result = JSON.parse(first);
  assert.equal(
    result.inputFingerprint,
    computeFilmTimingInputFingerprint(spec),
  );
  const { clauses, estimated, ...unchanged } = result.sentences[0];
  assert.equal(clauses.length, 2);
  assert.equal(estimated, undefined);
  assert.deepEqual({ ...result, sentences: [unchanged] }, original);
  assert.deepEqual(await readFile(paths.narrationWav), wav);
  assert.equal(JSON.parse(stdout[0]).status, "film-captions-ready");
  await runFilmCli(["captions", "--film", spec.filmId], contextCli);
  assert.equal(await readFile(paths.timing, "utf8"), first);
  await writeFile(paths.narrationWav, Uint8Array.from(audio([1000])));
  await assert.rejects(
    runFilmCli(["captions", "--film", spec.filmId], contextCli),
    /changed/,
  );
  assert.equal(await readFile(paths.timing, "utf8"), first);
  await writeJsonFile(paths.spec, {
    ...spec,
    narration: [{ id: "hours", text: "修改旁白。" }],
  });
  await assert.rejects(
    runFilmCli(["captions", "--film", spec.filmId], contextCli),
    /older than/,
  );
});
