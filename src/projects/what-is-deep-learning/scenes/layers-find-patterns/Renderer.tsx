import type {FC} from "react";
import {interpolate} from "remotion";

type LayersFindPatternsProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const clamp = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const pixelPattern = [
  0, 1, 0, 0, 1, 0,
  1, 1, 1, 1, 1, 1,
  1, 0, 1, 1, 0, 1,
  1, 1, 1, 1, 1, 1,
  0, 1, 0, 0, 1, 0,
] as const;

const layerData = [
  {label: "边缘", y: 850, color: "#51E5F2", start: 104},
  {label: "局部形状", y: 600, color: "#8E7CFF", start: 138},
  {label: "整体类别", y: 350, color: "#B56CFF", start: 172},
] as const;

const LayersFindPatterns: FC<LayersFindPatternsProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
}) => {
  if (
    storyId !== "what-is-deep-learning" ||
    meaningId !== "layers-find-patterns" ||
    durationInFrames !== 246 ||
    fps !== 30 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames
  ) {
    throw new Error("layers-find-patterns Renderer received stale Scene identity.");
  }

  const pixelReveal = clamp(sceneFrame, 4, 30);
  const pathReveal = clamp(sceneFrame, 92, 190);
  const decisionReveal = clamp(sceneFrame, 198, 224);
  const pulse = 0.72 + Math.sin(sceneFrame / 8) * 0.14;
  const signalY = interpolate(pathReveal, [0, 1], [1170, 250]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <svg
        aria-label="像素线索经过三层模式提取后形成猫类别判断"
        width="900"
        height="1470"
        viewBox="0 0 900 1470"
        style={{position: "absolute", inset: 0, fontSize: 36}}
      >
        <path
          d="M450 1170 V250"
          fill="none"
          stroke="#6678A8"
          strokeWidth="5"
          strokeDasharray="14 18"
          opacity={0.18 + pathReveal * 0.5}
        />

        <g opacity={pixelReveal} style={{fontSize: 36}}>
          <rect
            x="258"
            y="1160"
            width="384"
            height="270"
            rx="34"
            fill="#071A2A"
            fillOpacity="0.88"
            stroke="#51E5F2"
            strokeWidth="4"
          />
          <text x="306" y="1220" fontSize={40} fill="#B7F7FF" fontWeight="700">
            像素线索
          </text>
          {pixelPattern.map((active, index) => {
            const column = index % 6;
            const row = Math.floor(index / 6);
            return (
              <rect
                key={index}
                x={330 + column * 42}
                y={1250 + row * 31}
                width="26"
                height="22"
                rx="4"
                fill={active === 1 ? "#51E5F2" : "#24364E"}
                opacity={active === 1 ? pulse : 0.5}
              />
            );
          })}
        </g>

        {layerData.map((layer, index) => {
          const reveal = clamp(sceneFrame, layer.start, layer.start + 24);
          const firstLayerHold = index === 0 && sceneFrame >= 122 ? 1 : reveal;
          return (
            <g
              key={layer.label}
              opacity={0.12 + reveal * 0.88}
              style={{fontSize: 36}}
            >
              <rect
                x="145"
                y={layer.y}
                width="610"
                height="150"
                rx="34"
                fill="#11162F"
                fillOpacity="0.76"
                stroke={layer.color}
                strokeWidth={index === 0 && sceneFrame >= 122 ? 6 : 3}
                strokeOpacity={0.38 + firstLayerHold * 0.62}
              />
              {[0, 1, 2, 3, 4].map((node) => (
                <circle
                  key={node}
                  cx={260 + node * 95}
                  cy={layer.y + 76}
                  r={14 + reveal * 8}
                  fill={layer.color}
                  opacity={0.36 + reveal * 0.64}
                />
              ))}
              <text
                x="188"
                y={layer.y + 57}
                fontSize={40}
                fill="#F4F2FF"
                fontWeight="750"
              >
                {layer.label}
              </text>
              <text
                x="188"
                y={layer.y + 112}
                fontSize={36}
                fill={layer.color}
                fontWeight="650"
              >
                第 {index + 1} 层模式
              </text>
            </g>
          );
        })}

        <circle
          cx="450"
          cy={signalY}
          r="13"
          fill="#D9FBFF"
          opacity={pathReveal}
        />
        <circle
          cx="450"
          cy={signalY}
          r="25"
          fill="none"
          stroke="#51E5F2"
          strokeWidth="4"
          opacity={pathReveal * pulse}
        />

        <g opacity={decisionReveal}>
          <rect
            x="286"
            y="76"
            width="328"
            height="210"
            rx="38"
            fill="#181333"
            fillOpacity="0.86"
            stroke="#B56CFF"
            strokeWidth="5"
          />
          <path
            d="M390 190 L378 130 L418 155 Q450 138 482 155 L522 130 L510 190 Q506 232 450 238 Q394 232 390 190 Z"
            fill="#B56CFF"
            fillOpacity="0.24"
            stroke="#E4D8FF"
            strokeWidth="5"
          />
          <circle cx="428" cy="190" r="7" fill="#E4D8FF" />
          <circle cx="472" cy="190" r="7" fill="#E4D8FF" />
          <text x="548" y="212" fontSize={44} fill="#F4F2FF" fontWeight="800">
            猫
          </text>
        </g>
      </svg>
    </div>
  );
};

export default LayersFindPatterns;
