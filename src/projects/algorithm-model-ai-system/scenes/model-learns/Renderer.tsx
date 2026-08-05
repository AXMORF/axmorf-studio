import { interpolate } from "remotion";
import type { ReactNode } from "react";

type ReadabilityPolicy = Readonly<{
  policyId: "production-readability-v1";
  policyFingerprint: string;
  sceneContentSafeAreaPx: Readonly<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>;
}>;

type ModelLearnsRendererProps = Readonly<{
  sceneFrame: number;
  durationInFrames: number;
  readabilityPolicy?: ReadabilityPolicy;
}>;

const SceneBackground = ({ children }: Readonly<{ children: ReactNode }>) => (
  <div
    aria-hidden="true"
    style={{ position: "absolute", inset: 0, overflow: "hidden" }}
  >
    <>{children}</>
  </div>
);

const SceneContentFrame = ({
  policy,
  children,
}: Readonly<{ policy: ReadabilityPolicy; children: ReactNode }>) => {
  const safeArea = policy.sceneContentSafeAreaPx;
  return (
    <div
      data-readability-content-frame={policy.policyFingerprint}
      style={{
        position: "absolute",
        top: safeArea.top,
        right: safeArea.right,
        bottom: safeArea.bottom,
        left: safeArea.left,
        overflow: "hidden",
      }}
    >
      <>{children}</>
    </div>
  );
};

const FONT_FAMILY =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const INK = "#090b18";
const SOFT_WHITE = "#f6f3ff";
const CYAN = "#39dcff";
const VIOLET = "#a875ff";
const AMBER = "#ffbd59";

const nodePositions = [
  { left: 350, top: 330 },
  { left: 560, top: 270 },
  { left: 705, top: 430 },
  { left: 555, top: 570 },
  { left: 335, top: 535 },
] as const;

const ModelLearnsRenderer = ({
  sceneFrame,
  durationInFrames,
  readabilityPolicy,
}: ModelLearnsRendererProps) => {
  if (readabilityPolicy === undefined) {
    throw new Error("model-learns requires its frozen readability policy.");
  }

  const examplesProgress = interpolate(sceneFrame, [0, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const trainingProgress = interpolate(sceneFrame, [62, 178], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const settledProgress = interpolate(sceneFrame, [174, 226], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const handoffProgress = interpolate(
    sceneFrame,
    [218, durationInFrames - 1],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <>
      <SceneBackground>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: INK,
            backgroundImage:
              "linear-gradient(rgba(168,117,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(168,117,255,0.055) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 92,
            top: 360,
            width: 896,
            height: 896,
            borderRadius: 448,
            backgroundColor: "rgba(111,62,196,0.08)",
            boxShadow: "0 0 180px rgba(168,117,255,0.18)",
            opacity: 0.35 + settledProgress * 0.65,
          }}
        />
      </SceneBackground>

      <SceneContentFrame policy={readabilityPolicy}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            color: SOFT_WHITE,
            fontFamily: FONT_FAMILY,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 28,
              width: 900,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: 4,
                color: VIOLET,
              }}
            >
              02 · 模型层
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: "rgba(246,243,255,0.72)",
              }}
            >
              参数结构
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              top: 120,
              width: 184,
              height: 842,
              border: "2px solid rgba(246,243,255,0.16)",
              borderRadius: 28,
              backgroundColor: "rgba(5,7,18,0.72)",
              boxSizing: "border-box",
              padding: "24px 18px",
              fontSize: 36,
            }}
          >
            {[
              { label: "算法", color: CYAN, active: false },
              { label: "模型", color: VIOLET, active: true },
              { label: "系统", color: AMBER, active: false },
            ].map((layer, index) => (
              <div
                key={layer.label}
                style={{
                  height: 238,
                  marginBottom: index === 2 ? 0 : 28,
                  border: `3px solid ${layer.color}`,
                  borderRadius: 22,
                  backgroundColor: layer.active
                    ? "rgba(168,117,255,0.22)"
                    : "rgba(255,255,255,0.025)",
                  opacity: layer.active ? 1 : 0.45,
                  boxShadow: layer.active
                    ? "0 0 34px rgba(168,117,255,0.3)"
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{ fontSize: 36, fontWeight: 800, color: layer.color }}
                >
                  {layer.label}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              left: 222,
              top: 120,
              width: 678,
              height: 842,
              border: "2px solid rgba(168,117,255,0.32)",
              borderRadius: 34,
              backgroundColor: "rgba(18,13,40,0.82)",
              overflow: "hidden",
              fontSize: 36,
              boxShadow: `0 0 ${18 + settledProgress * 42}px rgba(168,117,255,0.22)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 34,
                top: 30,
                fontSize: 36,
                fontWeight: 800,
                color: SOFT_WHITE,
              }}
            >
              训练样本
            </div>

            {[0, 1, 2].map((index) => {
              const localProgress = interpolate(
                examplesProgress,
                [index * 0.18, 0.55 + index * 0.18],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              return (
                <div
                  key={index}
                  style={{
                    position: "absolute",
                    left: 36 + localProgress * 136,
                    top: 112 + index * 118,
                    width: 148,
                    height: 76,
                    border: `3px solid ${CYAN}`,
                    borderRadius: 18,
                    backgroundColor: "rgba(57,220,255,0.11)",
                    opacity: localProgress,
                    fontSize: 36,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {[0, 1, 2].map((bar) => (
                    <div
                      key={bar}
                      style={{
                        width: 20,
                        height: 18 + ((index + bar) % 3) * 14,
                        borderRadius: 6,
                        backgroundColor: CYAN,
                        opacity: 0.62 + bar * 0.14,
                      }}
                    />
                  ))}
                </div>
              );
            })}

            <svg
              aria-hidden="true"
              width={678}
              height={842}
              style={{ position: "absolute", inset: 0, fontSize: 36 }}
            >
              <path
                d="M220 225 C286 225 286 420 350 420"
                fill="none"
                stroke={CYAN}
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray="18 14"
                strokeDashoffset={48 - examplesProgress * 48}
                opacity={examplesProgress}
              />
              {nodePositions.slice(0, -1).map((node, index) => {
                const next = nodePositions[index + 1];
                return (
                  <line
                    key={index}
                    x1={node.left - 222 + 34}
                    y1={node.top - 120 + 34}
                    x2={next.left - 222 + 34}
                    y2={next.top - 120 + 34}
                    stroke={VIOLET}
                    strokeWidth={4 + trainingProgress * 3}
                    opacity={0.18 + trainingProgress * 0.72}
                  />
                );
              })}
              <line
                x1={nodePositions[4].left - 222 + 34}
                y1={nodePositions[4].top - 120 + 34}
                x2={nodePositions[0].left - 222 + 34}
                y2={nodePositions[0].top - 120 + 34}
                stroke={VIOLET}
                strokeWidth={4 + trainingProgress * 3}
                opacity={0.18 + trainingProgress * 0.72}
              />
            </svg>

            {nodePositions.map((node, index) => {
              const adjustment = Math.sin((sceneFrame + index * 17) * 0.14);
              const intensity =
                0.44 + trainingProgress * (0.36 + adjustment * 0.12);
              return (
                <div
                  key={index}
                  style={{
                    position: "absolute",
                    left: node.left - 222,
                    top: node.top - 120,
                    width: 68,
                    height: 68,
                    borderRadius: 34,
                    border: `4px solid ${VIOLET}`,
                    backgroundColor: `rgba(168,117,255,${intensity})`,
                    boxShadow: `0 0 ${12 + trainingProgress * 28}px rgba(168,117,255,0.52)`,
                  }}
                />
              );
            })}

            <div
              style={{
                position: "absolute",
                left: 312,
                top: 670,
                width: 330,
                height: 102,
                border: `3px solid ${VIOLET}`,
                borderRadius: 22,
                backgroundColor: "rgba(168,117,255,0.18)",
                opacity: settledProgress,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 900,
                  color: SOFT_WHITE,
                  letterSpacing: 3,
                }}
              >
                已学习 · 稳定参数
              </div>
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 222,
              top: 1000,
              width: 678,
              height: 256,
              border: `3px solid ${AMBER}`,
              borderRadius: 30,
              backgroundColor: "rgba(255,189,89,0.08)",
              opacity: 0.24 + handoffProgress * 0.76,
              boxShadow: `0 0 ${handoffProgress * 44}px rgba(255,189,89,0.22)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: 40,
                fontWeight: 850,
                color: AMBER,
                letterSpacing: 3,
              }}
            >
              交给 AI 系统运行
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 524,
              top: 934,
              width: 72,
              height: 52 + handoffProgress * 42,
              borderLeft: `6px solid ${AMBER}`,
              opacity: handoffProgress,
            }}
          />

          <div
            style={{
              position: "absolute",
              left: 0,
              top: 1328,
              width: 900,
              height: 2,
              backgroundColor: "rgba(246,243,255,0.16)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 1360,
              width: 900,
              fontSize: 36,
              fontWeight: 700,
              color: "rgba(246,243,255,0.72)",
              textAlign: "center",
              letterSpacing: 2,
            }}
          >
            数据塑造参数 · 参数保存所学
          </div>
        </div>
      </SceneContentFrame>
    </>
  );
};

export default ModelLearnsRenderer;
