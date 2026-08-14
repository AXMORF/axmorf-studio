import type { CSSProperties, FC } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { AXMORF_MARK_PATHS, AXMORF_WORDMARK } from "../axmorf-brand";
import { FIXED_INTRO_DURATION_IN_FRAMES } from "../../../contracts/story-composition";

export { FIXED_INTRO_DURATION_IN_FRAMES };

const PAPER = "#f8f4ee";
const INK = "#242424";
const ACCENT = "#a37d5c";

const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const AxmorfMark: FC<{ readonly frame: number }> = ({ frame }) => (
  <svg
    aria-label="AXMORF logo"
    role="img"
    viewBox="0 0 640 640"
    style={{ display: "block", height: 440, width: 440 }}
  >
    {AXMORF_MARK_PATHS.map((path, index) => {
      const progress = interpolate(
        frame,
        [10 + index * 3, 24 + index * 3],
        [0, 1],
        {
          ...clamped,
          easing: Easing.bezier(0.2, 0.7, 0.25, 1),
        },
      );
      const pieceStyle: CSSProperties = {
        filter: `blur(${(1 - progress) * 7}px)`,
        opacity: progress,
        transform: `scale(${1.45 - progress * 0.45})`,
        transformBox: "fill-box",
        transformOrigin: "center",
      };

      return <path key={path} d={path} fill={INK} style={pieceStyle} />;
    })}
  </svg>
);

export const FixedIntro: FC = () => {
  const frame = useCurrentFrame();
  const verticalDraw = interpolate(frame, [0, 9], [100, 0], {
    ...clamped,
    easing: Easing.bezier(0.3, 0, 0.2, 1),
  });
  const horizontalDraw = interpolate(frame, [8, 18], [100, 0], {
    ...clamped,
    easing: Easing.linear,
  });
  const crosshairOpacity = interpolate(frame, [24, 34], [0.54, 0], clamped);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        background: `radial-gradient(circle at 50% 43%, #fffdf9 0%, ${PAPER} 58%, #f2ebe3 100%)`,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ height: 440, position: "relative", width: 440 }}>
          <svg
            aria-hidden="true"
            viewBox="0 0 640 640"
            style={{
              height: 640,
              left: -100,
              opacity: crosshairOpacity,
              position: "absolute",
              top: -100,
              width: 640,
            }}
          >
            <line
              x1={320}
              x2={320}
              y1={54}
              y2={586}
              pathLength={100}
              stroke={ACCENT}
              strokeDasharray={100}
              strokeDashoffset={verticalDraw}
              strokeLinecap="round"
              strokeWidth={4}
            />
            <line
              x1={54}
              x2={586}
              y1={320}
              y2={320}
              pathLength={100}
              stroke={ACCENT}
              strokeDasharray={100}
              strokeDashoffset={horizontalDraw}
              strokeLinecap="round"
              strokeWidth={4}
            />
          </svg>
          <AxmorfMark frame={frame} />
        </div>

        <div
          aria-label={AXMORF_WORDMARK}
          style={{
            alignItems: "flex-end",
            color: INK,
            display: "inline-flex",
            fontFamily: "Inter, Arial, ui-sans-serif, sans-serif",
            fontSize: 82,
            fontWeight: 560,
            letterSpacing: "0.28em",
            lineHeight: 1,
            marginLeft: "0.28em",
            marginTop: 72,
          }}
        >
          {AXMORF_WORDMARK.split("").map((character, index) => {
            const delay = 18 + index * 3;
            const progress = interpolate(frame, [delay, delay + 12], [0, 1], {
              ...clamped,
              easing: Easing.bezier(0.2, 0.7, 0.25, 1),
            });
            const glint = interpolate(
              frame,
              [delay + 8, delay + 12, delay + 16],
              [0, 1, 0],
              clamped,
            );

            return (
              <span
                key={`${character}-${index}`}
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  filter: `blur(${(1 - progress) * 6}px)`,
                  opacity: progress,
                  position: "relative",
                  transform: `scale(${1.55 - progress * 0.55})`,
                  transformOrigin: "center bottom",
                }}
              >
                {character}
                <span
                  style={{
                    background: ACCENT,
                    bottom: -12,
                    height: 2,
                    left: "50%",
                    opacity: glint * 0.7,
                    position: "absolute",
                    transform: "translateX(-50%)",
                    width: `${glint * 92}%`,
                  }}
                />
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
