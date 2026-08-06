import {interpolate} from "remotion";

type AnalogyLimitRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}>;

const INK = "#292522";
const ORANGE = "#e77b55";
const GREEN = "#7c9d75";
const INDIGO = "#5967a8";
const PAPER = "#fffaf0";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const AnalogyLimitRenderer = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  width,
  height,
}: AnalogyLimitRendererProps) => {
  if (
    storyId !== "neural-network-name" ||
    meaningId !== "analogy-limit" ||
    durationInFrames !== 206 ||
    width !== 1080 ||
    height !== 1920
  ) {
    throw new Error("analogy-limit Renderer received stale Scene identity.");
  }

  const neuronDraw = interpolate(sceneFrame, [0, 54], [420, 0], clamp);
  const networkDraw = interpolate(sceneFrame, [22, 82], [520, 0], clamp);
  const linkDraw = interpolate(sceneFrame, [50, 104], [230, 0], clamp);
  const similarityOpacity = interpolate(
    sceneFrame,
    [68, 90, 134, 154],
    [0, 1, 1, 0.24],
    clamp,
  );
  const correctionDraw = interpolate(sceneFrame, [130, 158], [180, 0], clamp);
  const settle = interpolate(sceneFrame, [154, 180], [0.84, 1], clamp);

  return (
    <svg
      aria-label="生物神经元为人工神经网络提供结构灵感，但二者并不等同"
      data-scene="analogy-limit"
      viewBox="0 0 900 1470"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        fontSize: 36,
        overflow: "visible",
        opacity: settle,
      }}
    >
      <g
        fill="none"
        stroke={ORANGE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="13"
        style={{strokeDasharray: 420, strokeDashoffset: neuronDraw}}
      >
        <path d="M242 652 C190 622 160 570 132 506 M238 646 C176 666 142 724 112 788 M244 650 C198 596 205 530 220 472 M247 652 C206 704 214 780 238 842 M248 650 C292 615 322 560 332 498 M250 654 C310 690 328 744 344 812" />
        <path d="M256 654 C315 652 360 650 403 650" />
      </g>

      <path
        d="M204 610 C220 574 278 578 298 616 C315 648 295 704 252 720 C210 707 188 664 204 610 Z"
        fill={PAPER}
        stroke={INK}
        strokeLinejoin="round"
        strokeWidth="10"
        style={{opacity: interpolate(sceneFrame, [18, 42], [0, 1], clamp)}}
      />
      <circle cx="250" cy="650" fill={ORANGE} r="23" />
      <path
        d="M398 650 C422 636 441 636 463 650"
        fill="none"
        stroke={INDIGO}
        strokeDasharray="230"
        strokeDashoffset={linkDraw}
        strokeLinecap="round"
        strokeWidth="11"
      />

      <g
        fill="none"
        stroke={GREEN}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="11"
        style={{strokeDasharray: 520, strokeDashoffset: networkDraw}}
      >
        <path d="M542 540 C610 575 610 656 675 690 M542 650 C610 620 612 602 675 580 M542 650 C610 668 612 734 675 800 M542 760 C610 724 612 620 675 580 M542 760 C610 762 612 788 675 800" />
        <path d="M675 580 C738 612 744 642 806 650 M675 690 C735 682 748 660 806 650 M675 800 C738 748 748 688 806 650" />
      </g>

      {[
        [542, 540],
        [542, 650],
        [542, 760],
        [675, 580],
        [675, 690],
        [675, 800],
        [806, 650],
      ].map(([cx, cy], index) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          fill={GREEN}
          r={interpolate(sceneFrame, [28 + index * 4, 48 + index * 4], [0, 25], clamp)}
          stroke={INK}
          strokeWidth="7"
        />
      ))}

      <g
        fill="none"
        opacity={similarityOpacity}
        stroke={INDIGO}
        strokeLinecap="round"
        strokeWidth="13"
      >
        <path d="M410 598 C434 580 459 580 487 598 C511 614 531 614 553 596" />
        <path d="M410 704 C435 686 459 686 487 704 C511 720 531 720 553 702" />
      </g>

      <path
        d="M402 754 C444 708 485 661 522 616 C544 590 560 568 574 546"
        fill="none"
        stroke={INK}
        strokeDasharray="180"
        strokeDashoffset={correctionDraw}
        strokeLinecap="round"
        strokeWidth="16"
      />
      <path
        d="M390 770 C441 721 490 670 530 620"
        fill="none"
        stroke={ORANGE}
        strokeDasharray="180"
        strokeDashoffset={correctionDraw}
        strokeLinecap="round"
        strokeWidth="6"
      />

      <g opacity={interpolate(sceneFrame, [146, 172], [0, 1], clamp)}>
        <path
          d="M126 920 C258 954 344 960 422 944"
          fill="none"
          stroke={ORANGE}
          strokeLinecap="round"
          strokeWidth="9"
        />
        <path
          d="M478 944 C580 962 690 956 812 920"
          fill="none"
          stroke={GREEN}
          strokeLinecap="round"
          strokeWidth="9"
        />
        <circle cx="450" cy="944" fill={INDIGO} r="13" />
      </g>
    </svg>
  );
};

export default AnalogyLimitRenderer;
