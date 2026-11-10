import { useReviewMotion } from "../../film/review-motion";
import { measureText } from "@remotion/layout-utils";
import { useId, useMemo } from "react";
import { random, useCurrentFrame } from "remotion";
import {
  clamp,
  finite,
  integer,
  mix,
  positive,
  PRODUCER_RECIPE_CATALOG,
  recipeCues,
  resolveProducerRecipeTiming,
  type ProducerRecipeTiming,
  type ProducerRecipeFrameProps,
} from "./core";

export type AxiomGlyph = Readonly<{ text: string; x: number; width: number }>;
export type AxiomTextLayout = Readonly<{
  glyphs: readonly AxiomGlyph[];
  width: number;
}>;
export type AxiomTextStyle = Readonly<{
  fontFamily: string;
  fontSize: number;
  fontWeight?: number | string;
}>;
export const splitAxiomGlyphs = (text: string): string[] =>
  Array.from(
    new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text),
    ({ segment }) => segment,
  );
/** Browser-only measurement, after the caller's local fonts have loaded.
 * Each grapheme is independently painted (no cross-glyph ligatures/kerning). */
export const measureAxiomText = (
  text: string,
  style: AxiomTextStyle,
): AxiomTextLayout => {
  positive(style.fontSize, "fontSize");
  let width = 0;
  const glyphs = splitAxiomGlyphs(text).map((text) => {
    const measured = measureText({
      ...style,
      text,
      additionalStyles: { whiteSpace: "pre" },
    }).width;
    const glyph = { text, x: width, width: measured };
    width += measured;
    return glyph;
  });
  return { glyphs, width };
};
export type AxiomMorphOptions = ProducerRecipeTiming &
  Readonly<{
    mode: "assemble" | "scatter" | "shatter" | "reform";
    text: AxiomTextLayout;
    nextText?: AxiomTextLayout;
    seed?: string;
    spread?: number;
    /** 4, 8, 12 or 16 triangular clips per departing glyph. Defaults to 8. */
    fragments?: number;
  }>;
const checkLayout = (layout: AxiomTextLayout) => {
  positive(layout.width, "text width");
  integer(layout.glyphs.length, 1, 160, "glyph count");
  let end = 0;
  for (const glyph of layout.glyphs) {
    finite(glyph.x, "glyph x");
    if (
      glyph.x < end ||
      glyph.width < 0 ||
      !Number.isFinite(glyph.width) ||
      splitAxiomGlyphs(glyph.text).length !== 1
    )
      throw new Error("Invalid glyph layout.");
    end = glyph.x + glyph.width;
  }
  if (end > layout.width + 0.01) throw new Error("Glyphs exceed text width.");
};
/** Stable FIFO matching: repeated graphemes consume old occurrences exactly once. */
export const matchAxiomGlyphs = (
  from: AxiomTextLayout,
  to: AxiomTextLayout,
) => {
  const available = new Map<string, number[]>();
  from.glyphs.forEach((g, i) =>
    available.set(g.text, [...(available.get(g.text) ?? []), i]),
  );
  return to.glyphs.map((g) => available.get(g.text)?.shift() ?? null);
};
export const resolveAxiomMorph = (
  frame: number,
  options: AxiomMorphOptions,
) => {
  const timing = resolveProducerRecipeTiming(frame, options);
  if (!["assemble", "scatter", "shatter", "reform"].includes(options.mode))
    throw new Error("Unknown AxiomMorph mode.");
  checkLayout(options.text);
  if (options.mode === "reform" && !options.nextText)
    throw new Error("reform needs nextText.");
  if (options.nextText) checkLayout(options.nextText);
  const spread = options.spread ?? 360;
  positive(spread, "spread");
  const fragments = options.fragments ?? 8;
  integer(fragments, 4, 16, "fragments");
  if (fragments % 4 !== 0)
    throw new Error("fragments must be a multiple of four.");
  const edge = (i: number) => {
    const a = Math.PI / 4 + (i / fragments) * 2 * Math.PI;
    const x = Math.cos(a),
      y = Math.sin(a),
      r = 50 / Math.max(Math.abs(x), Math.abs(y));
    return `${50 + x * r}% ${50 + y * r}%`;
  };
  const seed = options.seed ?? "axiom";
  const p = timing.progress;
  const visibility = clamp(p);
  const vector = (key: string) => ({
    x: (random(`${seed}:${key}:x`) - 0.5) * spread * 2,
    y: (random(`${seed}:${key}:y`) - 0.5) * spread * 2,
    rotation: (random(`${seed}:${key}:r`) - 0.5) * 240,
  });
  const unit = (
    glyph: AxiomGlyph,
    width: number,
    key: string,
    fromX: number,
    entering: boolean,
    shared = false,
    fragment: number | null = null,
  ) => {
    const v = vector(`${key}:${fragment}`);
    const x = glyph.x - width / 2;
    return {
      key: `${key}:${fragment}`,
      text: glyph.text,
      width: glyph.width,
      fragment,
      clip:
        fragment === null
          ? undefined
          : `polygon(50% 50%, ${edge(fragment)}, ${edge(fragment + 1)})`,
      x: shared ? mix(fromX, x, p) : x + v.x * (entering ? 1 - p : p),
      y: shared ? 0 : v.y * (entering ? 1 - p : p),
      rotation: shared ? 0 : v.rotation * (entering ? 1 - p : p),
      opacity: shared ? 1 : entering ? visibility : 1 - visibility,
    };
  };
  const matches =
    options.mode === "reform"
      ? matchAxiomGlyphs(options.text, options.nextText!)
      : [];
  const used = new Set(matches.filter((i) => i !== null));
  const glyphs = options.text.glyphs.flatMap((glyph, i) => {
    if (used.has(i)) return [];
    const shattered = options.mode === "shatter" || options.mode === "reform";
    return Array.from({ length: shattered ? fragments : 1 }, (_, f) =>
      unit(
        glyph,
        options.text.width,
        `old-${i}`,
        0,
        options.mode === "assemble",
        false,
        shattered ? f : null,
      ),
    );
  });
  if (options.mode === "reform")
    options.nextText!.glyphs.forEach((glyph, i) => {
      const old = matches[i];
      glyphs.push(
        unit(
          glyph,
          options.nextText!.width,
          `new-${i}`,
          old === null
            ? 0
            : options.text.glyphs[old].x - options.text.width / 2,
          true,
          old !== null,
        ),
      );
    });
  return {
    ...timing,
    matches,
    glyphs,
    sfxCues: recipeCues(
      "AxiomMorph",
      timing,
      PRODUCER_RECIPE_CATALOG.AxiomMorph.sfxCues,
    ),
  };
};
export type AxiomMorphProps = ProducerRecipeFrameProps &
  Omit<AxiomMorphOptions, "text" | "nextText"> &
  AxiomTextStyle &
  Readonly<{ text: string; nextText?: string; color?: string }>;
export const AxiomMorph = ({
  frame: frameOverride,
  text,
  nextText,
  fontFamily,
  fontSize,
  fontWeight = 700,
  color = "currentColor",
  ...options
}: AxiomMorphProps) => {
  const textGroup = useId();
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  const layout = useMemo(
    () => measureAxiomText(text, { fontFamily, fontSize, fontWeight }),
    [text, fontFamily, fontSize, fontWeight],
  );
  const next = useMemo(
    () =>
      nextText === undefined
        ? undefined
        : measureAxiomText(nextText, { fontFamily, fontSize, fontWeight }),
    [nextText, fontFamily, fontSize, fontWeight],
  );
  const state = resolveAxiomMorph(frame, {
    ...options,
    text: layout,
    nextText: next,
  });
  useReviewMotion({
    type: "recipe",
    id: "AxiomMorph",
    anticipate: state.anticipate,
    move: state.move,
    land: state.land,
    settle: state.settle,
  });
  return (
    <div
      aria-label={nextText ?? text}
      data-recipe="AxiomMorph"
      data-axmorf-text-group={textGroup}
      style={{
        position: "relative",
        width: "100%",
        height: fontSize * 1.5,
        fontFamily,
        fontSize,
        fontWeight,
        color,
      }}
    >
      {state.glyphs.map((g) => (
        <span
          key={g.key}
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            whiteSpace: "pre",
            lineHeight: 1.5,
            width: g.width,
            clipPath: g.clip,
            opacity: g.opacity,
            transform: `translate(${g.x}px, ${g.y}px) rotate(${g.rotation}deg)`,
          }}
        >
          {g.text}
        </span>
      ))}
    </div>
  );
};
