import {Easing, interpolate} from "remotion";

type BiologicalNeuronRendererProps = Readonly<{
  sceneFrame: number;
  durationInFrames: number;
}>;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const progress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });

const BiologicalNeuronRenderer = ({
  sceneFrame,
  durationInFrames,
}: BiologicalNeuronRendererProps) => {
  const drawNeuron = progress(sceneFrame, 4, 50);
  const inputOne = progress(sceneFrame, 28, 64);
  const inputTwo = progress(sceneFrame, 45, 81);
  const inputThree = progress(sceneFrame, 62, 98);
  const integration = progress(sceneFrame, 78, 106);
  const release = progress(sceneFrame, 106, 178);
  const settle = progress(sceneFrame, 174, durationInFrames - 4);
  const somaRadius = 104 + Math.sin(integration * Math.PI) * 13;
  const somaGlow = Math.sin(integration * Math.PI) * 0.34;
  const axonSignalX = interpolate(release, [0, 1], [518, 825], clamp);
  const branchSignalY = interpolate(release, [0.62, 1], [676, 516], clamp);

  return (
    <svg
      aria-label="生物神经元接收、整合并传递信号的手绘示意图"
      viewBox="0 0 900 1470"
      width="100%"
      height="100%"
      style={{display: "block", overflow: "visible"}}
    >
      <g
        fill="none"
        stroke="#2f3142"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M390 615 C330 575 310 490 224 450 C172 426 136 396 108 350"
          strokeWidth="15"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawNeuron}
        />
        <path
          d="M385 650 C310 646 286 600 218 610 C164 618 128 598 94 570"
          strokeWidth="16"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawNeuron}
        />
        <path
          d="M390 696 C323 730 294 808 211 830 C160 844 124 880 98 922"
          strokeWidth="14"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawNeuron}
        />
        <path
          d="M410 578 C380 526 389 463 345 414 C322 388 316 348 326 310"
          strokeWidth="12"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawNeuron}
        />
        <path
          d="M500 674 C594 652 650 668 709 640 C760 615 788 558 826 504"
          strokeWidth="18"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - release}
        />
        <path
          d="M707 641 C767 660 799 716 832 786"
          strokeWidth="14"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - release}
        />
      </g>

      <g fill="#f08a5d" stroke="#2f3142" strokeWidth="13">
        <path
          d="M390 584 C427 548 488 555 516 602 C544 649 523 718 470 748 C418 778 357 744 347 690 C338 642 356 610 390 584 Z"
          opacity={drawNeuron}
        />
        <circle cx="826" cy="500" r={46 * release} />
        <circle cx="838" cy="800" r={42 * release} />
      </g>

      <circle
        cx="433"
        cy="663"
        r={somaRadius}
        fill="none"
        stroke="#f08a5d"
        strokeWidth="26"
        opacity={somaGlow}
      />

      <g fill="#4856a6" stroke="#f7f1df" strokeWidth="6">
        <circle cx={interpolate(inputOne, [0, 1], [92, 394], clamp)} cy={interpolate(inputOne, [0, 1], [350, 620], clamp)} r={15 * inputOne} />
        <circle cx={interpolate(inputTwo, [0, 1], [92, 390], clamp)} cy={interpolate(inputTwo, [0, 1], [570, 655], clamp)} r={15 * inputTwo} />
        <circle cx={interpolate(inputThree, [0, 1], [98, 398], clamp)} cy={interpolate(inputThree, [0, 1], [922, 696], clamp)} r={15 * inputThree} />
        <circle cx={axonSignalX} cy={release < 0.62 ? 674 : branchSignalY} r={release > 0 ? 17 : 0} opacity={1 - settle * 0.35} />
        <circle cx={axonSignalX} cy={release < 0.62 ? 674 : interpolate(release, [0.62, 1], [676, 788], clamp)} r={release > 0.62 ? 14 : 0} opacity={1 - settle * 0.35} />
      </g>

      <g fill="#4856a6" opacity={drawNeuron}>
        <circle cx="108" cy="350" r="10" />
        <circle cx="94" cy="570" r="10" />
        <circle cx="98" cy="922" r="10" />
      </g>
    </svg>
  );
};

export default BiologicalNeuronRenderer;
