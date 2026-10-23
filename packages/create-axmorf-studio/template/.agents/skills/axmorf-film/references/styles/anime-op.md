# 风格配方：动漫 OP

用户要“动漫 OP / 番剧片头 / MV 感 / 燃”一类风格时读。它在 [画面手艺](../craft.md) 之上调整结构、色彩、节奏和文字，
其余规则不变：旁白和字幕时序不为风格改变，渲染仍然只由帧驱动。

参考的是一类片头的**手法**，不是某部作品：不截取、描摹或复刻任何现成片头的画面、角色、Logo、字体设计或音乐，
也不在 `publish` 里暗示与某部作品有关。下面的比例和色值来自对两部国产动画 OP 逐镜头抽帧的实测，只作方向参考。

## 先看清：这种风格好看靠什么

1. **作画，占大头**：精细线稿与赛璐珞上色、轮廓光和体积光、焦外光斑、粒子、前景遮挡（叶子、花瓣、玻璃、布料）划过镜头。
   网点、色差、撕裂只是叠在高质量画面上的调味，单独拿出来不构成风格。
2. **克制的底色**：全片大部分时间是高调留白或深色夜景，高饱和像素只占约 13–14%；霓虹伪彩只在一两个爆发段出现。
3. **一套反复出现的意象**：同几件物体在开场、铺陈、爆发、收回中反复出现并变化，把快剪串成一个整体。
4. **段落有起伏**：安静 → 铺陈 → 拼贴 → 爆发 → 收回，而不是从头到尾一样满。

**没有合格的插画素材时，不要假装做出了这种风格。** 宿主没有生图工具，或生成的角色达不到“TV 动画成片”质量时，
在构思阶段告诉用户：只能做“纯图形版”（意象物件、纹样、版式和文字，不出现角色），角色画面需要用户提供或另行生成。
不要用几何图形、圆脑袋或简笔 SVG 小人代替角色。

## 分段结构

按片长分配，各段比例是起点：

| 段落 | 约占 | 画面                                                                               | 色彩               | 镜头长度                        | 特效               |
| ---- | ---- | ---------------------------------------------------------------------------------- | ------------------ | ------------------------------- | ------------------ |
| 开场 | 10%  | 一件意象物件的特写或白底静物，大量留白                                             | 基调色，单一强调色 | 1.5–4 秒                        | 几乎不用           |
| 铺陈 | 25%  | 主体在装饰性背景前（同心圆、条纹、纹样墙），出现第一组大字                         | 基调色             | 0.6–1.2 秒，夹一个 2–6 秒长镜头 | 不用或极轻         |
| 拼贴 | 20%  | 每个要点一个“视觉小世界”：平涂漫画、铅笔草稿、浮世绘浪纹、黑白网点、马赛克分屏轮换 | 开始变饱和         | 0.4–0.9 秒                      | 网点、轻错位       |
| 爆发 | 25%  | 眼睛或物件的连续特写变化、繁复纹样墙、动作与色彩爆炸                               | 爆发色只在这里     | 0.4–0.9 秒，镜头内 1–3 帧频闪   | 撕裂、闪白落在重音 |
| 收回 | 15%  | 回到开场的意象，完成一个动作（接住、放下、合上），暖色焦外光                       | 回到基调，偏暖     | 1.5–3 秒                        | 不用               |

用到讲解片时：

- 开场和收回放在 `narrationStartFrame` 之前与 `tailFrames` 里；爆发段放在关键揭示或句间 `pauseAfterMs` 停顿处。
- 铺陈和拼贴承担讲述：有旁白时一个主镜头至少撑完半句（约 1.5 秒以上），字幕区干净，不叠撕裂和错位。
- 片子短于 30 秒时合并为开场 → 铺陈 → 爆发 → 收回，拼贴并入铺陈。

## 色板（实测）

每部片选一个基调，再决定爆发段用哪组爆发色：

| 基调     | 实测占比                            | 角色色值                                                                                                      |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 高调白金 | 白与浅灰约 40%，赭金约 16%，黑约 9% | 底 `#eae5e6`，中灰 `#928e90`，墨 `#15131a`，金 `#b59857`（高光 `#d9b85d`），辅 赤陶 `#996049`、靛 `#404e7d`   |
| 靛蓝夜色 | 靛蓝约 23%，白约 22%，近黑约 14%    | 靛 `#3e5182`，夜 `#0d0d17`，白 `#e9e9ed`，钢蓝 `#538dab`；暖点 深红 `#7c1928`、杏 `#edc891`，只在对立段和结尾 |

| 爆发色 | 色值                                                         | 用法                   |
| ------ | ------------------------------------------------------------ | ---------------------- |
| 青紫   | 青绿 `#2ac3bb`，紫 `#56419b`，蓝 `#4260a7`，电紫 `#593fb6`   | 霓虹线描、迷幻对称纹样 |
| 赤金   | 赤陶 `#b57361`，酒红 `#7e3546`，品紫 `#853a70`，金 `#d9b85d` | 火焰、战斗、繁复纹样墙 |

- 高饱和像素全片控制在约 15% 以内：爆发色不铺满背景，用在主体轮廓、光效和局部纹样上。
- 高调白金基调里金色约占一成到一成半；靛蓝基调里金色几乎只出现在结尾。
- 用 `ProducerGradientMap` 统一素材：白金基调 `["#15131a", "#928e90", "#eae5e6"]`，靛蓝基调
  `["#0d0d17", "#3e5182", "#e9e9ed"]`，`amount` 0.3–0.6 让生图向色板靠拢；全量 `amount: 1` 的伪彩只给爆发段，
  例如 `["#0d0d17", "#56419b", "#2ac3bb", "#f3ecea"]`。

## 意象体系

- 从题材里选 3–4 件物体作为意象，例如讲 HTTPS 用钥匙、锁、信封；参考片用的是空椅子、金色大树、眼睛、手和落叶。
- 每件意象在全片出现至少三次，并且每次有变化：开场单独出现 → 铺陈里成为背景或道具 → 爆发里被放大、复制或变形 → 收回时回到原样并完成一个动作。
- 眼睛或物件的“连续特写变化”很适合爆发段：同一取景，每 2–6 帧换一种颜色或纹样，像一组变奏。
- 拼贴段每个要点配一个小画风，但意象和色板不变，观众才知道仍在同一部片里。

## 剪辑节奏

- **按乐句和重音切，不按每拍切**。参考片的切点与节拍网格的对齐只比随机略好；停留镜头以 0.6–1.75 秒最常见，
  每部都夹着几个 2–6 秒的长镜头。
- 快感主要来自**镜头内的作画**：1–3 帧的频闪、形变、抖动、一拍二或一拍三的动作，而不是把镜头剪碎。
- 段落切换和最大的揭示对齐 `sectionFrames` 或 `accentFrames`；节拍段的普通切点从 `barFrames` 里挑，或按语义手选后
  用 `snapProducerFrameToBeat` 吸附。
- **镜头跟着鼓**：主歌在小节头做 2% 左右的镜头冲击，前奏和副歌每拍冲击、军鼓上轻震；冲击在 5–6 帧内衰减。
  用 `beatFrames` 和 `barFrames` 计算，不要另写一套节拍。
- 硬切为主；闪白、闪黑只在段落切换与重音。转场优先用有动机的方式：前景物体遮挡划过、匹配形状（瞳孔 → 太阳 → 圆环）、
  从物体内部拉出（嘴里、眼里是下一个场景）。

## 文字

两种用法，同一画面只用一种：

- **克制（默认）**：职务小字加中号宋体名字，白色或暖金，放在画面安静区，柔和淡入淡出，不做倒影。
  `ProducerCreditTitle entrance="fade" weight={600}`，`sizePx` 竖屏 1080 宽约 72–110，横屏 1920 宽约 64–100。
- **海报（只给片名和章节）**：巨大粗宋体，可以出血到画面外、被主体遮挡、竖排，偶尔叠一层红色镜像倒影。
  `ProducerCreditTitle` 默认的 `entrance="slam"`，`sizePx` 竖屏 140–260、横屏 120–220，`echo={{ color: "#7e3546" }}` 之类的深色调。
- 海报大字在它那一刻就是画面主体，可以超出 [画面手艺](../craft.md) 的“一个短标题”预算，但不重复字幕。
- 文字放在 `ProducerGradientMap` 外面，伪彩只给画面，否则金字和白字会被一起改色。
- 字体默认 `producerDisplaySerifFamily`（已安装的粗宋体），不从网络加载字体。

## 特效：位置与上限

| 组件                      | 用在哪里                   | 上限                                                      |
| ------------------------- | -------------------------- | --------------------------------------------------------- |
| `ProducerGradientMap`     | 全片统一色调；爆发段做伪彩 | 统一色调 `amount` ≤ 0.6；伪彩只在爆发段                   |
| `ProducerHalftoneOverlay` | 拼贴、爆发                 | `opacity` ≤ 0.35；讲述段不用，或 `fade="edges"` 且 ≤ 0.15 |
| `ProducerChromaticSplit`  | 切点前后                   | 6 帧以内回到 0；≤ 12px；讲述段为 0                        |
| `ProducerGlitchSlices`    | 爆发段的重音切点           | `burstFrames` ≤ 3；每段不超过 3 次                        |
| `ProducerFlashCut`        | 段落切换、`accentFrames`   | 全屏闪烁每秒不超过 3 次                                   |

同一个镜头最多叠两种特效。叠完看图：如果特效比主体更抢眼，就减掉。

## 素材

- **角色与场景（生图）**：提示词写“原创角色，日系 TV 动画成片质量，精细线稿，赛璐珞上色，轮廓光或逆光，焦外光斑”，
  再写清取景、光源方向和选定基调的色值；不写具体作品、角色或画师名。按层生成：全幅背景板、透明主体、前景遮挡物，
  在代码里分层运动。
- **作画序列（让画面动起来的关键）**：2×2 绿幕动作表，抠像后用 `ProducerSpriteSheet` + `resolveProducerDrawing`
  按拍或每 3–5 帧换一张，叠在背景板上；适合回头、起跳、握拳、围巾或头发被风吹。纸鹤、花瓣一类粒子用 3×2 精灵图。
  做法见 [素材](../artwork.md#作画序列动作表)。
- **素材预算**：60 秒左右的 OP 至少准备 12 张插画，其中至少 3 组动作表、2–3 张不同的背景板。开工前把素材清单
  写进构思；生图失败导致关键画面缺失时停下来请用户同意重试（见 Skill 的“故障”），不要用同几张图撑满全片。
- **拼贴段的小画风**：在提示词里明确画风（平涂漫画、铅笔草稿、浮世绘浪纹、黑白网点），其余条件不变。
- **纹样与意象物件（原创 SVG）**：Art Deco 同心圆和条纹、曼陀罗、放射线、版式网格可以直接写在 TSX 里；
  物件要有体积、光影和细节层级（见 [SVG 精作配方](../craft.md#svg-精作配方)）。
- 每张生图照常用 `film:asset` 登记。

## 配乐

两条路，按许可情况选：

- **授权曲目（效果最好）**：用户提供或确认有权使用的曲子，用 `music.track` 接入（见
  [使用授权曲目](../music.md#使用授权曲目)），用 `trimStartSeconds` 从最有劲的段落开始，`sectionBars` 对齐分段结构。
  许可说不清就先问用户。
- **合成配乐**：`drive` 风格：军鼓反拍、八分音符贝斯、强力和弦吉他与过门撑起律动。它仍是合成音色，不是真实乐队；
  报告里说明这一点。段落与上面的分段结构一一对应：

```json
"score": {
  "engine": "studio-v2",
  "bpm": 172,
  "beatsPerBar": 4,
  "bars": 28,
  "style": "drive",
  "seed": 20261022,
  "arrangement": {
    "tonic": "E",
    "mode": "minor",
    "progression": [6, 4, 1, 5],
    "swing": 0,
    "sections": [
      { "bars": 4, "instruments": ["guitar", "pluck", "pad"], "density": 0.4, "energy": 0.4 },
      { "bars": 8, "instruments": ["kick", "snare", "hat", "bass", "guitar", "pad"], "density": 0.5, "energy": 0.45 },
      { "bars": 4, "instruments": ["kick", "snare", "hat", "bass", "guitar", "pluck"], "density": 0.7, "energy": 0.7 },
      { "bars": 8, "instruments": ["kick", "snare", "clap", "hat", "bass", "guitar", "lead", "pad"], "density": 0.9, "energy": 0.95 },
      { "bars": 4, "instruments": ["guitar", "pluck", "pad"], "density": 0.4, "energy": 0.4 }
    ]
  }
}
```

- `bars` 按实测时长重算（172 BPM 每小节约 1.4 秒）。`lead` 和最满的段落留给没有旁白的爆发段。
- 无旁白的 MV 把 `volume` 与 `underSpeechVolume` 都设到 0.8–0.9（成片约 -15 LUFS）；有旁白时保留默认。

## 片头片尾

系统品牌片头 2 秒、片尾 8 秒会占掉短片相当一部分，气质也不一定合拍。构思时问用户要不要；不要就建片时
`--bookends none`（见 Skill 的“建片”）。

## 安全

全屏闪白、闪黑和大面积明暗跳变每秒不超过 3 次；连续快切时只在部分切点闪，其余用硬切。

## 示例段落：组件用法

下面只演示组件怎么接到时序上，**不是画面示范**：`Plate` 是占位色块，正式片里换成登记过的插画和原创纹样，
否则不要交付。它展示四件事：从 `barFrames` 取切点并保留一个长镜头；用 `ProducerGradientMap` 把素材统一到基调；
前面的镜头克制、只有最后一个乐句爆发；克制与海报两种文字；撕裂和闪白只落在重音。

```tsx
import type { FC, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import {
  ProducerBeatCutSeries,
  ProducerCreditTitle,
  ProducerFlashCut,
  ProducerGlitchSlices,
  ProducerGradientMap,
  ProducerHalftoneOverlay,
  selectProducerCutFrames,
  useFilmTiming,
} from "@axmorf/studio/remotion";

const INDIGO_NIGHT = ["#0d0d17", "#3e5182", "#e9e9ed"];
const BURST = ["#0d0d17", "#56419b", "#2ac3bb", "#f3ecea"];

// Placeholder plate standing in for a registered illustration. Never deliver it as artwork.
const Plate: FC<{
  readonly background: string;
  readonly children?: ReactNode;
}> = ({ background, children }) => (
  <AbsoluteFill style={{ background }}>{children}</AbsoluteFill>
);

export const OpComponentsSegment: FC<{ readonly durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const { music } = useFilmTiming();
  // Cut on phrases (bars), keep the first cut at 0 and leave the final shot long.
  const bars = music?.barFrames ?? [
    0,
    Math.round(durationInFrames * 0.35),
    Math.round(durationInFrames * 0.6),
  ];
  const cuts = [
    0,
    ...selectProducerCutFrames({
      grid: bars,
      fromFrame: 1,
      toFrame: Math.max(2, durationInFrames - 45),
    }),
  ];
  // Effects land only on accents; absolute film frames match because this segment starts at frame 0.
  const accents = (music?.accentFrames ?? [cuts.at(-1)!]).filter(
    (frame) => frame > 0 && frame < durationInFrames,
  );

  // Recolor only the plate; type and overlays stay outside the gradient map so gold stays gold.
  const calm = (key: number) => (
    <AbsoluteFill key={key}>
      <ProducerGradientMap stops={INDIGO_NIGHT} amount={0.5}>
        <Plate background="linear-gradient(160deg, #e9e9ed, #538dab 55%, #0d0d17)" />
      </ProducerGradientMap>
      <ProducerCreditTitle
        role="原作"
        names={["节拍之书"]}
        sizePx={84}
        entrance="fade"
        weight={600}
        startFrame={6}
        style={{ right: "8%", top: "16%" }}
      />
    </AbsoluteFill>
  );
  const burst = (key: number) => (
    <AbsoluteFill key={key}>
      <ProducerGradientMap stops={BURST}>
        <Plate background="radial-gradient(circle at 50% 45%, #ffffff, #7a7a7a 40%, #050505 75%)" />
      </ProducerGradientMap>
      <ProducerHalftoneOverlay
        fade="edges"
        opacity={0.3}
        spacingPx={16}
        radiusPx={4}
      />
      <ProducerCreditTitle
        names={["第一章"]}
        sizePx={180}
        fill="gold"
        echo={{ color: "#7e3546" }}
        startFrame={2}
        style={{ left: "7%", top: "24%" }}
      />
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d17" }}>
      <ProducerGlitchSlices
        seed="op-accent"
        bursts={accents}
        burstFrames={3}
        intensity={0.7}
      >
        {/* Calm shots carry the telling; only the final phrase bursts. */}
        <ProducerBeatCutSeries
          cutFrames={cuts}
          endFrame={durationInFrames}
          shots={cuts.map((_, index) =>
            index === cuts.length - 1 && index > 0 ? burst(index) : calm(index),
          )}
        />
      </ProducerGlitchSlices>
      <ProducerFlashCut frames={accents} decayFrames={5} peak={0.8} />
    </AbsoluteFill>
  );
};
```

## 审片追加项

在 [审片](../craft.md#审片) 清单之外逐条回答，并写帧号：

1. 有没有用几何图形或简笔小人代替角色？有就改成纯图形版，或向用户说明缺少插画。
2. 分段起伏清楚：开场与收回安静，爆发段明显更满；收回画面回到了开场的意象。
3. 每件意象至少出现三次且有变化（写出各次的帧号）。
4. 基调色占画面主体；爆发色只出现在爆发段，且没有铺满背景。
5. 讲述段主镜头撑完半句以上，字幕区没有撕裂、错位和网点。
6. 特效没有比主体更抢眼；闪白每秒不超过 3 次。
7. 海报大字只用于片名和章节，其余文字是克制用法，且没有和字幕说同一句话。
8. 素材清单齐了：插画、动作表和背景板数量达到素材预算；`repetitionWarnings` 为空，或每条都有理由。
9. 角色真的在动：至少三处用动作表播放了连续原画，而不只是推拉一张静图。
