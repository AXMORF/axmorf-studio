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
  <div style={{position: "absolute", inset: 0, overflow: "hidden", fontSize: 36}}>
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
  >
    {children}
  </div>
);

type RendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
  readabilityPolicy?: SceneReadabilityPolicy;
}>;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};
const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const operationalNodes = [
  {label: "数据", x: 58, y: 474, anchor: 84},
  {label: "工具", x: 612, y: 474, anchor: 108},
  {label: "权限", x: 676, y: 734, anchor: 132},
  {label: "监控", x: 612, y: 1000, anchor: 158},
  {label: "人类反馈", x: 58, y: 1000, anchor: 190},
] as const;

const Renderer: FC<RendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  width,
  height,
  readabilityPolicy,
}) => {
  if (
    storyId !== "algorithm-model-ai-system" ||
    meaningId !== "system-operates" ||
    durationInFrames !== 278 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames ||
    readabilityPolicy === undefined
  ) {
    throw new Error("system-operates Renderer received stale Scene identity.");
  }

  const modelReveal = smooth((sceneFrame - 4) / 34);
  const shellReveal = smooth((sceneFrame - 30) / 48);
  const loopProgress = smooth((sceneFrame - 48) / 150);
  const stackProgress = smooth((sceneFrame - 214) / 42);
  const orbitOpacity = 1 - 0.76 * stackProgress;
  const pulsePhase = ((sceneFrame - 48) % 150 + 150) % 150;
  const pulseAngle = (pulsePhase / 150) * Math.PI * 2 - Math.PI / 2;
  const pulseX = 450 + Math.cos(pulseAngle) * 300;
  const pulseY = 790 + Math.sin(pulseAngle) * 350;

  return (
    <>
      <SceneBackground>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 43%, #201939 0%, #10152a 46%, #070b17 100%)",
          }}
        />
        <svg width="1080" height="1920" viewBox="0 0 1080 1920">
          <defs>
            <pattern id="system-grid" width="72" height="72" patternUnits="userSpaceOnUse">
              <path d="M72 0H0V72" fill="none" stroke="#6fd7e7" strokeWidth="1" opacity="0.08" />
            </pattern>
            <radialGradient id="system-amber-glow">
              <stop offset="0" stopColor="#f4b64d" stopOpacity="0.22" />
              <stop offset="1" stopColor="#f4b64d" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1080" height="1920" fill="url(#system-grid)" />
          <circle cx="540" cy="880" r={460 * shellReveal} fill="url(#system-amber-glow)" />
          <path
            d="M180 880C180 555 900 555 900 880C900 1205 180 1205 180 880Z"
            fill="none"
            stroke="#f4b64d"
            strokeWidth="4"
            strokeDasharray="18 18"
            strokeDashoffset={-sceneFrame * 1.6}
            opacity={0.24 * shellReveal * orbitOpacity}
          />
        </svg>
      </SceneBackground>

      <SceneContentFrame policy={readabilityPolicy}>
        <div style={{position: "absolute", inset: 0, color: "#f7f2e8", fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif', fontSize: 36}}>
          <div style={{position: "absolute", left: 0, top: 0, width: 900, opacity: 1 - 0.5 * stackProgress}}>
            <div style={{fontSize: 36, color: "#f4b64d", letterSpacing: 5, fontWeight: 700}}>
              AI SYSTEM · 04
            </div>
            <div style={{fontSize: 68, marginTop: 18, lineHeight: 1.16, fontWeight: 780, letterSpacing: -2}}>
              模型进入真实流程
            </div>
          </div>

          <svg
            width="900"
            height="1250"
            viewBox="0 0 900 1250"
            style={{position: "absolute", left: 0, top: 220, overflow: "visible", opacity: orbitOpacity, fontSize: 36}}
          >
            <ellipse cx="450" cy="610" rx="354" ry="402" fill="none" stroke="#f4b64d" strokeWidth="5" opacity={0.2 + 0.72 * shellReveal} />
            <ellipse cx="450" cy="610" rx="316" ry="360" fill="none" stroke="#f4b64d" strokeWidth="2" strokeDasharray="10 16" opacity={0.24 + 0.36 * shellReveal} />
            {operationalNodes.map((node) => {
              const reveal = smooth((sceneFrame - node.anchor) / 20);
              const centerX = node.x + 84;
              const centerY = node.y + 42;
              return (
                <g key={node.label} opacity={reveal}>
                  <path d={`M450 610L${centerX} ${centerY}`} stroke="#f4b64d" strokeWidth="4" opacity={0.22 + 0.58 * reveal} />
                  <circle cx={centerX} cy={centerY} r="54" fill="#f4b64d" opacity="0.08" />
                  <circle cx={centerX} cy={centerY} r="8" fill="#ffd88d" />
                </g>
              );
            })}
            <path d="M450 154V242" stroke="#6fd7e7" strokeWidth="6" opacity={smooth((sceneFrame - 48) / 20)} />
            <path d="M450 970V1082" stroke="#b790ff" strokeWidth="6" opacity={smooth((sceneFrame - 172) / 24)} />
            <circle cx={pulseX} cy={pulseY - 180} r="15" fill="#fff1bf" opacity={loopProgress} />
            <circle cx={pulseX} cy={pulseY - 180} r="30" fill="#f4b64d" opacity={0.14 * loopProgress} />
          </svg>

          <div
            style={{
              position: "absolute",
              left: 286,
              top: 642,
              width: 328,
              height: 238,
              borderRadius: 54,
              border: "4px solid #b790ff",
              background: "linear-gradient(145deg, rgba(111,70,188,0.9), rgba(42,27,83,0.96))",
              boxShadow: "0 0 56px rgba(183,144,255,0.28)",
              opacity: modelReveal * orbitOpacity,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{fontSize: 52, fontWeight: 800, letterSpacing: 2}}>
              模型
            </div>
            <div style={{fontSize: 36, marginTop: 12, color: "#d9c8ff", letterSpacing: 3}}>
              LEARNED PARAMETERS
            </div>
          </div>

          {operationalNodes.map((node) => {
            const reveal = smooth((sceneFrame - node.anchor) / 20) * orbitOpacity;
            return (
              <div
                key={node.label}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y + 220,
                  width: 168,
                  height: 84,
                  borderRadius: 24,
                  border: "3px solid rgba(244,182,77,0.9)",
                  background: "rgba(50,35,20,0.92)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: reveal,
                }}
              >
                <div style={{fontSize: 38, fontWeight: 740, color: "#ffe1a3"}}>
                  {node.label}
                </div>
              </div>
            );
          })}

          <div style={{position: "absolute", left: 0, top: 1250, width: 900, opacity: shellReveal * (1 - stackProgress)}}>
            <div style={{height: 3, width: `${mix(90, 900, loopProgress)}px`, background: "linear-gradient(90deg, #6fd7e7, #b790ff, #f4b64d)"}} />
            <div style={{fontSize: 38, marginTop: 20, color: "#dccca8", lineHeight: 1.35, fontWeight: 650}}>
              输入 → 模型 → 工具执行 → 监控 → 人类反馈
            </div>
          </div>

          <div style={{position: "absolute", left: 0, top: 340, width: 900, opacity: stackProgress, fontSize: 36}}>
            {[
              {label: "算法步骤", color: "#6fd7e7", width: 610},
              {label: "模型参数", color: "#b790ff", width: 735},
              {label: "AI 系统运行环境", color: "#f4b64d", width: 900},
            ].map((layer, index) => (
              <div key={layer.label} style={{position: "relative", height: 196, marginTop: index === 0 ? 0 : 34, borderRadius: 32, border: `4px solid ${layer.color}`, background: "rgba(11,15,29,0.92)", width: layer.width, opacity: smooth((sceneFrame - 224 - index * 8) / 18)}}>
                <div style={{position: "absolute", left: 34, top: 34}}>
                  <div style={{fontSize: 44, fontWeight: 800, color: layer.color}}>
                    {layer.label}
                  </div>
                  <div style={{fontSize: 36, marginTop: 12, color: "#e8e2d8"}}>
                    {index === 0 ? "可执行方法" : index === 1 ? "训练后的规律" : "让模型可靠工作"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{position: "absolute", left: 0, top: 1276, width: 900, opacity: stackProgress}}>
            <div style={{fontSize: 42, color: "#ffe0a1", fontWeight: 760, lineHeight: 1.35}}>
              完整系统 = 模型 + 真实流程 + 持续反馈
            </div>
          </div>
        </div>
      </SceneContentFrame>
    </>
  );
};

export default Renderer;
