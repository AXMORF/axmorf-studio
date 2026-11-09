import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Dark because the content is night observation, with no glow/grid/chip motif.
export const NightObservationExample = () => {
  const frame = useCurrentFrame();
  const turn = interpolate(frame, [0, 24], [10, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#252b3a" }}>
      <svg width="100%" height="100%" viewBox="0 0 1080 1920">
        <g
          data-axmorf-object="窗框和窗台"
          data-axmorf-object-role="background"
          fill="#675547"
        >
          <path d="M40 200H80V1600H40ZM1000 200H1040V1600H1000ZM40 200H1040V240H40ZM0 1600H1080V1670H0Z" />
        </g>
        <g data-axmorf-object="被观测的月亮">
          <circle cx={760} cy={530} r={135} fill="#efe1ba" />
          <circle cx={715} cy={490} r={28} fill="#c1b396" />
          <circle cx={790} cy={555} r={45} fill="#c1b396" />
        </g>
        <g
          data-axmorf-object="观测月光的望远镜"
          transform={`rotate(${turn} 470 1250)`}
        >
          <path
            d="M470 1250L300 1600M470 1250L600 1600M470 1250V1600"
            fill="none"
            stroke="#c1b396"
            strokeWidth={22}
            strokeLinecap="round"
          />
          <path d="M270 1220L640 920L730 1030L360 1330Z" fill="#bb755a" />
          <path d="M625 905L655 880L770 1020L740 1045Z" fill="#efe1ba" />
          <path d="M270 1220L230 1250L310 1350L360 1330Z" fill="#c1b396" />
        </g>
        <text x={90} y={140} fontSize={62} fill="#efe1ba">
          为什么夜里看得更清楚？
        </text>
        <text x={115} y={1780} fontSize={42} fill="#efe1ba">
          暗环境让微弱的月面细节更易辨认
        </text>
      </svg>
    </AbsoluteFill>
  );
};
