import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const INK = "#45403a";

/** Paper desk: receipt, pen and approval stamp; labels stay on a stable plane. */
export const PaperCollageExample = () => {
  const frame = useCurrentFrame();
  const drawing = Math.floor(frame / 3);
  const wobble = (random(`receipt-outline-${drawing}`) - 0.5) * 2;
  const lift = frame < 16 ? Math.sin((frame / 16) * Math.PI) * 5 : 0;
  const stamp = interpolate(frame, [54, 60, 64, 70], [-55, 4, -3, 0], clamp);
  const circle = interpolate(frame, [120, 136], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#f5edda" }}>
      <svg width="100%" height="100%" viewBox="0 0 960 540">
        <defs>
          <filter id="paper-fibers" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".6"
              numOctaves={2}
              seed={29}
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope=".065" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="multiply" />
          </filter>
          <filter
            id="paper-shadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="150%"
          >
            <feDropShadow
              dx={2}
              dy={4 + lift}
              stdDeviation={3 + lift / 3}
              floodColor="#45403a"
              floodOpacity=".18"
            />
          </filter>
        </defs>
        <g
          data-axmorf-object="米白纤维纸桌面"
          data-axmorf-object-role="background"
        >
          <rect
            width={960}
            height={540}
            fill="#f5edda"
            filter="url(#paper-fibers)"
          />
        </g>
        <g data-axmorf-object="标题纸条" data-axmorf-object-role="background">
          <path d="M55 42L850 37L847 117L58 122Z" fill="#fffaf0" />
        </g>
        <text
          x={82}
          y={94}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fontSize={39}
          fontWeight={700}
          fill={INK}
          transform="rotate(-1 82 94)"
        >
          用电读数，怎样变成账单？
        </text>
        <g data-axmorf-object="胶带固定的用电纸账单">
          <g transform={`translate(0 ${-lift})`}>
            <path
              d="M85 172L418 164L430 458L408 449L390 466L370 454L349 470L326 459L302 475L280 462L257 477L235 464L211 479L188 464L165 480L142 468L98 477Z"
              fill="#fffaf0"
              stroke="#fffaf0"
              strokeWidth={12}
              filter="url(#paper-shadow)"
            />
            <path
              d={`M${87 + wobble} 174L417 167L428 456M100 475L${86 - wobble} 174`}
              fill="none"
              stroke={INK}
              strokeWidth={2.5 + Math.abs(wobble)}
              strokeLinecap="round"
            />
            <path
              d="M183 154L307 151L310 184L185 188Z"
              fill="#80926d"
              opacity={0.7}
            />
          </g>
        </g>
        <text
          x={137}
          y={248}
          fontSize={31}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          用电账单
        </text>
        <text
          x={131}
          y={315}
          fontSize={29}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          128 kWh × ¥0.50
        </text>
        <text
          x={173}
          y={409}
          fontSize={54}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          ¥64
        </text>
        <g
          data-axmorf-object="红笔圈出换算后的金额"
          data-axmorf-object-role="relation"
          opacity={circle}
        >
          <path
            d="M133 391C128 335 355 329 363 389C373 444 139 458 133 391C130 380 133 366 148 358"
            fill="none"
            stroke="#b34d3c"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={650}
            strokeDashoffset={650 * (1 - circle)}
          />
        </g>
        <g data-axmorf-object="核对金额的红笔" transform="rotate(-12 695 225)">
          <path
            d="M550 211H790L819 225L790 239H550Z"
            fill="#b34d3c"
            stroke="#fffaf0"
            strokeWidth={6}
            filter="url(#paper-shadow)"
          />
          <path
            d="M557 214H788L809 225L788 236H557ZM789 215L791 235"
            fill="none"
            stroke={INK}
            strokeWidth={2}
          />
        </g>
        <g
          data-axmorf-object="表示已核对的实物印章"
          opacity={frame >= 54 ? 1 : 0}
          transform={`translate(0 ${stamp}) translate(0 ${frame >= 60 && frame < 64 ? 5 : 0})`}
        >
          <path
            d="M663 343V318Q663 289 697 289Q731 289 731 318V343ZM632 348H761V391H632Z"
            fill="#80926d"
            stroke="#fffaf0"
            strokeWidth={7}
            filter="url(#paper-shadow)"
          />
          <path
            d="M663 343H731M632 350H761V391H632Z"
            fill="none"
            stroke={INK}
            strokeWidth={2.5}
          />
        </g>
        <text
          x={584}
          y={454}
          fontSize={28}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          先核对读数，再圈出费用
        </text>
      </svg>
    </AbsoluteFill>
  );
};
