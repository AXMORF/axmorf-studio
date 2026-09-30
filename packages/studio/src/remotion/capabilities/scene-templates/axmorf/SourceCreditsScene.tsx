import type { FC } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { VisualTheme } from "@axmorf/studio/contracts";

import {
  AXMORF_SOURCE_FOLLOW_LANDSCAPE_LINES,
  AXMORF_SOURCE_FOLLOW_MESSAGE,
  AXMORF_SOURCE_FOLLOW_PORTRAIT_LINES,
} from "./content";

const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export type SourceCreditsSceneProps = Readonly<{
  sceneFrame: number;
  width: number;
  height: number;
  theme: VisualTheme;
  references: readonly Readonly<{ title: string; url: string }>[];
}>;

export const SourceCreditsScene: FC<SourceCreditsSceneProps> = ({
  sceneFrame,
  width,
  height,
  theme,
  references,
}) => {
  const isLandscape = width > height;
  const isDense = references.length > 5;
  const compactLandscape = isLandscape && isDense;
  const lines = isLandscape
    ? AXMORF_SOURCE_FOLLOW_LANDSCAPE_LINES
    : AXMORF_SOURCE_FOLLOW_PORTRAIT_LINES;
  return (
    <AbsoluteFill
      style={{
        color: theme.primaryText,
        opacity: interpolate(sceneFrame, [104, 119], [1, 0], clamped),
        overflow: "hidden",
        padding: isLandscape
          ? compactLandscape
            ? "12px 128px"
            : "88px 128px 64px"
          : `${references.length <= 3 ? 300 : 88}px 96px 96px`,
      }}
    >
      <div
        aria-label={AXMORF_SOURCE_FOLLOW_MESSAGE}
        role="img"
        style={{
          fontFamily:
            '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
          fontSize: 48,
          fontWeight: 520,
          letterSpacing: "0.045em",
          lineHeight: compactLandscape ? 1.1 : isLandscape ? 1.58 : 1.66,
          textAlign: "center",
        }}
      >
        {lines.map((line, index) => (
          <div
            key={line}
            aria-hidden="true"
            style={{
              fontSize: 48,
              filter: `blur(${interpolate(sceneFrame, [10 + index * 7, 32 + index * 7], [7, 0], clamped)}px)`,
              opacity: interpolate(
                sceneFrame,
                [10 + index * 7, 32 + index * 7],
                [0, 1],
                {
                  ...clamped,
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
              translate: `0 ${interpolate(sceneFrame, [10 + index * 7, 32 + index * 7], [22, 0], clamped)}px`,
            }}
          >
            {line}
          </div>
        ))}
      </div>
      <div
        style={{
          color: theme.accent,
          fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
          fontSize: 36,
          fontWeight: 650,
          letterSpacing: "0.18em",
          lineHeight: compactLandscape ? 1.2 : undefined,
          marginTop: compactLandscape ? 8 : isLandscape ? 28 : 52,
          opacity: interpolate(sceneFrame, [44, 58], [0, 1], clamped),
          textAlign: "center",
        }}
      >
        本期参考资料
      </div>
      <div
        style={{
          display: "grid",
          fontSize: 36,
          gap: compactLandscape ? 8 : isDense ? 10 : 14,
          gridTemplateColumns:
            isLandscape && references.length > 1
              ? "repeat(2, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
          marginTop: compactLandscape ? 8 : 24,
        }}
      >
        {(references.length === 0
          ? [{ title: "本期无外部资料引用", url: "" }]
          : references
        ).map((reference, index) => (
          <div
            key={`${reference.url}-${index}`}
            style={{
              fontSize: 36,
              border: `1px solid ${theme.secondaryText}`,
              borderRadius: 18,
              lineHeight: compactLandscape ? 1.1 : undefined,
              minWidth: 0,
              opacity: interpolate(
                sceneFrame,
                [54 + index * 4, 68 + index * 4],
                [0, 1],
                clamped,
              ),
              padding: compactLandscape
                ? "6px 18px"
                : isDense
                  ? "10px 18px"
                  : "16px 22px",
              translate: `0 ${interpolate(sceneFrame, [54 + index * 4, 68 + index * 4], [18, 0], clamped)}px`,
            }}
          >
            <div
              style={{
                fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
                fontSize: 36,
                fontWeight: 650,
                overflowWrap: "anywhere",
              }}
            >
              {reference.title}
            </div>
            {reference.url.length > 0 ? (
              <div
                style={{
                  color: theme.secondaryText,
                  direction: "ltr",
                  fontFamily: "Inter, Arial, ui-sans-serif, sans-serif",
                  fontSize: 36,
                  marginTop: 6,
                  overflowWrap: "anywhere",
                  textAlign: "left",
                }}
              >
                {reference.url}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
