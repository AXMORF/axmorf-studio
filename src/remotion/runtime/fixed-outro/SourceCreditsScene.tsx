import type { FC } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { VideoSourceReference } from "../../../contracts/brief";
import {
  FIXED_OUTRO_LANDSCAPE_LINES,
  FIXED_OUTRO_MESSAGE,
  FIXED_OUTRO_PORTRAIT_LINES,
} from "./content";

const PAPER = "#f8f4ee";
const INK = "#242424";
const ACCENT = "#a37d5c";

const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export type SourceCreditsSceneProps = Readonly<{
  references: readonly VideoSourceReference[];
}>;

export const SourceCreditsScene: FC<SourceCreditsSceneProps> = ({
  references,
}) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const isLandscape = width > height;
  const isDense = references.length > 5;
  const lines = isLandscape
    ? FIXED_OUTRO_LANDSCAPE_LINES
    : FIXED_OUTRO_PORTRAIT_LINES;
  const referenceFontSize = isLandscape
    ? references.length > 4
      ? 22
      : 25
    : isDense
      ? 22
      : 29;
  const portraitTopPadding =
    references.length <= 3 ? 400 : references.length <= 5 ? 280 : 78;
  const statementFontSize = isLandscape
    ? isDense
      ? 42
      : 46
    : isDense
      ? 44
      : 51;
  const sceneOpacity = interpolate(frame, [104, 119], [1, 0], clamped);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 34%, #fffdf9 0%, ${PAPER} 58%, #f2ebe3 100%)`,
        color: INK,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          inset: 0,
          opacity: sceneOpacity,
          padding: isLandscape
            ? "112px 150px 72px"
            : `${portraitTopPadding}px 112px 118px`,
          position: "absolute",
        }}
      >
        <div
          style={{
            background: ACCENT,
            height: 3,
            marginBottom: isLandscape ? 32 : 46,
            opacity: interpolate(frame, [4, 18], [0, 0.72], clamped),
            scale: `${interpolate(frame, [4, 26], [0, 1], {
              ...clamped,
              easing: Easing.out(Easing.cubic),
            })} 1`,
            transformOrigin: "center",
            width: 88,
          }}
        />
        <div
          aria-label={FIXED_OUTRO_MESSAGE}
          role="img"
          style={{
            fontFamily:
              '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
            fontSize: statementFontSize,
            fontWeight: 520,
            letterSpacing: "0.045em",
            lineHeight: isLandscape ? 1.62 : isDense ? 1.56 : 1.7,
            textAlign: "center",
          }}
        >
          {lines.map((line, index) => (
            <div
              key={line}
              aria-hidden="true"
              style={{
                filter: `blur(${interpolate(
                  frame,
                  [10 + index * 7, 32 + index * 7],
                  [7, 0],
                  clamped,
                )}px)`,
                opacity: interpolate(
                  frame,
                  [10 + index * 7, 32 + index * 7],
                  [0, 1],
                  {
                    ...clamped,
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
                translate: `0 ${interpolate(
                  frame,
                  [10 + index * 7, 32 + index * 7],
                  [22, 0],
                  clamped,
                )}px`,
              }}
            >
              {line}
            </div>
          ))}
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 18,
            marginTop: isLandscape ? 38 : 64,
            opacity: interpolate(frame, [44, 58], [0, 1], clamped),
            width: "100%",
          }}
        >
          <div style={{ background: "rgba(36, 36, 36, 0.16)", flex: 1, height: 1 }} />
          <div
            style={{
              color: ACCENT,
              fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
              fontSize: isLandscape ? 21 : 24,
              fontWeight: 650,
              letterSpacing: "0.18em",
              whiteSpace: "nowrap",
            }}
          >
            本期参考资料
          </div>
          <div style={{ background: "rgba(36, 36, 36, 0.16)", flex: 1, height: 1 }} />
        </div>

        <div
          style={{
            display: "grid",
            gap: isDense ? 10 : isLandscape ? 15 : 17,
            gridTemplateColumns: isLandscape
              ? "repeat(2, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
            marginTop: isLandscape ? 24 : 30,
            width: "100%",
          }}
        >
          {references.length === 0 ? (
            <div
              style={{
                color: "rgba(36, 36, 36, 0.7)",
                fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
                fontSize: referenceFontSize,
                gridColumn: "1 / -1",
                opacity: interpolate(frame, [54, 68], [0, 1], clamped),
                textAlign: "center",
              }}
            >
              本期无外部资料引用
            </div>
          ) : (
            references.map((reference, index) => {
              const titleFontSize = Math.max(
                15,
                referenceFontSize -
                  Math.ceil(Math.max(0, reference.title.length - 64) / 32) * 2,
              );
              const urlFontSize = Math.max(
                11,
                referenceFontSize * 0.68 -
                  Math.ceil(Math.max(0, reference.url.length - 96) / 48),
              );
              return (
                <div
                  key={`${reference.url}-${index}`}
                  style={{
                    background: "rgba(255, 253, 249, 0.72)",
                    border: "1px solid rgba(36, 36, 36, 0.1)",
                    borderRadius: 18,
                    boxShadow: "0 8px 24px rgba(80, 61, 45, 0.06)",
                    minWidth: 0,
                    opacity: interpolate(
                      frame,
                      [54 + index * 4, 68 + index * 4],
                      [0, 1],
                      clamped,
                    ),
                    padding: isDense
                      ? "10px 18px"
                      : isLandscape
                        ? "17px 22px"
                        : "20px 25px",
                    translate: `0 ${interpolate(
                      frame,
                      [54 + index * 4, 68 + index * 4],
                      [18, 0],
                      clamped,
                    )}px`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
                      fontSize: titleFontSize,
                      fontWeight: 650,
                      lineHeight: 1.3,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {reference.title}
                  </div>
                  <div
                    style={{
                      color: "rgba(36, 36, 36, 0.72)",
                      direction: "ltr",
                      fontFamily: 'Inter, Arial, ui-sans-serif, sans-serif',
                      fontSize: urlFontSize,
                      lineHeight: 1.3,
                      marginTop: isDense ? 4 : 7,
                      overflowWrap: "anywhere",
                      textAlign: "left",
                    }}
                  >
                    {reference.url}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
