# 示例段落

先读横屏的完整接线示例，再按需参考三个竖屏段落。它们不是模板：主体、文案、构图与时间都从本片剧本出发，
不要原样粘贴。横屏示例为 1920×1080；原有三个段落按 1080×1920 设计，换尺寸需重新构图。

> 下例是可选文字形变示范，不是产品不变量；真实片按内容选择效果，不要求使用 AxiomMorph。

## 横屏（1920×1080）：旧公理文字形变

一个 3200×1400 的证据世界：旧公理先完整出现；证据路径扫过，旧字碎裂，共有字随镜头平移，碎片重组为新公理。
`AxiomMorph mode="reform"` 同时处理共有字的移动、旧字碎裂与新字聚合，不需要跳回另一张文字卡。
开场 f0→60 缓慢移镜，f45 开始显露证据线，前三秒有取景与主体两次变化，旧公理保持可读。
问题章 → 证据章在 f90 用覆盖式 `light-leak`（12 帧，窗口 [84,96)）：证据带来的光照揭示延续暖色证据线，
避免纯色几何遮挡切断同一世界；两章共享世界和正片时钟。
“旧假设”只属于问题章；“可检验的结论”在证据章 f183→198 随重组完成显现，不把两个标签同时放进世界。
碎裂 f99、重组 f183 各有 cue，重组 cue 从 f181 吸附至 accent f183；镜头沿碎片迁移方向跟拍，
到达后 f183→299 继续缓慢漂移，让结论保持可读而不定格。

### 对应 storyboard.md 片段

```markdown
# 分镜与音效计划：axiom-story

规格：1920×1080 / 30 fps；正片 300 帧（10 秒）
主张：用证据修正旧判断

## 章节 question：旧假设

- 句子与范围：s01 [0, 90)（示意锚点，实际片用 film:voice 实测值）
- 世界：3200×1400 的证据空间，旧字在 (960, 600)，远景网格、近景遮挡；只有“旧假设”标签；字幕留在底部
- 镜头路径：ProducerWorldCamera，f0 中心 (1120,740) → f60 (960,700)，ease-in-out；随后停稳至 f99，旧公理完整可读
- 配方：证据线 f45→99 逐渐显露；AxiomMorph reform，startFrame 75 / duration 150 / spread 260；f75/99/183/224 为四阶段
- 入章转场：无
- 音效：s01 无，保留预期

## 章节 proof：证据改变判断

- 句子与范围：s02 [90, 159)，s03 [159, 240)；[240, 300) 为收束（示意，无合成旁白）
- 世界：沿用同一空间，证据击中旧字，新字最终位于 (2240, 600)；移除旧标签，仅在 f183→198 淡入“可检验的结论”
- 镜头路径：同一 ProducerWorldCamera，f99 (960,700) → f141 (1580,620) → f183 (2240,700)，两段 ease-in-out；再缓移至 f299 (2180,680)
- 配方：沿用同一次 AxiomMorph，旧字裂开/共有字迁移/新字聚合，不重置时钟
- 入章转场：f90 light-leak / 12 帧 / 窗口 [84,96)；选光照揭示呼应暖色证据线，保持世界连贯；sfx false，避开 f99 碎裂声
- 音效：s02 f99 glitch-tick「证据击碎旧字」；s03 endFrame 183 riser-short「重组前蓄势」
- 音效：s03 f181 soft-impact，snap accent / maxShift 3 / 窗口 [181,183]，解析为 f183「碎片重组」
- 留白与收音：musicDips [159,183) 音量 0.02；ending landFrame 270；不改旁白字幕
```

### 可编译 Film 根组件

下面完整代码与仓库 gallery 中的 `AxiomStoryExample.tsx` 仅导入路径适配仓库源码入口，其余逐字同步（自动测试保证），根 typecheck 和
`npm run compositions` 覆盖它。放到本片的 `Film.tsx` 时导出这个组件；无需自己创建 FilmProvider。
实际作品用本片时序替换示意帧并更新 storyboard，不复制 gallery 的无旁白 fixture 当作已生成旁白。

```tsx
import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  AxiomMorph,
  FilmCaptions,
  FilmSceneTrack,
  FilmSoundEffects,
  FilmSoundtrack,
  ProducerWorldCamera,
  measureAxiomText,
  resolveAxiomMorph,
  resolveFilmSceneTrack,
  useFilm,
  type FilmScene,
} from "@axmorf/studio/remotion";

const FONT = {
  fontFamily: "Noto Sans CJK SC, sans-serif",
  fontSize: 100,
  fontWeight: 700,
};
const MORPH = {
  startFrame: 75,
  durationInFrames: 150,
  mode: "reform" as const,
  seed: "axiom-story",
  spread: 260,
};
const CAMERA = {
  width: 1920,
  height: 1080,
  worldWidth: 3200,
  worldHeight: 1400,
  shots: [
    { frame: 0, center: [1120, 740], easing: "ease-in-out" },
    { frame: 60, center: [960, 700] },
    { frame: 99, center: [960, 700], easing: "ease-in-out" },
    { frame: 141, center: [1580, 620], easing: "ease-in-out" },
    { frame: 183, center: [2240, 700] },
    { frame: 299, center: [2180, 680] },
  ] as const,
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// frame is explicitly the body clock, never the enclosing scene Sequence clock.
const AxiomWorld = ({
  frame,
  chapter,
}: {
  frame: number;
  chapter: "question" | "proof";
}) => {
  const travel = interpolate(frame, [99, 183], [0, 1], clamp);
  const x = 960 + travel * 1280;
  return (
    <ProducerWorldCamera
      {...CAMERA}
      frame={frame}
      layers={[
        {
          depth: 0.15,
          content: (
            <svg width={4000} height={1600}>
              <defs>
                <radialGradient id="axiom-light">
                  <stop stopColor="#254d64" />
                  <stop offset="1" stopColor="#08131f" />
                </radialGradient>
                <pattern
                  id="axiom-grid"
                  width={120}
                  height={120}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M120 0H0V120"
                    fill="none"
                    stroke="#45718b"
                    strokeWidth={2}
                    opacity={0.2}
                  />
                </pattern>
              </defs>
              <rect width={4000} height={1600} fill="url(#axiom-light)" />
              <rect width={4000} height={1600} fill="url(#axiom-grid)" />
            </svg>
          ),
        },
        {
          depth: 1,
          content: (
            <>
              <svg width={3200} height={1400}>
                <path
                  d="M350 920 Q1600 780 2850 920"
                  fill="none"
                  stroke="#44758a"
                  strokeWidth={8}
                />
                <ellipse
                  cx={x}
                  cy={830}
                  rx={560}
                  ry={45}
                  fill="#000"
                  opacity={0.3}
                />
                {/* Evidence crosses the old claim as fracture begins at f99. */}
                <path
                  d={`M${x - 600} 420 L${x - 100} 570 L${x + 560} 390`}
                  fill="none"
                  stroke="#f3b66d"
                  strokeWidth={12}
                  strokeDasharray={1400}
                  strokeDashoffset={
                    1400 * (1 - interpolate(frame, [45, 99], [0, 1], clamp))
                  }
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: x - 700,
                  top: 600,
                  width: 1400,
                }}
              >
                <AxiomMorph
                  {...MORPH}
                  {...FONT}
                  frame={frame}
                  text="规模决定能力"
                  nextText="证据决定能力"
                  color="#ecf7fa"
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: chapter === "question" ? 800 : x - 160,
                  top: 990,
                  fontSize: 38,
                  color: chapter === "question" ? "#f3b66d" : "#62dcda",
                  opacity:
                    chapter === "question"
                      ? 1
                      : interpolate(frame, [183, 198], [0, 1], clamp),
                }}
              >
                {chapter === "question" ? "旧假设" : "可检验的结论"}
              </div>
            </>
          ),
        },
        {
          depth: 1.4,
          content: (
            <svg width={4600} height={1800}>
              <path
                d="M0 1270 L4600 1000 L4600 1800 L0 1800Z"
                fill="#050d17"
                opacity={0.65}
              />
            </svg>
          ),
        },
      ]}
    />
  );
};

export const AxiomStoryExample = () => {
  const film = useFilm();
  const frame = useCurrentFrame();
  const layouts = useMemo(
    () => ({
      text: measureAxiomText("规模决定能力", FONT),
      nextText: measureAxiomText("证据决定能力", FONT),
    }),
    [],
  );
  const morph = resolveAxiomMorph(frame, { ...MORPH, ...layouts });
  const scenes: readonly FilmScene[] = [
    {
      id: "old",
      from: 0,
      chapter: "question",
      render: (f) => <AxiomWorld frame={f} chapter="question" />,
    },
    {
      id: "evidence",
      from: 90,
      chapter: "proof",
      enter: { kind: "light-leak", frames: 12, sfx: false },
      render: (f) => <AxiomWorld frame={f + 90} chapter="proof" />,
    },
  ];
  const track = resolveFilmSceneTrack(film, scenes);
  return (
    <AbsoluteFill
      style={{ background: "#08131f", fontFamily: FONT.fontFamily }}
    >
      <FilmSceneTrack scenes={scenes} />
      <FilmSoundEffects
        cues={[
          ...track.sfxCues,
          // Fracture stays at f99, after the light-leak window [84, 96).
          { ...morph.sfxCues[0], for: "s02：证据击碎旧字" },
          // The visual land is f183; f181 snaps to the fixture's accent at f183.
          {
            frame: morph.land - 2,
            sfx: "soft-impact",
            snap: "accent",
            maxShiftFrames: 3,
            minFrame: morph.land - 2,
            maxFrame: morph.land,
            for: "s03：碎片重组为新公理",
          },
          { endFrame: morph.land, sfx: "riser-short", for: "s03：重组前蓄势" },
        ]}
      />
      <FilmSoundtrack
        musicDips={[{ from: 159, to: 183, volume: 0.02 }]}
        ending={{ landFrame: 270 }}
      />
      <FilmCaptions />
    </AbsoluteFill>
  );
};
```

Gallery 组合 id：`AxiomStoryGallery`（`npm run dev` → System）。适配层只在 gallery 使用共享已许可的
118 BPM 循环与静态节拍网格，无 provider 调用；实际片挂接 `film:music` 生成的网格。
在仓库根目录验证时，先重建本地包（gallery 入口读取编译产物），再列组合与渲染：

```bash
npm run typecheck
npm --workspace @axmorf/studio run build:runtime
npm run compositions
npx remotion still src/index.ts AxiomStoryGallery out/axiom-story.png --frame=183
npx remotion render src/index.ts AxiomStoryGallery out/axiom-story.mp4
```

以下三个是竖屏子段落，不是完整 Film 根组件；配乐、字幕和音效由外层统一组织。

每个段落是一个普通组件，放在 `Film.tsx` 的 `<Sequence from={...} durationInFrames={...}>` 里，由外层传入段落
长度；`useCurrentFrame()` 在 Sequence 内从 0 开始计数。时间点优先取自 `useFilmTiming()` 的句子和重音帧，
这里为了独立可读用段落长度的比例代替。

## 竖屏：软件主题：真实界面与有动机的镜头

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

## 竖屏：概念主题：有光影的物体造成可见结果

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

## 竖屏：讲解主题：镜头在大场景里跟着过程走

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
