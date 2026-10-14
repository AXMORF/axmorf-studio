import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { useFilmTiming, type FilmSentenceTiming } from "./context";

export type FilmCaptionsProps = Readonly<{
  /** Distance from the bottom edge as a fraction of the frame height. */
  bottom?: number;
  /** Maximum caption width as a fraction of the frame width. */
  maxWidth?: number;
  /** Overrides merged into the default caption box style. */
  style?: CSSProperties;
  /** Fully custom caption rendering; receives the active sentence and its 0–1 progress. */
  render?: (sentence: FilmSentenceTiming, progress: number) => ReactNode;
}>;

/** Pixel size that keeps a 72 half-unit sentence on at most two lines. */
export const resolveFilmCaptionFontSize = (width: number, height: number) =>
  Math.round(Math.min(width, height) * (width < height ? 0.046 : 0.04));

/**
 * Captions for the measured narration. Each sentence is shown exactly while it
 * is spoken. Place it last in the Film so it stays above the artwork.
 */
export const FilmCaptions = ({
  bottom,
  maxWidth = 0.86,
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
          style={{
            boxSizing: "border-box",
            maxWidth: Math.round(width * maxWidth),
            padding: `${Math.round(fontSize * 0.4)}px ${Math.round(fontSize * 0.7)}px`,
            borderRadius: Math.round(fontSize * 0.35),
            backgroundColor: "rgba(10, 14, 24, 0.78)",
            color: "#f8fafc",
            fontFamily:
              'Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
            fontSize,
            fontWeight: 650,
            lineHeight: 1.35,
            textAlign: "center",
            textWrap: "balance",
            overflowWrap: "anywhere",
            ...style,
          }}
        >
          {active.text}
        </div>
      )}
    </AbsoluteFill>
  );
};
