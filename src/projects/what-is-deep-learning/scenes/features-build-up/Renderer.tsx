import type {FC} from "react";
import {interpolate} from "remotion";

type RendererProps = Readonly<{
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
}>;

const CYAN = "#53D8F4";
const VIOLET = "#9D7CFF";
const WHITE = "#F4F7FF";
const MUTED = "#7180A8";
const CORAL = "#FF7E74";

const reveal = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Renderer: FC<RendererProps> = ({
  meaningId,
  sceneFrame,
  durationInFrames,
}) => {
  if (meaningId !== "features-build-up" || durationInFrames !== 321) {
    throw new Error("features-build-up Renderer received unexpected Scene props.");
  }

  const edgeReveal = reveal(sceneFrame, 12, 38);
  const colorReveal = reveal(sceneFrame, 38, 68);
  const textureReveal = reveal(sceneFrame, 68, 100);
  const cluesReady = reveal(sceneFrame, 88, 115);
  const earReveal = reveal(sceneFrame, 115, 162);
  const eyeReveal = reveal(sceneFrame, 150, 205);
  const partsReady = reveal(sceneFrame, 190, 230);
  const catReveal = reveal(sceneFrame, 230, 282);
  const predictionReveal = reveal(sceneFrame, 270, 306);
  const pulse = 0.72 + 0.12 * Math.sin(sceneFrame / 8);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 900 1470"
      role="img"
      aria-label="简单视觉线索逐层组合为猫的预测"
    >
      <g opacity={catReveal}>
        <path
          d="M276 287 L310 198 L374 244 L438 198 L472 287 C500 400 454 486 374 486 C294 486 248 400 276 287 Z"
          fill="none"
          stroke={WHITE}
          strokeWidth="12"
          strokeLinejoin="round"
          strokeDasharray="790"
          strokeDashoffset={790 * (1 - catReveal)}
        />
        <path
          d="M329 340 Q346 324 363 340 M385 340 Q402 324 419 340 M355 399 Q374 418 393 399"
          fill="none"
          stroke={VIOLET}
          strokeWidth="10"
          strokeLinecap="round"
          opacity={predictionReveal}
        />
        <circle
          cx="374"
          cy="342"
          r="150"
          fill="none"
          stroke={VIOLET}
          strokeWidth="5"
          opacity={0.2 * predictionReveal * pulse}
        />
        <text
          x="374"
          y="555"
          textAnchor="middle"
          fill={WHITE}
          fontSize="48"
          fontWeight="800"
          opacity={predictionReveal}
        >
          猫
        </text>
        <circle cx="478" cy="522" r="31" fill={VIOLET} opacity={predictionReveal} />
        <path
          d="M464 522 L474 533 L494 508"
          fill="none"
          stroke={WHITE}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={predictionReveal}
        />
      </g>

      <g opacity={partsReady}>
        <path d="M281 670 C300 590 328 550 344 492" fill="none" stroke={VIOLET} strokeWidth="8" />
        <path d="M565 670 C524 590 468 550 423 492" fill="none" stroke={VIOLET} strokeWidth="8" />
      </g>

      <g opacity={earReveal}>
        <rect x="118" y="670" width="300" height="208" rx="38" fill={VIOLET} fillOpacity="0.12" stroke={VIOLET} strokeWidth="7" />
        <path d="M196 784 L226 712 L274 764 L320 712 L348 784" fill="none" stroke={VIOLET} strokeWidth="11" strokeLinejoin="round" />
        <text x="268" y="844" textAnchor="middle" fill={WHITE} fontSize="42" fontWeight="750">耳朵</text>
      </g>

      <g opacity={eyeReveal}>
        <rect x="474" y="670" width="300" height="208" rx="38" fill={VIOLET} fillOpacity="0.12" stroke={VIOLET} strokeWidth="7" />
        <path d="M538 760 Q582 716 626 760 Q582 804 538 760 M646 760 Q690 716 734 760 Q690 804 646 760" fill="none" stroke={VIOLET} strokeWidth="9" />
        <circle cx="582" cy="760" r="10" fill={VIOLET} />
        <circle cx="690" cy="760" r="10" fill={VIOLET} />
        <text x="624" y="844" textAnchor="middle" fill={WHITE} fontSize="42" fontWeight="750">眼睛</text>
      </g>

      <g opacity={cluesReady}>
        <path d="M208 1060 C220 970 236 930 262 878" fill="none" stroke={CYAN} strokeWidth="8" />
        <path d="M446 1060 C430 970 396 930 346 878" fill="none" stroke={CYAN} strokeWidth="8" />
        <path d="M684 1060 C662 970 634 930 592 878" fill="none" stroke={CYAN} strokeWidth="8" />
      </g>

      <g opacity={edgeReveal}>
        <circle cx="208" cy="1188" r="112" fill={CYAN} fillOpacity="0.09" stroke={CYAN} strokeWidth="7" />
        <path d="M150 1218 L196 1162 L244 1218 L280 1168" fill="none" stroke={CYAN} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <text x="208" y="1350" textAnchor="middle" fill={WHITE} fontSize="40" fontWeight="700">边缘</text>
      </g>

      <g opacity={colorReveal}>
        <circle cx="446" cy="1188" r="112" fill={CYAN} fillOpacity="0.09" stroke={CYAN} strokeWidth="7" />
        <circle cx="412" cy="1188" r="39" fill={CYAN} fillOpacity="0.82" />
        <circle cx="462" cy="1162" r="39" fill={VIOLET} fillOpacity="0.82" />
        <circle cx="480" cy="1212" r="39" fill={CORAL} fillOpacity="0.82" />
        <text x="446" y="1350" textAnchor="middle" fill={WHITE} fontSize="40" fontWeight="700">颜色</text>
      </g>

      <g opacity={textureReveal} style={{fontSize: 36}}>
        <circle cx="684" cy="1188" r="112" fill={CYAN} fillOpacity="0.09" stroke={CYAN} strokeWidth="7" />
        {[0, 1, 2].flatMap((row) =>
          [0, 1, 2].map((column) => (
            <circle
              key={`${row}-${column}`}
              cx={644 + column * 40}
              cy={1148 + row * 40}
              r="9"
              fill={CYAN}
            />
          )),
        )}
        <text x="684" y="1350" textAnchor="middle" fill={WHITE} fontSize="40" fontWeight="700">纹理</text>
      </g>

      <g opacity={predictionReveal}>
        <path
          d="M700 456 C806 430 816 322 774 250"
          fill="none"
          stroke={MUTED}
          strokeWidth="7"
          strokeDasharray="18 18"
        />
        <path d="M756 274 L774 250 L786 280" fill="none" stroke={MUTED} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="700" cy="456" r="11" fill={MUTED} />
      </g>
    </svg>
  );
};

export default Renderer;
