import type {FC} from "react";

type RendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}>;

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

const smooth = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};

const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const Renderer: FC<RendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  width,
  height,
}) => {
  if (
    storyId !== "rounded-airplane-windows" ||
    meaningId !== "rounded-load-path" ||
    durationInFrames !== 504 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames
  ) {
    throw new Error("rounded-load-path Renderer received stale Scene identity.");
  }

  const reshape = smooth((sceneFrame - 18) / 220);
  const reveal = smooth((sceneFrame - 72) / 196);
  const conclusion = smooth((sceneFrame - 286) / 90);
  const radius = mix(22, 184, reshape);
  const hotOpacity = 0.9 * (1 - reshape);
  const flowOpacity = 0.16 + 0.84 * reveal;
  const peakStress = mix(3.4, 1.2, reshape);
  const flowOffset = -((sceneFrame * 2.1) % 54);
  const markerFrames = [28, 228, 356];

  return (
    <div
      data-scene="rounded-load-path"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        color: "#f2ecd8",
        background:
          "radial-gradient(circle at 50% 42%, #123552 0%, #0a243a 48%, #061827 100%)",
        fontFamily: '"Arial", "Noto Sans SC", sans-serif',
      }}
    >
      <svg
        viewBox="0 0 1080 1920"
        width="1080"
        height="1920"
        style={{position: "absolute", inset: 0}}
      >
        <defs>
          <pattern id="engineering-grid" width="54" height="54" patternUnits="userSpaceOnUse">
            <path d="M 54 0 L 0 0 0 54" fill="none" stroke="#6ea6c7" strokeWidth="1" opacity="0.12" />
          </pattern>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <rect width="1080" height="1920" fill="url(#engineering-grid)" />
        <path
          d="M80 460 C270 386 810 386 1000 460 L1000 1442 C810 1512 270 1512 80 1442 Z"
          fill="#0b2b43"
          stroke="#6ea6c7"
          strokeWidth="3"
          opacity="0.78"
        />
        <path
          d="M106 486 C290 426 790 426 974 486"
          fill="none"
          stroke="#f2ecd8"
          strokeWidth="2"
          opacity="0.26"
          strokeDasharray="12 15"
        />

        <rect
          x="180"
          y="590"
          width="720"
          height="690"
          rx={radius}
          fill="#071d2d"
          stroke="#f2ecd8"
          strokeWidth="9"
        />
        <rect
          x="208"
          y="618"
          width="664"
          height="634"
          rx={Math.max(8, radius - 26)}
          fill="#0c304a"
          stroke="#72d5dc"
          strokeWidth="3"
          opacity={0.48 + 0.3 * reveal}
        />

        {[
          [184, 594],
          [896, 594],
          [184, 1276],
          [896, 1276],
        ].map(([cx, cy], index) => (
          <g key={`${cx}-${cy}`} opacity={hotOpacity}>
            <circle cx={cx} cy={cy} r={48 - 18 * reshape} fill="#ff6a3d" opacity="0.24" filter="url(#soft-glow)" />
            <circle cx={cx} cy={cy} r={15 - 5 * reshape} fill="#ff7b48" />
            <text x={cx + (index % 2 === 0 ? 25 : -25)} y={cy - 30} textAnchor={index % 2 === 0 ? "start" : "end"} fill="#ffb08b" fontSize="24">
              σ PEAK
            </text>
          </g>
        ))}

        {[
          "M172 800 C172 626 320 570 504 570 C688 570 908 626 908 800",
          "M158 910 C158 666 332 546 540 546 C748 546 922 666 922 910",
          "M172 1070 C172 1244 320 1300 504 1300 C688 1300 908 1244 908 1070",
          "M158 960 C158 1204 332 1324 540 1324 C748 1324 922 1204 922 960",
        ].map((path, index) => (
          <path
            key={path}
            d={path}
            fill="none"
            stroke={index % 2 === 0 ? "#72d5dc" : "#4fa8c9"}
            strokeWidth={7 - index}
            strokeLinecap="round"
            strokeDasharray="30 24"
            strokeDashoffset={flowOffset + index * 12}
            opacity={flowOpacity * (0.84 - index * 0.1)}
          />
        ))}

        <path
          d="M540 522 L540 472 M540 1372 L540 1422 M130 935 L80 935 M950 935 L1000 935"
          stroke="#f2ecd8"
          strokeWidth="2"
          opacity="0.5"
        />

        {markerFrames.map((frame, index) => {
          const active = sceneFrame >= frame;
          const y = 1538 + index * 58;
          return (
            <g key={frame} opacity={active ? 1 : 0.28}>
              <circle cx="126" cy={y} r="8" fill={active ? "#72d5dc" : "#6a7f8e"} />
              <line x1="148" y1={y} x2={active ? 148 + 176 : 176} y2={y} stroke={active ? "#72d5dc" : "#6a7f8e"} strokeWidth="3" />
            </g>
          );
        })}
      </svg>

      <div style={{position: "absolute", left: 80, top: 100, width: 860}}>
        <div style={{fontSize: 25, letterSpacing: 7, color: "#72d5dc"}}>LOAD PATH / 02</div>
        <div style={{marginTop: 18, fontSize: 72, fontWeight: 750, letterSpacing: -2}}>圆角让载荷继续向前走</div>
        <div style={{marginTop: 18, width: 640, fontSize: 28, lineHeight: 1.5, color: "#a7bed0"}}>
          CONTINUOUS CURVATURE · DISTRIBUTED STRESS
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 82,
          top: 1338,
          width: 310,
          padding: "26px 28px",
          border: "1px solid rgba(242,236,216,0.34)",
          background: "rgba(5,24,39,0.78)",
        }}
      >
        <div style={{fontSize: 19, letterSpacing: 4, color: "#8aa7ba"}}>RELATIVE σMAX</div>
        <div style={{marginTop: 8, fontSize: 68, lineHeight: 1, color: reshape > 0.82 ? "#72d5dc" : "#ff7b48"}}>
          {peakStress.toFixed(1)}×
        </div>
        <div style={{marginTop: 14, fontSize: 22, color: "#f2ecd8", opacity: 0.72 + 0.28 * conclusion}}>
          峰值降低 · 路径连续
        </div>
      </div>

      <div style={{position: "absolute", left: 80, bottom: 92, display: "flex", alignItems: "center", gap: 18}}>
        <div style={{width: 14, height: 14, borderRadius: 7, background: "#72d5dc"}} />
        <div style={{fontSize: 24, letterSpacing: 2, color: "#b8cbd6"}}>ROUNDED GEOMETRY / LOWER FATIGUE RISK</div>
      </div>
    </div>
  );
};

export default Renderer;
