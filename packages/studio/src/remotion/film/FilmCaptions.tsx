import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { resolveFilmCaptionFontSize } from "../../contracts/film";
export { resolveFilmCaptionFontSize } from "../../contracts/film";

import { useFilmTiming, type FilmSentenceTiming } from "./context";
import { resolveCaptionLines } from "./caption-lines";
export { resolveCaptionLines } from "./caption-lines";

export type FilmCaptionsProps = Readonly<{
  /** Distance from the bottom edge as a fraction of the frame height. */
  bottom?: number;
  /** Maximum caption width as a fraction of the frame width. */
  maxWidth?: number;
  /** Paper uses a stable reading plane over a lightly tilted, taped white strip. */
  variant?: "box" | "paper";
  /** Overrides merged into the default caption box style. */
  style?: CSSProperties;
  /** Fully custom caption rendering; receives the active sentence and its 0–1 progress. */
  render?: (sentence: FilmSentenceTiming, progress: number) => ReactNode;
}>;

/**
 * Captions for the measured narration. Each sentence is shown exactly while it
 * is spoken. Place it last in the Film so it stays above the artwork.
 */
export const FilmCaptions = ({
  bottom,
  maxWidth = 0.86,
  variant = "box",
  style,
  render,
}: FilmCaptionsProps) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { sentences } = useFilmTiming();
  const active = sentences.find(
    ({ startFrame, endFrame }) => startFrame <= frame && frame < endFrame,
  );
  if (active === undefined) return null;
  const progress =
    (frame - active.startFrame) /
    Math.max(1, active.endFrame - active.startFrame);
  const fontSize = resolveFilmCaptionFontSize(width, height);
  const paper = variant === "paper";
  // Existing films keep their exact box pixels; opting into screen copy or paper
  // uses explicit line breaks. Do not reflow legacy captions on a runtime update.
  const legacyBox = !paper && active.caption === undefined;
  const size =
    typeof style?.fontSize === "number"
      ? style.fontSize
      : typeof style?.fontSize === "string" && style.fontSize.endsWith("px")
        ? Number.parseFloat(style.fontSize)
        : fontSize;
  const pixels = (value: CSSProperties["width"], fallback: number): number => {
    if (typeof value === "number") return value;
    if (value === "0") return 0;
    if (typeof value === "string" && value.endsWith("px"))
      return Number.parseFloat(value);
    if (typeof value === "string" && value.endsWith("%"))
      return (width * Number.parseFloat(value)) / 100;
    return fallback;
  };
  const padding = String(
    style?.padding ??
      `${Math.round(fontSize * 0.4)}px ${Math.round(fontSize * 0.7)}px`,
  ).split(/\s+/u);
  const defaultPadding = Math.round(fontSize * 0.7);
  const paddingRight =
    typeof style?.padding === "number"
      ? style.padding
      : pixels(padding[1] ?? padding[0], defaultPadding);
  const paddingLeft =
    typeof style?.padding === "number"
      ? style.padding
      : pixels(padding[3] ?? padding[1] ?? padding[0], defaultPadding);
  const lineWidth =
    Math.min(
      pixels(style?.maxWidth, width * maxWidth),
      pixels(style?.width, width),
    ) -
    pixels(style?.paddingLeft, paddingLeft) -
    pixels(style?.paddingRight, paddingRight);
  const lines = legacyBox
    ? null
    : resolveCaptionLines(
        active.caption ?? active.text,
        Math.max(1, Math.floor(lineWidth / (size / 2))),
      );
  return (
    <AbsoluteFill
      data-axmorf-captions=""
      style={{
        pointerEvents: "none",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: Math.round(
          height * (bottom ?? (width < height ? 0.11 : 0.07)),
        ),
      }}
    >
      {render ? (
        render(active, progress)
      ) : (
        <div
          data-axmorf-caption-box=""
          data-axmorf-caption-variant={variant}
          style={{
            ...(paper ? { position: "relative" } : {}),
            boxSizing: "border-box",
            maxWidth: Math.round(width * maxWidth),
            padding: `${Math.round(fontSize * 0.4)}px ${Math.round(fontSize * 0.7)}px`,
            borderRadius: paper ? 2 : Math.round(fontSize * 0.35),
            backgroundColor: paper ? "transparent" : "rgba(10, 14, 24, 0.78)",
            color: paper ? "#30343b" : "#f8fafc",
            fontFamily:
              'Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
            fontSize,
            fontWeight: 650,
            lineHeight: 1.35,
            textAlign: "center",
            ...(legacyBox
              ? { textWrap: "balance", overflowWrap: "anywhere" }
              : { whiteSpace: "pre", overflowWrap: "normal" }),
            ...style,
          }}
        >
          {paper ? (
            <>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: style?.backgroundColor ?? "#fffefa",
                  borderRadius: 2,
                  transform: "rotate(-0.65deg)",
                  boxShadow: "0 3px 9px rgba(45, 38, 27, 0.2)",
                }}
              />
              {[-1, 1].map((side) => (
                <div
                  key={side}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: "26%",
                    ...(side < 0
                      ? { left: -size * 0.3 }
                      : { right: -size * 0.3 }),
                    width: size * 0.65,
                    height: "48%",
                    backgroundColor: "rgba(194, 187, 155, 0.46)",
                    transform: `rotate(${side * 9}deg)`,
                  }}
                />
              ))}
              <span style={{ position: "relative" }}>{lines!.join("\n")}</span>
            </>
          ) : lines ? (
            lines.join("\n")
          ) : (
            active.text
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};
