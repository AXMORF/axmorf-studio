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
3. 用默认 `studio-v3` 运行 `film:music`：拿到 `beatFrames`、`barFrames`、`sectionFrames`、`accentFrames` 和 `onsets`（kick/snare/clap/hat/bass/hits/sections 为帧数组，v3 另有 fills/breaks 区间和带强度的 accents）。
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
节拍段（开场、揭示前后、章节转场、结尾）：三层全放开，**L1、L2 的幅度都必须高于讲述段**。
讲述段可以停住阅读，节拍段不能整段停住；揭示前的短 break 可以抽空蓄力，随后必须在重音上释放。
结尾可以比 drop 收敛，但没有旁白时仍要比讲述段更动，不能用整段定格代替收尾。

### 4.1 用运行时接好三层动效

下面是完整、可编译的最小段落，不是成片构图模板。挂在 Film 根组件（FilmProvider 内），先生成本片 music/sfx。
`impactFrames` 省略时覆盖所有重音、hit 和 section；真实片按小节表给每个事件设计动作，不只是让所有主体同样放大。
代码同时保存在仓库的 `RhythmDirectionExample.tsx`，测试逐字比对并用 TypeScript 编译本段。

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  barCameraShots,
  FilmCaptions,
  FilmSoundEffects,
  FilmSoundtrack,
  lastAtOrBefore,
  ProducerWorldCamera,
  resolveBreathScale,
  resolveImpactLevel,
  resolveNarrationActive,
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
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { music, sentences } = useFilmTiming();
  const pulse = useBeatPulse({ decayFrames: 10 });
  const narrating = useNarrationActive();
  const bars = music?.barFrames ?? [];
  const shots: readonly BarCameraShot[] = Array.from(
    { length: bars.length + 1 },
    (_, i) => {
      // Fix each step's amplitude at its bar start; speech edges must not jump the camera.
      const speaking = resolveNarrationActive(
        bars[Math.max(0, i - 1)] ?? 0,
        sentences,
      );
      return {
        center: [
          width * (0.5 + (i % 3) * (speaking ? 0.04 : 0.12)),
          height / 2,
        ],
        zoom: 1 + (i % 2) * (speaking ? 0.025 : 0.07),
      };
    },
  );
  const camera = useBarCamera(shots);
  const accents = (
    impactFrames ??
    [
      ...new Set([
        ...(music?.accentFrames ?? []),
        ...(music?.sectionFrames ?? []),
        ...(music?.onsets?.hits ?? []),
        ...(music?.onsets?.sections ?? []),
      ]),
    ].sort((a, b) => a - b)
  ).map((at) => ({
    frame: at,
    strength:
      music?.onsets?.accents?.find((a) => a.frame === at)?.strength ?? 1,
  }));
  // Start eight frames early: the first ramp sample is zero, leaving seven visible steps.
  const impact = useImpact(accents, { preFrames: 8 });
  const level = resolveImpactLevel(impact.strength);
  const nextAt = accents.find((a) => a.frame > frame)?.frame ?? Infinity;
  const anticipating = nextAt - frame <= 8;
  const elapsed =
    frame -
    (anticipating
      ? nextAt
      : lastAtOrBefore(
          frame,
          accents.map((a) => a.frame),
        ));
  // An exact-frame strike with a 12-frame release, independent of the spring's settled value.
  const strike = elapsed >= 0 && elapsed < 12 ? 1 - elapsed / 12 : 0;
  const flash =
    elapsed >= 0 && elapsed < 4 ? (1 - elapsed / 4) * level.flashOpacity : 0;
  const anticipation =
    anticipating && impact.strength > 0 ? impact.pre / impact.strength : 0;
  const shake =
    impact.strength > 0
      ? (impact.shake / (7 * impact.strength)) * level.shakePixels
      : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `translate(${shake}px,${shake * 0.6}px) scale(${1 + level.cameraImpulse * (strike - anticipation * 0.5)})`,
        }}
      >
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
                        background:
                          "radial-gradient(circle at 35% 30%, #427d88, #102338 70%)",
                        opacity: 0.65 + 0.35 * pulse,
                        // L3 deforms the subject as well as overshooting its scale; reading text stays still.
                        transform: `translateX(${-width * level.cameraImpulse * 1.5 * anticipation}px) scale(${resolveBreathScale(pulse, narrating) * (1 + (level.subjectScale - 1) * (strike - anticipation))}) scaleX(${1 + (level.subjectScale - 1) * strike}) scaleY(${1 - (level.subjectScale - 1) * strike})`,
                      }}
                    />
                  ))}
                </AbsoluteFill>
              ),
            },
          ]}
        />
        {Array.from({ length: level.particleCount }, (_, i) => {
          const angle = (i / level.particleCount) * Math.PI * 2;
          const radius = (1 - strike) * width * 0.45;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: width / 2,
                top: height / 2,
                width: 12,
                height: 12,
                backgroundColor: "#7ee3d5",
                opacity: strike,
                transform: `translate(${Math.cos(angle) * radius}px,${Math.sin(angle) * radius}px) rotate(${i * 31}deg)`,
              }}
            />
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundColor: "white",
          opacity: flash,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          color: "#f8fafc",
          fontSize: 64,
          padding: 80,
        }}
      >
        证据 → 机制 → 结果
      </div>
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
可选 events 为 `"beat"` / `"bar"` / `"accent"` / `"fill"` / `"break"` / 升序帧数组；fill/break 读区间起点。无配乐返回 0。
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

`useImpact(at)` 可直接接收 `music.onsets.accents`（按 strength 缩放包络），旧帧数组继续兼容。
`useImpact(at)` / `resolveImpact(frame, at, fps, { preFrames: 6 })` 返回 `{ strength, pre, hit, scale, shake }`。
`strength` 是当前窗口选中的重音强度，下一落点的蓄力优先；旧帧数组或无事件时默认 1。
**每个 L3 都必须按 strength 分档**，用 `resolveImpactLevel(strength)` 取得建议幅度：

| strength          | 镜头 zoom 冲击增量 | 主体峰值缩放 | shake 峰值 | 可选闪光透明度 | 粒子数 |
| ----------------- | ------------------ | ------------ | ---------- | -------------- | ------ |
| < 0.5 轻重音      | 0.02               | 1.03         | 3px        | 0              | 6      |
| 0.5–<0.9 段落重音 | 0.05               | 1.06         | 8px        | 0              | 18     |
| ≥ 0.9 drop / 揭示 | 0.12               | 1.12         | 16px       | 0.5            | 40     |

结尾 `ending.cadence: "resolve"` 的 accent 固定为 strength 0.6，属于段落档：去掉鼓、落定、收住，不按最强重音的冲击与预备要求处理。
这只改变事件强度，不改变合成音频；`cut` / `ring` 不自动生成结尾 accent，显式 hits 仍使用各自的 intensity。

这些是幅度预设，不是自动动作；`subjectScale` 为峰值倍率，`cameraImpulse` 为 zoom 增量，`shakePixels` 为峰值像素。
`strength ≥ 0.9` 的重音必须是全片画面变化最大的时刻：主体过冲至少 8%、shake 12–20px，
**至少包含主体形变、碎裂、数字落定之一，再加镜头冲击**，不能只做缩放加微抖。
转场不能比最强重音更抢眼，除非转场本身落在最强重音上。
**strength ≥0.9 的重音之前，必须有至少 6 帧可见的预备动作**：蓄力、后缩、数字可见地滚动、碎片聚拢等。
配方的过程不能被遮挡或藏起来，只露出终值；“代码里提前开始”不等于画面里看得见。
例如金额揭示不能让 NumberRoll 在隐藏层滚完，直到重音才切出最终金额。
上例显式用 `preFrames: 8` 留出至少 6 帧可见后移/收缩；旧默认 6 只描述包络，不自动保证预备足够可见。
上例用 strength 选档，12 帧释放的冲击包络与主体形变、粒子一起落在重音帧，闪光只持续 4 帧。
不要把最终停在 strength 的 `hit` 直接当作持续冲击量，也不要再把预设乘一次 strength 导致重复衰减。
以下旧包络保留兼容；仅接旧 `scale` / `shake` 不足以完成强重音：
以下包络数值以 strength=1 为准；加权事件的 hit 回弹到 strength，scale 仍回到 1。
at 是重音帧或升序帧数组：下一落点前 6 帧开始蓄力并优先于上一回弹，落点前 hit 恒为 0；
落点帧 spring 从 0 开始（damping 11、stiffness 260、mass 0.6），之后过冲并回弹到 1。
scale 在预备时从 1 后缩，落点为 0.96，再按 `0.96 + 0.04 * hit` 回弹；不要把 hit 当作“已落地”的布尔值。
shake 只在落点后的 `[at, at+6)` 出现，用 Remotion 的有种子 random，幅度为衰减中的 ±7px；空事件不动。
这就是冲击包络，主体轨迹、碎裂和重组仍由你设计。

- **落点帧 = 音乐重音帧，误差 0 帧。** 预备动作提前开始，不能在重音那一帧才入场。
- **旁白有旧公理或新公理候选时，必须用 AxiomMorph**，这是账号母题；没有就说明理由。公理形变的碎裂落在 hook 的第一个重音，重组落在 drop。读 [横屏示例](examples.md#横屏19201080旧公理文字形变)，
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
- `studio-v3` 推荐显式写 `volume: 0.64`、`underSpeechVolume: 0.34`。30 秒教学谱加现有 -16 LUFS 旁白及三条原创音效实测：
  讲述底层 -30.0 LUFS（低 14.0 LU），开场 -23.1、收尾 -23.9 LUFS（低 7.1/7.9 LU），混音 -3.6 dBTP。
  音效 intensity 用 .18–.30；这是本片起点，不是任意谱的声学保证，配乐与音效叠加后仍须实测并听审。
  v3 保留原 PCM 起音，用测量后的线性增益留出 true-peak 余量，不用会预振铃的二次重采样；旁白仅在 FilmSoundtrack 逐句 duck 一次。
  v2 继续兼容且输出不变；旧片 schema 的隐式 .24/.09 和先前 v2 显式 .24/.145 均不自动迁移。
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
6. **每个 strength ≥0.9 重音都必须逐张看 `motion["strong-accent-strip"]` 的连续小图**，确认至少 6 帧预备清楚可见、数字或文字变化过程看得见，而不是终值直接切出来；在 `review-notes.md` 按帧号记录结论、小图路径和需修改的地方。不能只凭像素预备或 p99 通过就跳过人工审片。
7. 讲述段旁白是否始终听得清？
8. 静音看最强的 3 个重音（按 strength 选择并写帧号）：它们是不是全片最大的动作？有没有普通转场盖过它们？
9. 节拍段是不是比讲述段更动？分别写出开场、揭示前后、章节转场、结尾的 L1/L2 幅度与帧号，不能只回答落点对齐。

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
   （局部低对比提示与最终手机观感都要核对）。
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

21. **逐张看所有强重音连续小图，不能只看最强 3 个**。对照每格帧号检查预备、数字/文字过程可见性、落定与回弹；
    `review-notes.md` 至少记录重音帧、小图路径、可见预备帧、变化过程是否被隐藏、结论和修改。没有提示也必须检查。

22. 文字不要横跨明暗交界，深色字不要放在深色背景上；逐条回应 `low-contrast-text`，写出帧号、最差网格位置与对比度。
    有底板、描边或阴影也要看实际像素；转场窗口和同组形变不免检，unknown 不算通过。

逐条回应 `film:review` 的 `motionWarnings`，为空或记录规则、时段、修改及再审证据；有意保留要给内容理由：

| 规则                   | 应检查和回应什么                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `enter-then-hold`      | 是否只有前段滑入、后段长停？让动作继续推进因果，或说明这段阅读停留的必要性。                       |
| `hard-cut-heavy`       | 跨章是否大多硬切？按空间/语义选覆盖式或匹配转场；强对照硬切须说明动机。                            |
| `no-sound-effects`     | 核对音效计划、素材许可及实际声音；补关键动作 cue，或说明有意无音效。                               |
| `off-beat-cuts`        | 核对跨章切点与配方 land 到重音的距离；在语义允许的网格落点改动作，不挪旁白字幕；L3 保持 0 帧误差。 |
| `static-camera`        | 核对每章的平移/跟拍/换位与帧号；手写镜头或有意固定机位给出证据。                                   |
| `repeated-composition` | 对照非相邻段落的中点帧，包含有旁白的段落和结尾；改重复构图或写出内容理由，无场景轨时为 unknown。   |

`text-under-foreground` 按浏览器真实绘制顺序判断 SVG 图形和 HTML 元素，审片时同步临时启用 pointer-events 命中并在截图前恢复，
不因 `pointer-events:none` 忽略绘制内容。文字矩形用 20×7 密集采样，任何确认的前景命中都提示；其他点 unknown 不抵消已确认命中。
同一文字组件的字形互遮不报，AxiomMorph 被 clip-path 裁掉的区域不当作可见文字；不同组件仍可互相遮挡。
FilmSceneTrack 的 overlay/overlap 时段照常检测，message 标注「转场窗口内」及对应正片帧号，供人工判断。
主体在文字后方的构图重叠不属于本规则；局部背景对比度另由 `low-contrast-text` 提示，文字与主体争抢仍须看图检查。
`low-contrast-text` 用审片已有帧图的 4×2 网格估计实际背景亮度，排除近文字色像素后逐格计算 WCAG 对比度，
任一格低于 3:1 就提示；若剩余背景不足 20%，保留近文字色区域作为低对比证据，避免少量亮边掩盖同色背景。
message 列出文字、正片帧、最差网格的位置与比值，并标注转场窗口及同组形变；不因底板、描边、阴影跳过。
采样不足、颜色或像素不可用时保留 `readability.unknown`；耗时见 `readability.contrast.analysisMs`。这是局部估计而非完整可读性判定，仍须人工看图。

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

另有基于连续全帧的力度提示：

| 规则                   | 回应                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accent-underplayed`   | strength ≥0.9 的重音若在 [f-8,f-1] 不足 6 帧能量严格高于全片中位数 2 倍，报“缺预备”；[f-1,f+3] 峰值低于 p99 报“冲击不够”。核对主体可见性、动作与镜头冲击。 |
| `beat-sections-static` | 非旁白段运动能量中位数不高于讲述段；提高节拍段 L1/L2，给出再审帧号。                                                                                       |

`motion.summary.motionEnergy` 给出全片中位数、预备阈值、p99（冲击判据）、p95（仅供历史对照）、各强重音峰值与合格预备帧数、讲述/节拍段中位数；`motion.energy.json` 指向逐帧数据。
分析解码 fresh animatic 的全部正片帧，缩到 160×90 灰度，以相邻帧亮度差均值计能量；片头片尾不计入。
复用 Workspace 的 FFmpeg，以无损灰度 PNG 逐张读取，单次解码上限 120 秒；不拿 0.5 秒稀疏采样冒充全帧。
没有 animatic、已过期或不完整时两项为 unknown；没有带强度的重音时前一项 unknown，没有讲述段或没有节拍段时后一项 unknown。
冲击阈值是全片线性插值 p99，包含转场，要求强重音进入全片最大动作之列；p95 仅留作历史对照，不再用于判定。
预备像素条件只检查整帧运动，能抓住整帧静止或预备能量过低；背景、其他物体、镜头在动时，即使配方本身被藏起来也可能通过，
不能把统计通过写成“主体过程可见”。**配方过程是否被隐藏改为逐张人工检查**。
`motion["strong-accent-strip"]` 为每个 strength ≥0.9 重音返回 `{frame, strength, frames, image, message}`。
每张联系表覆盖正片 [f-8,f+4] 的逐帧图片，标明帧号，边界处截到正片，不借用片头片尾；未报提示的强重音也会导出。
它复用现有 review 渲染和联系表，独立于 0.5 秒稀疏采样，无 animatic 时仍从当前片源渲染；缺强度元数据时数组为空，能量规则仍 unknown。
打开每个 `image`，按本节硬要求在 `review-notes.md` 逐个写结论，检查的是完整过程，不能只看到终值。
提示只辅助审片，不拦交付；仍需静音看最强动作，并看实际节拍段是否更动。

`axiom-morph-missing` 在全片完整遥测中完全没有 AxiomMorph 时只提醒一次：
“账号母题：旁白有旧公理或新公理候选时用 AxiomMorph；没有就说明理由”。
任一时段有 AxiomMorph 遥测就不提醒，不按旁白关键词猜测；遥测缺失/截断且没见到 AxiomMorph 时为 unknown。
这只是软提醒，不削弱上面的必须规则，不拦交付。

同步统计在 `motion.summary.rhythmSync`；缺配乐、遥测、音效记录或采样截断时对应项为 null / unknown，不能当作通过。
新规则已用 MusicSyncGallery 配乐事件表做正反校准；未识别的手写动作仍要人工审片。

## 10. 反模式（看到就改）

- 每句旁白一页，在句子起点硬切。
- `ease(f/40)` 滑入后线性慢漂，整片同一种动作。
- 镜头匀速漂移，和小节无关。
- 动作落点离重音好几帧，或在重音那帧才开始入场。
- 音效没有对应的画面动作；大动作没有声音。
- 整片同一个能量，没有收也没有爆。
- 空容器停半秒以上才出内容；正在读的字被前景挡住。
