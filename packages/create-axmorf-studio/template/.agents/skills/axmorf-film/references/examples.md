# 示例段落

三个可直接编译的段落，用来借鉴技法：满画幅的镜头结构、分层光影、细节层级、运动阶段、文字层，以及在大场景里
移动的镜头。它们不是模板：主体、文案、构图与时间都从本片的剧本出发，不要原样粘贴。三个例子都按 1080×1920 设计；横屏或其他尺寸要
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

## 讲解主题：镜头在大场景里跟着过程走

适合有“过程”的科普：光、信号、物质沿一条路径发生变化。场景先搭成三屏宽，太阳、大气、观察者依次排开；镜头跟着
光沿路径平移，到机制处推近，最后拉远看结果。远景、主体、前景三层按不同速度移动，产生纵深。标注贴在物体上并随
镜头移动；数字（散射强度）画成会增长的条，而不是一句文字。

```tsx
import type { FC } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  ProducerWorldCamera,
  resolveProducerPathPoint,
} from "@axmorf/studio/remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FONT = '"PingFang SC", "Noto Sans SC", sans-serif';
// Light path through the world, in world pixels: sun → molecule → eye.
const PATH = [
  [420, 640],
  [1620, 980],
  [2820, 1180],
] as const;

const Label: FC<{
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly show: number;
}> = ({ x, y, text, show }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity: show,
      transform: `translateY(${(1 - show) * 16}px)`,
      fontFamily: FONT,
      fontSize: 44,
      fontWeight: 700,
      color: "#f4f8ff",
      padding: "10px 18px",
      borderRadius: 14,
      background: "rgba(8, 20, 44, 0.72)",
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

export const WorldPathSegment: FC<{ readonly durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const worldWidth = width * 3;
  const d = durationInFrames;
  // The light travels the whole path over the first 70% of the segment.
  const travel = interpolate(frame, [0, d * 0.7], [0, 1], clamp);
  const photon = resolveProducerPathPoint(PATH, travel);
  const scatter = interpolate(frame, [d * 0.3, d * 0.55], [0, 1], clamp);
  const strength = interpolate(frame, [d * 0.4, d * 0.5], [0, 1], clamp);
  // Labels about the molecule leave before the camera does, so none slides off the frame.
  const atMolecule = interpolate(
    frame,
    [d * 0.3, d * 0.4, d * 0.52, d * 0.57],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <ProducerWorldCamera
      width={width}
      height={height}
      worldWidth={worldWidth}
      worldHeight={height}
      shots={[
        { frame: 0, center: [PATH[0][0] + 120, 900] },
        // Follow the light to the molecule, then push in on the mechanism.
        {
          frame: Math.round(d * 0.35),
          center: [PATH[1][0], 980],
          zoom: 1.25,
          easing: "ease-in-out",
        },
        {
          frame: Math.round(d * 0.55),
          center: [PATH[1][0] + 60, 1000],
          zoom: 1.6,
          easing: "ease-out",
        },
        // Pull out and travel on to the observer, then keep a slow push on the result.
        {
          frame: Math.round(d * 0.85),
          center: [PATH[2][0] - 200, 980],
          zoom: 1,
          easing: "ease-in-out",
        },
        { frame: d, center: [PATH[2][0] - 120, 1060], zoom: 1.15 },
      ]}
      layers={[
        {
          // Far sky: a gradient band and distant clouds that drift slowly.
          depth: 0.35,
          content: (
            <svg width={worldWidth} height={height}>
              <defs>
                <linearGradient id="world-sky" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0b2a5c" />
                  <stop offset="55%" stopColor="#1f5fa8" />
                  <stop offset="100%" stopColor="#f0a35e" />
                </linearGradient>
              </defs>
              <rect width={worldWidth} height={height} fill="url(#world-sky)" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <ellipse
                  key={i}
                  cx={300 + i * 520}
                  cy={260 + (i % 2) * 180}
                  rx={220}
                  ry={46}
                  fill="#ffffff"
                  opacity={0.12}
                />
              ))}
            </svg>
          ),
        },
        {
          // Subject plane: sun, ray, molecule with scattered blue, observer.
          depth: 1,
          content: (
            <div style={{ position: "absolute", inset: 0 }}>
              <svg width={worldWidth} height={height}>
                <defs>
                  <radialGradient id="world-sun">
                    <stop offset="0%" stopColor="#fffbe6" />
                    <stop offset="60%" stopColor="#ffd36b" />
                    <stop offset="100%" stopColor="#ffb347" stopOpacity={0} />
                  </radialGradient>
                  <radialGradient id="world-molecule" cx="35%" cy="30%">
                    <stop offset="0%" stopColor="#e8f4ff" />
                    <stop offset="70%" stopColor="#5f8fc9" />
                    <stop offset="100%" stopColor="#23406e" />
                  </radialGradient>
                </defs>
                <circle
                  cx={PATH[0][0]}
                  cy={PATH[0][1]}
                  r={210}
                  fill="url(#world-sun)"
                />
                <polyline
                  points={PATH.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke="#fff5d6"
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeDasharray="2400"
                  strokeDashoffset={2400 * (1 - travel)}
                  opacity={0.85}
                />
                {Array.from({ length: 12 }, (_, i) => {
                  const angle = (i / 12) * Math.PI * 2;
                  const reach = 60 + scatter * 300;
                  return (
                    <line
                      key={i}
                      x1={PATH[1][0]}
                      y1={PATH[1][1]}
                      x2={PATH[1][0] + Math.cos(angle) * reach}
                      y2={PATH[1][1] + Math.sin(angle) * reach}
                      stroke="#5fb4ff"
                      strokeWidth={8}
                      strokeLinecap="round"
                      opacity={scatter * 0.9}
                    />
                  );
                })}
                <circle
                  cx={PATH[1][0] - 26}
                  cy={PATH[1][1]}
                  r={46}
                  fill="url(#world-molecule)"
                />
                <circle
                  cx={PATH[1][0] + 30}
                  cy={PATH[1][1] + 6}
                  r={46}
                  fill="url(#world-molecule)"
                />
                <circle cx={photon[0]} cy={photon[1]} r={18} fill="#ffffff" />
                <path
                  d={`M${PATH[2][0] - 90} ${PATH[2][1]} Q${PATH[2][0]} ${PATH[2][1] - 70} ${PATH[2][0] + 90} ${PATH[2][1]} Q${PATH[2][0]} ${PATH[2][1] + 70} ${PATH[2][0] - 90} ${PATH[2][1]} Z`}
                  fill="#f4f8ff"
                />
                <circle cx={PATH[2][0]} cy={PATH[2][1]} r={34} fill="#2d6fc4" />
              </svg>
              <Label
                x={PATH[0][0] - 120}
                y={PATH[0][1] + 240}
                text="白光：各色光混合"
                show={interpolate(frame, [d * 0.05, d * 0.15], [0, 1], clamp)}
              />
              <Label
                x={PATH[1][0] - 150}
                y={PATH[1][1] - 230}
                text="氮气分子 N₂"
                show={atMolecule}
              />
              <Label
                x={PATH[2][0] - 180}
                y={PATH[2][1] + 120}
                text="四面八方的蓝光"
                show={interpolate(frame, [d * 0.7, d * 0.8], [0, 1], clamp)}
              />
              {/* The number in the narration, shown as a quantity instead of text. */}
              <div
                style={{
                  position: "absolute",
                  left: PATH[1][0] - 260,
                  top: PATH[1][1] + 260,
                  fontFamily: FONT,
                  color: "#f4f8ff",
                  opacity: Math.min(
                    atMolecule,
                    interpolate(frame, [d * 0.4, d * 0.45], [0, 1], clamp),
                  ),
                }}
              >
                {[
                  { name: "红光", value: 1, color: "#ff7a6b" },
                  { name: "蓝光", value: 5.9, color: "#5fb4ff" },
                ].map((bar) => (
                  <div
                    key={bar.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 18,
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ width: 120, fontSize: 40, fontWeight: 700 }}>
                      {bar.name}
                    </div>
                    <div
                      style={{
                        height: 34,
                        width: 60 * bar.value * strength,
                        borderRadius: 17,
                        background: bar.color,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 40,
                        fontWeight: 800,
                        opacity: strength,
                      }}
                    >{`${bar.value}×`}</div>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          // Near haze sweeps past faster than the subject. A layer deeper than 1
          // travels farther than the world, so its content runs past the right edge.
          depth: 1.4,
          content: (
            <svg width={worldWidth * 1.5} height={height}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <ellipse
                  key={i}
                  cx={500 + i * 900}
                  cy={1760}
                  rx={520}
                  ry={140}
                  fill="#081a36"
                  opacity={0.55}
                />
              ))}
            </svg>
          ),
        },
      ]}
      overlay={
        <div
          style={{
            position: "absolute",
            left: 64,
            top: 150,
            fontFamily: FONT,
            fontSize: 76,
            fontWeight: 900,
            color: "#f4f8ff",
          }}
        >
          蓝光被分子弹向四周
        </div>
      }
    />
  );
};
```
