import { countCaptionDisplayHalfUnits } from "../../contracts/film";

// Keep currency, grouped/decimal numbers, model names and word + version together.
const ATOM =
  /[$€£¥]?\d+(?:[,.]\d+)*(?:%|‰)?|[A-Za-z][A-Za-z0-9]*(?:[-'’][A-Za-z0-9]+)*(?:[ \t]+\d+(?:\.\d+)*)?/gu;
const PUNCTUATION_BREAK = /[，。、；：？！,;:?!]$/u;
const LINE_START_PUNCTUATION = /^[\p{P}]/u;
const MIN_LINE_HALF_UNITS = 3;

/** Deterministic screen-copy layout. Atomic words may overflow if the caller
 * provides less width than a word needs; never corrupt it or create a third line. */
export const resolveCaptionLines = (
  text: string,
  maxHalfUnitsPerLine: number,
): string[] => {
  if (!Number.isFinite(maxHalfUnitsPerLine) || maxHalfUnitsPerLine <= 0)
    throw new Error("Caption line width must be a positive finite number.");
  const copy = text.replace(/\s+/gu, " ").trim();
  if (countCaptionDisplayHalfUnits(copy) <= maxHalfUnitsPerLine) return [copy];
  const boundaries = new Set<number>();
  // Grapheme boundaries avoid splitting emoji, combining marks and surrogate pairs.
  const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
  for (const { index } of segmenter.segment(copy))
    if (index > 0) boundaries.add(index);
  for (const match of copy.matchAll(ATOM))
    for (const boundary of boundaries)
      if (boundary > match.index && boundary < match.index + match[0].length)
        boundaries.delete(boundary);
  const candidates = [...boundaries].flatMap((index) => {
    const left = copy.slice(0, index).trimEnd();
    const right = copy.slice(index).trimStart();
    if (!left || !right || LINE_START_PUNCTUATION.test(right)) return [];
    const a = countCaptionDisplayHalfUnits(left);
    const b = countCaptionDisplayHalfUnits(right);
    if (Math.min(a, b) <= MIN_LINE_HALF_UNITS) return [];
    return [
      {
        lines: [left, right],
        overflow: Math.max(0, a - maxHalfUnitsPerLine, b - maxHalfUnitsPerLine),
        priority: PUNCTUATION_BREAK.test(left)
          ? 0
          : /\s/u.test(copy[index - 1] + copy[index])
            ? 1
            : 2,
        imbalance: Math.abs(a - b),
        nearMiddle: Math.abs(a - b) <= Math.max(8, (a + b) * 0.35),
      },
    ];
  });
  candidates.sort(
    (a, b) =>
      a.overflow - b.overflow ||
      Number(b.nearMiddle) - Number(a.nearMiddle) ||
      a.priority - b.priority ||
      a.imbalance - b.imbalance,
  );
  return candidates[0]?.lines ?? [copy];
};
