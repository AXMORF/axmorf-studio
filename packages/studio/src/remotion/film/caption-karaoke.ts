import {
  countCaptionDisplayHalfUnits,
  splitFilmCaptionClauses,
  type FilmTiming,
} from "../../contracts/film";

type Sentence = FilmTiming["sentences"][number];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const progressAt = (frame: number, start: number, end: number) =>
  end <= start ? Number(frame >= end) : clamp((frame - start) / (end - start));

/** Keep word shaping intact within each fragment. A clause split across lines
 * spends its display half-units on line one before advancing onto line two. */
export const resolveKaraokeLines = (
  sentence: Sentence,
  lines: readonly string[],
  frame: number,
): { text: string; progress: number }[][] => {
  const copy = (sentence.caption ?? sentence.text).replace(/\s+/gu, " ").trim();
  const display = splitFilmCaptionClauses(copy);
  const spoken = splitFilmCaptionClauses(sentence.text);
  const aligned =
    display.length === spoken.length &&
    sentence.clauses?.length === spoken.length &&
    sentence.clauses.every((clause, i) => clause.text === spoken[i]);
  const texts = aligned ? display : [copy];
  let offset = 0;
  const clauses = texts.map((text, index) => {
    const start = offset;
    offset = copy.indexOf(text, offset) + text.length;
    const timing = aligned ? sentence.clauses![index] : sentence;
    return {
      start,
      end: offset,
      units: countCaptionDisplayHalfUnits(copy.slice(start, offset)),
      progress: progressAt(frame, timing.startFrame, timing.endFrame),
    };
  });
  offset = 0;
  return lines.map((line) => {
    const start = copy.indexOf(line, offset);
    const end = start + line.length;
    offset = end;
    return clauses.flatMap((clause) => {
      const from = Math.max(start, clause.start);
      const to = Math.min(end, clause.end);
      if (from >= to) return [];
      const text = copy.slice(from, to);
      const before = countCaptionDisplayHalfUnits(
        copy.slice(clause.start, from),
      );
      return [
        {
          text,
          progress: clamp(
            (clause.progress * clause.units - before) /
              countCaptionDisplayHalfUnits(text),
          ),
        },
      ];
    });
  });
};
