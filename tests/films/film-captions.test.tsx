import assert from "node:assert/strict";
import test from "node:test";
import {
  countCaptionDisplayHalfUnits,
  computeFilmTimingInputFingerprint,
  FilmSentenceSchema,
  FilmSpecSchema,
  FilmTimingSchema,
} from "@axmorf/studio/contracts";
import { resolveCaptionLines } from "../../packages/studio/src/remotion/film/FilmCaptions";
import {
  captionSpec as spec,
  captionTiming as timing,
  spoken,
  caption,
  renderCaptionFixture as render,
} from "../fixtures/film-captions";
import { buildFilmTiming } from "../../scripts/films/voice";
import {
  analyzeFilmCaptions,
  CAPTION_SPOKEN_NUMERALS_MIN_RUN,
} from "../../scripts/films/captions";

test("caption is optional, trimmed and subject to the same 72 half-unit limit", () => {
  assert.deepEqual(FilmSentenceSchema.parse({ id: "s", text: "原文" }), {
    id: "s",
    text: "原文",
  });
  assert.equal(
    FilmSentenceSchema.parse({ id: "s", text: spoken, caption: ` ${caption} ` })
      .caption,
    caption,
  );
  for (const invalid of ["", " ", "字".repeat(37)]) {
    const parsed = FilmSentenceSchema.safeParse({
      id: "s",
      text: spoken,
      caption: invalid,
    });
    assert.equal(parsed.success, false);
    if (!parsed.success)
      assert.deepEqual(parsed.error.issues[0].path, ["caption"]);
  }
  assert.equal(
    FilmSentenceSchema.safeParse({
      id: "s",
      text: "字".repeat(37),
      caption: "短字幕",
    }).success,
    false,
  );
  assert.equal(
    FilmSentenceSchema.safeParse({
      id: "s",
      text: spoken,
      caption: "字".repeat(36),
    }).success,
    true,
  );
});

test("caption edits preserve timing fingerprints, measured frames and legacy timing bytes", () => {
  const legacyBytes = JSON.stringify(timing);
  const edited = FilmSpecSchema.parse({
    ...spec,
    narration: [{ ...spec.narration[0], caption }],
  });
  assert.equal(
    computeFilmTimingInputFingerprint(edited),
    computeFilmTimingInputFingerprint(spec),
  );
  const updated = buildFilmTiming({
    spec: edited,
    sentenceSamples: [48_000],
    narration: null,
  });
  assert.equal(updated.sentences[0].caption, caption);
  const { caption: display, ...oldSentence } = updated.sentences[0];
  assert.equal(display, caption);
  assert.deepEqual({ ...updated, sentences: [oldSentence] }, timing);
  assert.equal(JSON.stringify(FilmTimingSchema.parse(timing)), legacyBytes);
  assert.equal(
    JSON.stringify(
      buildFilmTiming({ spec, sentenceSamples: [48_000], narration: null }),
    ),
    legacyBytes,
  );
});

test("useFilmTiming and captions use current screen copy without regenerating timing, including edits and removal", () => {
  assert.ok(render({}, caption).includes(caption));
  assert.ok(render({}, caption).includes(`data-timing="${caption}"`));
  assert.ok(!render({}, caption).includes(spoken));
  const saved = {
    ...timing,
    sentences: [{ ...timing.sentences[0], caption: "过期字幕" }],
  };
  assert.ok(render({}, "新字幕", saved).includes("新字幕"));
  assert.ok(!render({}, undefined, saved).includes("过期字幕"));
  assert.ok(render({}, undefined, saved).includes(spoken));
});

test("legacy box keeps its layout styles; paper and explicit copy use stable explicit lines with style overrides", () => {
  const box = render();
  assert.match(box, /text-wrap:balance;overflow-wrap:anywhere/);
  assert.match(box, /background-color:rgba\(10, 14, 24, 0.78\)/);
  assert.match(box, /data-axmorf-caption-box=""/);
  const paper = render({ variant: "paper" }, caption);
  assert.match(paper, /background-color:#fffefa/);
  assert.match(paper, /color:#30343b/);
  assert.match(paper, /rotate\(-0.65deg\)/);
  assert.match(paper, /white-space:pre/);
  assert.doesNotMatch(paper, /text-wrap:balance/);
  assert.match(paper, /<span style="position:relative">/);
  assert.match(
    render(
      {
        variant: "paper",
        style: { fontSize: 60, color: "red", backgroundColor: "white" },
      },
      caption,
    ),
    /font-size:60px/,
  );
  assert.match(
    render({ render: (sentence) => <b>{sentence.caption}</b> }, caption),
    /<b>这是 8,415/,
  );
});

test("line resolver leaves short captions alone and prefers punctuation near the middle", () => {
  assert.deepEqual(resolveCaptionLines("这是 8,415 个 H100 小时。", 40), [
    "这是 8,415 个 H100 小时。",
  ]);
  assert.deepEqual(resolveCaptionLines(caption, 31), [
    "这是 8,415 个 H100 小时，",
    "乘每小时 $2.5。",
  ]);
  assert.deepEqual(
    resolveCaptionLines("开头，先核对实际的费用，再解释数字。", 25),
    ["开头，先核对实际的费用，", "再解释数字。"],
  );
  for (const mark of "，。、；：？！") {
    assert.deepEqual(resolveCaptionLines(`这是前半句${mark}这是后半句。`, 18), [
      `这是前半句${mark}`,
      "这是后半句。",
    ]);
  }
});

test("line resolver preserves numbers, model names, words and named versions", () => {
  for (const atom of [
    "8,415",
    "H100",
    "$2.50",
    "Apache 2.0",
    "don't",
    "P-JiT",
  ]) {
    const lines = resolveCaptionLines(`核对${atom}的训练账单和实际成本`, 22);
    assert.equal(lines.length, 2, atom);
    assert.ok(
      lines.some((line) => line.includes(atom)),
      `${atom}: ${lines}`,
    );
    assert.equal(lines.join(""), `核对${atom}的训练账单和实际成本`);
    assert.ok(lines.every((line) => !/^\p{P}/u.test(line)));
  }
  assert.deepEqual(resolveCaptionLines("alpha beta gamma delta", 14), [
    "alpha beta",
    "gamma delta",
  ]);
});

test("line resolver balances CJK, avoids tiny tails and never creates more than two lines", () => {
  assert.deepEqual(resolveCaptionLines("一二三四五六七八九十", 12), [
    "一二三四五",
    "六七八九十",
  ]);
  const lines = resolveCaptionLines("这是一句比较长的字幕，尾。", 24);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => countCaptionDisplayHalfUnits(line) > 3));
  assert.ok(lines.every((line) => !/^\p{P}/u.test(line)));
  assert.deepEqual(resolveCaptionLines("Supercalifragilistic", 8), [
    "Supercalifragilistic",
  ]);
  const emoji = resolveCaptionLines("甲👩‍🔬乙丙丁戊己庚辛壬", 12);
  assert.ok(emoji.some((line) => line.includes("👩‍🔬")));
  for (const bad of [0, -1, Infinity, NaN])
    assert.throws(() => resolveCaptionLines("字", bad));
});

test("spoken-numeral hints use a constant threshold, skip explicit copy and do not block", () => {
  assert.equal(CAPTION_SPOKEN_NUMERALS_MIN_RUN, 3);
  const narration = [
    { id: "hours", text: spoken },
    { id: "size", text: "二十一亿参数" },
    { id: "data", text: "六点六亿样本" },
    { id: "short", text: "两人用十张卡" },
    { id: "display", text: spoken, caption },
  ];
  assert.deepEqual(
    analyzeFilmCaptions({ narration }).captionWarnings.map((w) => [
      w.rule,
      w.sentenceId,
    ]),
    [
      ["caption-spoken-numerals", "hours"],
      ["caption-spoken-numerals", "size"],
      ["caption-spoken-numerals", "data"],
    ],
  );
});
