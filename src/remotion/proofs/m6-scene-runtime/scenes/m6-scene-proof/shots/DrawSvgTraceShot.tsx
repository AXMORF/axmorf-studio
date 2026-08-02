import { Easing, Img, interpolate } from "remotion";

export const DrawSvgTraceShot = ({
  shotFrame,
  shapeSrc,
}: {
  readonly shotFrame: number;
  readonly shapeSrc: string;
}) => {
  const trace = interpolate(shotFrame, [8, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const closeFlash = interpolate(shotFrame, [48, 50, 56], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const contentOpacity = interpolate(shotFrame, [48, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const settle = interpolate(shotFrame, [56, 72], [1.035, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const penAngle = trace * Math.PI * 2 - Math.PI / 2;

  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: "#020617",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          height: 380,
          opacity: contentOpacity,
          transform: `scale(${settle})`,
          width: 560,
        }}
      >
        <Img src={shapeSrc} style={{ height: "100%", width: "100%" }} />
      </div>
      <svg
        height={420}
        opacity={shotFrame >= 0 ? 1 : 0}
        style={{ position: "absolute" }}
        viewBox="0 0 600 420"
        width={600}
      >
        <rect
          fill="none"
          height={380}
          pathLength={1}
          rx={28}
          stroke={closeFlash > 0.5 ? "#ffffff" : "#22d3ee"}
          strokeDasharray={1}
          strokeDashoffset={1 - trace}
          strokeWidth={5 + closeFlash * 5}
          width={560}
          x={20}
          y={20}
        />
        <circle
          cx={300 + Math.cos(penAngle) * 280}
          cy={210 + Math.sin(penAngle) * 190}
          fill="#f8fafc"
          opacity={trace > 0.02 && trace < 0.985 ? 1 : 0}
          r={9}
        />
      </svg>
      <div
        style={{
          color: "#e2e8f0",
          fontFamily: "Arial, sans-serif",
          fontSize: 28,
          fontWeight: 700,
          left: 72,
          letterSpacing: 3,
          position: "absolute",
          top: 62,
        }}
      >
        M6 · FIXED SCENE WINDOW
      </div>
    </div>
  );
};
