import type { FC } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export type PoppingTextProps = {
  colors?: string[];
  fontSize?: number;
  text?: string;
};

const defaultColors = ["#0f766e", "#2563eb", "#22d3ee"];

export const PoppingText: FC<PoppingTextProps> = ({
  colors = defaultColors,
  fontSize = 128,
  text = "BINGO!",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const characters = text.split("");

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        left: "50%",
        position: "absolute",
        textAlign: "center",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
      }}
    >
      {characters.map((char, index) => {
        const delay = index * 7;
        const color = colors[index % colors.length] ?? defaultColors[0];
        const progress = spring({
          frame: frame - delay,
          fps,
          from: 0,
          to: 1,
          config: { mass: 0.4, damping: 8, stiffness: 100 },
        });

        return (
          <span
            key={`${char}-${index}`}
            style={{
              color,
              display: "inline-block",
              fontFamily: "'Impact', 'Arial Black', sans-serif",
              fontSize,
              fontWeight: 900,
              letterSpacing: 0,
              margin: "0 0.08em",
              opacity: progress,
              textShadow: `0 0 10px ${color}80, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff`,
              transform: `scale(${progress})`,
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        );
      })}
    </div>
  );
};
