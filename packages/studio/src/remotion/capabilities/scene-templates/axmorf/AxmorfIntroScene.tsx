import type { FC } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";

import { AXMORF_MARK_PATHS, AXMORF_WORDMARK } from "./AxmorfBrand";

const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export type AxmorfIntroSceneProps = Readonly<{
  sceneFrame: number;
  width: number;
  height: number;
}>;

export const AxmorfIntroScene: FC<AxmorfIntroSceneProps> = ({
  sceneFrame,
  width,
  height,
}) => {
  const isLandscape = width > height;
  const markSize = Math.min(width, height) * (isLandscape ? 0.34 : 0.4);
  const animatedMarkSize =
    markSize * interpolate(sceneFrame, [10, 36], [1.45, 1], clamped);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        color: "#242424",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          alignItems: "center",
          backgroundColor: "#fffdf9",
          borderRadius: 36,
          display: "flex",
          flexDirection: "column",
          padding: "48px 56px",
        }}
      >
        <div
          style={{ height: markSize, position: "relative", width: markSize }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 640 640"
            style={{
              height: markSize * 1.35,
              left: -markSize * 0.175,
              opacity: interpolate(sceneFrame, [24, 34], [0.54, 0], clamped),
              position: "absolute",
              top: -markSize * 0.175,
              width: markSize * 1.35,
            }}
          >
            <line
              x1={320}
              x2={320}
              y1={54}
              y2={586}
              pathLength={100}
              stroke="#a37d5c"
              strokeDasharray={100}
              strokeDashoffset={interpolate(sceneFrame, [0, 9], [100, 0], {
                ...clamped,
                easing: Easing.bezier(0.3, 0, 0.2, 1),
              })}
              strokeLinecap="round"
              strokeWidth={4}
            />
            <line
              x1={54}
              x2={586}
              y1={320}
              y2={320}
              pathLength={100}
              stroke="#a37d5c"
              strokeDasharray={100}
              strokeDashoffset={interpolate(sceneFrame, [8, 18], [100, 0], {
                ...clamped,
                easing: Easing.linear,
              })}
              strokeLinecap="round"
              strokeWidth={4}
            />
          </svg>
          <svg
            aria-label="AXMORF logo"
            role="img"
            viewBox="0 0 640 640"
            style={{
              display: "block",
              fontSize: 36,
              height: animatedMarkSize,
              width: animatedMarkSize,
              position: "absolute",
              left: (markSize - animatedMarkSize) / 2,
              top: (markSize - animatedMarkSize) / 2,
            }}
          >
            {AXMORF_MARK_PATHS.map((path, index) => (
              <path
                key={path}
                d={path}
                fill="#242424"
                style={{
                  filter: `blur(${interpolate(sceneFrame, [10 + index * 3, 24 + index * 3], [7, 0], clamped)}px)`,
                  opacity: interpolate(
                    sceneFrame,
                    [10 + index * 3, 24 + index * 3],
                    [0, 1],
                    clamped,
                  ),
                }}
              />
            ))}
          </svg>
        </div>
        <div
          aria-label={AXMORF_WORDMARK}
          style={{
            color: "#242424",
            display: "flex",
            fontFamily: "Inter, Arial, ui-sans-serif, sans-serif",
            fontSize: 76,
            fontWeight: 560,
            gap: isLandscape ? 10 : 12,
            letterSpacing: "0.18em",
            marginLeft: "0.18em",
            marginTop: isLandscape ? 38 : 64,
          }}
        >
          {AXMORF_WORDMARK.split("").map((character, index) => (
            <span
              key={`${character}-${index}`}
              aria-hidden="true"
              style={{
                filter: `blur(${interpolate(sceneFrame, [18 + index * 3, 30 + index * 3], [6, 0], clamped)}px)`,
                opacity: interpolate(
                  sceneFrame,
                  [18 + index * 3, 30 + index * 3],
                  [0, 1],
                  clamped,
                ),
                fontSize: 76,
                position: "relative",
                top: interpolate(
                  sceneFrame,
                  [18 + index * 3, 30 + index * 3],
                  [18, 0],
                  clamped,
                ),
              }}
            >
              {character}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
