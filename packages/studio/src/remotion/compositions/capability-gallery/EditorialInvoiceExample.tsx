import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Two subjects: a physical electricity meter and its paper bill. The arrow is
// the narrated conversion from measured consumption to a charge, not decoration.
export const EditorialInvoiceExample = () => {
  const frame = useCurrentFrame();
  const bill = interpolate(frame, [48, 64], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#faf5e9" }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080">
        <g data-axmorf-object="木桌桌面" data-axmorf-object-role="background">
          <path d="M0 860H1920V1080H0Z" fill="#dfccb1" />
          <path d="M0 860H1920" stroke="#483c32" strokeWidth={8} />
        </g>
        <g data-axmorf-object="实测用电量的电表">
          <rect
            x={220}
            y={270}
            width={470}
            height={530}
            rx={45}
            fill="#527c63"
          />
          <rect
            x={260}
            y={320}
            width={390}
            height={190}
            rx={12}
            fill="#faf5e9"
          />
          <text
            x={455}
            y={438}
            textAnchor="middle"
            fontSize={72}
            fill="#483c32"
          >
            128 kWh
          </text>
          <circle cx={455} cy={640} r={72} fill="#faf5e9" />
          <path
            d="M455 640L490 595"
            stroke="#483c32"
            strokeWidth={12}
            strokeLinecap="round"
          />
        </g>
        <g
          data-axmorf-object="用电量换算为费用"
          data-axmorf-object-role="relation"
          opacity={bill}
        >
          <path
            d="M770 550H1050L1020 520M1050 550L1020 580"
            fill="none"
            stroke="#b65b42"
            strokeWidth={12}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g
          data-axmorf-object="对应费用的纸账单"
          opacity={bill}
          transform={`translate(0 ${(1 - bill) * -90})`}
        >
          <path
            d="M1180 260H1650V810L1610 790L1570 810L1530 790L1490 810L1450 790L1410 810L1370 790L1330 810L1290 790L1250 810L1180 790Z"
            fill="#faf5e9"
            stroke="#b65b42"
            strokeWidth={8}
          />
          <text
            x={1415}
            y={370}
            textAnchor="middle"
            fontSize={54}
            fill="#483c32"
          >
            用电账单
          </text>
          <text
            x={1415}
            y={500}
            textAnchor="middle"
            fontSize={46}
            fill="#483c32"
          >
            128 × ¥0.50
          </text>
          <text
            x={1415}
            y={660}
            textAnchor="middle"
            fontSize={84}
            fill="#b65b42"
          >
            ¥64
          </text>
        </g>
        <text x={160} y={150} fontSize={64} fill="#483c32">
          读数怎样变成账单？
        </text>
      </svg>
    </AbsoluteFill>
  );
};
