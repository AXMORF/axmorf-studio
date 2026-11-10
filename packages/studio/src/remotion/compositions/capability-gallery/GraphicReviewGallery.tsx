import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ReviewMeasure } from "../../film/review-measure";

export const GraphicReviewArtwork = ({ invalid }: { invalid: boolean }) => (
  <svg width={960} height={540} viewBox="0 0 960 540">
    <g data-axmorf-object="木桌" data-axmorf-object-role="background">
      <path d="M0 420H960V540H0Z" fill="#dfccb1" />
    </g>
    <g data-axmorf-object="纸账单">
      <path
        d="M100 120H300V400L280 385L260 400L240 385L220 400L200 385L180 400L160 385L140 400L100 385Z"
        fill="#fff"
        stroke="#b65b42"
        strokeWidth={6}
      />
      <text x={145} y={240} fontSize={36} fill="#483c32">
        ¥64
      </text>
    </g>
    <g
      data-axmorf-object="收款计算器"
      transform={`translate(${invalid ? -350 : 0} 0)`}
    >
      <rect x={520} y={130} width={230} height={270} rx={16} fill="#527c63" />
      <rect x={545} y={160} width={180} height={65} fill="#faf5e9" />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={548 + i * 60}
          y={270}
          width={42}
          height={42}
          fill="#faf5e9"
        />
      ))}
    </g>
    <g
      data-axmorf-object="账单金额输入计算器"
      data-axmorf-object-role="relation"
    >
      <path
        d="M330 265H480L460 245M480 265L460 285"
        fill="none"
        stroke="#b65b42"
        strokeWidth={8}
      />
    </g>
    {invalid ? (
      <>
        <circle
          data-axmorf-object="另一个硬币"
          cx={800}
          cy={100}
          r={40}
          fill="#b65b42"
        />
        <circle
          data-axmorf-object="第四个主体硬币"
          cx={900}
          cy={100}
          r={40}
          fill="#527c63"
        />
        {/* Unexplained shape deliberately fills >10% of the frame. */}
        <path d="M400 300L920 280L940 430L400 420Z" fill="#c1b396" />
      </>
    ) : null}
  </svg>
);

/** Paired semantic-graphics calibration, using the real review wrapper. */
export const GraphicReviewGallery = ({
  invalid = false,
}: {
  invalid: boolean;
}) => {
  const frame = useCurrentFrame();
  return (
    <ReviewMeasure index={0} frame={frame}>
      <AbsoluteFill style={{ background: "#faf5e9" }}>
        <GraphicReviewArtwork invalid={invalid} />
      </AbsoluteFill>
    </ReviewMeasure>
  );
};
