import type { FC } from "react";
import { Easing, interpolate } from "remotion";

type RelativisticEffectsShotProps = Readonly<{
  sceneFrame: number;
  shotFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}>;

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeInOut = Easing.bezier(0.45, 0, 0.55, 1);

const palette = {
  background: "#071426",
  backgroundDeep: "#040b16",
  cyan: "#62d9ff",
  cyanSoft: "#267b9c",
  amber: "#ffb54a",
  amberDeep: "#b86922",
  mint: "#68efbd",
  mintDeep: "#248b70",
  ink: "#eaf7ff",
  muted: "#86a7ba",
  grid: "#16334a",
} as const;

const measurementDots = [
  [180, 160],
  [340, 270],
  [520, 132],
  [720, 240],
  [1180, 170],
  [1400, 280],
  [1600, 150],
  [1740, 410],
  [250, 560],
  [1510, 610],
] as const;

export const RelativisticEffectsShot: FC<RelativisticEffectsShotProps> = ({
  sceneFrame,
  shotFrame,
  durationInFrames,
  width,
  height,
}) => {
  const establish = interpolate(shotFrame, [0, 28], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const velocityReveal = interpolate(shotFrame, [34, 104], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const gravityReveal = interpolate(shotFrame, [132, 204], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const convergence = interpolate(shotFrame, [226, 274], [0, 1], {
    ...clamp,
    easing: easeInOut,
  });
  const finalHold = interpolate(
    sceneFrame,
    [durationInFrames - 46, durationInFrames - 10],
    [0, 1],
    { ...clamp, easing: easeOut },
  );
  const orbitTrace = interpolate(shotFrame, [8, 78], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const satelliteDrift = Math.sin(sceneFrame * 0.028) * 7 * establish;
  const clockLagDegrees = -22 * velocityReveal;
  const clockLiftDegrees = 42 * gravityReveal;
  const clockNetVisual = clockLagDegrees + clockLiftDegrees;
  const pulse = Math.max(0, 1 - Math.abs(sceneFrame - 218) / 20);
  const amberX = interpolate(convergence, [0, 1], [620, 764]);
  const mintX = interpolate(convergence, [0, 1], [1300, 1156]);
  const valueY = interpolate(convergence, [0, 1], [548, 592]);
  const scaleX = width / 1920;
  const scaleY = height / 1080;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 1920 1080"
      role="img"
      aria-label="同一颗卫星钟上的速度与弱引力相对论效应"
      style={{ display: "block", backgroundColor: palette.backgroundDeep }}
    >
      <defs>
        <linearGradient id="space-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.backgroundDeep} />
          <stop offset="1" stopColor={palette.background} />
        </linearGradient>
        <linearGradient id="earth-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#123c59" />
          <stop offset="1" stopColor="#081b31" />
        </linearGradient>
        <radialGradient id="clock-core" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#b8f1ff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor={palette.cyan} stopOpacity="0.08" />
          <stop offset="1" stopColor={palette.cyan} stopOpacity="0" />
        </radialGradient>
        <filter id="soft-cyan" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <marker
          id="amber-arrow"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="10"
          markerHeight="10"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 11 6 L 0 11 Z" fill={palette.amber} />
        </marker>
        <marker
          id="mint-arrow"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="10"
          markerHeight="10"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 11 6 L 0 11 Z" fill={palette.mint} />
        </marker>
      </defs>

      <rect width="1920" height="1080" fill="url(#space-field)" />
      <g opacity={0.25 * establish}>
        {measurementDots.map(([x, y], index) => (
          <g key={`${x}-${y}`}>
            <circle
              cx={x}
              cy={y}
              r={index % 3 === 0 ? 3 : 2}
              fill={palette.grid}
            />
            {index % 2 === 0 ? (
              <path
                d={`M ${x - 16} ${y} H ${x + 16} M ${x} ${y - 16} V ${y + 16}`}
                stroke={palette.grid}
                strokeWidth="1"
              />
            ) : null}
          </g>
        ))}
      </g>

      <g opacity={establish}>
        <path
          d="M 165 776 Q 960 84 1755 776"
          fill="none"
          stroke={palette.cyanSoft}
          strokeWidth="2"
          pathLength="1"
          strokeDashoffset={1 - orbitTrace}
          strokeDasharray={`${orbitTrace} 1`}
          opacity="0.58"
        />
        <path
          d="M 120 1080 Q 960 650 1800 1080 Z"
          fill="url(#earth-glow)"
          stroke={palette.cyanSoft}
          strokeWidth="3"
        />
        <path
          d="M 310 975 Q 960 690 1610 975"
          fill="none"
          stroke={palette.grid}
          strokeWidth="2"
          strokeDasharray="4 20"
        />
      </g>

      <g transform={`translate(0 ${satelliteDrift})`} opacity={establish}>
        <circle
          cx="960"
          cy="354"
          r={138 + pulse * 8}
          fill="none"
          stroke={palette.cyan}
          strokeWidth={2 + pulse * 2}
          opacity={0.16 + pulse * 0.22}
        />
        <circle
          cx="960"
          cy="354"
          r="116"
          fill="url(#clock-core)"
          filter="url(#soft-cyan)"
          opacity="0.92"
        />
        <path
          d="M 900 318 H 830 L 790 286 H 716 V 422 H 790 L 830 390 H 900"
          fill="#0d2f47"
          stroke={palette.cyan}
          strokeWidth="4"
        />
        <path
          d="M 1020 318 H 1090 L 1130 286 H 1204 V 422 H 1130 L 1090 390 H 1020"
          fill="#0d2f47"
          stroke={palette.cyan}
          strokeWidth="4"
        />
        <rect
          x="908"
          y="302"
          width="104"
          height="104"
          rx="24"
          fill="#0b2337"
          stroke={palette.cyan}
          strokeWidth="4"
        />
        <circle
          cx="960"
          cy="354"
          r="38"
          fill="#071426"
          stroke={palette.cyan}
          strokeWidth="3"
        />
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI * 2;
          return (
            <circle
              key={index}
              cx={960 + Math.cos(angle) * 29}
              cy={354 + Math.sin(angle) * 29}
              r="2.5"
              fill={palette.cyan}
              opacity="0.8"
            />
          );
        })}
        <g transform={`rotate(${clockNetVisual} 960 354)`}>
          <path
            d="M 960 354 L 960 329"
            stroke={palette.ink}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 960 354 L 980 366"
            stroke={palette.cyan}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
        <circle cx="960" cy="354" r="5" fill={palette.ink} />
        <text
          x="960"
          y="242"
          textAnchor="middle"
          fill={palette.cyan}
          fontFamily="Arial, 'Noto Sans SC', sans-serif"
          fontWeight="700"
          fontSize="25"
          letterSpacing="5"
        >
          同一颗卫星钟
        </text>
      </g>

      <g
        opacity={velocityReveal}
        transform={`translate(${(1 - velocityReveal) * -42} 0)`}
      >
        <path
          d="M 755 302 C 570 328 505 432 598 530 C 636 570 682 588 728 598"
          fill="none"
          stroke={palette.amberDeep}
          strokeWidth="22"
          strokeLinecap="round"
          opacity="0.24"
        />
        <path
          d="M 755 302 C 570 328 505 432 598 530 C 636 570 682 588 728 598"
          fill="none"
          stroke={palette.amber}
          strokeWidth="5"
          strokeLinecap="round"
          markerEnd="url(#amber-arrow)"
        />
        <path
          d="M 590 384 H 488"
          stroke={palette.amber}
          strokeWidth="3"
          strokeDasharray="8 10"
        />
        <text
          x="470"
          y="350"
          textAnchor="end"
          fill={palette.amber}
          fontFamily="Arial, 'Noto Sans SC', sans-serif"
          fontSize="28"
          fontWeight="700"
          letterSpacing="3"
        >
          高速运动 · 钟变慢
        </text>
        <path
          d="M 445 386 V 432"
          stroke={palette.amber}
          strokeWidth="5"
          markerEnd="url(#amber-arrow)"
        />
      </g>

      <g
        opacity={gravityReveal}
        transform={`translate(${(1 - gravityReveal) * 42} 0)`}
      >
        {[0, 1, 2].map((index) => (
          <path
            key={index}
            d={`M ${1235 + index * 34} 820 C ${1370 + index * 24} 675 ${1380 + index * 12} 492 ${1170 + index * 8} 344`}
            fill="none"
            stroke={index === 1 ? palette.mint : palette.mintDeep}
            strokeWidth={index === 1 ? 5 : 2}
            strokeDasharray={index === 1 ? undefined : "7 14"}
            markerEnd={index === 1 ? "url(#mint-arrow)" : undefined}
            opacity={index === 1 ? 1 : 0.48}
          />
        ))}
        <path
          d="M 1340 430 H 1450"
          stroke={palette.mint}
          strokeWidth="3"
          strokeDasharray="8 10"
        />
        <text
          x="1470"
          y="395"
          fill={palette.mint}
          fontFamily="Arial, 'Noto Sans SC', sans-serif"
          fontSize="28"
          fontWeight="700"
          letterSpacing="3"
        >
          弱引力 · 钟变快
        </text>
        <path
          d="M 1495 430 V 374"
          stroke={palette.mint}
          strokeWidth="5"
          markerEnd="url(#mint-arrow)"
        />
      </g>

      <g>
        <g
          transform={`translate(${amberX} ${valueY})`}
          opacity={velocityReveal}
        >
          <text
            x="0"
            y="0"
            textAnchor="middle"
            fill={palette.amber}
            fontFamily="Arial, 'Noto Sans SC', sans-serif"
            fontWeight="800"
            fontSize="72"
            letterSpacing="-2"
          >
            −7
          </text>
          <text
            x="0"
            y="39"
            textAnchor="middle"
            fill={palette.amber}
            fontFamily="Arial, 'Noto Sans SC', sans-serif"
            fontWeight="700"
            fontSize="23"
            letterSpacing="2"
          >
            μs / day
          </text>
        </g>
        <g transform={`translate(${mintX} ${valueY})`} opacity={gravityReveal}>
          <text
            x="0"
            y="0"
            textAnchor="middle"
            fill={palette.mint}
            fontFamily="Arial, 'Noto Sans SC', sans-serif"
            fontWeight="800"
            fontSize="72"
            letterSpacing="-2"
          >
            +45
          </text>
          <text
            x="0"
            y="39"
            textAnchor="middle"
            fill={palette.mint}
            fontFamily="Arial, 'Noto Sans SC', sans-serif"
            fontWeight="700"
            fontSize="23"
            letterSpacing="2"
          >
            μs / day
          </text>
        </g>
        <g opacity={convergence}>
          <path
            d="M 842 618 C 885 654 917 665 940 670"
            fill="none"
            stroke={palette.amber}
            strokeWidth="4"
            markerEnd="url(#amber-arrow)"
          />
          <path
            d="M 1078 618 C 1035 654 1003 665 980 670"
            fill="none"
            stroke={palette.mint}
            strokeWidth="4"
            markerEnd="url(#mint-arrow)"
          />
          <circle
            cx="960"
            cy="674"
            r={20 + pulse * 8}
            fill="#0b2337"
            stroke={palette.cyan}
            strokeWidth="3"
          />
          <path
            d="M 952 674 H 968 M 960 666 V 682"
            stroke={palette.cyan}
            strokeWidth="3"
          />
          <text
            x="960"
            y="724"
            textAnchor="middle"
            fill={palette.muted}
            fontFamily="Arial, 'Noto Sans SC', sans-serif"
            fontSize="22"
            fontWeight="700"
            letterSpacing="4"
          >
            两种效应 · 下一步组合
          </text>
        </g>
      </g>

      <g opacity={0.45 + finalHold * 0.35}>
        <path
          d="M 665 778 H 1255"
          stroke={palette.cyanSoft}
          strokeWidth="2"
          strokeDasharray="2 16"
        />
        <circle cx="665" cy="778" r="5" fill={palette.amber} />
        <circle cx="1255" cy="778" r="5" fill={palette.mint} />
      </g>
      <rect
        x="0"
        y="0"
        width="1920"
        height="1080"
        fill="none"
        stroke={palette.grid}
        strokeWidth="2"
        opacity={0.35 * Math.min(scaleX, scaleY)}
      />
    </svg>
  );
};
