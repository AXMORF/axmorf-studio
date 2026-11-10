import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ReviewMeasure } from "../../film/review-measure";

/** Paired calibration: prose cards alone versus a quantity diagram and short result. */
export const TextCardReviewArtwork = ({ cardOnly }: { cardOnly: boolean }) => (
  <svg width={960} height={540} viewBox="0 0 960 540">
    {cardOnly ? (
      <g
        data-axmorf-object="说明核对顺序的文字卡片"
        data-axmorf-object-kind="card"
      >
        <rect x={70} y={120} width={330} height={290} fill="#fffdf6" />
        <text x={105} y={240} fontSize={40} fill="#403d32">
          先核对读数
        </text>
        <text x={105} y={320} fontSize={40} fill="#403d32">
          再计算费用
        </text>
      </g>
    ) : (
      <g
        data-axmorf-object="128度用量乘以每度半元的数量图解"
        data-axmorf-object-kind="diagram"
      >
        <text x={70} y={100} fontSize={32} fill="#403d32">
          128 kWh × ¥0.50
        </text>
        {/* Each bar is 32 kWh; the half-width ink area explains the tariff. */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect
              x={70 + i * 80}
              y={130}
              width={60}
              height={280}
              fill="#c7d0b0"
            />
            <rect
              x={70 + i * 80}
              y={130}
              width={30}
              height={280}
              fill="#657650"
            />
          </g>
        ))}
        <text x={70} y={465} fontSize={32} fill="#403d32">
          每条 32 kWh
        </text>
      </g>
    )}
    <g
      data-axmorf-object="用电量按单价换算为金额"
      data-axmorf-object-role="relation"
      data-axmorf-object-kind="diagram"
    >
      <path
        d="M430 270H520L500 250M520 270L500 290"
        fill="none"
        stroke="#9f382e"
        strokeWidth={8}
      />
    </g>
    <g data-axmorf-object="换算结果数字卡片" data-axmorf-object-kind="card">
      <rect x={560} y={120} width={330} height={290} fill="#fffdf6" />
      <text x={605} y={230} fontSize={38} fill="#403d32">
        {cardOnly ? "对应费用" : "="}
      </text>
      <text x={605} y={345} fontSize={94} fill="#9f382e">
        ¥64
      </text>
    </g>
  </svg>
);

export const TextCardReviewGallery = ({ cardOnly }: { cardOnly: boolean }) => {
  const frame = useCurrentFrame();
  return (
    <ReviewMeasure index={0} frame={frame}>
      <AbsoluteFill style={{ background: "#e7dcc6" }}>
        <TextCardReviewArtwork cardOnly={cardOnly} />
      </AbsoluteFill>
    </ReviewMeasure>
  );
};
