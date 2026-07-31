import type { FC } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export type LogoFadeRevealProps = {
  background?: string;
  logoText?: string;
  name?: string;
  tagline?: string;
};

export const LogoFadeReveal: FC<LogoFadeRevealProps> = ({
  background = "#111827",
  logoText = "LOGO",
  name = "Company Name",
  tagline = "Your tagline here",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });
  const textProgress = spring({
    frame: Math.max(0, frame - 15),
    fps,
    config: { damping: 14, stiffness: 60, mass: 0.6 },
  });

  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: background,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #4361ee, #0f766e)",
          borderRadius: 8,
          boxShadow: "0 0 40px rgba(67, 97, 238, 0.3)",
          display: "flex",
          height: 120,
          justifyContent: "center",
          opacity: logoProgress,
          transform: `scale(${0.8 + 0.2 * logoProgress})`,
          width: 120,
        }}
      >
        <span
          style={{
            color: "white",
            fontFamily: "Inter, sans-serif",
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 0,
          }}
        >
          {logoText}
        </span>
      </div>
      <h2
        style={{
          color: "white",
          fontFamily: "Inter, sans-serif",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 0,
          marginBottom: 0,
          marginTop: 24,
          opacity: textProgress,
          transform: `translateY(${20 * (1 - textProgress)}px)`,
        }}
      >
        {name}
      </h2>
      <p
        style={{
          color: "#93c5fd",
          fontFamily: "Inter, sans-serif",
          fontSize: 16,
          marginTop: 8,
          opacity: textProgress,
          transform: `translateY(${20 * (1 - textProgress)}px)`,
        }}
      >
        {tagline}
      </p>
    </div>
  );
};
