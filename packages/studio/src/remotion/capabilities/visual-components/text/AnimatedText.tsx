import type { CSSProperties } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export type AnimatedTextProps = {
  text?: string;
  color?: string;
  fontSize?: CSSProperties["fontSize"];
  staggerInFrames?: number;
  style?: CSSProperties;
};

function AnimatedText({
  text = "Hello Remotion",
  color = "white",
  fontSize = "5rem",
  staggerInFrames = 5,
  style,
}: AnimatedTextProps = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const characters = Array.from(text);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        textAlign: "center",
        ...style,
      }}
    >
      {characters.map((char, i) => {
        const delay = i * staggerInFrames;

        const opacity = spring({
          frame: frame - delay,
          fps,
          from: 0,
          to: 1,
          config: { mass: 0.5, damping: 10 },
        });

        const y = spring({
          frame: frame - delay,
          fps,
          from: -50,
          to: 0,
          config: { mass: 0.5, damping: 10 },
        });

        const rotate = spring({
          frame: frame - delay,
          fps,
          from: -180,
          to: 0,
          config: { mass: 0.5, damping: 12 },
        });

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              color,
              fontSize,
              fontWeight: "bold",
              transform: `translateY(${y}px) rotate(${rotate}deg)`,
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        );
      })}
    </div>
  );
}

export default AnimatedText;
