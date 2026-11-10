import type { FilmSpec } from "@axmorf/studio/contracts";

/** Three or more consecutive pronunciation numerals merit explicit screen copy. */
export const CAPTION_SPOKEN_NUMERALS_MIN_RUN = 3;
const SPOKEN_NUMERALS = new RegExp(
  `[零一二两三四五六七八九十百千万亿点]{${CAPTION_SPOKEN_NUMERALS_MIN_RUN},}`,
  "u",
);

/** Authoring hints only; never changes text, timing, fingerprints or delivery gates. */
export const analyzeFilmCaptions = (spec: Pick<FilmSpec, "narration">) => ({
  captionWarnings: spec.narration.flatMap(({ id, text, caption }) =>
    caption === undefined && SPOKEN_NUMERALS.test(text)
      ? [
          {
            rule: "caption-spoken-numerals" as const,
            sentenceId: id,
            text,
            message: `句子 ${id} 的 text 含连续 ${CAPTION_SPOKEN_NUMERALS_MIN_RUN} 个以上中文数字字符；请补 caption 显示数字、型号或货币符号，text 保留 TTS 念法。`,
          },
        ]
      : [],
  ),
});
