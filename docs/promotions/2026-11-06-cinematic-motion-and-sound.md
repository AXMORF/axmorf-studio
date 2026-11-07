# 镜头、转场与声音：让 Agent 做出的片子不再像幻灯片

> 文档类型：实施计划
>
> 状态：已批准（2026-11-06，commander 审定，补充意见已写入第 4.3、4.4、5、6、7、8 节），实施中。按第 6 节分批实施；完成并记入 [ITERATION_STATUS.md](../ITERATION_STATUS.md) 后移入
> `docs/archive/implementation-plans/` 并补归档说明。
>
> 对应 [ROADMAP.md](../ROADMAP.md) “下一步候选”第一项（把镜头与连续空间做成 Skill 内的示范），并扩展到转场、镜头配方、音效与审片提示。

## 1. 为什么改

### 1.1 证据

今天的日常片 `ai-small-lab-training-cost-20261106`（1920×1080，30 fps，25 句旁白）的 `Film.tsx` 只有 24 行：

- 17 个镜头对应 17 句旁白，每个镜头在句子的 `startFrame` 处硬切；
- 每个镜头的动作都是 `ease(f/40)` 滑入，然后线性慢漂，也就是“入场动画 + 停留”；
- 全片没有音效，切点没有对齐 beat/accent，没用任何 `Producer*` 镜头组件；
- 用 ffmpeg 检测场景切换，平均 4.5 秒一次，看起来仍像幻灯片。可见切得勤不等于有动态。

对 ai Workspace 的 145 部片做 `grep` 统计（2026-11-06，按片目录去重）：

| 能力                                    | 使用的片数 |
| --------------------------------------- | ---------- |
| `TransitionSeries`                      | 0          |
| `@remotion/motion-blur` / `light-leaks` | 0 / 0      |
| `@remotion/three`                       | 0          |
| `ProducerBeatCamera` / `ProducerWhipIn` | 0 / 0      |
| `ProducerWorldCamera`                   | 3          |
| 共享音效 `sound-effects/`               | 3          |

运行时已经有这些能力：`@remotion/transitions` 4.0.489 自带 fade、slide、wipe、flip、clock-wipe、iris 类、dissolve、
zoom-blur、linear-blur、cross-zoom、crosswarp、ripple、film-burn 等 presentation；包里有 25 个已登记许可的共享音效、
`snapProducerFrameToBeat`、`ProducerWorldCamera`、`ProducerBeatCamera`、`ProducerWhipIn`。

### 1.2 根因

1. **没有合用的工具。** 音效只能手写 `<Sequence><Audio/></Sequence>`；转场要自己把 `TransitionSeries` 和按旁白实测出来的绝对帧对齐，
   它的重叠帧还会缩短总时长，和“总长由旁白决定”冲突。最省事的写法就成了“按句硬切 + 入场动画”。
2. **Skill 没有把 Agent 引过去。** `craft.md` 讲了原则（连续世界、有动机的转场、动作分层），但给不出能直接组合的镜头手法；
   `api.md` 只用一行提到 `TransitionSeries`；流程里没有“音效计划”和“先看节奏”这两步；三个示例都是 1080×1920 竖屏，
   而账号实际产出的是 1920×1080 横屏。
3. **审片看不出问题。** `stillWarnings` 只抓“2 秒以上几乎没变”，抓不到“滑入后静止”、硬切比例、0 个音效、切点不在拍上这类问题；
   联系表只能看构图，看不出节奏。

## 2. 目标与非目标

**目标**：Agent 按 Skill 正常做片，就能自然用上有动机的转场、可复用的镜头配方和对齐画面的音效；审片能指出“像幻灯片”的具体时段，
并给出连续的低清预览，供人看节奏。

**非目标**（不在本批）：

- 不把新指标做成交付门禁。按 ROADMAP“不引入”，所有新指标只作为审片提示，不拦 `film:check`/`film:deliver`。
- 不改确定性渲染、离线渲染、旁白实测时序、字幕规则、交付四件套等硬规则，不降低现有检查。
- 不做 Lottie、3D 场景或 AI 视频生成。配方第一批只用 SVG/DOM + Remotion frame API。
- 不迁移、不批量改写已有的 145 部片。新 API 只做增量，旧片照常编译。

## 3. 设计：运行时（`@axmorf/studio/remotion`）

全部是新增导出，现有导出的签名和行为不变。

### 3.1 场景轨 `FilmSceneTrack`

把场景按旁白句子编排，转场放在场景边界上，并保证“画面跟着旁白”的绝对帧不漂移。

```tsx
<FilmSceneTrack
  scenes={[
    {
      id: "axiom",
      from: "axiom",
      chapter: "hook",
      render: (f) => <Opening f={f} />,
    },
    {
      id: "lab",
      from: "lab",
      chapter: "evidence",
      render: (f) => <Laboratory f={f} />,
      enter: { kind: "match-scale", frames: 18 },
    },
    { id: "bill", from: "bill", render: (f) => <Bill f={f} /> }, // 同一章内：不写 enter，默认连续（硬接）
  ]}
/>
```

- `from` 是句子 id，也可以写绝对帧，对应 `sentence(id).startFrame`，这是该场景的**名义边界**。第一个场景从 0 开始，最后一个延续到正片结尾。
- `render(f)` 收到的是场景内的本地帧，含转场里提前出现的部分（为负数时从 0 起算，并写明语义），场景组件不用再自己算偏移。
- 转场分两类，统一挂在 `enter` 上：
  - **覆盖式**（`TransitionSeries.Overlay`）：不改变时间轴，以边界帧为中心叠加，包括 `light-leak`（@remotion/light-leaks）、
    `flash`、`whip-blur`（方向模糊甩切）、`mask-wipe`（SVG 形状遮罩擦除）。首选这一类，时序零风险。
  - **重叠式**（presentation）：两个场景同时渲染，包括 `fade`、`slide`、`wipe`、`iris`、`zoom-blur`、`linear-blur`、`cross-zoom`，
    以及自定义的 `match-scale`（上一场景的主体放大后成为下一场景，匹配剪辑）。重叠窗口居中放在名义边界上：`[B − ⌊d/2⌋, B + ⌈d/2⌉)`，
    由纯函数 `resolveFilmSceneTrack()` 反推每个 `TransitionSeries.Sequence` 的时长，让每个场景的绝对起点保持不变，正片总长不受影响。
- 校验（抛错，确定性）：边界必须递增；转场窗口不能重叠，也不能超过相邻场景各自时长的一半；窗口不能进入片头片尾，场景轨只在正片内。
- 字幕、`FilmSoundtrack`、片头片尾都在场景轨之外，不受转场影响。
- 每个转场可以带 `sfx`（默认按 kind 映射，扩展现有 `getProducerTransitionSfxRole`），交给 3.3 的音效轨统一放置。
- 章节规则写进 Skill（第 5 节）：同一 `chapter` 内默认不写 `enter`，靠镜头运动保持连续；跨章节才用有动机的转场。
  运行时不强制这条规则，审片会统计（4.3）。

### 3.2 镜头配方 `recipes`

新增 `capabilities/recipes/`。每个配方包含：

1. **实现**：一个组件，加一个纯函数 resolver（帧 → 状态），方便单测；
2. **元数据** `ProducerRecipeMeta`：`id`、`title`、`useWhen`、`avoidWhen`、建议时长、关键帧语义
   （`anticipate`/`move`/`land`/`settle`），以及**建议的音效落点** `sfxCues: [{ at: "land", role: "soft-impact" }]`；
3. **预览**：注册进现有 `compositions/capability-gallery`，让 `npm run compositions` 覆盖它，并能渲染 still 或短片供人看；
4. **配方卡**：Skill 里 `references/recipes.md` 的一节，写明何时用、典型参数、可直接组合的代码片段。

第一批按优先级排列：

| #   | 配方                  | 说明                                                                                                                                                                                                       |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `AxiomMorph` 文字形变 | 账号母题“旧公理 → 新公理”。拆成字形单元（用 `@remotion/layout-utils` 实测宽度定位），支持 assemble / scatter / shatter / reform；新旧文本共有的字移动到新位置，其余字碎裂或溶解，碎片轨迹用 `random(seed)` |
| 2   | `NumberRoll` 数字滚动 | 逐位滚动、落定时轻微过冲，支持千分位、单位和货币符号；落定帧就是 `land`                                                                                                                                    |
| 3   | `BarGrow` 柱条生长    | 生长 → 过冲 → 回弹 → 停稳，支持多柱错峰和基线刻度                                                                                                                                                          |
| 4   | `CameraMove` 镜头预设 | 基于 `ProducerWorldCamera` 的命名预设：push-in、pull-out、pan-along-path、reveal-pan、parallax-drift，曲线统一；可选 `@remotion/motion-blur`，仅用于快速运动并限制采样数以控制渲染成本                     |
| 5   | `ParticleField` 粒子  | 散开 / 聚合成形（目标形状取 SVG path 采样点），确定性随机                                                                                                                                                  |
| 6   | `ParallaxLayers` 视差 | 背 / 中 / 主 / 前景按深度移动，配合 4 使用；已有 `ProducerLayeredStage` 能覆盖的部分直接复用，不重复实现                                                                                                   |

借鉴 video-shotcraft 的卡片组织方式（说明 + 可运行实现 + 预览），以及 remotion-scenes、remocn 的具体技法。
默认**参考方法、自己实现**。确实需要直接拷代码时，保留原版权头，并更新 `THIRD_PARTY_NOTICES.md`（shotcraft 为 Apache-2.0，
remotion-scenes 与 remocn 为 MIT，GitHub Unwrapped 的代码为 MIT，但它的音乐不能用）。

### 3.3 声音：音效轨与段落手段

- **`FilmSoundEffects`**：数据化的音效轨。
  ```tsx
  <FilmSoundEffects
    cues={[
      {
        frame: morph.land,
        sfx: "soft-impact",
        snap: "accent",
        maxShiftFrames: 3,
        for: "旧公理碎裂落定",
      },
      { endFrame: reveal, sfx: "riser-short", for: "揭示前蓄势" }, // 以结束帧锚定，用于 riser
    ]}
  />
  ```
  `sfx` 是共享音效角色名或本片登记的素材，`snap` 取 `none`、`beat`、`bar`、`accent`、`section`，用 `snapProducerFrameToBeat`
  吸附，不会离开允许的窗口。`for` 写这个音效对应的可见动作，供审片清单引用。同一帧的重复音效合并；音量默认值和旁白下的压低系数写成常量。
- **配方和转场自动产出 cue**：`resolve*` 返回 `sfxCues`（帧 + 建议角色），Agent 可以直接展开传给音效轨，也可以有选择地取用。
- **段落手段**（扩展 `FilmSoundtrack`，新增 props，默认行为不变）：
  - `musicDips`：在指定区间把配乐压低到给定音量，实现揭示前的留白；
  - `ending`：结尾“收音”，让配乐淡出终点对齐最后一个重音，配一个可选的收尾音效。
- **新增音效素材**：riser、reverse swell、低频 impact、glitch tick、whip、shimmer。**优先用仓库现有的确定性合成器**
  （`scripts/films/score/synth-score`）离线生成，许可为项目自有，以 Apache-2.0 登记。合成效果不够、必须外采时，只用 CC0 并逐个登记来源。
  不下载许可不清楚的素材。
- 审片会统计音效（4.3）。音效数为 0 只是提示，不拦交付。

## 4. 设计：审片（`film:review`）

全部是提示，不拦交付，输出到 review JSON 的新字段 `motion` 和 `motionWarnings`。

### 4.1 运行时日志

review 组合在渲染时，用固定标记加单行 JSON，打印本片解析后的场景轨（边界、转场 kind、窗口）、音效 cue（解析后的帧、角色、`for`）、
用过的配方和镜头预设。做法沿用 2026-10-20 可读性测量那一套标记、schema 与日志通道，不新开机制。

### 4.2 低清连续采样

按固定间隔（默认每 0.5 秒）以 `scale 0.125` 渲染整片采样帧，复用现有 `readFrameSignature`，得到：

- **画面变化曲线**：每秒变化量，写入 `review/motion-curve.json`，并画成一张小图 `review/motion-curve.png`；
- **切点**：签名突变的位置，与 4.1 的边界互相核对。

### 4.3 提示规则

| rule               | 判定（阈值写成常量，按样片实测后再定，初值标注“待校准”）                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `enter-then-hold`  | 一个场景内，变化量集中在前约 20% 的时长，之后长时间接近零（与 `stillWarnings` 不重复报） |
| `hard-cut-heavy`   | 跨章节边界里硬切占比过高，或全片转场数为 0                                               |
| `no-sound-effects` | 有旁白、时长超过 30 秒，但 cue 数为 0                                                    |
| `off-beat-cuts`    | 有配乐时，节拍段的切点和配方 `land` 落在 beat/accent ±2 帧以内的比例过低                 |
| `static-camera`    | 某一章没有使用任何镜头预设、`ProducerWorldCamera` 或世界坐标移动                         |

统计来源与旧写法：`no-sound-effects` 和 `static-camera` 不能只看新 API 的日志。`no-sound-effects` 还要识别本片源码里手写的
`<Audio>`/`<Html5Audio>` 和引用 `sound-effects/` 的 `staticFile`；`static-camera` 只对用了 `FilmSceneTrack` 并标了章节的片做判定，
手写 transform 做镜头的旧写法无法可靠识别。判不准的一律标为 `unknown`，写进 `motion` 摘要，不作为警告报出，
避免误报已用过旧写法的片（ai Workspace 里有 3 部）。

被标记的时段会额外输出密集帧序列（默认 6 fps，单段最多 3 秒），写入 `review/dense/<rule>-<from>-<to>/`。

### 4.4 Animatic

`npm run film:review -- --film <id> --animatic`：用低分辨率（短边 360）、原帧率渲染整片带声音的连续预览 `review/animatic.mp4`，
用来看节奏和听音画配合。默认不渲染，因为成本较高；Skill 要求成片前至少看一次。它只是预览，不是交付物，不写入 `deliveries/`。
`film:deliver` 时如果本片 review 目录里没有 `animatic.mp4`（或它比当前源码旧），在输出里提醒一句，不拦交付。

## 5. 设计：Skill 与模板

Skill 根目录 `.agents/skills/axmorf-film/` 和模板 `packages/create-axmorf-studio/template/.agents/skills/axmorf-film/`
两处逐字保持一致，现有镜像检查继续生效。

- **`craft.md` 重写结构**：先讲“一个世界 + 镜头跟着因果走、章节之间才转场”，再讲章节怎么划分、每章的世界和镜头路径、
  跨章节用哪类转场；原来的“逐页幻灯片”反例、设计、审片清单保留并更新，审片清单增加 4.3 的提示项。
- **新增 `references/recipes.md`**：配方目录，每个配方一节，写何时用、参数、音效落点和代码片段，并链接 gallery 预览。
- **新增 `references/sound.md`**（或并入 `music.md`，实现时选一处，不重复）：怎么写音效计划，以及 cue、吸附、留白、收尾的用法。
- **`SKILL.md` 流程**：在“生成配乐”和“编写”之间加一步**分镜与音效计划**，写成文件 `src/films/<filmId>/storyboard.md`（章节、
  每章的世界与镜头路径、配方、转场、音效 cue，以及对应的句子 id 与帧号），并告知用户；审片和验收都按这份文件核对，
  修改片子时同步更新。在“看图迭代”之前加一步**先出 animatic 看节奏**（`--animatic`），节奏对了再精修画面。审片结论要回应 `motionWarnings`。
- **`api.md`**：补上 `FilmSceneTrack`、`FilmSoundEffects`、配方、`FilmSoundtrack` 新 props 的用法。
- **`examples.md`**：新增一个 1920×1080 横屏示例，内容就是“旧公理文字形变”：旧公理在一个世界里出现，被证据击碎，重组成新公理，
  镜头跟着碎片移动，碎裂和重组都有音效落点。现有三个竖屏示例保留，并标明是竖屏。

## 6. 分批与验收

| 批次 | 内容                                                                                                                                                                                                                                                                     | 验收                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1   | 3.1 场景轨；3.3 音效轨与段落手段；新音效素材                                                                                                                                                                                                                             | `resolveFilmSceneTrack` 与 cue 吸附的单测（边界、重叠、窗口冲突、片头片尾）；gallery 里的场景轨示例 still 和短片；`npm run check` 全绿                                                                                                                                                                             |
| P2   | 3.2 配方 1–3（AxiomMorph、NumberRoll、BarGrow）+ 4、5、6                                                                                                                                                                                                                 | 每个配方有 resolver 单测和 gallery 预览；同一帧渲染两次像素一致；`npm run compositions` 通过                                                                                                                                                                                                                       |
| P3   | 第 4 节审片提示与 animatic                                                                                                                                                                                                                                               | 纯函数单测；对今天旧片跑一次，应能报出 `enter-then-hold`、`no-sound-effects`、`hard-cut-heavy`，结果记入 ITERATION_STATUS；animatic 能正常播放且有声音                                                                                                                                                             |
| P4   | 第 5 节 Skill 与模板                                                                                                                                                                                                                                                     | 镜像检查通过；README、api、TERMINOLOGY、ARCHITECTURE 同步；旧权威 grep 无残留                                                                                                                                                                                                                                      |
| P5   | **对比样片**：在独立的试用 Workspace（用本地 `npm pack` 的 rc 包由 `create-axmorf-studio` 创建，不动生产 ai Workspace）中，由一个**只读 Skill 的新 Agent 任务**用同样的剧本、旁白文本和事实，重做 `ai-small-lab-training-cost-20261106`，新片 id 为 `…-v2`，只交付不发布 | 交付通过 `film:deliver`；生成新旧左右并排、画面同步播放的对比视频，含两条音轨（音轨 1 旧版、音轨 2 新版，可在播放器里切换），另附两版原片；附两版的 `motionWarnings` 对照和新版 `storyboard.md`。**先交 commander 审**（抽帧、对照提示、核对音效计划），再给用户看并实际听审；**用户认可才算通过**，指标只作为参考 |
| P6   | 发布                                                                                                                                                                                                                                                                     | 用户认可后按 [RELEASE](../guides/RELEASE.md) 发 rc 到 `next`；ai Workspace 执行 `workspace:upgrade`，再做一部日常片验证，之后才考虑 `latest`                                                                                                                                                                       |

**P1 进度（2026-11-06，未发布）**：场景轨、音效轨、配乐 musicDips/ending、六个确定性合成音效及共享分发已实现。
新增 18 项回归；完整 `npm run check` 通过（381 项中 380 通过，Linux 跳过 1 项 macOS 专用测试），两包构建/typecheck 与 runtime 包检查通过。
gallery 已输出 still 与 2.9 秒视频（含声音，完整解码、看图通过），12 种转场各有真实 Chromium 中点 still 冒烟。
证据与未验证事项见 [ITERATION_STATUS](../ITERATION_STATUS.md)：尚未人工听审，独立 Workspace 实跑与样片对比留到 P5；Skill/api 留到 P4。

**P2 进度（2026-11-07，未发布）**：六个配方、纯 resolver、绝对帧 `FilmSoundEffectCue`、元数据目录与六个横屏 gallery 已实现；
ParallaxLayers 复用任意深度的 ProducerWorldCamera，不另建投影引擎。新增 22 项回归，完整 `npm run check` 通过
（403 项中 402 通过，Linux 跳过 1 项 macOS 专用测试）；六个组合通过宿主 compositions，六张 still 与六段 3.6 秒含声音预览已输出、
看图和完整解码通过。AxiomMorph / ParticleField 各在运动与停稳帧独立渲染两次，完整 PNG 逐字节一致；
五种镜头与快速段 motion blur 有真实 still 冒烟。验证证据、预览路径与尚未验证项见 [ITERATION_STATUS](../ITERATION_STATUS.md)。
未拷外部代码、未新增依赖；人工听审/独立 Workspace/生产对比后续验收，Skill/api/配方卡留到 P4。

**P3 进度（2026-11-07，未发布）**：review 运动遥测、五类纯函数提示、半秒变化曲线/切点与边界互核、
有总量上限的密集帧、可选带声 animatic 及 deliver 缺失/过期提示已实现，全部仅提示。
新增 16 项回归；旧片真实校准得到两段 enter-then-hold、hard-cut-heavy、no-sound-effects，
无场景轨的精确踩拍/镜头判断保持 unknown。gallery 派生 fixture 的曲线、密集帧与 640×360 / 30fps
带声预览（含片头片尾）已生成、看图与完整解码通过；人工听审留待后续。
校准阈值、证据路径、验证范围和未验证项见 [ITERATION_STATUS](../ITERATION_STATUS.md)。

**P5 审片反馈修正（2026-11-07，未发布）**：本批只改代码、Skill 和文档，不重做片子。
已强化 AxiomMorph 母题与横屏示例必读、storyboard 句子/帧号、空容器时限、前景避让、状态标识正文级字号/对比及手机亮度建议；
NumberRoll 改为同一递增数值驱动所有列、数值不越目标、仅位移回弹；两份 Skill 逐字一致，registry 安装说明同步。
新增仅提示的 `text-under-foreground` 与 `repeated-composition`，无场景轨或不可靠命中保持 unknown，不进入检查/交付门禁。
新增 16 项回归，完整 `npm run check` 通过（437 项：436 通过，1 项平台跳过）；NumberRoll gallery 的 108 帧短片与五张 still
已重渲、看图、完整解码。P5 临时副本真实 review 命中 9 条前景遮挡（含 f873「64 × H100」，20%）；
`repeated-composition` 为 `[]`，结尾三个镜头仍在同一场景且没有内部切点，中点法不能单独比较它们，未扩大方案范围。
片源只读、复制品按 owned-path 清理，不提交素材；证据、漏检边界及尚未验证范围见 [ITERATION_STATUS](../ITERATION_STATUS.md)。
下一轮仍需全新 Agent 制作 P5-v3，并由用户实际审阅；此批不代表 P5 通过。

**P5-v3 rc 前修正（2026-11-07，未发布）**：在 v3 只读片源复制品上验证羽化 mask-wipe/tint、
同组字形遮挡排除与 `FilmStatusTag` / `small-status-tag`。同一 53 帧的前景提示 19→13，剩余全在转场帧；
状态主副词约 43px、字幕约 48px，无 small-status-tag。完整 `npm run check` 通过（443 项，1 项平台跳过），
预览、实测值和渐变命中局限见 [ITERATION_STATUS](../ITERATION_STATUS.md)。没有新 Agent 重做、改版本、发布或进入 P6。

P5 由“只读 Skill 的新 Agent”来做，是为了检验 Skill 能不能把 Agent 引到这些能力上，而不是检验实现者能不能手工做出好片。

## 7. 风险与取舍

- **渲染成本**：motion blur、粒子、重叠转场会让渲染变慢。配方给出成本说明和默认采样上限；交付超时仍按现有规则处理（调高超时，不降画质）。
- **重叠转场的时序**：用覆盖式作默认，重叠式要通过 resolver 校验；出问题时从转场改回硬接，不影响旁白时序。
- **提示阈值误报**：阈值先标“待校准”，P3 用旧片和 P5 新片校准后再写进 Skill；提示永远不拦交付。
- **配方变成新模板**：配方只解决“怎么动”，构图、主体、世界仍由 Agent 按剧本设计。Skill 明确写出“不原样粘贴”，
  审片清单第 2 条（每段同一版式）继续适用。
- **合成音效的质感**：riser、impact 这类合成出来可能显得廉价。P5 要包含用户实际听审；用户觉得不行，就改为按 CC0 逐个外采并登记来源，
  不批量导入。
- **许可**：外部代码默认不拷；新音效优先合成。每拷一段代码、每加一个素材都在同一个提交里更新 NOTICES 和素材清单。

## 8. 审定结论（2026-11-06）

1. 新增音效先用现有合成器生成；P5 用户听审不通过时，改为按 CC0 逐个外采并登记（见第 7 节）。
2. animatic 默认关闭（`--animatic` 开启），Skill 要求成片前至少看一次；`film:deliver` 在缺少 animatic 时提醒（见 4.4）。
3. P5 先在试用 Workspace 用本地 rc 包验证；对比样片先交 commander 审，再交用户；用户认可后再发 `next`。
4. 第 1.1 节的统计以按片目录去重的口径为准。
