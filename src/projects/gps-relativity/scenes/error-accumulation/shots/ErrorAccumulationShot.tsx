import { Easing, interpolate } from "remotion";

const COLORS = {
  background: "#071426",
  panel: "#0c2038",
  grid: "#27435d",
  cyan: "#45d9ff",
  amber: "#ffb15c",
  mint: "#64f0bd",
  receiver: "#4d8dff",
  white: "#eef7ff",
  muted: "#83a2bb",
} as const;

const clampProgress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const pointOnLine = (
  start: readonly [number, number],
  end: readonly [number, number],
  progress: number,
) => ({
  x: start[0] + (end[0] - start[0]) * progress,
  y: start[1] + (end[1] - start[1]) * progress,
});

export type ErrorAccumulationShotProps = Readonly<{
  sceneFrame: number;
  shotFrame: number;
  durationInFrames: number;
}>;

export const ErrorAccumulationShot = ({
  sceneFrame,
  shotFrame,
  durationInFrames,
}: ErrorAccumulationShotProps) => {
  const fieldEnter = clampProgress(shotFrame, 0, 42);
  const clockDrift = clampProgress(shotFrame, 38, 104);
  const errorGrowth = clampProgress(shotFrame, 64, 176);
  const threshold = clampProgress(shotFrame, 142, 168);
  const network = clampProgress(shotFrame, 205, 276);
  const correction = clampProgress(shotFrame, 270, 355);
  const settled = clampProgress(shotFrame, 346, 382);

  const errorRadius = interpolate(errorGrowth, [0, 1], [28, 254]);
  const correctedRadius = errorRadius * (1 - correction * 0.82);
  const errorOpacity = (0.22 + errorGrowth * 0.74) * (1 - correction * 0.82);
  const lineDraw = interpolate(fieldEnter, [0, 1], [1, 0]);
  const networkDash = interpolate(network, [0, 1], [1, 0]);
  const driftValue = (0.1 + clockDrift * 3.9).toFixed(1);
  const signalPhase = (((sceneFrame % 84) + 84) % 84) / 84;
  const correctedPhase = (((sceneFrame % 66) + 66) % 66) / 66;

  const satellite: readonly [number, number] = [448, 244];
  const receiver: readonly [number, number] = [1498, 532];
  const control: readonly [number, number] = [656, 646];
  const signalPoint = pointOnLine(satellite, receiver, signalPhase);
  const controlToSatellite = pointOnLine(control, satellite, correctedPhase);
  const controlToReceiver = pointOnLine(control, receiver, correctedPhase);

  return (
    <div
      data-scene-frame={sceneFrame}
      data-shot-frame={shotFrame}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: COLORS.background,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg
        aria-label="微小钟差扩张为公里级误差并由共享时间网络校正"
        viewBox="0 0 1920 1080"
        width="100%"
        height="100%"
        role="img"
      >
        <defs>
          <pattern
            id="error-accumulation-dot-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.4" fill={COLORS.grid} opacity="0.5" />
          </pattern>
          <radialGradient id="error-range-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.04" />
            <stop offset="72%" stopColor={COLORS.amber} stopOpacity="0.1" />
            <stop offset="100%" stopColor={COLORS.amber} stopOpacity="0.2" />
          </radialGradient>
        </defs>

        <rect width="1920" height="1080" fill={COLORS.background} />
        <rect
          width="1920"
          height="850"
          fill="url(#error-accumulation-dot-grid)"
        />

        <g opacity={fieldEnter}>
          <circle
            cx="960"
            cy="1042"
            r="486"
            fill="#0a2944"
            stroke="#1a5775"
            strokeWidth="3"
          />
          <path
            d="M 326 344 Q 935 18 1592 338"
            fill="none"
            stroke={COLORS.cyan}
            strokeOpacity="0.24"
            strokeWidth="3"
            strokeDasharray="12 20"
          />
          <text
            x="94"
            y="92"
            fill={COLORS.muted}
            fontSize="24"
            letterSpacing="5"
          >
            GPS · RANGING CHAIN
          </text>
          <text
            x="94"
            y="142"
            fill={COLORS.white}
            fontSize="42"
            fontWeight="700"
          >
            时间偏差会变成距离偏差
          </text>
        </g>

        <g opacity={fieldEnter} transform="translate(448 244)">
          <rect
            x="-58"
            y="-36"
            width="116"
            height="72"
            rx="13"
            fill={COLORS.panel}
            stroke={COLORS.cyan}
            strokeWidth="3"
          />
          <rect
            x="-142"
            y="-24"
            width="72"
            height="48"
            rx="5"
            fill="#103252"
            stroke={COLORS.cyan}
            strokeWidth="2"
          />
          <rect
            x="70"
            y="-24"
            width="72"
            height="48"
            rx="5"
            fill="#103252"
            stroke={COLORS.cyan}
            strokeWidth="2"
          />
          <circle
            cx="0"
            cy="0"
            r="18"
            fill={COLORS.cyan}
            fillOpacity="0.18"
            stroke={COLORS.cyan}
            strokeWidth="3"
          />
          <path
            d="M -8 0 H 0 V -10"
            fill="none"
            stroke={COLORS.white}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <text
            x="-82"
            y="77"
            fill={COLORS.cyan}
            fontSize="25"
            fontWeight="700"
          >
            卫星钟
          </text>
        </g>

        <g opacity={fieldEnter}>
          <path
            d="M 448 244 L 1498 532"
            fill="none"
            stroke={COLORS.cyan}
            strokeOpacity="0.72"
            strokeWidth="4"
            strokeDasharray="1"
            pathLength="1"
            strokeDashoffset={lineDraw}
          />
          <circle
            cx={signalPoint.x}
            cy={signalPoint.y}
            r="8"
            fill={COLORS.cyan}
          />
          <circle
            cx={signalPoint.x}
            cy={signalPoint.y}
            r="18"
            fill="none"
            stroke={COLORS.cyan}
            strokeOpacity="0.32"
            strokeWidth="3"
          />
        </g>

        <g opacity={clockDrift} transform="translate(448 244)">
          <circle
            cx="0"
            cy="0"
            r={30 + clockDrift * 16}
            fill="none"
            stroke={COLORS.amber}
            strokeOpacity={0.25 + clockDrift * 0.5}
            strokeWidth="4"
          />
          <path
            d="M 12 -8 L 31 -21"
            stroke={COLORS.amber}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
        <g opacity={clockDrift} transform="translate(620 190)">
          <rect
            width="250"
            height="82"
            rx="16"
            fill={COLORS.panel}
            stroke={COLORS.amber}
            strokeOpacity="0.75"
          />
          <text
            x="24"
            y="31"
            fill={COLORS.muted}
            fontSize="19"
            letterSpacing="2"
          >
            微小钟差
          </text>
          <text
            x="24"
            y="65"
            fill={COLORS.amber}
            fontSize="31"
            fontWeight="800"
          >
            +{driftValue} µs
          </text>
        </g>

        <g opacity={errorOpacity}>
          <circle
            cx={receiver[0]}
            cy={receiver[1]}
            r={correctedRadius}
            fill="url(#error-range-fill)"
          />
          <circle
            cx={receiver[0]}
            cy={receiver[1]}
            r={correctedRadius}
            fill="none"
            stroke={COLORS.amber}
            strokeWidth={threshold > 0.2 ? 5 : 3}
            strokeDasharray="15 12"
          />
          <line
            x1={receiver[0] - correctedRadius}
            y1={receiver[1]}
            x2={receiver[0] + correctedRadius}
            y2={receiver[1]}
            stroke={COLORS.amber}
            strokeOpacity="0.62"
            strokeWidth="2"
          />
        </g>

        <g
          opacity={errorGrowth * (1 - threshold)}
          transform="translate(1180 322)"
        >
          <rect
            width="292"
            height="88"
            rx="16"
            fill={COLORS.panel}
            stroke={COLORS.amber}
            strokeOpacity="0.55"
          />
          <text
            x="24"
            y="34"
            fill={COLORS.muted}
            fontSize="20"
            letterSpacing="1.5"
          >
            光速换算
          </text>
          <text
            x="24"
            y="68"
            fill={COLORS.white}
            fontSize="30"
            fontWeight="750"
          >
            1 µs ≈ 300 m
          </text>
        </g>

        <g
          opacity={threshold * (1 - correction * 0.75)}
          transform="translate(1125 300)"
        >
          <rect
            width="388"
            height="112"
            rx="18"
            fill="#271d1b"
            stroke={COLORS.amber}
            strokeWidth="2"
          />
          <text
            x="26"
            y="41"
            fill={COLORS.amber}
            fontSize="20"
            fontWeight="700"
            letterSpacing="2"
          >
            未校正 · RANGE ERROR
          </text>
          <text
            x="26"
            y="84"
            fill={COLORS.white}
            fontSize="36"
            fontWeight="850"
          >
            累积测距误差 &gt; 1 km
          </text>
        </g>

        <g opacity={fieldEnter} transform="translate(1498 532)">
          <circle
            r="54"
            fill={COLORS.panel}
            stroke={COLORS.receiver}
            strokeWidth="4"
          />
          <circle r="15" fill={COLORS.receiver} />
          <path
            d="M -82 0 H -36 M 36 0 H 82 M 0 -82 V -36 M 0 36 V 82"
            stroke={COLORS.receiver}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <text
            x="-52"
            y="120"
            fill={COLORS.receiver}
            fontSize="25"
            fontWeight="700"
          >
            接收机
          </text>
        </g>

        <g
          opacity={network}
          transform={`translate(${control[0]} ${control[1] + (1 - network) * 34})`}
        >
          <rect x="-68" y="31" width="136" height="20" rx="10" fill="#173c4a" />
          <path
            d="M -40 24 Q 0 -35 40 24 Q 0 49 -40 24 Z"
            fill={COLORS.panel}
            stroke={COLORS.mint}
            strokeWidth="4"
          />
          <path d="M 0 24 L 0 52" stroke={COLORS.mint} strokeWidth="4" />
          <circle cx="0" cy="11" r="7" fill={COLORS.mint} />
          <text
            x="-64"
            y="90"
            fill={COLORS.mint}
            fontSize="25"
            fontWeight="700"
          >
            地面控制
          </text>
        </g>

        <g opacity={network}>
          <path
            d={`M ${control[0]} ${control[1]} L ${satellite[0]} ${satellite[1]}`}
            fill="none"
            stroke={COLORS.mint}
            strokeWidth="5"
            strokeDasharray="1"
            pathLength="1"
            strokeDashoffset={networkDash}
          />
          <path
            d={`M ${control[0]} ${control[1]} L ${receiver[0]} ${receiver[1]}`}
            fill="none"
            stroke={COLORS.mint}
            strokeWidth="5"
            strokeDasharray="1"
            pathLength="1"
            strokeDashoffset={networkDash}
          />
          <path
            d={`M ${satellite[0]} ${satellite[1]} L ${receiver[0]} ${receiver[1]}`}
            fill="none"
            stroke={COLORS.mint}
            strokeOpacity={correction}
            strokeWidth="6"
          />
          <circle
            cx={controlToSatellite.x}
            cy={controlToSatellite.y}
            r="8"
            fill={COLORS.mint}
          />
          <circle
            cx={controlToReceiver.x}
            cy={controlToReceiver.y}
            r="8"
            fill={COLORS.mint}
          />
        </g>

        <g opacity={network} transform="translate(808 484)">
          <rect
            width="316"
            height="92"
            rx="46"
            fill={COLORS.panel}
            stroke={COLORS.mint}
            strokeWidth="2"
          />
          <circle
            cx="48"
            cy="46"
            r={12 + correction * 5}
            fill={COLORS.mint}
            fillOpacity={0.35 + correction * 0.55}
          />
          <text
            x="82"
            y="39"
            fill={COLORS.muted}
            fontSize="18"
            letterSpacing="2"
          >
            COMMON TIME BASE
          </text>
          <text
            x="82"
            y="68"
            fill={COLORS.white}
            fontSize="27"
            fontWeight="750"
          >
            共享时间基准
          </text>
        </g>

        <g
          opacity={correction}
          transform={`translate(${receiver[0]} ${receiver[1]}) scale(${0.72 + correction * 0.28})`}
        >
          <circle
            r="84"
            fill="none"
            stroke={COLORS.mint}
            strokeWidth="5"
            strokeOpacity="0.7"
          />
          <circle r="64" fill="none" stroke={COLORS.receiver} strokeWidth="4" />
          <path
            d="M -25 2 L -7 21 L 31 -25"
            fill="none"
            stroke={COLORS.mint}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        <g opacity={settled} transform="translate(1210 706)">
          <rect
            width="410"
            height="76"
            rx="18"
            fill="#0b2931"
            stroke={COLORS.mint}
            strokeWidth="2"
          />
          <circle cx="40" cy="38" r="10" fill={COLORS.mint} />
          <text
            x="70"
            y="47"
            fill={COLORS.white}
            fontSize="28"
            fontWeight="750"
          >
            时间同步 · 定位锁定
          </text>
        </g>

        <text
          x="94"
          y="812"
          fill={COLORS.muted}
          fontSize="20"
          letterSpacing="3"
          opacity={fieldEnter * 0.78}
        >
          SATELLITE CLOCK → GROUND CONTROL → RECEIVER
        </text>
        <rect
          x="94"
          y="834"
          width={interpolate(shotFrame, [0, durationInFrames - 1], [0, 560], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          height="3"
          fill={correction > 0.4 ? COLORS.mint : COLORS.cyan}
          opacity="0.7"
        />
      </svg>
    </div>
  );
};
