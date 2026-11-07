# 节奏驱动的动效：导演手册

> 给做 AXMORF 片子的 Agent 读。读完要能回答：这一帧为什么在动、跟哪个声音一起动。
> 代码片段按 `@axmorf/studio/remotion` 当前 API 写，字段以 `api.md` 为准；它们是技法示范，不是模板。

## 1. 一句话原则

**一部片只有一个时钟：配乐的节拍网格。** 画面的每一次变化、每一个音效都挂在这个网格上。旁白与字幕保留实测时序，绝不为了踩拍挪动；
先用句子锚定节奏谱，再从生成的网格选择符合语义的动作落点。无配乐时不伪造网格，按内容安排动作。

像 PPT 的片子，画面和声音各走各的：每句旁白换一页，元素用同一条缓动滑进来，然后停住慢慢漂；配乐在下面自己循环。
观众不会说“没对齐”，只会觉得“闷、慢、像幻灯片”。修法不是切得更勤，而是让画面听得见音乐。

## 2. 工作顺序（不能倒过来）

1. `film:voice`：旁白实测，拿到每句起止帧。
2. **先写节奏谱**（`music.score`）：按章节把段落锚到句子上，定好揭示用的 `hits`、揭示前的 `breaks`、结尾 `ending`。
3. `film:music`：拿到 `beatFrames`、`barFrames`、`sectionFrames`、`accentFrames` 和 `onsets`（kick/snare/clap/hat/bass/hits/sections，字段均为帧数组）。
4. **写 storyboard.md**：按小节写，不按句子写（格式见第 8 节）。
5. 写画面：先搭三层动效（第 4 节），再填细节。
6. 写音效：从画面动作派生（第 6 节）。
7. `film:review --animatic`：完整看一遍带声音的低清预览，按第 9 节自检，节奏对了再精修画面。

画面先做、声音后配，几乎一定对不上。旁白长度一变就重跑 2–3，画面里所有时间都从网格读，不写死帧号。

## 3. 节奏谱怎么写

讲解片的配乐是**节拍器加情绪曲线**，不是背景音乐。

| 段落  | 放在哪                         | 配乐                                         | 画面能量                |
| ----- | ------------------------------ | -------------------------------------------- | ----------------------- |
| hook  | 片头前 5–8 秒（旧公理）        | 直接进鼓，第一小节就有重音                   | 高：冲击、碎裂          |
| verse | 讲事实、讲证据的章节           | 稳定律动：kick + hat，旋律退后               | 中：每小节一件事        |
| lift  | 揭示前 1–2 小节                | 渐强或 riser，最后 1–2 拍 `breaks` 抽空      | 收：画面聚拢、停住      |
| drop  | 揭示那一帧（关键数字、新公理） | `hits: drop`，全乐器回来                     | 最高：大动作 + 镜头冲击 |
| outro | 开放问题                       | 去掉鼓，`ending: resolve` 落在问题说完的那拍 | 低：慢推、留白          |

- BPM：讲解段 96–116，钩子和高潮能量来自编配，不靠提速。一部片一个 BPM。
- 章节边界 = `sections`；每个揭示 = 一个 `hit`；每次停顿 = 一个 `break`。
- 整片能量要有起伏：hook 高，证据段中，揭示前收，揭示爆，结尾落。整片都在同一个能量上，比没有音乐还闷。

## 4. 三层动效（核心）

所有动效分到三层，每层挂在不同粒度的音乐事件上。

| 层      | 跟谁动                             | 做什么                                                           | 幅度                                    |
| ------- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| L1 呼吸 | 每个 kick（或每拍）                | 环境光一闪、背景网格轻缩放、主体轻微“点头”                       | 讲述段 1–2%，节拍段 3–5%；6–10 帧衰减完 |
| L2 节拍 | 每小节（或每两小节）               | 一次可见的构图变化：镜头前进一步、新元素入场、标签切换、数据推进 | **每小节必须有一件事发生**              |
| L3 重音 | `accentFrames`、`hits`、`sections` | 大事件：文字碎裂/重组、数字落定、镜头冲击、闪光、粒子爆开、转场  | 全片最大的动作只在这里                  |

讲述段（有人在说话）：L1 克制，L2 照常，L3 放到句间和句尾。
节拍段（开场、转场、揭示、结尾）：三层全放开。

### 4.1 用运行时接好三层动效

下面是完整、可编译的最小段落，不是成片构图模板。挂在 Film 根组件（FilmProvider 内），先生成本片 music/sfx。
`impactFrames` 省略时覆盖所有重音、hit 和 section；真实片按小节表给每个事件设计动作，不只是让所有主体同样放大。
代码同时保存在仓库的 `RhythmDirectionExample.tsx`，测试逐字比对并用 TypeScript 编译本段。

```tsx
import { AbsoluteFill, useVideoConfig } from "remotion";
import {
  barCameraShots,
  FilmCaptions,
  FilmSoundEffects,
  FilmSoundtrack,
  ProducerWorldCamera,
  resolveBreathScale,
  useBarCamera,
  useBeatPulse,
  useFilmTiming,
  useImpact,
  useNarrationActive,
  type BarCameraShot,
} from "@axmorf/studio/remotion";

/** Mount at Film root, inside FilmProvider. Supply this film's generated music/sfx. */
export const RhythmDirectionExample = ({
  impactFrames,
}: { readonly impactFrames?: readonly number[] } = {}) => {
  const { width, height } = useVideoConfig();
  const { music } = useFilmTiming();
  const pulse = useBeatPulse();
  const narrating = useNarrationActive();
  const bars = music?.barFrames ?? [];
  const shots: readonly BarCameraShot[] = Array.from(
    { length: bars.length + 1 },
    (_, i) => ({
      center: [width * (0.5 + (i % 3)), height / 2],
      zoom: 1 + (i % 2) * 0.15,
    }),
  );
  const camera = useBarCamera(shots);
  const accents = [
    ...new Set([
      ...(music?.accentFrames ?? []),
      ...(music?.sectionFrames ?? []),
      ...(music?.onsets?.hits ?? []),
      ...(music?.onsets?.sections ?? []),
    ]),
  ].sort((a, b) => a - b);
  const impact = useImpact(impactFrames ?? accents);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020" }}>
      <ProducerWorldCamera
        width={width}
        height={height}
        worldWidth={width * 3}
        worldHeight={height}
        shots={barCameraShots(camera, shots[0])}
        frame={1}
        layers={[
          {
            depth: 1,
            content: (
              <AbsoluteFill
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-around",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: width * 0.6,
                      height: height * 0.6,
                      borderRadius: "50%",
                      border: "10px solid #7ee3d5",
                      opacity: 0.65 + 0.35 * pulse,
                      transform: `translateX(${impact.shake}px) scale(${resolveBreathScale(pulse, narrating) * impact.scale})`,
                    }}
                  />
                ))}
              </AbsoluteFill>
            ),
          },
        ]}
        overlay={
          <div style={{ color: "#f8fafc", fontSize: 64, padding: 80 }}>
            证据 → 机制 → 结果
          </div>
        }
      />
      <FilmSoundtrack />
      <FilmSoundEffects />
      <FilmCaptions />
    </AbsoluteFill>
  );
};
```

`lastAtOrBefore(frame, events)` 对升序数组二分查找，无过去事件返回 `-Infinity`。
`resolveBeatPulse(frame, events, { decayFrames: 8 })` 是无状态指数衰减（落点为 1，8 帧时为 exp(-3)，之后为 0）。
`useBeatPulse()` 默认 kick；旧 track 没有 onsets 时才回退 beatFrames，有 onsets 但 kick 为空就保持安静。
可选 events 为 `"beat"` / `"bar"` / `"accent"` / 升序帧数组；无配乐返回 0。
所有 hook 默认读当前帧；**在 Film 根调用，把结果传给场景**。如放在 Sequence 内，传 `{ frame: 根组件正片帧 }`，
不要把本地帧和正片绝对事件混用。数组必须升序；不要在渲染时扫描文件或读取音频分析服务。

### 4.2 L1 呼吸

`useNarrationActive()` 使用每句实测 `[startFrame, endFrame)`，句间停顿属于节拍段。
`resolveBreathScale(pulse, narrating)` 在讲述段用 1.2%，节拍段用 3.5%，分别位于 1–2% / 3–5% 范围内。
默认 8 帧衰减，按内容用 6–10 帧。只给背景、环境光、主体的次级部件用；**正在阅读的文字不呼吸**。
需要纯函数时用 `resolveNarrationActive(frame, sentences)`。

### 4.3 L2 节拍：镜头一小节走一步

镜头不要匀速漂。`useBarCamera(shots)` 在每个小节起点从 shots[i] 用 spring 走向 shots[i+1]，然后稳住。
默认 damping 18、stiffness 120，可通过第二参数的 config 覆盖；镜头进度限制为 0..1，避免越出世界/zoom 边界。
shots 用真实世界像素 `{ center: [x, y], zoom }`，少于小节数时停在最后机位；没有小节时停在首机位。
最后机位之后没有 L2，必须另排元素入场、标签切换或数据推进，不能拿耗尽的镜头计划冒充变化。

纯函数 `resolveBarCamera(frame, { bars, shots, fps, config })` 返回 `{ center, zoom }`。
`ProducerWorldCamera` 接收的是 shots，不接收 x/y：用 `barCameraShots(camera, shots[0])` 转换，并传 `frame={1}`；
首机位作为固定视差锚点，不能每帧重置。它不直接适配 `CameraMove`（后者要求 preset、startFrame、durationInFrames）；
选择 CameraMove 配方时按其 resolver 的 land 对齐重音，不能把 camera state 展开成配方 props。
新元素在小节起点错峰 2–3 帧；每小节仍必须有一件可见的事。

### 4.4 L3 重音：预备 → 冲击 → 回弹 → 稳住

`useImpact(at)` / `resolveImpact(frame, at, fps, { preFrames: 6 })` 返回 `{ pre, hit, scale, shake }`。
at 是重音帧或升序帧数组：下一落点前 6 帧开始蓄力并优先于上一回弹，落点前 hit 恒为 0；
落点帧 spring 从 0 开始（damping 11、stiffness 260、mass 0.6），之后过冲并回弹到 1。
scale 在预备时从 1 后缩，落点为 0.96，再按 `0.96 + 0.04 * hit` 回弹；不要把 hit 当作“已落地”的布尔值。
shake 只在落点后的 `[at, at+6)` 出现，用 Remotion 的有种子 random，幅度为衰减中的 ±7px；空事件不动。
这就是冲击包络，主体轨迹、碎裂和重组仍由你设计。

- **落点帧 = 音乐重音帧，误差 0 帧。** 预备动作提前开始，不能在重音那一帧才入场。
- 公理形变（AxiomMorph）的碎裂落在 hook 的第一个重音，重组落在 drop。读 [横屏示例](examples.md#横屏19201080旧公理文字形变)，
  在每小节表标明对应句子、旧/新文字、出现/碎裂/重组/阅读帧，按 resolver 校准，不能只把两个标题淡入。
- 闪白或光斑最多 3–4 帧，透明度 ≤ 0.6，只给最大的那一两个揭示用。
- hook 上报完整 impact 和 bar camera 计划供审片使用；配方继续上报 anticipate/move/land/settle。
  手写 transform 没有自动可识别的动作事件，相关规则可能为 unknown，必须看实际画面。

## 5. 动作手艺

- **快进快出，停住阅读。** 主动作 8–20 帧完成（30 fps），然后稳住给观众读。不要用 40 帧的缓慢滑入加慢漂，那就是幻灯片。
- **曲线**：入场用 spring（damping 12–18），离场用 ease-in 加速，不用线性插值。
- **一个镜头一个主动作。** 同时只能有一个东西在抢眼，其他元素做次级运动。
- **错峰**：一组元素间隔 2–3 帧依次出现，不要一起淡入。
- **运动模糊**只加在快速位移（甩镜、碎片飞散）上，限制采样数。
- **文字**：关键词出现在旁白念到它的那一句里；正在读的字不晃、不呼吸、不被前景挡。
- **空容器不等待**：容器和内容一起出现，或 0.3 秒内开始出内容。

## 6. 音效：从画面派生

1. 先列画面上所有 L3 和重要 L2 动作，每个动作决定一个音效：
   碎裂 → 低频 impact 加碎片 tick；数字落定 → thud 加短 click；镜头甩动 → whoosh；纸张或卡片 → paper；结果确认 → chime。
2. **音效长度 = 动作长度**：riser 从预备开始，到落点结束；whoosh 覆盖整段甩动。
3. 音效落在网格上，和配乐同调（`sound.effects` 的参数跟随 score 的调性）。
4. 密度：讲述段每小节最多 1 个，节拍段可以每拍都有，但要避开旁白的重音字。
5. 没有画面动作的声音不加；没有声音的大动作要么补音效，要么说明理由。

## 7. 混音

- 旁白 -16 LUFS 左右；配乐加音效的底层在讲述段比旁白低 12–15 LU，节拍段可以回到低 6–8 LU。
- 讲述段底层若比旁白低到超过 18 LU，观众就听不出有配乐了（P7 的 B 版就是这样）。
- 合成配乐起点推荐显式写 `volume: 0.24`、`underSpeechVolume: 0.145`；上一轮 .09 实测余量 18.6 LU，.145 为 14.9 LU。
  这是本片起点，不是声学保证：配乐与音效叠加后实测并听审。旧片 schema 的隐式默认不变。
- 揭示前的抽空要真的安静；drop 之后 1–2 小节是全片最满的地方。
- 结尾不淡出循环，让和声在问题说完的那一拍落定。

## 8. storyboard.md 写法

按小节写，每行一个小节（帧来自 film:music，全部计正片，句子 id 来自实测旁白；无旁白写“无”）：

```
| 小节 | 帧 | 段落 | 旁白句 | L2 构图变化 | L3 重音事件 | 音效 |
| 1 | 0–68 | hook | axiom | 旧公理压满画面 | f34 accent：裂缝出现 | impact-low |
| 2 | 68–136 | hook | axiom→lab | 碎裂 | f102 drop：碎成字块 | shatter + tick×6 |
| 3 | 136–204 | verse | lab | 镜头推到研究室 | — | paper（账单落桌） |
```

表前写规格、正片总帧、主张；表后按章节补世界关系、前中后景、文字安静区、镜头起止/中心/尺度、
配方 anticipate/move/land/settle、跨章转场种类/窗口/动机、音效动作/声音起止与 anchor、许可、留白和收尾。
不另维护按句分页的分镜模板。审片和验收都对照这份表。改片时同步改表。

## 9. 自检（看 animatic 时逐条回答，写帧号）

1. 静音看一遍：能不能只看画面就感觉到拍子？看不出来就是 L1、L2 太弱。
2. 每个小节都有一件事发生吗？列出没有的小节。
3. 每个 `accentFrames` 和 `hits` 都有大动作吗？大动作的落点和重音差几帧？
4. 有没有没声音的大动作、没画面的声音？
5. 能量曲线：hook 高 → 证据中 → 揭示前收 → 揭示爆 → 结尾落，哪一段平了？
6. 挑 3 个重音，取前后各 0.5 秒、每 0.1 秒一帧的序列，看预备、冲击、回弹是否完整。
7. 讲述段旁白是否始终听得清？

### 9.1 构图、可读性与审片报告

运行 `film:review` 后打开联系表和单帧。每轮都逐条回答，并写出支撑结论的帧号（例如“2：f402 俯视芯片、
f474 侧视机柜，构图不同”）；答不出帧号就当作“否”。“否”的项改完再审：

1. 缩小到手机尺寸，半秒内能认出主体，且主体占画面主要部分。
2. 相邻段落以及结尾几句的关键画面构图明显不同，而不是同一布局换文字（结尾逐句写帧号）；没有出现“每段顶部标题 + 居中物体 + 底部字幕”的固定版式。
3. 不算字幕时画面上最多一个短标题和 3 个贴在物体上的短标注，且不重复字幕；`readabilityWarnings` 中字号过小、文字越界的提示
   为空，或每条都有明确理由。
4. 停留之外，相隔 2 秒的两帧能看出主体或镜头的变化；`stillWarnings` 为空，或每条都有明确理由。
   结尾也算：最后一句说完后的画面同样需要按节拍的次级运动，不要整段定格。
5. 主体有体积、材质和细节，不是图标、方框、问号或几条线。
6. 环境铺满画面，没有大块没设计的底色或居中方框。
7. 字幕不遮挡关键内容，`readabilityWarnings` 中被字幕遮挡的提示为空，或每条都有明确理由；画面文字与背景对比清楚
   （对比度仍需看图判断）。
8. 有配乐时，L3 揭示落点与音乐重音严格同帧（0 帧误差），L2 按小节安排。
9. 封面两种尺寸都有清楚的主体和大标题，不是正片某帧的简单缩放。
10. 节拍段（没有旁白的时段）没有反复回到同一个画面；`repetitionWarnings` 为空，或每条都有明确理由。
11. 静音测试：关掉声音只看联系表和单帧，每段的机制都能看懂；旁白里的数字都以可见的数量出现（写出帧号）。
12. 镜头不只有推拉：每章至少一次平移、跟拍或换位，写出起止帧和移动方向。
13. 字幕在手机上清楚：没有为排成一行缩小字号；`readabilityWarnings` 里没有 `small-caption`。

14. 对照 `storyboard.md`：章节、句子 id/帧、世界关系、镜头路径、配方、转场、音效是否一致？改片后计划是否同步？
15. 播放 `review/animatic.mp4`：节奏有起伏，碎裂、到达和重组听得见，音效不淹没旁白；结尾自然收音。
16. 旧公理和新公理候选是不是用 `AxiomMorph` 形变呈现的？逐句写出旧/新文字、形变和落定帧号。
17. 卡片、纸张、面板与内容是否一起出现，或约 0.3 秒内开始出内容？写出出现帧，没有空容器等待超过约 0.5 秒。
18. 前景没有压住正在阅读的文字；逐条回应 `text-under-foreground` 并写帧号，unknown 的命中测量逐帧看图核对。
19. 每条音效对应一个可见动作，音长与动作时长一致；写出动作/声音起止帧、主要落点与 onset/accent 的帧号和差值。
20. 内容状态标识统一用 `FilmStatusTag`，不手写；同时核对 `small-status-tag`，主词和副词不低于字幕字号的 70%
    且不低于 `minimumReadableFontSize`，手机上清楚、底板与文字对比足够，逐条写帧号。提示只用于审片，不拦交付。

逐条回应 `film:review` 的 `motionWarnings`，为空或记录规则、时段、修改及再审证据；有意保留要给内容理由：

| 规则                   | 应检查和回应什么                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `enter-then-hold`      | 是否只有前段滑入、后段长停？让动作继续推进因果，或说明这段阅读停留的必要性。                       |
| `hard-cut-heavy`       | 跨章是否大多硬切？按空间/语义选覆盖式或匹配转场；强对照硬切须说明动机。                            |
| `no-sound-effects`     | 核对音效计划、素材许可及实际声音；补关键动作 cue，或说明有意无音效。                               |
| `off-beat-cuts`        | 核对跨章切点与配方 land 到重音的距离；在语义允许的网格落点改动作，不挪旁白字幕；L3 保持 0 帧误差。 |
| `static-camera`        | 核对每章的平移/跟拍/换位与帧号；手写镜头或有意固定机位给出证据。                                   |
| `repeated-composition` | 对照非相邻段落的中点帧，包含有旁白的段落和结尾；改重复构图或写出内容理由，无场景轨时为 unknown。   |

提示不是美学评分或交付门禁。`motion` 中的 `unknown` 表示测量无法判断，需看实际画面，
不能当作通过。联系表只验证构图；成片前至少看一次带声音 animatic，改节奏后重看。在报告中区分看图、播放、实际听审，
如实记录没有验证的项目；所有提示都不替代 `film:check`。

新增同步提示只用精确遥测，容差 ±2 帧仅为审片诊断，不能替代 L3 的 0 帧要求：

| 规则                    | 回应                                                   |
| ----------------------- | ------------------------------------------------------ |
| `accent-without-visual` | accent/hit/section 缺大动作，逐帧核对并补齐。          |
| `visual-without-sound`  | impact/配方 land 缺音效，补声或说明有意无声。          |
| `sound-without-visual`  | 音效 anchor 缺画面事件，去掉孤立声音或补清楚可见动作。 |
| `bar-without-change`    | 小节内缺 L2+，讲述段与节拍段都必须有构图变化。         |

统计在 `motion.summary.rhythmSync`；缺配乐、遥测、音效记录或采样截断时对应项为 null / unknown，不能当作通过。
新规则已用 MusicSyncGallery 配乐事件表做正反校准；未识别的手写动作仍要人工审片。

## 10. 反模式（看到就改）

- 每句旁白一页，在句子起点硬切。
- `ease(f/40)` 滑入后线性慢漂，整片同一种动作。
- 镜头匀速漂移，和小节无关。
- 动作落点离重音好几帧，或在重音那帧才开始入场。
- 音效没有对应的画面动作；大动作没有声音。
- 整片同一个能量，没有收也没有爆。
- 空容器停半秒以上才出内容；正在读的字被前景挡住。
