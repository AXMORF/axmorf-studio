import type { FC, ReactNode } from "react";

type WholePictureRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  readabilityPolicy?: Readonly<{
    policyId: "production-readability-v1";
    policyFingerprint: string;
    typographyPolicy: Readonly<{ minFontSizePx: number }>;
    sceneContentSafeAreaPx: Readonly<{
      top: number;
      right: number;
      bottom: number;
      left: number;
    }>;
  }>;
}>;

type WholePictureReadabilityPolicy = NonNullable<
  WholePictureRendererProps["readabilityPolicy"]
>;

const SceneBackground: FC<Readonly<{ children: ReactNode }>> = ({
  children,
}) => (
  <div
    aria-hidden="true"
    data-readability-background="full-bleed"
    style={{ position: "absolute", inset: 0, overflow: "hidden", fontSize: 36 }}
  >
    {children}
  </div>
);

const SceneContentFrame: FC<
  Readonly<{ policy: WholePictureReadabilityPolicy; children: ReactNode }>
> = ({ policy, children }) => (
  <div
    data-readability-content-frame={policy.policyFingerprint}
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

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};
const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const layerColors = {
  algorithm: "#42E8F5",
  model: "#A77CFF",
  system: "#FFB84D",
} as const;

type LayerCardProps = Readonly<{
  label: string;
  description: string;
  color: string;
  top: number;
  progress: number;
  active: number;
  kind: "algorithm" | "model" | "system";
}>;

const LayerCard: FC<LayerCardProps> = ({
  label,
  description,
  color,
  top,
  progress,
  active,
  kind,
}) => {
  const left = mix(60, 0, progress);
  const opacity = 0.12 + progress * 0.88;
  const lineWidth = mix(0, 178, active);
  const nodes = kind === "algorithm" ? 4 : kind === "model" ? 5 : 6;

  return (
    <div
      style={{
        position: "absolute",
        left,
        right: 0,
        top,
        height: 214,
        opacity,
        border: `2px solid ${color}66`,
        borderRadius: 28,
        background: `linear-gradient(105deg, ${color}18, rgba(9,13,31,0.88) 58%)`,
        boxShadow: `inset 5px 0 0 ${color}, 0 18px 50px rgba(0,0,0,0.24)`,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 38, top: 32, width: 430 }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 780,
            lineHeight: 1.08,
            color: "#F6F8FF",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 36,
            marginTop: 18,
            lineHeight: 1.22,
            color: "#B9C2D9",
          }}
        >
          {description}
        </div>
      </div>

      <svg
        aria-hidden="true"
        width="330"
        height="160"
        viewBox="0 0 330 160"
        style={{ position: "absolute", right: 26, top: 27, fontSize: 36 }}
      >
        <path
          d="M28 80 H206"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          opacity={0.28}
        />
        <path
          d={`M28 80 H${28 + lineWidth}`}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
        />
        {Array.from({ length: nodes }, (_, index) => {
          const spacing = 178 / Math.max(1, nodes - 1);
          const x = 28 + index * spacing;
          const nodeOn = clamp(active * nodes - index);
          return (
            <g key={`${kind}-${index}`} opacity={0.3 + nodeOn * 0.7}>
              <circle
                cx={x}
                cy="80"
                r={17 + nodeOn * 4}
                fill="#090D1F"
                stroke={color}
                strokeWidth="5"
              />
              <circle cx={x} cy="80" r={6} fill={color} />
            </g>
          );
        })}
        <path
          d="M238 44 L302 80 L238 116 Z"
          fill={`${color}22`}
          stroke={color}
          strokeWidth="5"
          opacity={0.38 + active * 0.62}
        />
        <circle
          cx="263"
          cy="80"
          r={9 + active * 9}
          fill={color}
          opacity={0.45 + active * 0.55}
        />
      </svg>
    </div>
  );
};

const Renderer: FC<WholePictureRendererProps> = ({
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
    meaningId !== "whole-picture" ||
    durationInFrames !== 428 ||
    fps !== 30 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames ||
    readabilityPolicy === undefined
  ) {
    throw new Error("whole-picture Renderer received stale Scene identity.");
  }

  const algorithmReveal = ease((sceneFrame - 4) / 34);
  const modelReveal = ease((sceneFrame - 46) / 42);
  const systemReveal = ease((sceneFrame - 142) / 52);
  const systemActive = ease((sceneFrame - 188) / 58);
  const valueReveal = ease((sceneFrame - 270) / 58);
  const settled = ease((sceneFrame - 326) / 54);
  const pulse = (Math.sin(sceneFrame / 11) + 1) / 2;
  const flowPosition = (sceneFrame * 4.2) % 520;

  return (
    <>
      <SceneBackground>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 38%, rgba(91,71,188,0.22), transparent 38%), radial-gradient(circle at 74% 72%, rgba(255,184,77,0.13), transparent 30%), #060916",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.22,
            backgroundImage:
              "linear-gradient(rgba(128,153,205,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(128,153,205,0.11) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 70,
            right: 70,
            top: 72,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, #42E8F566, #A77CFF66, #FFB84D66, transparent)",
          }}
        />
      </SceneBackground>

      <SceneContentFrame policy={readabilityPolicy}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            color: "#F6F8FF",
            fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              height: 148,
            }}
          >
            <div
              style={{
                fontSize: 36,
                color: "#7F8BA8",
                fontWeight: 650,
                letterSpacing: 5,
              }}
            >
              SYSTEM MAP / 05
            </div>
            <div
              style={{
                fontSize: 56,
                marginTop: 14,
                fontWeight: 820,
                lineHeight: 1.08,
                letterSpacing: -1,
              }}
            >
              从方法，到智能，再到价值
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 172,
              height: 850,
            }}
          >
            <LayerCard
              label="算法"
              description="训练方法 · 明确步骤"
              color={layerColors.algorithm}
              top={0}
              progress={algorithmReveal}
              active={algorithmReveal}
              kind="algorithm"
            />
            <LayerCard
              label="模型"
              description="智能核心 · 学到规律"
              color={layerColors.model}
              top={276}
              progress={modelReveal}
              active={modelReveal}
              kind="model"
            />
            <LayerCard
              label="AI 系统"
              description="运行组织 · 可靠交付"
              color={layerColors.system}
              top={552}
              progress={systemReveal}
              active={systemActive}
              kind="system"
            />

            <svg
              aria-hidden="true"
              width="900"
              height="850"
              viewBox="0 0 900 850"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                fontSize: 36,
              }}
            >
              <path
                d="M450 214 V276 M450 490 V552"
                stroke="#CBD4EA"
                strokeWidth="5"
                opacity="0.2"
                strokeDasharray="10 13"
              />
              <circle
                cx="450"
                cy={232 + Math.min(flowPosition, 42)}
                r="8"
                fill={layerColors.algorithm}
                opacity={modelReveal}
              />
              <circle
                cx="450"
                cy={508 + Math.min(flowPosition, 42)}
                r="8"
                fill={layerColors.model}
                opacity={systemReveal}
              />
            </svg>
          </div>

          <div
            style={{
              position: "absolute",
              left: mix(70, 0, valueReveal),
              right: 0,
              top: 1090,
              height: 300,
              opacity: 0.08 + valueReveal * 0.92,
              border: "2px solid rgba(255,184,77,0.62)",
              borderRadius: 34,
              background:
                "linear-gradient(115deg, rgba(255,184,77,0.18), rgba(11,16,35,0.92) 56%)",
              boxShadow: `0 0 ${24 + settled * 42}px rgba(255,184,77,${0.1 + settled * 0.18})`,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", left: 42, top: 38, right: 42 }}>
              <div
                style={{
                  fontSize: 36,
                  color: layerColors.system,
                  fontWeight: 720,
                  letterSpacing: 4,
                }}
              >
                COMPLETE OPERATING STACK
              </div>
              <div
                style={{
                  fontSize: 64,
                  marginTop: 16,
                  color: "#FFF8E9",
                  fontWeight: 850,
                  lineHeight: 1,
                }}
              >
                可靠地产生价值
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 18,
                  marginTop: 34,
                  fontSize: 36,
                }}
              >
                {["可控", "可监测", "可反馈"].map((label, index) => (
                  <div
                    key={label}
                    style={{
                      minWidth: 154,
                      padding: "12px 22px",
                      borderRadius: 999,
                      border: `2px solid rgba(255,184,77,${0.32 + settled * 0.42})`,
                      background: `rgba(255,184,77,${0.06 + settled * (0.08 + index * 0.015)})`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 36,
                        color: "#E8EAF4",
                        fontWeight: 680,
                        textAlign: "center",
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 34,
                top: 34,
                width: 18,
                height: 18,
                borderRadius: 9,
                background: layerColors.system,
                opacity: 0.62 + pulse * 0.38,
                boxShadow: "0 0 24px rgba(255,184,77,0.72)",
              }}
            />
          </div>
        </div>
      </SceneContentFrame>
    </>
  );
};

export default Renderer;
