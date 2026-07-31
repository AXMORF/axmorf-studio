import type { FC } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type GradientShiftBackgroundProps = {
  colors?: [string, string, string, string];
  speed?: number;
};

type RgbColor = {
  b: number;
  g: number;
  r: number;
};

const defaultColors: [string, string, string, string] = [
  "#172554",
  "#134e4a",
  "#581c87",
  "#172554",
];

const parseHexColor = (hex: string): RgbColor => {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const lerp = (a: number, b: number, progress: number) =>
  Math.round(a + (b - a) * progress);

const interpolateColor = (colors: RgbColor[], phase: number) => {
  const scaled = phase * (colors.length - 2);
  const index = Math.floor(scaled);
  const progress = scaled - index;
  const current = colors[index] ?? colors[0];
  const next = colors[index + 1] ?? colors[colors.length - 1];

  return `rgb(${lerp(current.r, next.r, progress)}, ${lerp(current.g, next.g, progress)}, ${lerp(
    current.b,
    next.b,
    progress
  )})`;
};

export const GradientShiftBackground: FC<GradientShiftBackgroundProps> = ({
  colors = defaultColors,
  speed = 0.3,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * speed;
  const rgbColors = colors.map(parseHexColor);
  const phase1 = Math.sin(t) * 0.5 + 0.5;
  const phase2 = Math.sin(t + 2) * 0.5 + 0.5;
  const phase3 = Math.sin(t + 4) * 0.5 + 0.5;
  const angle = (frame * 0.5) % 360;

  return (
    <div
      style={{
        background: `linear-gradient(${angle}deg, ${interpolateColor(
          rgbColors,
          phase1
        )}, ${interpolateColor(rgbColors, phase2)}, ${interpolateColor(rgbColors, phase3)})`,
        height: "100%",
        width: "100%",
      }}
    />
  );
};
