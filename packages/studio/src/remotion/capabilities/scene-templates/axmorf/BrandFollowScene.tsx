import type { FC } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";

import { AXMORF_WORDMARK, AxmorfMark } from "./AxmorfBrand";

const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export type BrandFollowSceneProps = Readonly<{
  sceneFrame: number;
  width: number;
  height: number;
}>;

export const resolveBrandFollowLockupLayout = ({
  width,
  height,
}: Pick<BrandFollowSceneProps, "width" | "height">) => {
  const isLandscape = width > height;
  const markSize = isLandscape ? 188 : 214;
  const wordmarkWidth = isLandscape ? 406 : 452;
  const lockupGap = isLandscape ? 30 : 17;
  const lockupWidth = markSize + lockupGap + wordmarkWidth;
  return {
    isLandscape,
    lockupGap,
    lockupLeft: width / 2 - lockupWidth / 2,
    lockupWidth,
    markCenteredLeft: (lockupWidth - markSize) / 2,
    markSize,
    wordmarkWidth,
  } as const;
};

export const BrandFollowScene: FC<BrandFollowSceneProps> = ({
  sceneFrame,
  width,
  height,
}) => {
  const frame = sceneFrame * 1.5;
  const {
    isLandscape,
    lockupGap,
    lockupLeft,
    lockupWidth,
    markCenteredLeft,
    markSize,
    wordmarkWidth,
  } = resolveBrandFollowLockupLayout({ width, height });
  const lockupY = height * (isLandscape ? 0.42 : 0.39);
  const markLeft = interpolate(frame, [48, 68], [markCenteredLeft, 0], {
    ...clamped,
    easing: Easing.inOut(Easing.cubic),
  });
  const markZoom = interpolate(frame, [2, 40], [isLandscape ? 6.4 : 7.2, 1], {
    ...clamped,
    easing: Easing.inOut(Easing.cubic),
  });
  const buttonWidth = isLandscape ? 286 : 310;
  const buttonHeight = isLandscape ? 74 : 84;
  const clickProgress = interpolate(frame, [142, 150], [0, 1], {
    ...clamped,
    easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{ color: "#242424", overflow: "hidden" }}>
      <div
        style={{
          backgroundColor: "#fffdf9",
          borderRadius: 36,
          height: markSize + 96,
          left: lockupLeft - 48,
          overflow: "hidden",
          position: "absolute",
          top: lockupY - markSize / 2 - 48,
          width: lockupWidth + 96,
        }}
      >
        <div
          aria-label="AXMORF"
          role="img"
          style={{
            height: markSize * markZoom,
            left: markLeft + (markSize - markSize * markZoom) / 2 + 48,
            position: "absolute",
            top: (markSize - markSize * markZoom) / 2 + 48,
            width: markSize * markZoom,
          }}
        >
          <AxmorfMark
            color="#242424"
            style={{ height: "100%", width: "100%" }}
          />
        </div>
        <div
          aria-label={AXMORF_WORDMARK}
          role="img"
          style={{
            display: "flex",
            fontFamily: "Inter, Arial, ui-sans-serif, sans-serif",
            fontSize: 76,
            fontWeight: 620,
            justifyContent: "space-between",
            left: markSize + lockupGap + 48,
            letterSpacing: "0.12em",
            position: "absolute",
            top: markSize / 2 - 38 + 48,
            width: wordmarkWidth,
          }}
        >
          {AXMORF_WORDMARK.split("").map((character, index) => (
            <span
              key={`${character}-${index}`}
              aria-hidden="true"
              style={{
                fontSize: 76,
                opacity: interpolate(
                  frame,
                  [64 + index * 4, 76 + index * 4],
                  [0, 1],
                  clamped,
                ),
                translate: `${interpolate(frame, [64 + index * 4, 76 + index * 4], [18, 0], clamped)}px 0`,
              }}
            >
              {character}
            </span>
          ))}
        </div>
      </div>
      <div
        aria-label={`AXMORF 品牌关注状态：${clickProgress >= 0.5 ? "已关注" : "关注"}`}
        role="img"
        style={{
          alignItems: "center",
          background: clickProgress > 0 ? "#a37d5c" : "#242424",
          borderRadius: buttonHeight / 2,
          color: "#fffdf9",
          display: "flex",
          fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
          fontSize: 36,
          fontWeight: 650,
          height: buttonHeight,
          justifyContent: "center",
          left: width / 2 - buttonWidth / 2,
          letterSpacing: "0.1em",
          opacity: interpolate(frame, [102, 118], [0, 1], clamped),
          position: "absolute",
          top:
            height * (isLandscape ? 0.72 : 0.68) -
            buttonHeight / 2 +
            interpolate(frame, [102, 118], [14, 0], {
              ...clamped,
              easing: Easing.out(Easing.back(1.6)),
            }),
          width: buttonWidth,
        }}
      >
        {clickProgress >= 0.5 ? "✓ 已关注" : "+ 关注 AXMORF"}
      </div>
      <svg
        aria-hidden="true"
        height={isLandscape ? 54 : 62}
        viewBox="0 0 28 28"
        width={isLandscape ? 54 : 62}
        style={{
          filter: "drop-shadow(0 5px 8px rgba(36, 36, 36, 0.28))",
          left: interpolate(frame, [114, 136], [width * 0.14, width * 0.58], {
            ...clamped,
            easing: Easing.out(Easing.cubic),
          }),
          opacity: interpolate(
            frame,
            [114, 119, 160, 172],
            [0, 1, 1, 0],
            clamped,
          ),
          position: "absolute",
          top: interpolate(frame, [114, 136], [height * 0.86, height * 0.68], {
            ...clamped,
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <path
          d="M2 1 L2 23 L8 17.5 L11.5 25 L15.5 23.2 L12 15.8 L20 15 Z"
          fill="#fffdf9"
          stroke="#242424"
          strokeLinejoin="round"
          strokeWidth={1.6}
        />
      </svg>
    </AbsoluteFill>
  );
};
