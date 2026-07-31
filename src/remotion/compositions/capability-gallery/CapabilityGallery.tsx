import type { FC } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const capabilities = [
  "Camera",
  "Effects",
  "Lottie / Media",
  "Motion",
  "Primitives",
  "Sound",
  "Styles",
  "Transitions",
] as const;

export const CapabilityGallery: FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 8%, rgba(84,232,255,.16), transparent 34%), #080b14",
        color: "#f8fafc",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        padding: "92px 120px",
      }}
    >
      <div style={{ color: "#54e8ff", fontSize: 24, fontWeight: 760, letterSpacing: "0.18em" }}>
        REMOTION STORY PRODUCER
      </div>
      <div style={{ fontSize: 66, fontWeight: 820, marginTop: 18, opacity }}>基础能力工程</div>
      <div
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "repeat(4, 1fr)",
          marginTop: 56,
        }}
      >
        {capabilities.map((capability, index) => {
          const progress = interpolate(frame, [8 + index * 4, 24 + index * 4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={capability}
              style={{
                background: "rgba(17, 24, 39, 0.84)",
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 22,
                fontSize: 27,
                fontWeight: 720,
                opacity: progress,
                padding: "34px 28px",
                transform: `translateY(${(1 - progress) * 22}px)`,
              }}
            >
              {capability}
            </div>
          );
        })}
      </div>
      <div style={{ color: "#94a3b8", fontSize: 25, marginTop: 42 }}>
        目标架构已写入文档，生产链尚未实现。
      </div>
    </AbsoluteFill>
  );
};
