# 风格配方：动漫 OP

用户要“动漫 OP / 番剧片头 / MV 感 / 燃”一类风格时读。它在 [画面手艺](../craft.md) 之上调整节奏、色彩和文字，
其余规则不变：旁白和字幕时序不为风格改变，渲染仍然只由帧驱动。

参考的是一类片头的**手法**，不是某部作品：不截取、描摹或复刻任何现成片头的画面、角色、Logo、字体设计或音乐，
也不在 `publish` 里暗示与某部作品有关。

## 风格要点

- **节拍剪辑**：参考片平均每 0.6–0.9 秒一个镜头，很多镜头不到半秒；转场主要是硬切和闪白、闪黑。
- **两套色调交替**：高饱和霓虹伪彩（品红、青、电光紫、荧光绿）与黑白水墨灰调交替出现；
  金色只用在最重要的字和纹样上；危险或对立段落用红黑高反差。
- **印刷与数码质感**：半调网点、RGB 色差错位、横向撕裂、霓虹描边、纸张颗粒。
- **构图两极**：极端特写（眼睛、手、嘴、道具）与远景剪影交替；对称中心构图（曼陀罗、圆环、放射纹样）；
  多格拼贴分屏。传统纹样（云纹、金色几何、神兽剪影）可以与现代造型（耳机、街头服饰）混搭。
- **文字即画面**：职员表式排版，职务是小字，名字是巨大粗宋体，可以出血到画面外、被主体遮挡、横竖混排；
  偶尔叠一层镜像倒影。

## 怎么用到讲解片

讲解片有旁白，不能整片都按 OP 的速度剪。把片子分成两种段落：

| 段落   | 什么时候                               | 节奏                                    | 画面                                               |
| ------ | -------------------------------------- | --------------------------------------- | -------------------------------------------------- |
| 节拍段 | 开场钩子、段落转场、旁白停顿、高潮揭示 | 每 1–2 拍一切（约 0.4–0.9 秒）          | 特写/剪影/大字快速交替，撕裂和闪帧落在切点         |
| 讲述段 | 旁白在说、观众要读要理解               | 一个主镜头至少撑完半句（约 1.5 秒以上） | 主体稳定，靠网点漂移、缓慢推镜、色彩呼吸做次级运动 |

- 节拍段放在 `narrationStartFrame` 之前的开场和句间 `pauseAfterMs` 里最自然；需要更长的节拍段就给相应句子加停顿。
- 讲述段不加持续撕裂；色差保持在 0–4px 的轻微程度，切点前后几帧再放大。
- 关键揭示落在 `accentFrames` 或 `sectionFrames`，闪白也只放在这些落点上。

## 色板

按段落选一组，相邻两段不用同一组：

| 色组     | 用法                     | 建议值                                                                                                            |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 霓虹伪彩 | 角色特写、高能段         | `ProducerGradientMap` stops `["#14002e", "#7b2cff", "#ff2bd6", "#5ff8ff"]` 或 `["#001a12", "#00c27a", "#e8ff3a"]` |
| 水墨灰   | 回忆、静场、悬念         | stops `["#0b0b0e", "#8d8a85", "#f3efe6"]`，叠低透明度纸张颗粒                                                     |
| 金       | 片名、最重要的名字与纹样 | `ProducerCreditTitle fill="gold"`；纹样用 `#e8b84f` → `#a86f1d` 渐变                                              |
| 红黑     | 对立、危险、反转         | 底 `#0a0204`，主色 `#e3262f`，高光 `#ff8a5c`                                                                      |

## 文字

- 用 `ProducerCreditTitle` 做职员表式大字：`sizePx` 竖屏 1080 宽时 140–260，横屏 1920 宽时 120–220；
  职务小字自动取约三分之一并不低于 `minFontSizePx`。
- 这类大字在节拍段里**就是主体**，因此可以超过 [画面手艺](../craft.md) 的“一个短标题”预算；但仍然不重复字幕，
  同一画面最多一组职务 + 名字，讲述段回到普通预算。
- 竖排用 `orientation="vertical"`；镜像倒影用 `echo={{ color: "#e3262f" }}`，只用于片名或段落标题。
- 字体默认 `producerDisplaySerifFamily`（Songti SC / Noto Serif SC / Source Han Serif SC 等已安装粗宋体），
  不要从网络加载字体。

## 素材

- 角色和场景用生图：要求“原创角色，日系 TV 动画赛璐珞上色，干净线稿，强轮廓光”，并写清取景与光源；
  主体与背景分开生成透明主体，方便叠伪彩、色差和网点。提示词里不写具体作品、角色或画师名。
- 纹样、圆环、放射线、拼贴网格用原创 SVG 直接写在 TSX 里。
- 每张生图照常用 `film:asset` 登记。

## 运行时工具

全部从 `@axmorf/studio/remotion` 导入，详见 [运行时 API](../api.md#图形处理与节拍剪辑)：

- `ProducerBeatCutSeries` + `selectProducerCutFrames`：按 `beatFrames`/`barFrames` 硬切镜头。
- `ProducerGradientMap`：霓虹伪彩、双色调。
- `ProducerChromaticSplit`：RGB 色差错位。
- `ProducerGlitchSlices`：切点处的横向撕裂（`bursts` 传切点帧）。
- `ProducerHalftoneOverlay`：网点叠层，`fade="edges"` 让主体保持干净。
- `ProducerFlashCut`：闪白、闪黑。
- `ProducerCreditTitle`：职员表式大字。

## 配乐

当前配乐引擎只有 `electronic` 与 `organic` 两种音色，合成不出乐队摇滚；用下面的配方得到最接近的“燃”感，
并在报告里说明这一点：

```json
"score": {
  "engine": "studio-v2",
  "bpm": 160,
  "beatsPerBar": 4,
  "bars": 24,
  "style": "electronic",
  "seed": 20261022,
  "arrangement": {
    "tonic": "E",
    "mode": "minor",
    "progression": [1, 6, 3, 7],
    "swing": 0,
    "sections": [
      { "bars": 2, "instruments": ["pad", "pluck"], "density": 0.4, "energy": 0.4 },
      { "bars": 8, "instruments": ["kick", "hat", "bass", "pluck", "pad"], "density": 0.6, "energy": 0.6 },
      { "bars": 2, "instruments": ["kick", "snare", "hat", "bass", "pad"], "density": 0.7, "energy": 0.75 },
      { "bars": 8, "instruments": ["kick", "clap", "snare", "hat", "bass", "pluck", "pad", "lead"], "density": 0.85, "energy": 0.95 },
      { "bars": 4, "instruments": ["pad", "pluck", "lead"], "density": 0.45, "energy": 0.45 }
    ]
  }
}
```

`bars` 按实测时长重算（160 BPM 每小节 1.5 秒）。`lead` 和最满的段落留给没有旁白的节拍段；30 fps 下一拍约 11 帧，
`every: 2` 的切点约 0.75 秒一切。

## 安全

全屏闪白、闪黑和大面积明暗跳变每秒不超过 3 次；连续节拍切时只在部分切点闪，其余用硬切或撕裂。

## 示例段落

一个可以直接放进片里的节拍段：霓虹伪彩特写、水墨远景和职员表大字三种镜头按拍轮换，切点撕裂，每四切闪白一次。
主体用原创 SVG 剪影代替，真实作品里换成登记过的生图。

```tsx
import type { FC } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  ProducerBeatCutSeries,
  ProducerChromaticSplit,
  ProducerCreditTitle,
  ProducerFlashCut,
  ProducerGlitchSlices,
  ProducerGradientMap,
  ProducerHalftoneOverlay,
  selectProducerCutFrames,
  useFilmTiming,
} from "@axmorf/studio/remotion";

const NEON = ["#14002e", "#7b2cff", "#ff2bd6", "#5ff8ff"];
const INK = ["#0b0b0e", "#8d8a85", "#f3efe6"];

// Head-and-shoulders silhouette with headphones, lit from the upper right.
const Figure: FC<{ readonly tilt: number }> = ({ tilt }) => (
  <svg
    viewBox="0 0 600 900"
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMax meet"
  >
    <defs>
      <radialGradient id="op-skin" cx="65%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#9a9a9a" />
        <stop offset="100%" stopColor="#1c1c1c" />
      </radialGradient>
      <linearGradient id="op-coat" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#d9d9d9" />
        <stop offset="100%" stopColor="#111111" />
      </linearGradient>
    </defs>
    <g transform={`rotate(${tilt} 300 520)`}>
      <path
        d="M60 900 C80 700 170 610 300 600 C430 610 520 700 540 900 Z"
        fill="url(#op-coat)"
      />
      <path d="M240 560 L360 560 L350 640 L250 640 Z" fill="#2a2a2a" />
      <ellipse cx="300" cy="400" rx="150" ry="185" fill="url(#op-skin)" />
      <path
        d="M150 380 C140 230 220 170 300 170 C400 170 470 230 455 390 C430 300 380 260 300 262 C230 262 180 300 150 380 Z"
        fill="#0d0d0d"
      />
      <path
        d="M135 400 C130 250 470 250 465 400"
        fill="none"
        stroke="#f2f2f2"
        strokeWidth={22}
        strokeLinecap="round"
      />
      <rect x="112" y="370" width="54" height="96" rx="24" fill="#fafafa" />
      <rect x="434" y="370" width="54" height="96" rx="24" fill="#fafafa" />
      <path
        d="M340 420 C365 410 395 412 410 425"
        stroke="#000"
        strokeWidth={9}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

const Mandala: FC<{ readonly turn: number }> = ({ turn }) => (
  <svg viewBox="-500 -500 1000 1000" width="100%" height="100%">
    <g transform={`rotate(${turn})`}>
      {Array.from({ length: 24 }, (_, index) => (
        <path
          key={index}
          d="M0 -460 L26 -300 L0 -250 L-26 -300 Z"
          fill="#f3efe6"
          opacity={index % 2 === 0 ? 0.9 : 0.45}
          transform={`rotate(${index * 15})`}
        />
      ))}
      {[420, 330, 240, 150].map((radius) => (
        <circle
          key={radius}
          r={radius}
          fill="none"
          stroke="#f3efe6"
          strokeWidth={radius / 60}
          opacity={0.6}
        />
      ))}
    </g>
  </svg>
);

const NeonCloseUp: FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 65% 30%, #ffffff, #4a4a4a 45%, #050505)",
      }}
    >
      <ProducerChromaticSplit
        amountPx={interpolate(frame, [0, 6], [18, 3], {
          extrapolateRight: "clamp",
        })}
      >
        <ProducerGradientMap stops={NEON}>
          <AbsoluteFill
            style={{
              transform: `scale(${1.5 + frame * 0.004}) translateY(14%)`,
            }}
          >
            <Figure tilt={-6} />
          </AbsoluteFill>
        </ProducerGradientMap>
      </ProducerChromaticSplit>
      <ProducerHalftoneOverlay
        fade="edges"
        spacingPx={16}
        radiusPx={4}
        driftPxPerFrame={0.4}
        opacity={0.45}
      />
    </AbsoluteFill>
  );
};

const InkWide: FC = () => {
  const frame = useCurrentFrame();
  return (
    <ProducerGradientMap stops={INK}>
      <AbsoluteFill style={{ background: "linear-gradient(#e9e4da, #6f6b66)" }}>
        <AbsoluteFill
          style={{ opacity: 0.7, transform: `scale(${1.1 + frame * 0.003})` }}
        >
          <Mandala turn={frame * 0.6} />
        </AbsoluteFill>
        <AbsoluteFill
          style={{ top: "58%", left: "38%", width: "24%", height: "42%" }}
        >
          <Figure tilt={0} />
        </AbsoluteFill>
      </AbsoluteFill>
    </ProducerGradientMap>
  );
};

const TitleCard: FC = () => (
  <AbsoluteFill
    style={{
      background: "radial-gradient(circle at 30% 40%, #5a0710, #0a0204 70%)",
    }}
  >
    <ProducerHalftoneOverlay
      color="#ff8a5c"
      opacity={0.25}
      spacingPx={20}
      radiusPx={5}
    />
    <ProducerCreditTitle
      role="第一章"
      names={["节拍觉醒"]}
      sizePx={220}
      fill="gold"
      echo={{ color: "#e3262f" }}
      startFrame={1}
      style={{ left: "8%", top: "30%" }}
    />
  </AbsoluteFill>
);

export const OpBeatSegment: FC<{ readonly durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { music } = useFilmTiming();
  // Without a score, fall back to a 160 BPM grid at 30 fps so the segment still cuts on a pulse.
  const grid =
    music?.beatFrames ??
    Array.from({ length: Math.ceil(durationInFrames / 11) }, (_, index) =>
      Math.round(index * 11.25),
    );
  const cuts = selectProducerCutFrames({
    grid,
    fromFrame: 0,
    toFrame: durationInFrames - 8,
    every: 2,
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#050505" }}>
      <ProducerGlitchSlices
        seed="op-beat"
        bursts={cuts.slice(1)}
        burstFrames={5}
        intensity={0.9}
      >
        <ProducerBeatCutSeries
          cutFrames={cuts}
          endFrame={durationInFrames}
          shots={[
            <NeonCloseUp key="neon" />,
            <InkWide key="ink" />,
            <TitleCard key="title" />,
          ]}
        />
      </ProducerGlitchSlices>
      <ProducerFlashCut
        frames={cuts.filter((_, index) => index > 0 && index % 4 === 0)}
        decayFrames={5}
      />
    </AbsoluteFill>
  );
};
```

## 审片追加项

在 [审片](../craft.md#审片) 清单之外逐条回答，并写帧号：

1. 节拍段的切点落在拍上（与 `beatFrames` 相差不超过 2 帧），讲述段的主镜头撑完半句以上。
2. 相邻镜头换了色组或景别（特写 ↔ 远景、伪彩 ↔ 水墨），不是同一构图换颜色。
3. 撕裂、色差、闪帧只出现在切点附近；字幕所在的讲述段画面干净可读。
4. 闪白每秒不超过 3 次。
5. 职员表式大字在手机尺寸下依然清楚，且没有和字幕说同一句话。
