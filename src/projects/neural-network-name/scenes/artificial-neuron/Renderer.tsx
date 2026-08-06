import type { FC } from "react";

type ArtificialNeuronRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const easeOut = (value: number) => {
  const progress = clamp01(value);
  return 1 - (1 - progress) ** 3;
};

const smooth = (value: number) => {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
};

const Renderer: FC<ArtificialNeuronRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
}) => {
  if (
    storyId !== "neural-network-name" ||
    meaningId !== "artificial-neuron" ||
    durationInFrames !== 365 ||
    fps !== 30 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames
  ) {
    throw new Error("artificial-neuron Renderer received stale Scene identity.");
  }

  const inputProgress = [
    easeOut((sceneFrame - 20) / 34),
    easeOut((sceneFrame - 62) / 34),
    easeOut((sceneFrame - 104) / 34),
  ];
  const abstractionProgress = smooth((sceneFrame - 146) / 42);
  const sumProgress = smooth((sceneFrame - 176) / 48);
  const gateProgress = smooth((sceneFrame - 222) / 44);
  const outputProgress = smooth((sceneFrame - 268) / 54);
  const finalPulse =
    outputProgress * (0.72 + 0.28 * Math.sin((sceneFrame - 268) / 7));

  const inputRows = [
    { y: 420, value: "0.8", weight: "× 0.7", strokeWidth: 9 },
    { y: 670, value: "0.3", weight: "× 1.2", strokeWidth: 15 },
    { y: 920, value: "0.6", weight: "× 0.4", strokeWidth: 6 },
  ] as const;

  return (
    <svg
      aria-label="人工神经元将多个输入乘以权重、求和、激活并产生输出的手绘运算图"
      viewBox="0 0 900 1470"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        fontSize: 36,
      }}
    >
      <g opacity={0.96}>
        <text
          x="450"
          y="126"
          textAnchor="middle"
          fontSize={54}
          fontWeight={800}
          fill="#29323a"
          fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
        >
          把连接关系，变成数字运算
        </text>
        <path
          d="M202 158 C332 166 544 148 698 160"
          fill="none"
          stroke="#5267a8"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="16 11"
          opacity={0.58}
        />
      </g>

      {inputRows.map((input, index) => {
        const progress = inputProgress[index] ?? 0;
        const x = 34 + 70 * (1 - progress);
        return (
          <g key={input.value} opacity={progress}>
            <circle
              cx={x + 66}
              cy={input.y}
              r="62"
              fill="#fffaf0"
              stroke="#29323a"
              strokeWidth="6"
            />
            <circle
              cx={x + 70}
              cy={input.y - 3}
              r="57"
              fill="#eef5e5"
              stroke="#708b68"
              strokeWidth="3"
              strokeDasharray="9 6"
            />
            <text
              x={x + 68}
              y={input.y + 15}
              textAnchor="middle"
              fontSize={42}
              fontWeight={800}
              fill="#29323a"
              fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
            >
              {input.value}
            </text>
            <path
              d={`M${x + 132} ${input.y} C250 ${input.y - 12} 302 ${
                651 + (input.y - 670) * 0.34
              } 372 ${651 + (input.y - 670) * 0.22}`}
              fill="none"
              stroke="#4c5f9d"
              strokeWidth={input.strokeWidth}
              strokeLinecap="round"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - progress}
            />
            <path
              d={`M${x + 134} ${input.y + 5} C248 ${input.y - 4} 304 ${
                657 + (input.y - 670) * 0.34
              } 374 ${657 + (input.y - 670) * 0.22}`}
              fill="none"
              stroke="#29323a"
              strokeWidth="2"
              strokeLinecap="round"
              opacity={0.34}
            />
            <text
              x="245"
              y={input.y - 34}
              textAnchor="middle"
              fontSize={36}
              fontWeight={700}
              fill="#4c5f9d"
              fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
            >
              {input.weight}
            </text>
          </g>
        );
      })}

      <g opacity={0.34 + abstractionProgress * 0.66}>
        <circle
          cx="468"
          cy="650"
          r={118 + 8 * Math.sin(sceneFrame / 8) * sumProgress}
          fill="#d9e8cb"
          stroke="#29323a"
          strokeWidth="8"
        />
        <circle
          cx="472"
          cy="646"
          r="108"
          fill="none"
          stroke="#708b68"
          strokeWidth="5"
          strokeDasharray="18 12"
          strokeDashoffset={-sceneFrame * sumProgress * 0.8}
        />
        <text
          x="468"
          y="674"
          textAnchor="middle"
          fontSize={76}
          fontWeight={800}
          fill="#29323a"
          fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
        >
          Σ
        </text>
        <text
          x="468"
          y="818"
          textAnchor="middle"
          fontSize={38}
          fontWeight={800}
          fill="#597052"
          fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
        >
          加起来
        </text>
      </g>

      <g opacity={gateProgress}>
        <path
          d="M584 650 C620 650 642 650 662 650"
          fill="none"
          stroke="#4c5f9d"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - gateProgress}
        />
        <path
          d="M660 536 C704 548 731 586 731 650 C731 714 704 752 660 764 L660 536"
          fill="#eef5e5"
          stroke="#29323a"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <path
          d="M673 559 C704 575 716 604 716 650 C716 696 704 725 673 741"
          fill="none"
          stroke="#708b68"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="13 9"
        />
        <text
          x="696"
          y="818"
          textAnchor="middle"
          fontSize={38}
          fontWeight={800}
          fill="#597052"
          fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
        >
          激活门
        </text>
      </g>

      <g opacity={outputProgress}>
        <path
          d="M731 650 C772 650 805 650 846 650"
          fill="none"
          stroke="#4c5f9d"
          strokeWidth={10 + finalPulse * 5}
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - outputProgress}
        />
        <path
          d="M824 628 L850 650 L824 672"
          fill="none"
          stroke="#4c5f9d"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="848"
          cy="650"
          r={14 + finalPulse * 9}
          fill="#4c5f9d"
          opacity={0.68 + finalPulse * 0.32}
        />
        <text
          x="790"
          y="584"
          textAnchor="middle"
          fontSize={38}
          fontWeight={800}
          fill="#4c5f9d"
          fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
        >
          输出
        </text>
      </g>

      <g opacity={sumProgress}>
        <path
          d="M90 1118 C228 1098 338 1114 450 1110 C562 1106 682 1098 810 1118"
          fill="none"
          stroke="#29323a"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="10 12"
          opacity={0.38}
        />
        <text
          x="450"
          y="1196"
          textAnchor="middle"
          fontSize={44}
          fontWeight={800}
          fill="#29323a"
          fontFamily="Noto Sans SC, Microsoft YaHei, sans-serif"
        >
          输入 × 权重 → 求和 → 激活 → 输出
        </text>
      </g>
    </svg>
  );
};

export default Renderer;
