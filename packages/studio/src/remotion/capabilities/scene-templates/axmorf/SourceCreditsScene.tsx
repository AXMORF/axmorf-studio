import type { FC } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";

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
  references: readonly Readonly<{ title: string; url: string }>[];
}>;

export const SourceCreditsScene: FC<SourceCreditsSceneProps> = ({
  sceneFrame,
  width,
  height,
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
        color: "#242424",
        opacity: interpolate(sceneFrame, [104, 119], [1, 0], clamped),
        overflow: "hidden",
        padding: isLandscape
          ? compactLandscape
            ? "24px 128px"
            : "88px 128px 64px"
          : `${references.length <= 3 ? 300 : 88}px 96px 96px`,
      }}
    >
      <div
        aria-label={AXMORF_SOURCE_FOLLOW_MESSAGE}
        role="img"
        style={{
          backgroundColor: "#fffdf9",
          borderRadius: 8,
          boxShadow: "0 0 0 20px #fffdf9",
          fontFamily:
            '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
          fontSize: 48,
          fontWeight: 520,
          letterSpacing: "0.045em",
          lineHeight: compactLandscape ? 1.3 : isLandscape ? 1.58 : 1.66,
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
          backgroundColor: "#fffdf9",
          borderRadius: 16,
          color: "#a37d5c",
          marginLeft: "auto",
          marginRight: "auto",
          boxShadow: "0 0 0 8px #fffdf9",
          width: "fit-content",
          fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
          fontSize: 36,
          fontWeight: 650,
          letterSpacing: "0.18em",
          marginTop: compactLandscape ? 16 : isLandscape ? 28 : 52,
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
          gap: isDense ? 10 : 14,
          gridTemplateColumns: isLandscape
            ? "repeat(2, minmax(0, 1fr))"
            : "minmax(0, 1fr)",
          marginTop: compactLandscape ? 16 : 24,
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
              background: "#fffdf9",
              border: "1px solid rgba(36, 36, 36, 0.1)",
              borderRadius: 18,
              minWidth: 0,
              opacity: interpolate(
                sceneFrame,
                [54 + index * 4, 68 + index * 4],
                [0, 1],
                clamped,
              ),
              padding: isDense ? "10px 18px" : "16px 22px",
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
                  color: "rgba(36, 36, 36, 0.72)",
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
