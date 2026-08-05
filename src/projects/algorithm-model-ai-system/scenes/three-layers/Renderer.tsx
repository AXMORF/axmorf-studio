import { createElement, type CSSProperties, type ReactNode } from "react";
import { interpolate } from "remotion";

type FrozenReadabilityPolicy = Readonly<{
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

type ThreeLayersRendererProps = Readonly<{
  sceneFrame: number;
  durationInFrames: number;
  readabilityPolicy?: FrozenReadabilityPolicy;
}>;

const SceneBackground = ({ children }: Readonly<{ children: ReactNode }>) =>
  createElement(
    "div",
    {
      "aria-hidden": true,
      "data-readability-background": "full-bleed",
      style: { position: "absolute", inset: 0, overflow: "hidden" },
    },
    children,
  );

const SceneContentFrame = ({
  policy,
  children,
}: Readonly<{ policy: FrozenReadabilityPolicy; children: ReactNode }>) => {
  const safeArea = policy.sceneContentSafeAreaPx;
  return createElement(
    "div",
    {
      "data-readability-content-frame": policy.policyFingerprint,
      style: {
        position: "absolute",
        top: safeArea.top,
        right: safeArea.right,
        bottom: safeArea.bottom,
        left: safeArea.left,
        overflow: "hidden",
      },
    },
    children,
  );
};

const SceneText = ({
  fontSizePx,
  style,
  children,
}: Readonly<{
  fontSizePx: number;
  style?: Omit<CSSProperties, "fontSize" | "transform" | "scale">;
  children: ReactNode;
}>) =>
  createElement("div", { style: { ...style, fontSize: fontSizePx } }, children);

const CYAN = "#38e8ff";
const VIOLET = "#a98aff";
const AMBER = "#ffbd59";
const SOFT_WHITE = "#edf8ff";
const MUTED = "#91a8ba";

const reveal = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const ThreeLayersRenderer = ({
  sceneFrame,
  durationInFrames,
  readabilityPolicy,
}: ThreeLayersRendererProps) => {
  if (readabilityPolicy === undefined) {
    throw new Error("three-layers requires the frozen readability policy.");
  }

  const algorithmIn = reveal(sceneFrame, 4, 28);
  const modelIn = reveal(sceneFrame, 48, 74);
  const systemIn = reveal(sceneFrame, 92, 118);
  const spineIn = reveal(sceneFrame, 136, 178);
  const algorithmFocus = reveal(sceneFrame, 198, 226);
  const modelFocus = 1 - algorithmFocus * 0.42;
  const systemFocus = 1 - algorithmFocus * 0.52;
  const completion = Math.min(
    1,
    sceneFrame / Math.max(1, durationInFrames - 1),
  );

  return (
    <>
      <SceneBackground>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 24%, rgba(56,232,255,0.12), transparent 30%), radial-gradient(circle at 80% 72%, rgba(255,189,89,0.1), transparent 32%), linear-gradient(180deg, #091522 0%, #071019 58%, #050b12 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.22,
            backgroundImage:
              "linear-gradient(rgba(145,168,186,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(145,168,186,0.13) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: `${completion * 100}%`,
            height: 4,
            background: "linear-gradient(90deg, #38e8ff, #a98aff, #ffbd59)",
            opacity: 0.72,
          }}
        />
      </SceneBackground>

      <SceneContentFrame policy={readabilityPolicy}>
        <div style={{ position: "absolute", inset: 0 }}>
          <div style={{ position: "absolute", top: 22, left: 8, right: 8 }}>
            <SceneText
              fontSizePx={42}
              style={{
                color: MUTED,
                letterSpacing: 4,
                fontWeight: 650,
              }}
            >
              同一句话里的三个概念
            </SceneText>
          </div>

          <div
            style={{
              position: "absolute",
              left: 34,
              top: 165,
              width: 12,
              height: 962 * spineIn,
              borderRadius: 999,
              background: "linear-gradient(180deg, #38e8ff, #a98aff, #ffbd59)",
              boxShadow: "0 0 28px rgba(169,138,255,0.5)",
              opacity: spineIn,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 19,
              top: 1100,
              width: 42,
              height: 42,
              borderRight: `10px solid ${AMBER}`,
              borderBottom: `10px solid ${AMBER}`,
              opacity: spineIn,
            }}
          />

          <div
            style={{
              position: "absolute",
              left: 86,
              right: 10,
              top: 132,
              height: 292,
              borderRadius: 34,
              border: `2px solid rgba(56,232,255,${0.48 + algorithmFocus * 0.44})`,
              background: `linear-gradient(135deg, rgba(56,232,255,${0.12 + algorithmFocus * 0.1}), rgba(8,26,38,0.94))`,
              boxShadow: `0 0 ${28 + algorithmFocus * 28}px rgba(56,232,255,${0.16 + algorithmFocus * 0.2})`,
              opacity: algorithmIn,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", left: 34, top: 30, right: 34 }}>
              <SceneText
                fontSizePx={54}
                style={{ color: CYAN, fontWeight: 800, letterSpacing: 2 }}
              >
                01 算法
              </SceneText>
            </div>
            <div
              style={{ position: "absolute", left: 36, top: 112, right: 36 }}
            >
              <SceneText
                fontSizePx={38}
                style={{ color: SOFT_WHITE, fontWeight: 650 }}
              >
                输入 → 步骤与规则 → 结果
              </SceneText>
            </div>
            <div
              style={{
                position: "absolute",
                left: 36,
                top: 190,
                width: 142,
                height: 50,
                borderRadius: 25,
                background: "rgba(56,232,255,0.18)",
                border: "2px solid rgba(56,232,255,0.48)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 216,
                top: 190,
                width: 142,
                height: 50,
                borderRadius: 25,
                background: "rgba(56,232,255,0.26)",
                border: "2px solid rgba(56,232,255,0.62)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 396,
                top: 190,
                width: 142,
                height: 50,
                borderRadius: 25,
                background: "rgba(56,232,255,0.34)",
                border: "2px solid rgba(56,232,255,0.78)",
              }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              left: 86,
              right: 10,
              top: 474,
              height: 292,
              borderRadius: 34,
              border: "2px solid rgba(169,138,255,0.62)",
              background:
                "linear-gradient(135deg, rgba(169,138,255,0.15), rgba(18,18,42,0.94))",
              boxShadow: "0 0 32px rgba(169,138,255,0.2)",
              opacity: modelIn * modelFocus,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", left: 34, top: 30, right: 34 }}>
              <SceneText
                fontSizePx={54}
                style={{ color: VIOLET, fontWeight: 800, letterSpacing: 2 }}
              >
                02 模型
              </SceneText>
            </div>
            <div
              style={{ position: "absolute", left: 36, top: 112, right: 36 }}
            >
              <SceneText
                fontSizePx={38}
                style={{ color: SOFT_WHITE, fontWeight: 650 }}
              >
                数据 → 参数结构 → 学到的规律
              </SceneText>
            </div>
            <div
              style={{
                position: "absolute",
                left: 52,
                top: 205,
                width: 18,
                height: 18,
                borderRadius: 18,
                background: VIOLET,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 166,
                top: 185,
                width: 28,
                height: 28,
                borderRadius: 28,
                background: VIOLET,
                boxShadow: "0 0 22px rgba(169,138,255,0.8)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 286,
                top: 218,
                width: 20,
                height: 20,
                borderRadius: 20,
                background: VIOLET,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 408,
                top: 180,
                width: 32,
                height: 32,
                borderRadius: 32,
                background: VIOLET,
                boxShadow: "0 0 26px rgba(169,138,255,0.8)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 70,
                top: 213,
                width: 100,
                height: 3,
                background: "rgba(169,138,255,0.55)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 192,
                top: 211,
                width: 98,
                height: 3,
                background: "rgba(169,138,255,0.55)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 304,
                top: 211,
                width: 108,
                height: 3,
                background: "rgba(169,138,255,0.55)",
              }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              left: 86,
              right: 10,
              top: 816,
              height: 292,
              borderRadius: 34,
              border: "2px solid rgba(255,189,89,0.66)",
              background:
                "linear-gradient(135deg, rgba(255,189,89,0.15), rgba(39,25,10,0.94))",
              boxShadow: "0 0 34px rgba(255,189,89,0.18)",
              opacity: systemIn * systemFocus,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", left: 34, top: 30, right: 34 }}>
              <SceneText
                fontSizePx={54}
                style={{ color: AMBER, fontWeight: 800, letterSpacing: 2 }}
              >
                03 AI 系统
              </SceneText>
            </div>
            <div
              style={{ position: "absolute", left: 36, top: 112, right: 36 }}
            >
              <SceneText
                fontSizePx={38}
                style={{ color: SOFT_WHITE, fontWeight: 650 }}
              >
                模型 + 数据 + 工具 + 运行环境
              </SceneText>
            </div>
            <div
              style={{
                position: "absolute",
                left: 36,
                right: 36,
                bottom: 38,
                height: 50,
                borderRadius: 18,
                border: "2px solid rgba(255,189,89,0.52)",
                background: "rgba(255,189,89,0.12)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 226,
                bottom: 49,
                width: 154,
                height: 28,
                borderRadius: 14,
                background: "rgba(169,138,255,0.74)",
                boxShadow: "0 0 22px rgba(169,138,255,0.62)",
              }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              left: 90,
              right: 12,
              bottom: 44,
              height: 102,
              borderRadius: 28,
              background: "rgba(7,16,25,0.82)",
              border: "1px solid rgba(237,248,255,0.16)",
              opacity: spineIn,
            }}
          >
            <div style={{ position: "absolute", left: 28, top: 24, right: 28 }}>
              <SceneText
                fontSizePx={38}
                style={{
                  color: SOFT_WHITE,
                  fontWeight: 700,
                  textAlign: "center",
                  letterSpacing: 2,
                }}
              >
                三层不同，各有职责
              </SceneText>
            </div>
          </div>
        </div>
      </SceneContentFrame>
    </>
  );
};

export default ThreeLayersRenderer;
