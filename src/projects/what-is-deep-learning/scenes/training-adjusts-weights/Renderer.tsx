import type { FC } from "react";

type RendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const bounded = clamp(value);
  return bounded * bounded * (3 - 2 * bounded);
};
const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const CYAN = "#5DE5F2";
const VIOLET = "#A77CFF";
const CORAL = "#FF7A73";
const WHITE = "#F5F7FF";
const MUTED = "#8794B2";

const layerNodes = [
  { x: 350, ys: [450, 630, 810] },
  { x: 510, ys: [400, 540, 680, 820] },
  { x: 660, ys: [510, 680, 850] },
] as const;

const Renderer: FC<RendererProps> = ({
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
    meaningId !== "training-adjusts-weights" ||
    durationInFrames !== 312 ||
    fps !== 30 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames
  ) {
    throw new Error("training-adjusts-weights Renderer received stale Scene identity.");
  }

  const enter = smooth((sceneFrame - 8) / 46);
  const cycle = Math.min(2, Math.floor(Math.max(0, sceneFrame - 34) / 28));
  const signal = smooth(((sceneFrame - 42) % 76) / 58);
  const wrong = smooth((sceneFrame - 96) / 26) * (1 - smooth((sceneFrame - 206) / 36));
  const feedback = smooth((sceneFrame - 126) / 48) * (1 - smooth((sceneFrame - 220) / 34));
  const adjust = smooth((sceneFrame - 186) / 76);
  const settled = smooth((sceneFrame - 246) / 42);
  const pulse = (Math.sin(sceneFrame / 8) + 1) / 2;
  const errorValue = Math.round(mix(78, 24, adjust));
  const sampleY = [440, 610, 780][cycle] ?? 440;
  const pathProgress = Math.min(1, signal * 1.15);

  return (
    <div
      data-scene="training-adjusts-weights"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        color: WHITE,
        fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <svg
        aria-label="训练例子经过网络，错误反馈促使连接权重调整"
        viewBox="0 0 900 1470"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, fontSize: 36 }}
      >
        <defs>
          <filter id="node-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <marker id="feedback-arrow" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto">
            <path d="M0 0 L14 7 L0 14 Z" fill={CORAL} />
          </marker>
        </defs>

        <text x="0" y="54" fill={MUTED} fontSize="36" fontWeight="700" letterSpacing="4">
          LEARNING LOOP / 03
        </text>
        <text x="0" y="120" fill={WHITE} fontSize="54" fontWeight="820">
          例子让连接一点点改变
        </text>

        <g opacity={0.3 + enter * 0.7} style={{ fontSize: 36 }}>
          <text x="0" y="265" fill={CYAN} fontSize="38" fontWeight="760">
            训练例子
          </text>
          {[440, 610, 780].map((y, index) => {
            const active = index === cycle;
            const cardOpacity = active ? 1 : 0.34 + enter * 0.2;
            return (
              <g key={y} opacity={cardOpacity}>
                <rect x="0" y={y - 76} width="210" height="132" rx="28" fill="rgba(10,32,57,0.74)" stroke={CYAN} strokeWidth={active ? 4 : 2} />
                <circle cx="54" cy={y - 10} r="28" fill={index === 1 ? "rgba(167,124,255,0.2)" : "rgba(93,229,242,0.2)"} stroke={index === 1 ? VIOLET : CYAN} strokeWidth="4" />
                <path
                  d={index === 1 ? `M38 ${y - 12} Q54 ${y - 34} 70 ${y - 12} Q54 ${y + 14} 38 ${y - 12}` : `M36 ${y + 10} L42 ${y - 30} L56 ${y - 14} L70 ${y - 30} L76 ${y + 10} Z`}
                  fill="none"
                  stroke={index === 1 ? VIOLET : CYAN}
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <text x="100" y={y + 3} fill={WHITE} fontSize="38" fontWeight="760">
                  {index === 1 ? "狗" : "猫"}
                </text>
              </g>
            );
          })}
          <circle cx={mix(220, 338, pathProgress)} cy={mix(sampleY - 10, 630, pathProgress)} r="10" fill={CYAN} opacity={0.55 + pulse * 0.45} />
        </g>

        <g style={{ fontSize: 36 }}>
          <text x="326" y="265" fill={VIOLET} fontSize="38" fontWeight="760">
            多层网络
          </text>
          {layerNodes.slice(0, -1).flatMap((layer, layerIndex) =>
            layer.ys.flatMap((fromY, fromIndex) =>
              layerNodes[layerIndex + 1].ys.map((toY, toIndex) => {
                const strengthened = (fromIndex + toIndex + layerIndex) % 3 === 0;
                const baseWidth = strengthened ? 3 : 2;
                const finalWidth = strengthened ? 11 : 1.5;
                return (
                  <line
                    key={`${layer.x}-${fromY}-${toY}`}
                    x1={layer.x + 18}
                    y1={fromY}
                    x2={layerNodes[layerIndex + 1].x - 18}
                    y2={toY}
                    stroke={strengthened ? VIOLET : "#7180A5"}
                    strokeWidth={mix(baseWidth, finalWidth, adjust)}
                    opacity={mix(0.35, strengthened ? 0.9 : 0.18, adjust)}
                    strokeLinecap="round"
                  />
                );
              }),
            ),
          )}
          {layerNodes.flatMap((layer, layerIndex) =>
            layer.ys.map((y, nodeIndex) => {
              const active = pathProgress > (layerIndex + nodeIndex * 0.09) / 3;
              return (
                <g key={`${layer.x}-${y}`}>
                  <circle cx={layer.x} cy={y} r="34" fill={VIOLET} opacity={active ? 0.2 + pulse * 0.13 : 0.08} filter="url(#node-glow)" />
                  <circle cx={layer.x} cy={y} r="17" fill={active ? VIOLET : "#293452"} stroke={VIOLET} strokeWidth="3" />
                </g>
              );
            }),
          )}
        </g>

        <g opacity={smooth((sceneFrame - 74) / 34)}>
          <rect x="706" y="418" width="194" height="292" rx="30" fill="rgba(20,25,48,0.78)" stroke={wrong > 0.1 ? CORAL : VIOLET} strokeWidth="4" />
          <text x="803" y="478" textAnchor="middle" fill={MUTED} fontSize="36" fontWeight="700">
            预测
          </text>
          <path d="M766 566 L778 528 L800 548 L826 518 L842 568 Z" fill="none" stroke={VIOLET} strokeWidth="5" strokeLinejoin="round" />
          <text x="803" y="636" textAnchor="middle" fill={wrong > 0.12 ? CORAL : WHITE} fontSize="42" fontWeight="820">
            {wrong > 0.12 ? "猜错" : "猜一猜"}
          </text>
        </g>

        <g opacity={wrong}>
          <rect x="690" y="786" width="210" height="168" rx="28" fill="rgba(255,122,115,0.12)" stroke={CORAL} strokeWidth="4" />
          <text x="795" y="846" textAnchor="middle" fill={CORAL} fontSize="36" fontWeight="760">
            误差
          </text>
          <text x="795" y="918" textAnchor="middle" fill={WHITE} fontSize="56" fontWeight="850">
            {errorValue}%
          </text>
        </g>

        <path
          d="M790 976 C790 1080 628 1088 562 970 C520 896 542 842 598 804"
          fill="none"
          stroke={CORAL}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="20 18"
          strokeDashoffset={-(sceneFrame * 4) % 38}
          markerEnd="url(#feedback-arrow)"
          opacity={feedback}
        />
        <text x="600" y="1080" fill={CORAL} fontSize="38" fontWeight="800" opacity={feedback}>
          误差返回
        </text>

        <g opacity={smooth((sceneFrame - 176) / 40)}>
          <rect x="274" y="1054" width="354" height="102" rx="51" fill="rgba(167,124,255,0.13)" stroke={VIOLET} strokeWidth="3" />
          <text x="451" y="1120" textAnchor="middle" fill={WHITE} fontSize="40" fontWeight="800">
            调整连接权重
          </text>
        </g>

        {["看例子", "发现误差", "调权重"].map((label, index) => {
          const thresholds = [18, 106, 210];
          const active = sceneFrame >= (thresholds[index] ?? 0);
          const x = 18 + index * 298;
          return (
            <g key={label} opacity={active ? 1 : 0.28} style={{ fontSize: 36 }}>
              <circle cx={x + 34} cy="1294" r="30" fill={index === 1 ? CORAL : index === 2 ? VIOLET : CYAN} opacity={active ? 0.94 : 0.35} />
              <text x={x + 34} y="1307" textAnchor="middle" fill="#081224" fontSize="36" fontWeight="900">
                {index + 1}
              </text>
              <text x={x + 78} y="1308" fill={WHITE} fontSize="38" fontWeight="760">
                {label}
              </text>
              {index < 2 ? <path d={`M${x + 238} 1294 H${x + 284}`} stroke={MUTED} strokeWidth="4" strokeLinecap="round" /> : null}
            </g>
          );
        })}

        <g opacity={settled}>
          <circle cx="450" cy="1402" r="8" fill={VIOLET} />
          <text x="476" y="1415" fill={VIOLET} fontSize="38" fontWeight="760">
            连接已更新，继续学习
          </text>
        </g>
      </svg>
    </div>
  );
};

export default Renderer;
