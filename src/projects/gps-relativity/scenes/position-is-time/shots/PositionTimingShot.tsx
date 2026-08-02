import { Easing, interpolate } from "remotion";

type PositionTimingShotProps = Readonly<{
  shotFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

type SatelliteSignal = Readonly<{
  id: string;
  x: number;
  y: number;
  startFrame: number;
  arrivalFrame: number;
  rangeLabel: string;
  phase: number;
}>;

const palette = {
  space: "#071525",
  spaceLift: "#0b2138",
  cyan: "#57d8f6",
  cyanSoft: "#2494b7",
  receiver: "#3e8dff",
  mint: "#72f3c1",
  amber: "#ffb65a",
  white: "#edf8ff",
  muted: "#88a8bc",
  grid: "#15344d",
} as const;

const receiver = { x: 1432, y: 630 } as const;

const satellites: readonly SatelliteSignal[] = [
  {
    id: "S1",
    x: 238,
    y: 248,
    startFrame: 38,
    arrivalFrame: 188,
    rangeLabel: "20 183 km",
    phase: 0,
  },
  {
    id: "S2",
    x: 520,
    y: 124,
    startFrame: 62,
    arrivalFrame: 212,
    rangeLabel: "21 006 km",
    phase: 11,
  },
  {
    id: "S3",
    x: 706,
    y: 330,
    startFrame: 91,
    arrivalFrame: 232,
    rangeLabel: "22 041 km",
    phase: 21,
  },
  {
    id: "S4",
    x: 970,
    y: 164,
    startFrame: 118,
    arrivalFrame: 248,
    rangeLabel: "23 112 km",
    phase: 32,
  },
];

const clampProgress = (frame: number, startFrame: number, endFrame: number) =>
  interpolate(frame, [startFrame, endFrame], [0, 1], {
    easing: Easing.bezier(0.42, 0, 0.58, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const arrivalPulse = (frame: number, arrivalFrame: number) => {
  const rise = interpolate(frame, [arrivalFrame - 3, arrivalFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fall = interpolate(frame, [arrivalFrame, arrivalFrame + 18], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return Math.min(rise, fall);
};

const SatelliteClock = ({
  satellite,
  shotFrame,
  fps,
}: Readonly<{
  satellite: SatelliteSignal;
  shotFrame: number;
  fps: number;
}>) => {
  const enter = interpolate(
    shotFrame,
    [satellite.startFrame - Math.round(0.9 * fps), satellite.startFrame],
    [0, 1],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const clockAngle = ((shotFrame + satellite.phase) * 4.2) % 360;
  const pulsePhase = ((shotFrame + satellite.phase) % 54) / 54;

  return (
    <g
      transform={`translate(${satellite.x} ${satellite.y - (1 - enter) * 24})`}
      opacity={enter}
    >
      <circle
        r={52 + pulsePhase * 26}
        fill="none"
        stroke={palette.cyan}
        strokeWidth={2}
        opacity={(1 - pulsePhase) * 0.22}
      />
      <rect
        x={-54}
        y={-30}
        width={108}
        height={60}
        rx={18}
        fill="#0f3550"
        stroke={palette.cyan}
        strokeWidth={3}
      />
      <path
        d="M-72 -16 L-54 -7 M-72 16 L-54 7 M72 -16 L54 -7 M72 16 L54 7"
        stroke={palette.cyanSoft}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <circle
        cx={0}
        cy={0}
        r={22}
        fill={palette.space}
        stroke={palette.white}
        strokeWidth={2}
      />
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={-14}
        stroke={palette.cyan}
        strokeWidth={3}
        strokeLinecap="round"
        transform={`rotate(${clockAngle})`}
      />
      <circle r={3.5} fill={palette.cyan} />
      <text
        x={0}
        y={54}
        fill={palette.cyan}
        fontSize={22}
        fontWeight={700}
        textAnchor="middle"
        letterSpacing={2}
      >
        {satellite.id} · TIME
      </text>
    </g>
  );
};

export const PositionTimingShot = ({
  shotFrame,
  durationInFrames,
  fps,
  width,
  height,
}: PositionTimingShotProps) => {
  const fieldEnter = interpolate(shotFrame, [0, 28], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const geometryResolve = clampProgress(shotFrame, 218, 272);
  const lockPulse = arrivalPulse(shotFrame, 212);
  const titleFade = interpolate(
    shotFrame,
    [durationInFrames - 36, durationInFrames - 1],
    [1, 0.62],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        background: `radial-gradient(circle at 76% 38%, ${palette.spaceLift} 0%, ${palette.space} 58%, #050e19 100%)`,
        color: palette.white,
        fontFamily:
          'Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <svg
        viewBox="0 0 1920 1080"
        width={width}
        height={height}
        aria-label="GPS signals convert arrival-time differences into distances"
      >
        <defs>
          <linearGradient
            id="earth-position-timing"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0" stopColor="#164c70" />
            <stop offset="1" stopColor="#071b31" />
          </linearGradient>
          <filter
            id="position-timing-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g opacity={fieldEnter * 0.7}>
          {Array.from({ length: 14 }, (_, index) => (
            <line
              key={`vertical-${index}`}
              x1={80 + index * 140}
              y1={76}
              x2={80 + index * 140}
              y2={820}
              stroke={palette.grid}
              strokeWidth={1}
              strokeDasharray="3 18"
            />
          ))}
          {Array.from({ length: 7 }, (_, index) => (
            <line
              key={`horizontal-${index}`}
              x1={64}
              y1={116 + index * 112}
              x2={1848}
              y2={116 + index * 112}
              stroke={palette.grid}
              strokeWidth={1}
              strokeDasharray="3 18"
            />
          ))}
        </g>

        <g opacity={fieldEnter * titleFade}>
          <text
            x={94}
            y={92}
            fill={palette.muted}
            fontSize={21}
            fontWeight={700}
            letterSpacing={4}
          >
            GPS RANGE FIELD · ARRIVAL TIME
          </text>
          <text
            x={94}
            y={140}
            fill={palette.white}
            fontSize={38}
            fontWeight={760}
          >
            位置，先是时间
          </text>
          <line
            x1={94}
            y1={164}
            x2={346}
            y2={164}
            stroke={palette.cyan}
            strokeWidth={4}
          />
        </g>

        <path
          d="M-160 1110 Q960 610 2080 1110 Z"
          fill="url(#earth-position-timing)"
          stroke={palette.cyanSoft}
          strokeWidth={4}
          opacity={fieldEnter}
        />
        <path
          d="M110 1022 Q960 718 1810 1022"
          fill="none"
          stroke={palette.grid}
          strokeWidth={2}
          strokeDasharray="7 20"
          opacity={fieldEnter * 0.8}
        />

        {satellites.map((satellite) => {
          const progress = clampProgress(
            shotFrame,
            satellite.startFrame,
            satellite.arrivalFrame,
          );
          const signalX = satellite.x + (receiver.x - satellite.x) * progress;
          const signalY = satellite.y + (receiver.y - satellite.y) * progress;
          const pulse = arrivalPulse(shotFrame, satellite.arrivalFrame);
          const lineLength = Math.hypot(
            receiver.x - satellite.x,
            receiver.y - satellite.y,
          );
          const labelX = satellite.x + (receiver.x - satellite.x) * 0.58;
          const labelY = satellite.y + (receiver.y - satellite.y) * 0.58 - 22;

          return (
            <g key={satellite.id}>
              <line
                x1={satellite.x}
                y1={satellite.y}
                x2={receiver.x}
                y2={receiver.y}
                stroke={palette.cyanSoft}
                strokeWidth={3}
                strokeDasharray={`${lineLength} ${lineLength}`}
                strokeDashoffset={lineLength * (1 - progress)}
                opacity={0.26 + progress * 0.52}
              />
              <circle
                cx={signalX}
                cy={signalY}
                r={8 + 5 * progress}
                fill={palette.white}
                stroke={palette.cyan}
                strokeWidth={4}
                filter="url(#position-timing-glow)"
                opacity={progress > 0 && progress < 1 ? 1 : 0}
              />
              <circle
                cx={receiver.x}
                cy={receiver.y}
                r={26 + pulse * 82}
                fill="none"
                stroke={
                  satellite.arrivalFrame === 212 ? palette.amber : palette.mint
                }
                strokeWidth={4 - pulse * 2}
                opacity={pulse * 0.9}
              />
              <g
                opacity={clampProgress(
                  shotFrame,
                  satellite.arrivalFrame + 3,
                  satellite.arrivalFrame + 10,
                )}
              >
                <rect
                  x={labelX - 72}
                  y={labelY - 21}
                  width={144}
                  height={36}
                  rx={18}
                  fill="#0a1c2d"
                  stroke={palette.cyanSoft}
                  strokeWidth={1.5}
                />
                <text
                  x={labelX}
                  y={labelY + 4}
                  fill={palette.white}
                  fontSize={18}
                  fontWeight={650}
                  textAnchor="middle"
                  letterSpacing={1}
                >
                  {satellite.rangeLabel}
                </text>
              </g>
              <SatelliteClock
                satellite={satellite}
                shotFrame={shotFrame}
                fps={fps}
              />
            </g>
          );
        })}

        <g
          transform={`translate(${receiver.x} ${receiver.y})`}
          opacity={fieldEnter}
        >
          <circle
            r={86 + lockPulse * 10}
            fill="#0a2744"
            stroke={lockPulse > 0 ? palette.amber : palette.receiver}
            strokeWidth={5}
            filter="url(#position-timing-glow)"
          />
          <circle r={56} fill="#0d3b6a" stroke={palette.cyan} strokeWidth={2} />
          <path
            d="M-27 9 Q0 -20 27 9 M-17 22 Q0 5 17 22"
            fill="none"
            stroke={palette.white}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <circle cy={34} r={6} fill={palette.mint} />
          <text
            x={0}
            y={126}
            fill={palette.receiver}
            fontSize={24}
            fontWeight={750}
            textAnchor="middle"
            letterSpacing={2}
          >
            RECEIVER · Δt
          </text>
          <g opacity={geometryResolve}>
            <rect
              x={-111}
              y={148}
              width={222}
              height={42}
              rx={21}
              fill="#0b1f31"
              stroke={palette.mint}
              strokeWidth={2}
            />
            <text
              x={0}
              y={176}
              fill={palette.mint}
              fontSize={20}
              fontWeight={760}
              textAnchor="middle"
              letterSpacing={2}
            >
              4 RANGES LOCKED
            </text>
          </g>
        </g>

        <g
          transform={`translate(${1530 + (1 - geometryResolve) * 64} 292)`}
          opacity={geometryResolve}
        >
          <rect
            x={-2}
            y={-58}
            width={300}
            height={176}
            rx={28}
            fill="#091d31"
            stroke={palette.grid}
            strokeWidth={2}
          />
          <text
            x={24}
            y={-18}
            fill={palette.muted}
            fontSize={18}
            fontWeight={700}
            letterSpacing={3}
          >
            TIME → RANGE
          </text>
          <text
            x={24}
            y={43}
            fill={palette.white}
            fontSize={40}
            fontWeight={780}
          >
            c × Δt
          </text>
          <text
            x={182}
            y={43}
            fill={palette.amber}
            fontSize={35}
            fontWeight={700}
          >
            →
          </text>
          <text
            x={24}
            y={90}
            fill={palette.mint}
            fontSize={27}
            fontWeight={730}
          >
            距离
          </text>
          <text
            x={118}
            y={90}
            fill={palette.cyan}
            fontSize={22}
            fontWeight={650}
          >
            299.8 m / μs
          </text>
        </g>

        <g opacity={clampProgress(shotFrame, 264, 300)}>
          <path
            d="M1170 724 C1270 760 1350 764 1432 716"
            fill="none"
            stroke={palette.mint}
            strokeWidth={3}
            strokeDasharray="7 13"
          />
          <text
            x={1088}
            y={752}
            fill={palette.mint}
            fontSize={20}
            fontWeight={700}
            letterSpacing={2}
          >
            ARRIVAL TIMES COMPARED
          </text>
        </g>
      </svg>
    </div>
  );
};
