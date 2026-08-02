import { AbsoluteFill, Easing, interpolate } from "remotion";

type PracticalConclusionShotProps = Readonly<{
  shotFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}>;

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const SatelliteClock = ({
  x,
  y,
  label,
  phase,
  pulse,
}: Readonly<{
  x: number;
  y: number;
  label: string;
  phase: number;
  pulse: number;
}>) => {
  const signalX = interpolate(pulse, [0, 1], [x + 54, 810]);
  const signalY = interpolate(pulse, [0, 1], [y, 520]);
  return (
    <g>
      <path
        d={`M ${x + 50} ${y} C ${x + 210} ${y}, 620 ${520 + (y - 520) * 0.28}, 810 520`}
        fill="none"
        stroke="rgba(71, 210, 245, 0.32)"
        strokeWidth={3}
      />
      <circle
        cx={x}
        cy={y}
        r={46}
        fill="#102b47"
        stroke="#47d2f5"
        strokeWidth={3}
      />
      <circle
        cx={x}
        cy={y}
        r={31}
        fill="none"
        stroke="#47d2f5"
        strokeDasharray="4 8"
        strokeDashoffset={-phase * 28}
        strokeWidth={2}
      />
      <path
        d={`M ${x} ${y} L ${x + Math.cos(phase * Math.PI * 1.7) * 21} ${
          y + Math.sin(phase * Math.PI * 1.7) * 21
        }`}
        stroke="#d7f7ff"
        strokeLinecap="round"
        strokeWidth={3}
      />
      <circle
        cx={signalX}
        cy={signalY}
        r={8}
        fill="#79e4ff"
        opacity={0.4 + pulse * 0.6}
      />
      <text
        x={x}
        y={y + 78}
        fill="#8fb6cb"
        fontFamily="Arial, sans-serif"
        fontSize={20}
        fontWeight={700}
        letterSpacing={2}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
};

export const PracticalConclusionShot = ({
  shotFrame,
  durationInFrames,
  width,
  height,
}: PracticalConclusionShotProps) => {
  if (shotFrame < 0 || shotFrame >= durationInFrames) {
    throw new Error("Practical conclusion Shot escaped its fixed Scene range.");
  }

  const fieldIn = interpolate(shotFrame, [0, 34], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const signalProgress = interpolate(shotFrame, [24, 126], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });
  const correctionProgress = interpolate(shotFrame, [82, 164], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const phoneIn = interpolate(shotFrame, [52, 132], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const locatingProgress = interpolate(shotFrame, [126, 207], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });
  const lockConfirm = interpolate(shotFrame, [198, 207, 221], [0, 1, 1], clamp);
  const networkPulse = interpolate(shotFrame, [144, 202], [0, 1], clamp);
  const phoneX = interpolate(phoneIn, [0, 1], [1450, 1226]);
  const phoneOpacity = interpolate(phoneIn, [0, 1], [0, 1]);
  const uncertaintyRadius = interpolate(locatingProgress, [0, 1], [148, 46]);
  const dotRadius = interpolate(lockConfirm, [0, 1], [11, 18]);
  const lockRingRadius = interpolate(lockConfirm, [0, 1], [54, 31]);
  const titleY = interpolate(fieldIn, [0, 1], [148, 126]);

  const satelliteData = [
    { x: 252, y: 280, label: "卫星时钟 01", offset: 0 },
    { x: 372, y: 504, label: "卫星时钟 02", offset: 0.13 },
    { x: 248, y: 728, label: "卫星时钟 03", offset: 0.26 },
  ] as const;

  return (
    <AbsoluteFill
      style={{
        width,
        height,
        backgroundColor: "#071522",
        color: "#e9fbff",
        overflow: "hidden",
      }}
    >
      <svg width={width} height={height} viewBox="0 0 1920 1080">
        <defs>
          <radialGradient id="receiver-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4aa9ff" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#4aa9ff" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="corrected-path" x1="0" x2="1">
            <stop offset="0%" stopColor="#47d2f5" />
            <stop offset="100%" stopColor="#73efc5" />
          </linearGradient>
          <pattern
            id="measurement-grid"
            width="64"
            height="64"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.5" fill="#33546a" />
          </pattern>
        </defs>

        <rect
          width="1920"
          height="1080"
          fill="url(#measurement-grid)"
          opacity={0.3 * fieldIn}
        />
        <path
          d="M 0 950 Q 440 830 870 930 T 1920 900 L 1920 1080 L 0 1080 Z"
          fill="#0a2537"
          opacity={0.72}
        />
        <path
          d="M 0 950 Q 440 830 870 930 T 1920 900"
          fill="none"
          stroke="#266681"
          strokeWidth={3}
          opacity={0.72}
        />

        <text
          x={112}
          y={titleY}
          fill="#e9fbff"
          fontFamily="Arial, sans-serif"
          fontSize={48}
          fontWeight={800}
          letterSpacing={2}
          opacity={fieldIn}
        >
          时间被修正，位置才可信
        </text>
        <text
          x={114}
          y={184}
          fill="#86aabb"
          fontFamily="Arial, sans-serif"
          fontSize={23}
          fontWeight={600}
          letterSpacing={3}
          opacity={fieldIn}
        >
          RELATIVITY · SIGNAL TIME · POSITION
        </text>

        {satelliteData.map((satellite) => (
          <SatelliteClock
            key={satellite.label}
            x={satellite.x}
            y={satellite.y}
            label={satellite.label}
            phase={Math.max(0, Math.min(1, signalProgress + satellite.offset))}
            pulse={Math.max(0, Math.min(1, signalProgress - satellite.offset))}
          />
        ))}

        <g opacity={interpolate(correctionProgress, [0, 1], [0.25, 1])}>
          <circle
            cx={840}
            cy={520}
            r={88}
            fill="#0c2437"
            stroke="#73efc5"
            strokeWidth={3}
          />
          <circle
            cx={840}
            cy={520}
            r={64}
            fill="none"
            stroke="#73efc5"
            strokeDasharray="9 11"
            strokeDashoffset={-correctionProgress * 48}
            strokeWidth={2}
          />
          <path
            d="M 807 520 L 831 544 L 876 496"
            fill="none"
            stroke="#73efc5"
            strokeDasharray={96}
            strokeDashoffset={96 * (1 - correctionProgress)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={8}
          />
          <text
            x={840}
            y={636}
            fill="#73efc5"
            fontFamily="Arial, sans-serif"
            fontSize={25}
            fontWeight={800}
            letterSpacing={2}
            textAnchor="middle"
          >
            相对论时间修正
          </text>
          <text
            x={840}
            y={672}
            fill="#7f9daf"
            fontFamily="Arial, sans-serif"
            fontSize={19}
            fontWeight={600}
            letterSpacing={1}
            textAnchor="middle"
          >
            卫星钟保持同一时间基准
          </text>
        </g>

        <path
          d="M 928 520 C 1010 520, 1060 486, 1168 486"
          fill="none"
          stroke="#183c52"
          strokeWidth={15}
          strokeLinecap="round"
        />
        <path
          d="M 928 520 C 1010 520, 1060 486, 1168 486"
          fill="none"
          stroke="url(#corrected-path)"
          strokeDasharray={280}
          strokeDashoffset={280 * (1 - networkPulse)}
          strokeLinecap="round"
          strokeWidth={5}
        />
        <circle
          cx={interpolate(networkPulse, [0, 1], [932, 1166])}
          cy={interpolate(networkPulse, [0, 1], [520, 486])}
          r={8}
          fill="#73efc5"
          opacity={networkPulse}
        />

        <g transform={`translate(${phoneX} 178)`} opacity={phoneOpacity}>
          <rect
            x={-28}
            y={-28}
            width={460}
            height={744}
            rx={88}
            fill="url(#receiver-glow)"
          />
          <rect
            x={0}
            y={0}
            width={404}
            height={690}
            rx={58}
            fill="#07131e"
            stroke="#3c708b"
            strokeWidth={5}
          />
          <rect x={22} y={56} width={360} height={588} rx={38} fill="#0b2739" />
          <rect x={157} y={22} width={90} height={8} rx={4} fill="#355a6f" />

          <path
            d="M 54 160 C 132 112, 211 116, 352 90"
            fill="none"
            stroke="#315c70"
            strokeWidth={12}
          />
          <path
            d="M 36 412 C 140 338, 210 338, 374 250"
            fill="none"
            stroke="#315c70"
            strokeWidth={10}
          />
          <path
            d="M 102 78 C 116 210, 164 342, 140 612"
            fill="none"
            stroke="#274e63"
            strokeWidth={8}
          />
          <path
            d="M 300 62 C 272 236, 300 414, 336 626"
            fill="none"
            stroke="#274e63"
            strokeWidth={8}
          />
          <path
            d="M 64 526 C 128 464, 176 504, 225 430 S 308 346, 344 330"
            fill="none"
            stroke="#47d2f5"
            strokeDasharray="8 12"
            strokeWidth={4}
            opacity={0.62}
          />

          <g transform="translate(218 356)">
            <circle
              r={uncertaintyRadius}
              fill="#4aa9ff"
              opacity={0.045 + (1 - locatingProgress) * 0.08}
            />
            <circle
              r={uncertaintyRadius}
              fill="none"
              stroke="#4aa9ff"
              strokeDasharray="10 12"
              strokeWidth={3}
              opacity={0.4 + locatingProgress * 0.35}
            />
            <circle
              r={lockRingRadius}
              fill="none"
              stroke="#73efc5"
              strokeWidth={3}
              opacity={lockConfirm}
            />
            <line
              x1={-48}
              y1={0}
              x2={-26}
              y2={0}
              stroke="#73efc5"
              strokeWidth={3}
              opacity={lockConfirm}
            />
            <line
              x1={26}
              y1={0}
              x2={48}
              y2={0}
              stroke="#73efc5"
              strokeWidth={3}
              opacity={lockConfirm}
            />
            <line
              x1={0}
              y1={-48}
              x2={0}
              y2={-26}
              stroke="#73efc5"
              strokeWidth={3}
              opacity={lockConfirm}
            />
            <line
              x1={0}
              y1={26}
              x2={0}
              y2={48}
              stroke="#73efc5"
              strokeWidth={3}
              opacity={lockConfirm}
            />
            <circle
              r={dotRadius + 11}
              fill="#4aa9ff"
              opacity={0.14 + lockConfirm * 0.12}
            />
            <circle
              r={dotRadius}
              fill="#4aa9ff"
              stroke="#d9f3ff"
              strokeWidth={5}
            />
          </g>

          <g
            opacity={lockConfirm}
            transform={`translate(202 ${interpolate(lockConfirm, [0, 1], [604, 586])})`}
          >
            <rect
              x={-120}
              y={-27}
              width={240}
              height={54}
              rx={27}
              fill="#102f42"
              stroke="#73efc5"
              strokeWidth={2}
            />
            <circle cx={-84} cy={0} r={7} fill="#73efc5" />
            <text
              x={12}
              y={8}
              fill="#d9fff2"
              fontFamily="Arial, sans-serif"
              fontSize={21}
              fontWeight={800}
              letterSpacing={2}
              textAnchor="middle"
            >
              定位已校正
            </text>
          </g>
        </g>

        <g opacity={fieldIn}>
          <line
            x1={510}
            y1={780}
            x2={1110}
            y2={780}
            stroke="#24475b"
            strokeWidth={2}
          />
          <circle cx={548} cy={780} r={7} fill="#47d2f5" />
          <circle cx={814} cy={780} r={7} fill="#73efc5" />
          <circle cx={1074} cy={780} r={7} fill="#4aa9ff" />
          <text
            x={548}
            y={820}
            fill="#89aabc"
            fontFamily="Arial, sans-serif"
            fontSize={19}
            fontWeight={700}
            textAnchor="middle"
          >
            卫星时钟
          </text>
          <text
            x={814}
            y={820}
            fill="#9bdcc6"
            fontFamily="Arial, sans-serif"
            fontSize={19}
            fontWeight={700}
            textAnchor="middle"
          >
            时间修正
          </text>
          <text
            x={1074}
            y={820}
            fill="#91c7ff"
            fontFamily="Arial, sans-serif"
            fontSize={19}
            fontWeight={700}
            textAnchor="middle"
          >
            日常定位
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
