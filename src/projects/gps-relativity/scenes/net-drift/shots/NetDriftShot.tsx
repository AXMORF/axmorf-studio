import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";

type NetDriftShotProps = Readonly<{
  sceneFrame: number;
  shotFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const COLORS = {
  background: "#071426",
  panel: "#0b2036",
  grid: "#17324a",
  line: "#547087",
  text: "#f4f8fb",
  muted: "#8ea6b8",
  cyan: "#56d9f5",
  receiver: "#5aa8ff",
  amber: "#ffb454",
  mint: "#74f2b3",
} as const;

const clampProgress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const fadeProgress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const ArrowHead = ({
  x,
  y,
  color,
  direction = 1,
}: {
  x: number;
  y: number;
  color: string;
  direction?: 1 | -1;
}) => (
  <polygon
    points={`${x},${y} ${x - direction * 18},${y - 10} ${x - direction * 18},${y + 10}`}
    fill={color}
  />
);

const SatelliteClock = ({ phase }: { phase: number }) => {
  const handAngle = -90 + phase * 38;
  const handX = 148 + Math.cos((handAngle * Math.PI) / 180) * 33;
  const handY = 132 + Math.sin((handAngle * Math.PI) / 180) * 33;
  return (
    <g transform="translate(86 128)">
      <g stroke={COLORS.cyan} strokeWidth="5" fill={COLORS.panel}>
        <rect x="34" y="0" width="56" height="44" rx="8" />
        <path d="M 34 9 L 0 -4 L 0 48 L 34 35" fill="#0d2942" />
        <path d="M 90 9 L 124 -4 L 124 48 L 90 35" fill="#0d2942" />
        <path d="M 62 44 L 62 66" />
      </g>
      <circle
        cx="148"
        cy="132"
        r="54"
        fill="#091a2d"
        stroke={COLORS.cyan}
        strokeWidth="5"
      />
      <circle cx="148" cy="132" r="5" fill={COLORS.cyan} />
      <line
        x1="148"
        y1="132"
        x2={handX}
        y2={handY}
        stroke={COLORS.mint}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line
        x1="148"
        y1="132"
        x2="148"
        y2="102"
        stroke={COLORS.text}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.72"
      />
      <text
        x="215"
        y="120"
        fill={COLORS.cyan}
        fontSize="24"
        fontWeight="700"
        letterSpacing="2"
      >
        SAT CLOCK
      </text>
      <text x="215" y="153" fill={COLORS.muted} fontSize="21">
        相对地面 · 每日偏差
      </text>
    </g>
  );
};

const Receiver = ({ pulse }: { pulse: number }) => (
  <g transform="translate(1570 676)">
    <circle
      cx="0"
      cy="0"
      r={34 + pulse * 8}
      fill="none"
      stroke={COLORS.receiver}
      strokeWidth="3"
      opacity={0.18 + pulse * 0.18}
    />
    <circle cx="0" cy="0" r="18" fill={COLORS.receiver} />
    <path
      d="M -24 62 Q 0 30 24 62"
      fill="none"
      stroke={COLORS.receiver}
      strokeWidth="6"
      strokeLinecap="round"
    />
    <line
      x1="0"
      y1="16"
      x2="0"
      y2="48"
      stroke={COLORS.receiver}
      strokeWidth="6"
      strokeLinecap="round"
    />
    <text x="0" y="102" fill={COLORS.muted} fontSize="21" textAnchor="middle">
      地面接收机
    </text>
  </g>
);

const style: CSSProperties = {
  fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif',
  color: COLORS.text,
  overflow: "hidden",
};

const NetDriftShot = ({
  sceneFrame,
  shotFrame,
  durationInFrames,
  fps,
  width,
  height,
}: NetDriftShotProps) => {
  const scaleX = width / 1920;
  const scaleY = height / 1080;
  const negative = clampProgress(shotFrame, 20, 62);
  const positive = clampProgress(shotFrame, 58, 118);
  const lock = clampProgress(shotFrame, 118, 136);
  const projection = clampProgress(shotFrame, 150, 184);
  const unitReveal = clampProgress(shotFrame, 176, 210);
  const distance = clampProgress(shotFrame, 202, 232);
  const exit = clampProgress(
    shotFrame,
    238,
    Math.max(239, durationInFrames - 8),
  );

  const axisLeft = 310;
  const axisRight = 1600;
  const axisY = 448;
  const axisX = (value: number) =>
    axisLeft + ((value + 10) / 60) * (axisRight - axisLeft);
  const zeroX = axisX(0);
  const negativeX = axisX(-7);
  const netX = axisX(38);
  const currentNegativeX = zeroX + (negativeX - zeroX) * negative;
  const currentNetX = negativeX + (netX - negativeX) * positive;
  const distanceValue = Math.round(114 * distance) / 10;
  const pulse = (Math.sin((sceneFrame / fps) * Math.PI * 2) + 1) / 2;
  const titleOpacity = fadeProgress(shotFrame, 0, 22);
  const bridgeY = 672;
  const distanceStartX = 560;
  const distanceEndX = 1488;
  const currentDistanceX =
    distanceStartX + (distanceEndX - distanceStartX) * distance;
  const netHalo = 24 + lock * 13 + exit * 8;
  const safeOpacity = fadeProgress(shotFrame, 8, 28);

  return (
    <AbsoluteFill style={{ ...style, backgroundColor: COLORS.background }}>
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scaleX}, ${scaleY})`,
          transformOrigin: "top left",
          position: "absolute",
        }}
      >
        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          aria-label="相对论时间净漂移映射到无线电传播距离"
        >
          <defs>
            <pattern
              id="net-drift-grid"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="2" fill={COLORS.grid} />
            </pattern>
            <linearGradient id="signal-gradient" x1="0" x2="1">
              <stop offset="0" stopColor={COLORS.mint} />
              <stop offset="0.5" stopColor={COLORS.cyan} />
              <stop offset="1" stopColor={COLORS.receiver} />
            </linearGradient>
            <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width="1920" height="1080" fill={COLORS.background} />
          <rect
            width="1920"
            height="900"
            fill="url(#net-drift-grid)"
            opacity="0.82"
          />
          <rect
            x="70"
            y="54"
            width="1780"
            height="760"
            rx="34"
            fill={COLORS.panel}
            opacity="0.42"
            stroke="#173b59"
            strokeWidth="2"
          />

          <g opacity={titleOpacity}>
            <text
              x="960"
              y="104"
              fill={COLORS.text}
              fontSize="34"
              fontWeight="750"
              textAnchor="middle"
              letterSpacing="2"
            >
              时间差，会沿信号路径变成距离差
            </text>
            <text
              x="960"
              y="142"
              fill={COLORS.muted}
              fontSize="21"
              textAnchor="middle"
              letterSpacing="3"
            >
              RELATIVISTIC CLOCK DRIFT → RANGE
            </text>
          </g>

          <SatelliteClock phase={lock} />

          <g opacity={safeOpacity}>
            <text
              x="960"
              y="336"
              fill={COLORS.muted}
              fontSize="22"
              textAnchor="middle"
              letterSpacing="2"
            >
              卫星钟相对地面 · μs / day
            </text>
            <line
              x1={axisLeft}
              y1={axisY}
              x2={axisRight}
              y2={axisY}
              stroke={COLORS.line}
              strokeWidth="3"
            />
            <ArrowHead x={axisRight} y={axisY} color={COLORS.line} />
            {[-10, 0, 10, 20, 30, 40, 50].map((tick) => (
              <g key={tick}>
                <line
                  x1={axisX(tick)}
                  y1={axisY - 12}
                  x2={axisX(tick)}
                  y2={axisY + 12}
                  stroke={tick === 0 ? COLORS.text : COLORS.line}
                  strokeWidth={tick === 0 ? 3 : 2}
                />
                <text
                  x={axisX(tick)}
                  y={axisY + 42}
                  fill={tick === 0 ? COLORS.text : COLORS.muted}
                  fontSize="19"
                  textAnchor="middle"
                >
                  {tick > 0 ? `+${tick}` : tick}
                </text>
              </g>
            ))}
          </g>

          <g opacity={negative}>
            <line
              x1={zeroX}
              y1={axisY - 42}
              x2={currentNegativeX}
              y2={axisY - 42}
              stroke={COLORS.amber}
              strokeWidth="10"
              strokeLinecap="round"
            />
            <ArrowHead
              x={currentNegativeX}
              y={axisY - 42}
              color={COLORS.amber}
              direction={-1}
            />
            <text
              x={(zeroX + negativeX) / 2}
              y={axisY - 72}
              fill={COLORS.amber}
              fontSize="27"
              fontWeight="800"
              textAnchor="middle"
            >
              −7 μs
            </text>
            <text
              x={(zeroX + negativeX) / 2}
              y={axisY - 102}
              fill={COLORS.muted}
              fontSize="18"
              textAnchor="middle"
            >
              速度效应
            </text>
          </g>

          <g opacity={fadeProgress(shotFrame, 50, 70)}>
            <line
              x1={negativeX}
              y1={axisY + 42}
              x2={currentNetX}
              y2={axisY + 42}
              stroke={COLORS.mint}
              strokeWidth="10"
              strokeLinecap="round"
            />
            <ArrowHead x={currentNetX} y={axisY + 42} color={COLORS.mint} />
            <text
              x={negativeX + (netX - negativeX) * 0.54}
              y={axisY + 88}
              fill={COLORS.mint}
              fontSize="27"
              fontWeight="800"
              textAnchor="middle"
            >
              +45 μs
            </text>
            <text
              x={negativeX + (netX - negativeX) * 0.54}
              y={axisY + 116}
              fill={COLORS.muted}
              fontSize="18"
              textAnchor="middle"
            >
              引力效应 · 从 −7 继续向右
            </text>
          </g>

          <g opacity={fadeProgress(shotFrame, 110, 126)}>
            <line
              x1={currentNetX}
              y1={axisY - 26}
              x2={currentNetX}
              y2={axisY + 27}
              stroke={COLORS.mint}
              strokeWidth="5"
            />
            <circle
              cx={currentNetX}
              cy={axisY}
              r={netHalo}
              fill="none"
              stroke={COLORS.mint}
              strokeWidth="4"
              opacity={0.36 + lock * 0.54}
              filter="url(#soft-glow)"
            />
            <rect
              x={netX - 178}
              y="236"
              width="356"
              height="86"
              rx="22"
              fill="#0b2c37"
              stroke={COLORS.mint}
              strokeWidth={2 + lock * 2}
              opacity={0.92}
            />
            <text
              x={netX}
              y="275"
              fill={COLORS.muted}
              fontSize="19"
              fontWeight="650"
              textAnchor="middle"
            >
              NET / 每日净漂移
            </text>
            <text
              x={netX}
              y="311"
              fill={COLORS.mint}
              fontSize="37"
              fontWeight="850"
              textAnchor="middle"
            >
              −7 + 45 = +38 μs
            </text>
          </g>

          <g opacity={projection}>
            <line
              x1={netX}
              y1={axisY + 18}
              x2={netX}
              y2={axisY + (bridgeY - axisY) * projection}
              stroke={COLORS.cyan}
              strokeWidth="3"
              strokeDasharray="10 10"
            />
            <circle
              cx={netX}
              cy={bridgeY}
              r="10"
              fill={COLORS.cyan}
              opacity={projection}
            />
            <path
              d={`M ${netX} ${bridgeY} C ${netX - 130} ${bridgeY - 2}, ${distanceStartX + 110} ${bridgeY - 2}, ${distanceStartX} ${bridgeY}`}
              fill="none"
              stroke={COLORS.cyan}
              strokeWidth="4"
              pathLength="1"
              strokeDasharray={`${projection} 1`}
            />
            <text
              x="960"
              y="623"
              fill={COLORS.cyan}
              fontSize="20"
              textAnchor="middle"
              letterSpacing="2"
            >
              同一个时间量投影到信号路径
            </text>
          </g>

          <g opacity={unitReveal}>
            <line
              x1={distanceStartX}
              y1={bridgeY}
              x2={currentDistanceX}
              y2={bridgeY}
              stroke="url(#signal-gradient)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <ArrowHead
              x={currentDistanceX}
              y={bridgeY}
              color={COLORS.receiver}
            />
            {Array.from({ length: 39 }, (_, index) => {
              const x =
                distanceStartX + ((distanceEndX - distanceStartX) * index) / 38;
              const visible = index / 38 <= distance + 0.001;
              return (
                <line
                  key={index}
                  x1={x}
                  y1={bridgeY - (index % 5 === 0 ? 17 : 9)}
                  x2={x}
                  y2={bridgeY + (index % 5 === 0 ? 17 : 9)}
                  stroke={COLORS.text}
                  strokeWidth={index % 5 === 0 ? 2 : 1}
                  opacity={visible ? 0.72 : 0.12}
                />
              );
            })}
            <path
              d={`M ${distanceStartX} 724 L ${distanceStartX} 744 L ${distanceStartX + (distanceEndX - distanceStartX) / 38} 744 L ${distanceStartX + (distanceEndX - distanceStartX) / 38} 724`}
              fill="none"
              stroke={COLORS.cyan}
              strokeWidth="2"
            />
            <text
              x={distanceStartX + 12}
              y="781"
              fill={COLORS.cyan}
              fontSize="25"
              fontWeight="750"
            >
              1 μs ≈ 300 m
            </text>
            <text
              x={distanceEndX}
              y="720"
              fill={COLORS.muted}
              fontSize="18"
              textAnchor="end"
            >
              38 个相同的微秒刻度
            </text>
          </g>

          <g opacity={fadeProgress(shotFrame, 212, 228)}>
            <rect
              x="1110"
              y="742"
              width="378"
              height="68"
              rx="18"
              fill="#0d2a40"
              stroke={COLORS.receiver}
              strokeWidth="2"
            />
            <text
              x="1299"
              y="785"
              fill={COLORS.text}
              fontSize="30"
              fontWeight="820"
              textAnchor="middle"
            >
              38 μs → {distanceValue.toFixed(1)} km / day
            </text>
          </g>

          <Receiver pulse={pulse * distance} />

          <g opacity={exit}>
            <line
              x1={netX + 38}
              y1="360"
              x2="1745"
              y2="360"
              stroke={COLORS.mint}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <ArrowHead x={1745} y={360} color={COLORS.mint} />
            <text
              x="1740"
              y="329"
              fill={COLORS.mint}
              fontSize="19"
              fontWeight="700"
              textAnchor="end"
            >
              正向累计漂移继续
            </text>
          </g>

          <line
            x1="90"
            y1="880"
            x2="1830"
            y2="880"
            stroke="#15334c"
            strokeWidth="2"
          />
          <text
            x="110"
            y="923"
            fill={COLORS.muted}
            fontSize="18"
            letterSpacing="2"
          >
            CLOCK BIAS
          </text>
          <text
            x="1810"
            y="923"
            fill={COLORS.muted}
            fontSize="18"
            textAnchor="end"
            letterSpacing="2"
          >
            RANGE ERROR NEXT →
          </text>
        </svg>
      </div>
    </AbsoluteFill>
  );
};

export default NetDriftShot;
