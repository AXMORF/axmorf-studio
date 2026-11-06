# 镜头配方目录

六张卡与公共导出 `PRODUCER_RECIPE_CATALOG` 一致；其中记录 `id/title/useWhen/avoidWhen`、
`recommendedDurationSeconds`、`keyframes`、`sfxCues: [{at, role}]`。后者是语义建议，不是可直接播放的绝对帧 cue；
调用相应 resolver 才得到 `FilmSoundEffectCue[]`。**不原样粘贴，构图和世界从剧本出发**；这些片段只展示 API 接线。

每张卡在 `npm run dev` 的 Remotion Studio → System → Recipes 下预览，组合 id 见各节；均为 1920×1080 / 30 fps。
片段需放在已注册 film 的根层（FilmProvider 内），本片至少覆盖 cue 尾端；画面布局和字幕/配乐由 Film 根组件负责。
示例 frame 在根层读取，是正片绝对帧；不要直接放进 Sequence 后仍按绝对 startFrame 使用。

## 共同时间语义

`startFrame` 为正片绝对起点，`durationInFrames` 至少 12 帧。`resolveProducerRecipeTiming(frame, options)` 给出：
`anticipate = startFrame`、`move = startFrame + floor(duration × 0.16)`、
`land = startFrame + floor(duration × 0.72)`、`settle = startFrame + duration − 1`；BarGrow 的错峰汇总以最后柱 land 为准。
状态还包括 `phase`（before/anticipate/move/land/settle/hold）。组件不自动发声，resolver 的 `sfxCues` 显式传给
`FilmSoundEffects`，按计划选取并可改 `for/snap/maxShiftFrames/minFrame/maxFrame`，见 [音效计划](sound.md)。
若吸附音效移动了锚点，要核对画面仍同步；可先反推配方 startFrame，让 land 对齐，不挪旁白字幕。

## AxiomMorph：文字形变

- 什么时候用：旧公理被证据打破、文字重组。
- 什么时候避开：长段正文或需要连续阅读时。
- 建议时长：1.2–3 秒，按本片 fps 换算帧，保留停稳阅读时间。
- 关键参数：`mode: assemble | scatter | shatter | reform`；`text`、`nextText`、`fontFamily/fontSize/fontWeight`、`seed`、`spread`、`fragments`（4/8/12/16）。resolver 的 text/nextText 接收 `measureAxiomText` 布局，组件接收字符串。共有字按次序匹配移动，其他旧字碎裂、新字聚合。
- 声音建议：move → glitch-tick；land → soft-impact。下面从 resolver 取 cue 交给 FilmSoundEffects；可选取，避免与转场重复。
- Gallery 组合 id：`Recipe-AxiomMorph`。

```tsx
import { useCurrentFrame } from "remotion";
import {
  AxiomMorph,
  measureAxiomText,
  resolveAxiomMorph,
  FilmSoundEffects,
} from "@axmorf/studio/remotion";

export const AxiomMorphCard = () => {
  const frame = useCurrentFrame();
  const font = { fontFamily: "Noto Sans CJK SC, sans-serif", fontSize: 84 };
  const options = {
    startFrame: 12,
    durationInFrames: 72,
    mode: "reform" as const,
  };
  const text = measureAxiomText("规模决定能力", font);
  const nextText = measureAxiomText("证据决定能力", font);
  const state = resolveAxiomMorph(frame, { ...options, text, nextText });
  return (
    <>
      <AxiomMorph
        {...options}
        {...font}
        frame={frame}
        text="规模决定能力"
        nextText="证据决定能力"
      />
      <FilmSoundEffects cues={state.sfxCues} />
    </>
  );
};
```

## NumberRoll：逐位数字滚动

- 什么时候用：金额、计数或量级揭示。
- 什么时候避开：精确读数需要始终可读时。
- 建议时长：0.8–2 秒，按本片 fps 换算帧，保留停稳阅读时间。
- 关键参数：`value`（绝对值 < 1e15）、`decimals`（0–8）、`grouping`、`prefix/suffix`、`turns`（1–6，递增速度控制）、`fontSize`。落定帧每一位都是最终值。
- 过程中的数值不能误导：不能大于目标值，不能和旁白矛盾。所有数字列由同一个单调递增的定点数值生成，
  按 `decimals` 的显示精度向下取值（避免舍入超过事实目标），千分位与前后缀一起格式化；
  过冲只做位移回弹，不改变数值。
  非负目标从 0 增长，负目标从显示目标的两倍递增到目标；需要始终看到精确事实时直接显示最终值。
- 声音建议：land → soft-impact。下面从 resolver 取 cue 交给 FilmSoundEffects；可选取，避免与转场重复。
- Gallery 组合 id：`Recipe-NumberRoll`。

```tsx
import { useCurrentFrame } from "remotion";
import {
  NumberRoll,
  resolveNumberRoll,
  FilmSoundEffects,
} from "@axmorf/studio/remotion";

export const NumberRollCard = () => {
  const frame = useCurrentFrame();
  const options = {
    startFrame: 12,
    durationInFrames: 48,
    value: 12804.75,
    decimals: 2,
    prefix: "¥ ",
    suffix: " / 次",
  };
  const state = resolveNumberRoll(frame, options);
  return (
    <>
      <NumberRoll {...options} frame={frame} fontSize={140} />
      <FilmSoundEffects cues={state.sfxCues} />
    </>
  );
};
```

## BarGrow：柱条回弹

- 什么时候用：比较非负数量。
- 什么时候避开：负数、密集时间序列。
- 建议时长：1–3 秒，按本片 fps 换算帧，保留停稳阅读时间。
- 关键参数：`values`（1–32 个非负数）、`maxValue`、`staggerInFrames`、`ticks`（1–12）；组件再接 `labels/width/height/color`。每柱错峰后仍至少有 12 帧，`land` 是最后一柱到达，`sfxCues` 包含各柱落点，可选择只留末柱。
- 声音建议：每柱 land → soft-impact。下面从 resolver 取 cue 交给 FilmSoundEffects；可选取，避免与转场重复。
- Gallery 组合 id：`Recipe-BarGrow`。

```tsx
import { useCurrentFrame } from "remotion";
import {
  BarGrow,
  resolveBarGrow,
  FilmSoundEffects,
} from "@axmorf/studio/remotion";

export const BarGrowCard = () => {
  const frame = useCurrentFrame();
  const options = {
    startFrame: 12,
    durationInFrames: 72,
    values: [28, 65, 86],
    maxValue: 100,
    staggerInFrames: 5,
  };
  const state = resolveBarGrow(frame, options);
  return (
    <>
      <BarGrow {...options} frame={frame} labels={["基线", "证据", "结果"]} />
      <FilmSoundEffects cues={state.sfxCues.slice(-1)} />
    </>
  );
};
```

## CameraMove：世界镜头推拉摇移

- 什么时候用：沿因果路径移动或揭示范围。
- 什么时候避开：没有空间关系的无动机漂移。
- 建议时长：1.2–4 秒，按本片 fps 换算帧，保留停稳阅读时间。
- 关键参数：`preset`：`push-in` / `pull-out` / `pan-along-path` / `reveal-pan` / `parallax-drift`；`width/height/worldWidth/worldHeight`、世界像素 `from/to/path`、`zoom`（1–6）。推拉用 from 为中心，path 预设需要至少两点；各层的 content 按世界坐标绘制。
- 声音建议：move → whoosh-sweep；land → soft-impact。下面从 resolver 取 cue 交给 FilmSoundEffects；可选取，避免与转场重复。
- Gallery 组合 id：`Recipe-CameraMove`。

```tsx
import { useCurrentFrame } from "remotion";
import {
  CameraMove,
  resolveCameraMove,
  FilmSoundEffects,
} from "@axmorf/studio/remotion";

export const CameraMoveCard = () => {
  const frame = useCurrentFrame();
  const options = {
    startFrame: 12,
    durationInFrames: 90,
    preset: "pan-along-path" as const,
    width: 1920,
    height: 1080,
    worldWidth: 3200,
    worldHeight: 1400,
    path: [
      [960, 700],
      [1700, 550],
      [2240, 700],
    ] as const,
  };
  const state = resolveCameraMove(frame, options);
  return (
    <>
      <CameraMove
        {...options}
        frame={frame}
        layers={[
          {
            depth: 1,
            content: (
              <svg width={3200} height={1400}>
                <path
                  d="M960 700 L1700 550 L2240 700"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={16}
                />
              </svg>
            ),
          },
        ]}
      />
      <FilmSoundEffects cues={state.sfxCues} />
    </>
  );
};
```

`motionBlur` 默认 false；只在快速运动段启用，`blurSamples` 默认 4、允许 2–8。每个样本重绘子树，成本约按采样数增加，讲述段优先保持清楚。

## ParticleField：粒子散聚

- 什么时候用：分散的证据聚成形状。
- 什么时候避开：正文与精确数据标注。
- 建议时长：1.2–3 秒，按本片 fps 换算帧，保留停稳阅读时间。
- 关键参数：`mode: scatter | assemble`、`path`（SVG 路径，与 field 同一像素坐标）、`width/height`、`count`（2–400，默认 120）、`seed`。不是把文字变粒子的排版工具；粒子越多 DOM 成本越高。
- 声音建议：move → shimmer；land → soft-impact。下面从 resolver 取 cue 交给 FilmSoundEffects；可选取，避免与转场重复。
- Gallery 组合 id：`Recipe-ParticleField`。

```tsx
import { useCurrentFrame } from "remotion";
import {
  ParticleField,
  resolveParticleField,
  FilmSoundEffects,
} from "@axmorf/studio/remotion";

export const ParticleFieldCard = () => {
  const frame = useCurrentFrame();
  const options = {
    startFrame: 12,
    durationInFrames: 72,
    mode: "assemble" as const,
    width: 1500,
    height: 600,
    count: 120,
    seed: "evidence",
    path: "M300 450 L750 100 L1200 450 Z",
  };
  const state = resolveParticleField(frame, options);
  return (
    <>
      <ParticleField {...options} frame={frame} color="#4bd9dc" />
      <FilmSoundEffects cues={state.sfxCues} />
    </>
  );
};
```

## ParallaxLayers：深度视差

- 什么时候用：背、中、主、前景建立空间。
- 什么时候避开：所有层必须固定对齐的图表。
- 建议时长：1.5–4 秒，按本片 fps 换算帧，保留停稳阅读时间。
- 关键参数：`width/height/worldWidth/worldHeight`、`from/to`、`layers: [{depth, content}]`。resolver 用 `depths`（1–16 层，默认 0.15/0.5/1/1.5），组件从 layers 取深度；复用 ProducerWorldCamera，不另建坐标引擎。depth > 1 的前景要超出世界边缘绘制，防止露边。
- 声音建议：move → whoosh-sweep；land → soft-impact。下面从 resolver 取 cue 交给 FilmSoundEffects；可选取，避免与转场重复。
- Gallery 组合 id：`Recipe-ParallaxLayers`。

```tsx
import { useCurrentFrame } from "remotion";
import {
  ParallaxLayers,
  resolveParallaxLayers,
  FilmSoundEffects,
} from "@axmorf/studio/remotion";

export const ParallaxLayersCard = () => {
  const frame = useCurrentFrame();
  const options = {
    startFrame: 12,
    durationInFrames: 90,
    width: 1920,
    height: 1080,
    worldWidth: 3200,
    worldHeight: 1400,
    from: [960, 700] as const,
    to: [2240, 700] as const,
  };
  const layers = [
    {
      depth: 0.15,
      content: (
        <div style={{ width: 4000, height: 1800, background: "#102636" }} />
      ),
    },
    {
      depth: 1,
      content: (
        <div
          style={{ position: "absolute", left: 1800, top: 600, fontSize: 120 }}
        >
          证据
        </div>
      ),
    },
  ];
  const state = resolveParallaxLayers(frame, {
    ...options,
    depths: layers.map((l) => l.depth),
  });
  return (
    <>
      <ParallaxLayers {...options} frame={frame} layers={layers} />
      <FilmSoundEffects cues={state.sfxCues} />
    </>
  );
};
```
