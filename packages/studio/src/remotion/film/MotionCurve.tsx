import { FilmMotionCurveSchema } from "../../contracts/film";
/** Internal Still, rendered through the same props-file path as ContactSheet. */
export const MotionCurve = (input: Record<string, unknown>) => {
  const curve = FilmMotionCurveSchema.parse(input);
  const max = Math.max(1, ...curve.seconds.map((p) => p.difference));
  const duration = Math.max(
    1,
    ...curve.samples.map((p) => p.frame / curve.fps),
  );
  const x = (second: number) => 60 + (second / duration) * 870;
  const y = (difference: number) => 265 - (difference / max) * 205;
  return (
    <svg
      width={960}
      height={320}
      viewBox="0 0 960 320"
      style={{ background: "#f4f4f5", fontFamily: "Arial", fontSize: 16 }}
    >
      <text x={30} y={30}>
        Visual change / second · sum of grayscale MAD · dashed: candidate cuts
        (±0.5s)
      </text>
      <path d="M60 55 V265 H930" fill="none" stroke="#71717a" />
      <polyline
        points={curve.seconds
          .map((p) => `${x(p.second)},${y(p.difference)}`)
          .join(" ")}
        fill="none"
        stroke="#0369a1"
        strokeWidth={2}
      />
      {curve.cuts.map((p) => (
        <line
          key={p.frame}
          x1={x(p.frame / curve.fps)}
          x2={x(p.frame / curve.fps)}
          y1={55}
          y2={265}
          stroke="#b45309"
          strokeDasharray="4 4"
        />
      ))}
      <text x={10} y={65}>
        {max.toFixed(1)}
      </text>
      <text x={35} y={270}>
        0
      </text>
      <text x={60} y={300}>
        0s
      </text>
      <text x={870} y={300}>
        {duration.toFixed(1)}s
      </text>
    </svg>
  );
};
