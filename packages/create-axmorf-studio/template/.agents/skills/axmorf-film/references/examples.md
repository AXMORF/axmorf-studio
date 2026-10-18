# 示例段落

两个可直接编译的段落，用来借鉴技法：满画幅的镜头结构、分层光影、细节层级、运动阶段和文字层。它们不是模板：
主体、文案、构图与时间都从本片的剧本出发，不要原样粘贴。两个例子都按 1080×1920 设计；横屏或其他尺寸要
重新安排构图，而不只是缩放。

每个段落是一个普通组件，放在 `Film.tsx` 的 `<Sequence from={...} durationInFrames={...}>` 里，由外层传入段落
长度；`useCurrentFrame()` 在 Sequence 内从 0 开始计数。时间点优先取自 `useFilmTiming()` 的句子和重音帧，
这里为了独立可读用段落长度的比例代替。

## 软件主题：真实界面与有动机的镜头

适合开发工具、仓库和命令行流程。世界铺满画面，镜头从全景推到关键的一行代码，再推到结果；标题留在不随镜头
运动的稳定文字层。

```tsx
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  CodePanel,
  InterfaceWindow,
  ProducerShotStage,
  RepositoryCard,
  TerminalPanel,
} from "@axmorf/studio/remotion";

const MIN_FONT = 36;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Backdrop = ({ width, height }: { width: number; height: number }) => (
  <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <defs>
      <radialGradient id="room" cx="0.3" cy="0.35" r="0.85">
        <stop offset="0" stopColor="#1d3b6b" />
        <stop offset="0.55" stopColor="#0c1424" />
        <stop offset="1" stopColor="#05080f" />
      </radialGradient>
      <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#58a6ff" stopOpacity="0.32" />
        <stop offset="1" stopColor="#58a6ff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width={width} height={height} fill="url(#room)" />
    <path
      d={`M${-width * 0.1} ${height * 0.2} L${width * 0.9} ${-height * 0.04} L${width * 1.1} 0 L0 ${height * 0.45}Z`}
      fill="url(#beam)"
    />
  </svg>
);

export const InspectSegment = ({
  durationInFrames,
}: {
  durationInFrames: number;
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const at = (ratio: number) => Math.round(durationInFrames * ratio);
  const headline = interpolate(frame, [0, 12], [0, 1], clamp);
  return (
    <ProducerShotStage
      width={width}
      height={height}
      frame={frame}
      shots={[
        { frame: 0, focus: [0.5, 0.5], zoom: 1, easing: "ease-in-out" },
        { frame: at(0.25), focus: [0.5, 0.5], zoom: 1, easing: "ease-in-out" },
        {
          frame: at(0.45),
          focus: [0.5, 0.42],
          zoom: 1.45,
          easing: "ease-in-out",
        },
        {
          frame: at(0.62),
          focus: [0.5, 0.42],
          zoom: 1.45,
          easing: "ease-in-out",
        },
        { frame: at(0.85), focus: [0.52, 0.7], zoom: 1.6, rotation: -2 },
      ]}
      drift={{ amplitudePx: 8, periodFrames: 150 }}
      background={<Backdrop width={width} height={height} />}
      subject={
        <div style={{ position: "absolute", inset: 0 }}>
          <div
            style={{
              position: "absolute",
              left: width * 0.065,
              top: height * 0.17,
            }}
          >
            <InterfaceWindow
              width={width * 0.87}
              height={height * 0.4}
              minFontSizePx={MIN_FONT}
              url="github.com/owner/project"
            >
              <div
                style={{
                  padding: 36,
                  display: "flex",
                  flexDirection: "column",
                  gap: 28,
                }}
              >
                <RepositoryCard
                  owner="owner"
                  name="project"
                  description="One sentence from the real project description"
                  language={{ name: "TypeScript", color: "#3178c6" }}
                  width={width * 0.8}
                  minFontSizePx={MIN_FONT}
                />
                <CodePanel
                  frame={frame}
                  code={
                    'import { inspect } from "project";\nconst map = await inspect("./app");'
                  }
                  fileName="inspect.ts"
                  minFontSizePx={MIN_FONT}
                  startFrame={at(0.1)}
                  highlights={[
                    { fromLine: 2, toLine: 2, startFrame: at(0.38) },
                  ]}
                />
              </div>
            </InterfaceWindow>
          </div>
          <div
            style={{
              position: "absolute",
              left: width * 0.14,
              top: height * 0.6,
            }}
          >
            <InterfaceWindow
              width={width * 0.8}
              height={height * 0.22}
              minFontSizePx={MIN_FONT}
              variant="app"
              title="zsh"
            >
              <TerminalPanel
                frame={frame}
                minFontSizePx={MIN_FONT}
                startFrame={at(0.6)}
                lines={[
                  { kind: "command", text: "npx project inspect ./app" },
                  { kind: "success", text: "✓ structure map written" },
                ]}
              />
            </InterfaceWindow>
          </div>
        </div>
      }
      overlay={
        <div style={{ position: "absolute", inset: 0 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              height: "24%",
              background: "linear-gradient(#05080fee 55%, #05080f00)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 64,
              top: 96,
              right: 64,
              opacity: headline,
              fontFamily: '"PingFang SC", "Inter", sans-serif',
            }}
          >
            <div
              style={{
                fontSize: MIN_FONT,
                fontWeight: 700,
                letterSpacing: 2,
                color: "#58a6ff",
              }}
            >
              01 / INSPECT
            </div>
            <div style={{ fontSize: 94, fontWeight: 900, color: "#f0f6fc" }}>
              先读结构
            </div>
          </div>
        </div>
      }
    />
  );
};
```

## 概念主题：有光影的物体造成可见结果

适合没有真实界面的概念。一个精心绘制的物体作用于另一个：预备、接触、回弹，再停在结果上。体积来自渐变、
接触阴影和高光边；每个物体有大、中、小三级细节；结果出现后镜头推近一次。

```tsx
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ProducerShotStage } from "@axmorf/studio/remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ink = "#1b1a2e";

const Module = ({
  x,
  y,
  size,
  hue,
  glow,
}: {
  x: number;
  y: number;
  size: number;
  hue: string;
  glow: number;
}) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse
      cx={0}
      cy={size * 0.62}
      rx={size * 0.62}
      ry={size * 0.12}
      fill={ink}
      opacity={0.35}
    />
    <rect
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      rx={size * 0.14}
      fill={`url(#${hue}-body)`}
    />
    <rect
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size * 0.18}
      rx={size * 0.14}
      fill="#ffffff"
      opacity={0.28}
    />
    <rect
      x={-size * 0.3}
      y={-size * 0.3}
      width={size * 0.6}
      height={size * 0.6}
      rx={size * 0.06}
      fill={ink}
      opacity={0.82}
    />
    {[-0.18, 0, 0.18].map((offset) => (
      <rect
        key={offset}
        x={-size * 0.2}
        y={size * (offset - 0.025)}
        width={size * 0.4}
        height={size * 0.05}
        rx={size * 0.02}
        fill={hue === "warm" ? "#ffcf8a" : "#9fe7ff"}
        opacity={0.35 + glow * 0.65}
      />
    ))}
    {[-0.36, -0.12, 0.12, 0.36].map((offset) => (
      <rect
        key={offset}
        x={size * offset - size * 0.03}
        y={size * 0.5}
        width={size * 0.06}
        height={size * 0.1}
        fill="#c9c3b5"
      />
    ))}
  </g>
);

export const InstallSegment = ({
  durationInFrames,
}: {
  durationInFrames: number;
}) => {
  const frame = useCurrentFrame();
  const { fps, width: w, height: h } = useVideoConfig();
  const contact = Math.round(durationInFrames * 0.35);
  const drop = spring({
    frame: frame - (contact - 14),
    fps,
    config: { damping: 11, mass: 0.8 },
  });
  const size = w * 0.42;
  const barTop = h * 0.56;
  // The pins touch the bar top at rest: body center sits 0.6 × size above it.
  const fallY = interpolate(drop, [0, 1], [-h * 0.15, barTop - size * 0.6]);
  const glow = interpolate(frame, [contact, contact + 18], [0, 1], clamp);
  const label = interpolate(frame, [contact + 24, contact + 36], [0, 1], clamp);
  return (
    <ProducerShotStage
      width={w}
      height={h}
      frame={frame}
      shots={[
        { frame: 0, focus: [0.5, 0.5], zoom: 1.1, easing: "ease-in-out" },
        { frame: contact, focus: [0.5, 0.52], zoom: 1, easing: "ease-in-out" },
        {
          frame: contact + 30,
          focus: [0.5, 0.52],
          zoom: 1,
          easing: "ease-in-out",
        },
        { frame: durationInFrames - 1, focus: [0.5, 0.5], zoom: 1.25 },
      ]}
      drift={{ amplitudePx: 6, periodFrames: 180 }}
      background={
        <svg width={w} height={h}>
          <defs>
            <radialGradient id="stage" cx="0.5" cy="0.55" r="0.75">
              <stop offset="0" stopColor="#f6ead2" />
              <stop offset="1" stopColor="#c9b28c" />
            </radialGradient>
          </defs>
          <rect width={w} height={h} fill="url(#stage)" />
          <path
            d={`M0 ${h * 0.7} L${w} ${h * 0.64} L${w} ${h} L0 ${h}Z`}
            fill="#b39a74"
            opacity={0.55}
          />
          <path
            d={`M0 ${h * 0.84} L${w} ${h * 0.8}`}
            stroke="#8f7652"
            strokeWidth={6}
            opacity={0.4}
          />
        </svg>
      }
      subject={
        <svg width={w} height={h}>
          <defs>
            <linearGradient id="warm-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff9a62" />
              <stop offset="1" stopColor="#c2452d" />
            </linearGradient>
            <linearGradient id="cool-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6fb7c9" />
              <stop offset="1" stopColor="#2c5f73" />
            </linearGradient>
          </defs>
          <ellipse
            cx={w * 0.5}
            cy={barTop + h * 0.115}
            rx={w * 0.46}
            ry={h * 0.02}
            fill={ink}
            opacity={0.3}
          />
          <rect
            x={w * 0.08}
            y={barTop}
            width={w * 0.84}
            height={h * 0.1}
            rx={28}
            fill="url(#cool-body)"
          />
          <rect
            x={w * 0.08}
            y={barTop}
            width={w * 0.84}
            height={h * 0.018}
            rx={12}
            fill="#ffffff"
            opacity={0.3}
          />
          {[0.2, 0.32, 0.68, 0.8].map((slot) => (
            <circle
              key={slot}
              cx={w * slot}
              cy={barTop + h * 0.055}
              r={w * 0.018}
              fill="#9fe7ff"
              opacity={0.3 + glow * 0.7}
            />
          ))}
          <ellipse
            cx={w * 0.5}
            cy={barTop}
            rx={w * 0.3 * glow}
            ry={h * 0.03 * glow}
            fill="#ffcf8a"
            opacity={0.35 * glow}
          />
          <Module x={w * 0.5} y={fallY} size={size} hue="warm" glow={glow} />
        </svg>
      }
      overlay={
        <div
          style={{
            position: "absolute",
            left: 64,
            right: 64,
            top: 140,
            opacity: label,
            fontFamily: '"PingFang SC", "Inter", sans-serif',
          }}
        >
          <div style={{ fontSize: 80, fontWeight: 900, color: ink }}>
            放进本地，立刻运行
          </div>
        </div>
      }
    />
  );
};
```
