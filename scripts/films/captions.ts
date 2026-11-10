import {
  splitFilmCaptionClauses,
  type FilmSpec,
} from "@axmorf/studio/contracts";

/** Three or more consecutive pronunciation numerals merit explicit screen copy. */
export const CAPTION_SPOKEN_NUMERALS_MIN_RUN = 3;
const SPOKEN_NUMERALS = new RegExp(
  `[零一二两三四五六七八九十百千万亿点]{${CAPTION_SPOKEN_NUMERALS_MIN_RUN},}`,
  "u",
);

/** Authoring hints only; never changes text, timing, fingerprints or delivery gates. */
export const analyzeFilmCaptions = (spec: Pick<FilmSpec, "narration">) => {
  const captionWarnings: {
    rule: "caption-spoken-numerals" | "karaoke-clause-mismatch";
    sentenceId: string;
    text: string;
    message: string;
  }[] = [];
  for (const { id, text, caption } of spec.narration) {
    if (caption === undefined && SPOKEN_NUMERALS.test(text))
      captionWarnings.push({
        rule: "caption-spoken-numerals",
        sentenceId: id,
        text,
        message: `句子 ${id} 的 text 含连续 ${CAPTION_SPOKEN_NUMERALS_MIN_RUN} 个以上中文数字字符；请补 caption 显示数字、型号或货币符号，text 保留 TTS 念法。`,
      });
    if (
      caption !== undefined &&
      splitFilmCaptionClauses(caption).length !==
        splitFilmCaptionClauses(text).length
    )
      captionWarnings.push({
        rule: "karaoke-clause-mismatch",
        sentenceId: id,
        text,
        message: `句子 ${id} 的 caption 与 text 分句数不一致；karaoke 将按整句时间线性扫过。请保持相同的分句标点；精度是分句级估计，不是逐字对齐。`,
      });
  }
  return { captionWarnings };
};
