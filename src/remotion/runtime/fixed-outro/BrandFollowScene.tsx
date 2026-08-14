import type { FC } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  AXMORF_WORDMARK,
  AxmorfMark,
} from "../axmorf-brand";

const PAPER = "#f8f4ee";
const INK = "#242424";
const ACCENT = "#a37d5c";
const BUTTON_APPEAR_FRAME = 102;
const CURSOR_START_FRAME = 114;
const CURSOR_SETTLE_FRAME = 136;
const CLICK_FRAME = 142;
export const BRAND_FOLLOW_PLAYBACK_RATE = 1.5;

const particleAngles = [-154, -112, -68, -26, 26, 68, 112, 154] as const;

const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const cubicPoint = (
  progress: number,
  start: Readonly<{ x: number; y: number }>,
  controlOne: Readonly<{ x: number; y: number }>,
  controlTwo: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
) => {
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * progress * controlOne.x +
      3 * inverse * progress ** 2 * controlTwo.x +
      progress ** 3 * end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * progress * controlOne.y +
      3 * inverse * progress ** 2 * controlTwo.y +
      progress ** 3 * end.y,
  };
};

const Pointer: FC<{
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly size: number;
  readonly dip: number;
}> = ({ x, y, opacity, size, dip }) => (
  <svg
    aria-hidden="true"
    height={size}
    viewBox="0 0 28 28"
    width={size}
    style={{
      filter: "drop-shadow(0 5px 8px rgba(36, 36, 36, 0.28))",
      left: x,
      opacity,
      position: "absolute",
      top: y + dip,
    }}
  >
    <path
      d="M2 1 L2 23 L8 17.5 L11.5 25 L15.5 23.2 L12 15.8 L20 15 Z"
      fill="#fffdf9"
      stroke={INK}
      strokeLinejoin="round"
      strokeWidth={1.6}
    />
  </svg>
);

export const BrandFollowScene: FC = () => {
  const frame = useCurrentFrame() * BRAND_FOLLOW_PLAYBACK_RATE;
  const { height, width } = useVideoConfig();
  const isLandscape = width > height;
  const markSize = isLandscape ? 188 : 214;
  const lockupY = height * (isLandscape ? 0.42 : 0.39);
  const shrinkProgress = interpolate(frame, [2, 40], [0, 1], {
    ...clamped,
    easing: Easing.inOut(Easing.cubic),
  });
  const brakeProgress = interpolate(frame, [36, 52], [0, 1], clamped);
  const brake = Math.sin(brakeProgress * Math.PI) * 0.06;
  const markScale =
    interpolate(
      shrinkProgress,
      [0, 1],
      [isLandscape ? 6.4 : 7.2, 1],
      clamped,
    ) *
    (1 + brake);
  const healProgress = interpolate(frame, [14, 40], [0, 1], {
    ...clamped,
    easing: Easing.inOut(Easing.quad),
  });
  const shiftX = interpolate(
    frame,
    [48, 68],
    [0, isLandscape ? -160 : -146],
    {
      ...clamped,
      easing: Easing.inOut(Easing.cubic),
    },
  );
  const buttonWidth = isLandscape ? 286 : 310;
  const buttonHeight = isLandscape ? 74 : 84;
  const buttonCenter = {
    x: width / 2,
    y: height * (isLandscape ? 0.72 : 0.68),
  };
  const buttonLeft = buttonCenter.x - buttonWidth / 2;
  const buttonTop = buttonCenter.y - buttonHeight / 2;
  const clickPoint = {
    x: buttonCenter.x + buttonWidth * 0.16,
    y: buttonCenter.y - 4,
  };
  const cursorPathProgress = interpolate(
    frame,
    [CURSOR_START_FRAME, CURSOR_SETTLE_FRAME],
    [0, 1],
    {
      ...clamped,
      easing: Easing.out(Easing.cubic),
    },
  );
  const cursor = cubicPoint(
    cursorPathProgress,
    {
      x: width * (isLandscape ? 0.18 : 0.12),
      y: height * (isLandscape ? 0.9 : 0.86),
    },
    { x: width * 0.34, y: height * 0.94 },
    { x: width * 0.72, y: height * 0.84 },
    clickPoint,
  );
  const hoverProgress = interpolate(
    frame,
    [CURSOR_SETTLE_FRAME, CURSOR_SETTLE_FRAME + 5],
    [0, 1],
    clamped,
  );
  const pressProgress = interpolate(
    frame,
    [CLICK_FRAME, CLICK_FRAME + 3, CLICK_FRAME + 9],
    [0, 1, 0],
    clamped,
  );
  const rippleProgress = interpolate(
    frame,
    [CLICK_FRAME, CLICK_FRAME + 24],
    [0, 1],
    {
      ...clamped,
      easing: Easing.out(Easing.cubic),
    },
  );
  const particleProgress = interpolate(
    frame,
    [CLICK_FRAME + 2, CLICK_FRAME + 18],
    [0, 1],
    clamped,
  );
  const isRippleVisible = frame >= CLICK_FRAME && frame < CLICK_FRAME + 24;
  const areParticlesVisible =
    frame >= CLICK_FRAME + 2 && frame < CLICK_FRAME + 18;
  const statusProgress = interpolate(
    frame,
    [CLICK_FRAME + 2, CLICK_FRAME + 8],
    [0, 1],
    {
      ...clamped,
      easing: Easing.out(Easing.cubic),
    },
  );
  const isFollowed = statusProgress >= 0.5;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 42%, #fffdf9 0%, ${PAPER} 58%, #f2ebe3 100%)`,
        color: INK,
        overflow: "hidden",
      }}
    >
      <div
        aria-label="AXMORF"
        role="img"
        style={{
          height: markSize,
          left: width / 2 - markSize / 2 + shiftX,
          position: "absolute",
          scale: markScale,
          top: lockupY - markSize / 2,
          width: markSize,
        }}
      >
        <AxmorfMark
          color={ACCENT}
          style={{
            filter: `blur(${interpolate(
              healProgress,
              [0, 1],
              [4, 0],
              clamped,
            )}px) drop-shadow(0 0 24px rgba(163, 125, 92, 0.3))`,
            height: "100%",
            opacity: 1 - healProgress,
            position: "absolute",
            width: "100%",
          }}
        />
        <AxmorfMark
          color={INK}
          style={{
            height: "100%",
            opacity: healProgress,
            position: "absolute",
            width: "100%",
          }}
        />
      </div>

      <div
        aria-label={AXMORF_WORDMARK}
        role="img"
        style={{
          alignItems: "center",
          display: "flex",
          fontFamily: "Inter, Arial, ui-sans-serif, sans-serif",
          fontSize: isLandscape ? 70 : 76,
          fontWeight: 620,
          gap: isLandscape ? 13 : 15,
          left: width / 2 + (isLandscape ? -36 : -22),
          letterSpacing: "0.12em",
          lineHeight: 1,
          position: "absolute",
          top: lockupY - (isLandscape ? 35 : 38),
        }}
      >
        {AXMORF_WORDMARK.split("").map((character, index) => (
          <span
            key={`${character}-${index}`}
            aria-hidden="true"
            style={{
              display: "inline-block",
              opacity: interpolate(
                frame,
                [64 + index * 4, 76 + index * 4],
                [0, 1],
                {
                  ...clamped,
                  easing: Easing.out(Easing.cubic),
                },
              ),
              translate: `${interpolate(
                frame,
                [64 + index * 4, 76 + index * 4],
                [18, 0],
                clamped,
              )}px 0`,
            }}
          >
            {character}
          </span>
        ))}
      </div>

      <div
        aria-label={`AXMORF 品牌关注状态：${isFollowed ? "已关注" : "关注"}`}
        role="img"
        style={{
          alignItems: "center",
          background: INK,
          border: "1px solid rgba(255, 253, 249, 0.26)",
          borderRadius: buttonHeight / 2,
          boxShadow: `inset 0 0 0 1px rgba(163, 125, 92, ${0.22 + hoverProgress * 0.22}), 0 ${14 + hoverProgress * 3}px ${34 + hoverProgress * 8}px rgba(71, 51, 34, ${0.14 + hoverProgress * 0.05}), 0 3px 8px rgba(36, 36, 36, 0.12)`,
          color: "#fffdf9",
          display: "flex",
          fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
          fontSize: isLandscape ? 27 : 30,
          fontWeight: 650,
          height: buttonHeight,
          justifyContent: "center",
          left: buttonLeft,
          opacity: interpolate(
            frame,
            [BUTTON_APPEAR_FRAME, BUTTON_APPEAR_FRAME + 16],
            [0, 1],
            clamped,
          ),
          overflow: "hidden",
          position: "absolute",
          scale:
            interpolate(
              frame,
              [BUTTON_APPEAR_FRAME, BUTTON_APPEAR_FRAME + 16],
              [0.82, 1],
              {
                ...clamped,
                easing: Easing.out(Easing.back(1.6)),
              },
            ) *
            (1 + hoverProgress * 0.024) *
            (1 - pressProgress * 0.055),
          top: buttonTop,
          width: buttonWidth,
        }}
      >
        <div
          style={{
            background: ACCENT,
            inset: 0,
            opacity: statusProgress,
            position: "absolute",
          }}
        />
        <div
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255, 253, 249, 0.28), transparent)",
            height: 1,
            left: 28,
            opacity: 0.72,
            position: "absolute",
            right: 28,
            top: 2,
          }}
        />
        <span
          aria-hidden="true"
          style={{
            alignItems: "center",
            display: "flex",
            gap: isLandscape ? 16 : 18,
            inset: 0,
            justifyContent: "center",
            letterSpacing: "0.08em",
            opacity: 1 - statusProgress,
            position: "absolute",
            translate: `${-statusProgress * 12}px 0`,
          }}
        >
          <span
            style={{
              alignItems: "center",
              background: "rgba(255, 253, 249, 0.08)",
              border: "1px solid rgba(255, 253, 249, 0.7)",
              display: "flex",
              height: isLandscape ? 26 : 29,
              justifyContent: "center",
              rotate: "45deg",
              width: isLandscape ? 26 : 29,
            }}
          >
            <span
              style={{
                fontSize: isLandscape ? 22 : 24,
                fontWeight: 400,
                lineHeight: 1,
                rotate: "-45deg",
              }}
            >
              +
            </span>
          </span>
          <span>关注 AXMORF</span>
        </span>
        <span
          aria-hidden="true"
          style={{
            alignItems: "center",
            display: "flex",
            gap: isLandscape ? 15 : 17,
            inset: 0,
            justifyContent: "center",
            letterSpacing: "0.12em",
            opacity: statusProgress,
            position: "absolute",
            translate: `${(1 - statusProgress) * 12}px 0`,
          }}
        >
          <span
            style={{
              alignItems: "center",
              background: "rgba(255, 253, 249, 0.12)",
              border: "1px solid rgba(255, 253, 249, 0.8)",
              display: "flex",
              height: isLandscape ? 26 : 29,
              justifyContent: "center",
              rotate: "45deg",
              width: isLandscape ? 26 : 29,
            }}
          >
            <span
              style={{
                alignItems: "center",
                display: "flex",
                rotate: "-45deg",
              }}
            >
              <svg
                aria-hidden="true"
                height={isLandscape ? 18 : 20}
                viewBox="0 0 32 32"
                width={isLandscape ? 18 : 20}
              >
                <path
                  d="M5 16.5L12.5 24L27 8.5"
                  fill="none"
                  pathLength={1}
                  stroke="#fffdf9"
                  strokeDasharray={1}
                  strokeDashoffset={interpolate(
                    frame,
                    [CLICK_FRAME + 3, CLICK_FRAME + 8],
                    [1, 0],
                    clamped,
                  )}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={4}
                />
              </svg>
            </span>
          </span>
          <span>已关注</span>
        </span>
      </div>

      {isRippleVisible ? (
        <div
          style={{
            border: `${interpolate(
              frame,
              [CLICK_FRAME, CLICK_FRAME + 24],
              [3, 1],
              clamped,
            )}px solid ${ACCENT}`,
            borderRadius: "50%",
            height: 52,
            left: clickPoint.x - 26,
            opacity: 0.66 * (1 - rippleProgress),
            position: "absolute",
            scale: 0.72 + rippleProgress * 1.5,
            top: clickPoint.y - 26,
            width: 52,
          }}
        />
      ) : null}

      {areParticlesVisible
        ? particleAngles.map((angle, index) => {
            const radians = (angle * Math.PI) / 180;
            const distance = 24 + particleProgress * 42;
            const length = 13 * (1 - particleProgress);
            return (
              <div
                key={angle}
                style={{
                  background: index % 2 === 0 ? ACCENT : "#ccb097",
                  borderRadius: 4,
                  height: 3,
                  left: clickPoint.x + Math.cos(radians) * distance,
                  opacity: 1 - particleProgress,
                  position: "absolute",
                  rotate: `${angle}deg`,
                  top: clickPoint.y + Math.sin(radians) * distance,
                  width: length,
                }}
              />
            );
          })
        : null}

      <Pointer
        dip={interpolate(
          frame,
          [CLICK_FRAME, CLICK_FRAME + 3, CLICK_FRAME + 9],
          [0, 4, 0],
          clamped,
        )}
        opacity={interpolate(
          frame,
          [CURSOR_START_FRAME, CURSOR_START_FRAME + 5, 160, 172],
          [0, 1, 1, 0],
          clamped,
        )}
        size={isLandscape ? 54 : 62}
        x={cursor.x}
        y={cursor.y}
      />
    </AbsoluteFill>
  );
};
