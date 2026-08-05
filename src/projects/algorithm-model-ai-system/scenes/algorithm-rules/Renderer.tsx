import type {FC, ReactNode} from "react";

type SceneReadabilityPolicy = Readonly<{
  policyId: "production-readability-v1";
  policyFingerprint: string;
  typographyPolicy: Readonly<{minFontSizePx: number}>;
  sceneContentSafeAreaPx: Readonly<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>;
}>;

const SceneBackground: FC<Readonly<{children: ReactNode}>> = ({children}) => (
  <div
    style={{position: "absolute", inset: 0, overflow: "hidden", fontSize: 36}}
    aria-hidden="true"
  >
    {children}
  </div>
);

const SceneContentFrame: FC<
  Readonly<{policy: SceneReadabilityPolicy; children: ReactNode}>
> = ({policy, children}) => (
  <div
    style={{
      position: "absolute",
      top: policy.sceneContentSafeAreaPx.top,
      right: policy.sceneContentSafeAreaPx.right,
      bottom: policy.sceneContentSafeAreaPx.bottom,
      left: policy.sceneContentSafeAreaPx.left,
      overflow: "hidden",
      fontSize: 36,
    }}
    data-readability-content-frame={policy.policyFingerprint}
  >
    {children}
  </div>
);

type AlgorithmRulesRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  readabilityPolicy?: SceneReadabilityPolicy;
}>;

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

const smooth = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};

const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const Renderer: FC<AlgorithmRulesRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
  readabilityPolicy,
}) => {
  if (
    storyId !== "algorithm-model-ai-system" ||
    meaningId !== "algorithm-rules" ||
    durationInFrames !== 269 ||
    fps !== 30 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames ||
    readabilityPolicy === undefined
  ) {
    throw new Error("algorithm-rules Renderer received stale Scene identity.");
  }

  const definitionReveal = smooth((sceneFrame - 8) / 42);
  const flowReveal = smooth((sceneFrame - 48) / 62);
  const exampleReveal = smooth((sceneFrame - 118) / 24);
  const compareProgress = smooth((sceneFrame - 126) / 28);
  const decideProgress = smooth((sceneFrame - 156) / 26);
  const swapProgress = smooth((sceneFrame - 188) / 34);
  const orderedProgress = smooth((sceneFrame - 224) / 30);
  const loopPhase = ((Math.max(0, sceneFrame - 52) % 78) / 78) * 3;
  const activeRule = Math.min(2, Math.floor(loopPhase));
  const markerX = [126, 450, 774][activeRule];
  const pulse = 0.65 + 0.35 * Math.sin((sceneFrame / 30) * Math.PI * 2);
  const leftValueX = mix(188, 332, swapProgress);
  const rightValueX = mix(332, 188, swapProgress);
  const values = orderedProgress > 0.65 ? [2, 3, 6, 8] : [8, 3, 6, 2];

  return (
    <>
      <SceneBackground>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 30%, #12394a 0%, #071b28 48%, #040d16 100%)",
          }}
        />
        <svg
          viewBox="0 0 1080 1920"
          width="1080"
          height="1920"
          style={{position: "absolute", inset: 0}}
        >
          <defs>
            <pattern id="algorithm-grid" width="54" height="54" patternUnits="userSpaceOnUse">
              <path d="M54 0H0V54" fill="none" stroke="#65e6ff" strokeWidth="1" opacity="0.08" />
            </pattern>
            <radialGradient id="algorithm-halo">
              <stop offset="0" stopColor="#57def6" stopOpacity="0.2" />
              <stop offset="1" stopColor="#57def6" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1080" height="1920" fill="url(#algorithm-grid)" />
          <circle cx="540" cy="800" r={430 + 24 * pulse} fill="url(#algorithm-halo)" />
        </svg>
      </SceneBackground>
      <SceneContentFrame policy={readabilityPolicy}>
        <div style={{position: "absolute", inset: 0, color: "#eefcff"}}>
          <div style={{position: "absolute", left: 0, top: 0, width: 900}}>
            <div
              style={{fontSize: 38, fontWeight: 700, letterSpacing: 6, color: "#57def6"}}
            >
              ALGORITHM / RULE SEQUENCE
            </div>
            <div
              style={{fontSize: 64, marginTop: 14, fontWeight: 800, lineHeight: 1.18, opacity: definitionReveal}}
            >
              明确步骤，重复执行
            </div>
          </div>

          <svg
            viewBox="0 0 900 1470"
            width="900"
            height="1470"
            style={{position: "absolute", inset: 0}}
          >
            <g opacity={definitionReveal}>
              <rect x="0" y="188" width="900" height="176" rx="34" fill="#0b2b3b" stroke="#57def6" strokeWidth="3" />
              <circle cx="72" cy="276" r="34" fill="#57def6" opacity={pulse} />
              <path d="M126 276H792" stroke="#57def6" strokeWidth="4" strokeDasharray="18 14" opacity="0.52" />
              <circle cx="828" cy="276" r="18" fill="#57def6" />
              <text x="126" y="266" fontSize={40} fill="#eefcff" fontWeight="700">
                输入 → 按规则处理 → 确定输出
              </text>
              <text x="126" y="320" fontSize={36} fill="#8fb9c7">
                同样的输入条件，遵循同样的步骤
              </text>
            </g>

            <g opacity={flowReveal} style={{fontSize: 36}}>
              <path d="M216 512H360M540 512H684" stroke="#57def6" strokeWidth="5" strokeDasharray="14 12" />
              <path d="M348 496L372 512L348 528M672 496L696 512L672 528" fill="none" stroke="#57def6" strokeWidth="5" />
              {[
                {x: 0, label: "比较", index: "01"},
                {x: 324, label: "判断", index: "02"},
                {x: 648, label: "交换", index: "03"},
              ].map((rule, index) => (
                <g key={rule.index}>
                  <rect
                    x={rule.x}
                    y="430"
                    width="252"
                    height="164"
                    rx="28"
                    fill={activeRule === index ? "#123e50" : "#0a2432"}
                    stroke="#57def6"
                    strokeWidth={activeRule === index ? 5 : 2}
                    opacity={activeRule === index ? 1 : 0.72}
                  />
                  <text x={rule.x + 28} y="480" fontSize={36} fill="#78e9ff" fontWeight="700">
                    {rule.index}
                  </text>
                  <text x={rule.x + 126} y="552" textAnchor="middle" fontSize={50} fill="#eefcff" fontWeight="800">
                    {rule.label}
                  </text>
                </g>
              ))}
              <circle cx={markerX} cy="622" r="12" fill="#eefcff" />
              <path d="M774 622C774 680 126 680 126 622" fill="none" stroke="#57def6" strokeWidth="3" strokeDasharray="12 12" opacity="0.65" />
              <path d="M144 607L126 622L144 637" fill="none" stroke="#57def6" strokeWidth="4" />
              <text x="450" y="726" textAnchor="middle" fontSize={36} fill="#8fb9c7">
                顺序固定 · 条件明确 · 可以循环
              </text>
            </g>

            <g opacity={exampleReveal} style={{fontSize: 36}}>
              <rect x="0" y="778" width="900" height="374" rx="34" fill="#071e2b" stroke="#2f7285" strokeWidth="2" />
              <text x="36" y="836" fontSize={38} fill="#57def6" fontWeight="700">
                SORTING EXAMPLE
              </text>
              <text x="864" y="836" textAnchor="end" fontSize={36} fill="#8fb9c7">
                从小到大
              </text>

              {values.map((value, index) => {
                const fixedX = 188 + index * 144;
                const x = index === 0 ? leftValueX : index === 1 ? rightValueX : fixedX;
                const selected = index < 2 && compareProgress > 0.15 && orderedProgress < 0.65;
                return (
                  <g key={`${index}-${value}`}>
                    <rect
                      x={x - 54}
                      y="890"
                      width="108"
                      height="108"
                      rx="22"
                      fill={selected ? "#15566b" : orderedProgress > 0.65 ? "#123d4b" : "#0d2c3b"}
                      stroke={selected ? "#eefcff" : "#57def6"}
                      strokeWidth={selected ? 5 : 3}
                    />
                    <text x={x} y="963" textAnchor="middle" fontSize={52} fill="#eefcff" fontWeight="800">
                      {value}
                    </text>
                  </g>
                );
              })}

              <path d="M244 1028H656" stroke="#57def6" strokeWidth="4" opacity={orderedProgress} />
              <path d="M638 1012L662 1028L638 1044" fill="none" stroke="#57def6" strokeWidth="4" opacity={orderedProgress} />
              <text x="36" y="1110" fontSize={40} fill="#eefcff" fontWeight="700">
                {orderedProgress > 0.65
                  ? "输出：有序数据"
                  : decideProgress > 0.55
                    ? "判断：左侧更大，需要交换"
                    : compareProgress > 0.25
                      ? "比较：8 与 3"
                      : "读取相邻数据"}
              </text>
            </g>

            <g opacity={smooth((sceneFrame - 214) / 34)}>
              <rect x="0" y="1210" width="900" height="118" rx="28" fill="#102339" stroke="#9d82ff" strokeWidth="3" />
              <rect x="0" y="1210" width={mix(64, 900, orderedProgress)} height="118" rx="28" fill="#34276b" opacity="0.56" />
              <text x="40" y="1284" fontSize={42} fill="#d9d0ff" fontWeight="700">
                有序数据 → 交给模型层
              </text>
              <path d="M690 1269H824" stroke="#d9d0ff" strokeWidth="5" />
              <path d="M806 1251L834 1269L806 1287" fill="none" stroke="#d9d0ff" strokeWidth="5" />
            </g>

            <g opacity="0.78">
              <rect x="0" y="1370" width="276" height="76" rx="20" fill="#123e50" stroke="#57def6" strokeWidth="3" />
              <rect x="312" y="1370" width="276" height="76" rx="20" fill="#211c49" stroke="#9d82ff" strokeWidth="2" />
              <rect x="624" y="1370" width="276" height="76" rx="20" fill="#3c2a13" stroke="#ffbd64" strokeWidth="2" />
              <text x="138" y="1422" textAnchor="middle" fontSize={36} fill="#dffaff" fontWeight="700">算法</text>
              <text x="450" y="1422" textAnchor="middle" fontSize={36} fill="#d9d0ff" fontWeight="700">模型</text>
              <text x="762" y="1422" textAnchor="middle" fontSize={36} fill="#ffe1ac" fontWeight="700">AI 系统</text>
            </g>
          </svg>
        </div>
      </SceneContentFrame>
    </>
  );
};

export default Renderer;
