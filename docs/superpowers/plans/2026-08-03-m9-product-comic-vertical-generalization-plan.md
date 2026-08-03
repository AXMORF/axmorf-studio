# M9 产品漫画竖屏第二主题泛化实施计划

> 日期：2026-08-03
>
> 状态：待用户审阅；产品 source-of-truth 已锁定为当前仓库，不代表 M9 已开始
>
> 执行方式：计划获批且 repo-first source snapshot 通过后，由当前对话中的主 Agent inline 执行；
> 不假定 plan runner，不在本计划中授权 subagent、commit、push 或媒体生成
>
> 基线分支：`codex/foundation`
>
> 基线提交：`f89bf6d95decde27c7a128eaa90568526db49942`
>
> M9 技术 project/story ID：`product-comic-vertical`
>
> M9 Composition ID：`ProductComicVertical`

## 1. 目标与完成定义

M9 使用第二个真实主题——用户自己的产品——完整重跑 M1–M8 已建立的生产链，证明当前
系统不是只服务 `gps-relativity`。新视频必须是 2–3 分钟、9:16、默认
1080×1920、30 fps 的完整统一漫画作品，并清楚说明：产品解决的问题、3–5 个核心能力、
真实使用流程、可验证的差异化价值，以及结尾行动引导。

M9 完成不是“复制 GPS 并换文案”，也不是“渲染出一条能播放的 MP4”。只有同时满足以下
条件才算完成：

1. 产品事实、可用资产、禁止表述和 CTA 先形成有来源、可复核、不可静默扩张的
   source-of-truth；任何无法从该 source-of-truth 证明的功能、客户、数据或效果都不得进入
   Story、旁白、画面或 CTA；
2. 新 Story 完整经过 VideoBrief、StorySpec、NarrationSpec、RenderSpec、StoryBeat、
   authored `ttsChunks`、StoryCheck、真实 VoxCPM、PCM 封存、SemanticTiming、CaptionCue、
   Narrative Baseline 和 narrative AutoCheck；
3. 每个 StoryBeat 恰好对应一个 `meaningId`、一个独占 Scene 目录和一个 ScenePackage；
   ScenePackage 同时拥有画面与 Scene-local ambience/SFX；
4. 新项目拥有自己的 VisualStyleSpec、ResourceCatalog overlay、漫画设计系统、RendererRegistry、
   SceneVisual/SceneSound review、GlobalSoundPlan、project-local GlobalVisualLayers 和
   FinalAssembly；
5. `video-shotcraft` 的准确完整 commit 已冻结，104 张 card、161 个 style/preview 已全部进入
   inventory/coverage matrix；每一项都有准确来源、完整配方/demo/preview/依赖/license 状态、
   适用性和选择/不选择理由；
6. 所有被选为 `exact-demo-localized` 的 Shotcraft reference 都通过 immutable lineage、准确
   demo、最小依赖闭包、真实 Renderer/JSX/frame-state binding、source/adaptation 配对证据和
   正常速度可辨识度门；
7. 完整正常速度最终 MP4 通过 still、contact sheet、移动端缩放、`ffprobe`、逐帧完整解码、
   帧数/时长、响度、true peak、sample peak、采样率、声道和批量 review；
8. 用户明确批准当前 checksum-bound preview 后，才写 FinalPreviewApproval 和 passing
   `final-mechanical-check-v2`；
9. GPS M1–M8 所有 Story、旁白、timing、ScenePackage、GlobalSound、GlobalVisual、
   FinalAssembly、preview、approval 和 v2 report byte identity 保持不变；
10. M9 最终只形成两主题泛化结论和具体 promotion proposal，不迁移任何共享 capability，
    不开始 M10、封面、账号、网络发布、权限或密钥配置。

## 2. 本轮需求冻结与 planning-only 边界

### 2.1 已锁定成片要求

- 时长硬边界：`120s <= measured sealed duration <= 180s`；工作目标为 145–165 秒，但最终
  `durationInFrames` 只能来自封存 PCM 的累计整数 sample-frame 边界；
- 画幅：1080×1920，30 fps，9:16；RenderSpec 必须使用偶数 width/height；
- 视觉：完整且统一的漫画画风，必须由 panel/gutter/ink/palette/halftone/speed-line/
  onomatopoeia/transition/character-product continuity 共同构成，不接受“产品截图加粗描边”或
  全片套漫画滤镜；
- 叙事：问题 → 产品 → 核心能力 → 实际流程 → 可验证差异化 → CTA；
- 产品范围：只介绍当前 `Remotion Story Producer` 仓库已经实现的功能、端到端流程、确定性
  边界和 GPS 实证；不讨论 Logo、官方品牌色、官网、Git remote、客户、商业数据或发布；
- CTA 固定为项目流程型行动引导：“从一份主题资料开始，按这条可验证生产链完成第一支作品”；
- 旁白：中文，使用 `public/voice_profile/my_voice.m4a` 与准确文本
  `public/voice_profile/my_voice_text.txt` 做 `high-fidelity-clone`；允许通过文案、断句、重音和
  authored pause 形成清晰、自然、克制、有推进感的语气，不向模型传入 emotion/control，禁止
  兴奋、悲伤、愤怒、恐惧、煽情或夸张等情绪化表演；
- 字幕：仍由顶层 `CaptionLayer` 唯一渲染；漫画对话框、拟声词和 diegetic UI 文本是画面
  语义元素，不能复制或伪装正式字幕；
- motion：所有 render-critical motion 只使用 Remotion frame API；禁止 CSS animation、
  CSS transition 和 Tailwind animation utilities；
- runtime：不调用 Agent、skill、MCP、Git、网络或目录扫描；JSON 不含 JSX、动态模块路径、
  任意代码或可执行表达式；
- 资产：所有 runtime 资产位于 `public/projects/product-comic-vertical/`，并绑定 manifest、
  checksum、license/attribution、allowed-use 和 current Catalog identity；
- 所有权：Scene-local ambience/SFX 只由 ScenePackage 拥有；GlobalSoundPlan 只拥有全局 BGM、
  跨 Scene ambience、ducking 与 mastering input，不建立第二份 Scene SFX 权威；
- 共享边界：GPS 的 GlobalVisual 不能复制成通用能力；M9 GlobalVisual 仍是 project-local 强语义
  renderer，不得扩张为通用 Scene DSL、自动布局器、自动导演或任意 Track 系统。

### 2.2 本轮明确不做

本轮只新增本计划文件。不得开始：

- 创建 `product-comic-vertical` 代码、JSON、测试或资产；
- 生成旁白、音效、BGM、still、contact sheet 或 MP4；
- 拉取/本地化 Shotcraft 到仓库工作树；本轮调查使用的临时 clone/cache 不进入仓库；
- 修改 README、ROADMAP、ITERATION_STATUS 或任何 M1–M8 权威产物；
- 新增正式 NarrativeCheck 合同；M9 按用户锁定链继续使用 StoryCheck、Scene visual/sound review
  和 final batch review。NarrativeCheck 仍是独立未实现项，除非用户另行扩展范围；
- commit、push、PR、发布、账号、网络、权限或密钥操作。

## 3. 现场核验的 repo truth

本计划编写前已现场核验；正式执行每个 Task 前仍必须重查，不能把本节当作跳过 preflight
的授权。

### 3.1 Git 与 M1–M8 基线

- 工作目录：`/data/projects/repos/remotion-story-producer`；
- `.codegraph/` 存在，代码理解已先使用 CodeGraph；
- branch：`codex/foundation`；
- HEAD：`f89bf6d95decde27c7a128eaa90568526db49942`；
- 计划编写前 staged、unstaged、untracked 均为空；
- 最近提交为 M8 docs closeout、用户 approval evidence、FinalAssembly、M8 contracts 和 M8 plan；
- M1–M8 已完成，M9 与 NarrativeCheck、第二主题、发布均尚未实现；
- `gps-relativity` 当前最终 MP4 为 1731 帧、约 57.749 秒、1920×1080@30fps、H.264/AAC，
  当前技术 evidence 为 -17.7 LUFS、-2.9 dBTP，已有 checksum-bound 用户批准与 passing v2；
- 所有 `remotion` 与 `@remotion/*` 依赖当前精确版本均为 `4.0.489`；M9 不升级依赖。

### 3.2 当前可复用的真实接口

- `narration:generate|seal|check` 已按 `--project <slug>` 工作；生成需要仓库外
  `RSP_VOXCPM_PRIVATE_CONFIG`，seal 以候选 checksum 选择 attempt；
- `ttsChunks` 是 Agent 按语义、语气和朗读节奏预先创作的单元，当前 seal 会用 PCM 实测并按
  `ceilDiv(cumulativeSamples × fps, sampleRate)` 生成绝对帧；
- 当前 `CaptionCue` 是 `semantic-timing.generated.json` 内的正式字段，不存在需要 M9 另造的
  独立 `caption-cues.generated.json`；
- ProjectRegistry 使用固定一级项目目录、静态生成、字面量 `import()` 与 Remotion
  `lazyComponent`；`Composition.tsx` 必须 default export；
- `scene:package`、`scene:coverage`、`renderer:generate|check`、`final:assembly` 和
  `project:check --level narrative|final` 已接受任意合法 project slug；
- `CompositionAssembly` 当前的 z-order 是 Scene visual → project-local GlobalVisual →
  NarrativeCore/CaptionLayer，sound 则由 Scene-local bus 与 global bus 分层装配；
- final-v2 已有 15 项合同，且只有存在 final assembly 分支时才要求 GlobalSound、GlobalVisual、
  preview evidence 和 approval。

### 3.3 M9 前必须先修的已证实样例耦合

这些不是推测，而是当前代码事实；必须先用 GPS regression 固定，再做最小修复：

1. `scripts/baseline/evidence.ts` 的 CLI 虽接受任意 `--project`，但 evidence collector 和
   `inspectBaselineRender()` 仍写死 `GpsRelativity`、30 fps、1731 帧，以及 caption frame 15；
2. `src/contracts/external-reference.ts`、Shotcraft adapter/CLI/resolver 当前把 `cardId`、
   `styleKey` 写死为 `draw-svg-trace`，exact-demo parser 只覆盖该窄 fixture；
3. dependency closure 当前 bare-package allowlist 仅覆盖 `react`、`remotion`，而完整上游 demo
   还真实使用 `@remotion/motion-blur`、`@react-three/fiber`、`three` 以及若干 local fixtures、
   JSON、图片和 helper；allowlist 必须以目标仓库当前精确依赖和静态 source graph 为准，不能
   放宽成“任意 npm import”；
4. final-v2 checker 当前将 preview evidence 路径写死为
   `generated/m8-final-preview-evidence.generated.json`；M9 需要 canonical
   `generated/final-preview-evidence.generated.json`，同时只为 GPS 保留 legacy path 兼容；
5. M7/M8 媒体生产与 review orchestration 是 GPS-specific。M9 先保留自己的
   `scripts/m9-product/` project-local 编排；完成两个主题对比前不提前抽成共享 capability。
6. 当前 narration provider 只支持 `controllable-clone`、`/clone`、绝对 `.wav` 和必填
   `controlInstruction`；M9 锁定的源音频是 AAC/M4A，而高质量克隆需要
   `high-fidelity-clone`、准确 prompt transcript、canonical prompt WAV 和
   `/clone_with_prompt`。该 provider 分支必须先 TDD 实现，不能把 controllable clone 改名冒充
   高质量克隆。

任何泛化修改都必须满足：GPS 当前生成文件、媒体 checksum、approval 和 v2 report byte-exact
不变；否则该修复不得进入 M9 主线。

### 3.4 当前 voice profile 事实

用户已把声音资源复制到工作树，属于受保护的用户输入：

- `public/voice_profile/my_voice.m4a`：243,013 bytes，AAC、48 kHz、stereo、14.877333 秒，
  SHA-256 `1d35f0a39c79850dabac21383e5883a78efc6a161d2be5dd8d1a926e49bd4b6c`；
- `public/voice_profile/my_voice_text.txt`：162 bytes、UTF-8，SHA-256
  `7b6f08f4100f146c649659d0fe2a88386b978cc9368ea0928e17c50d780a655e`；
- 文本是 prompt audio 的用户配对 transcript；正式生成前仍要做一次人工逐字听校，不能只因文件
  同目录就自动声称 transcript exact；
- 当前 `RSP_VOXCPM_PRIVATE_CONFIG` 在本 shell 未设置。计划阶段不需要用户重新描述声音；正式
  generate 时由 Gate A 检查本地 VoxCPM endpoint/private config，缺失则 fail closed；
- 这两个源文件不得被 Agent 覆盖、转码回写、删除、移动或自动 staging。canonical prompt WAV
  只生成到候选/private workspace，checksum 进入 provider attempt identity；是否把原始声音文件
  纳入 Git 必须另获用户明确授权；它们只用于 authoring-time VoxCPM provider，Remotion runtime
  不通过 `staticFile()`、Audio 或任何网络路径加载这些声音源。

## 4. 产品 source-of-truth 与禁止编造门

### 4.1 repo-first 产品资料包

M9 的产品就是当前仓库 `Remotion Story Producer`。用户不需要重新填写产品问卷。主 Agent
直接从下列 current repo truth 生成 source packet：

1. `README.md`：产品入口、已实现能力、真实命令和当前未实现项；
2. `docs/FINAL_PRODUCT_GOAL.md`：一句话目标、三个权威、最终结构和不可偷换边界；
3. `docs/PRODUCTION_WORKFLOW.md`：从用户资料到 FinalPreviewApproval 的完整流程与节点责任；
4. `docs/ITERATION_STATUS.md`、`docs/ROADMAP.md`：M1–M8 已完成事实和 M9/M10 边界；
5. `docs/ARCHITECTURE.md`、`docs/DETERMINISTIC_EXECUTION.md`、`docs/TERMINOLOGY.md`：运行时、
   fingerprint、时间权威、Scene ownership 和名词边界；
6. `package.json`、当前 `src/`、`scripts/`、tests：真实可调用功能和不能虚构的实现范围；
7. GPS M2–M8 evidence、当前 preview/final report：可验证的第一主题实证；
8. 用户提供的 `public/voice_profile/my_voice.m4a` 与 `my_voice_text.txt`：M9 高质量声音克隆输入。

source snapshot 必须绑定当前 HEAD、上述文件 checksum、测试/报告 fingerprint 和 voice source
checksum。仓库未实现的 NarrativeCheck、第二主题证明、M10 发布，以及不存在的客户/效率/
准确率/收入数据必须明确列为 forbidden claims。Logo、官方品牌色、官网与 Git remote 不属于本片
内容，也不成为执行前置条件。

### 4.2 项目内 source packet

repo-first source snapshot 通过后，先创建下列 project-local、不可执行数据：

```text
src/projects/product-comic-vertical/sources/
  product-source.json
  claims.json
  asset-sources.json
  voice-profile.json
  source-receipt.generated.json
```

- `product-source.json`：从 repo truth 提取的名称、定位、目标用户、已实现能力、流程、固定 CTA、
  旁白语言与克制语气策略；
- `claims.json`：每条可使用事实的 `claimId`、原始表述、允许改写范围、证据 URI/仓库路径、
  verification status、forbidden exaggerations；
- `asset-sources.json`：每个源资产的 owner、usage permission、source URI、原始 checksum、
  localization target、是否允许进入 runtime；
- `voice-profile.json`：`m9-project-my-voice`、`high-fidelity-clone`、M4A/text 相对路径与 checksum、
  实测 48 kHz/stereo/14.877333 秒事实、prompt transcript identity、canonicalization policy、
  `tone-not-emotion-v1` 和禁止 emotion/control 声明；
- `source-receipt.generated.json`：前三者 canonical fingerprints、已解析本地资产 checksum 和
  `sourcePacketFingerprint`。

禁止把 token、登录态、私有 endpoint、绝对 home path、临时 clone 路径或未授权原始文件写入
这些 JSON。私有资料只记录脱敏引用和允许使用的派生事实；若不能合法提交，保留在仓库外，
receipt 只绑定用户允许进入作品的摘录与 checksum。

### 4.3 claim 使用规则

- StoryBeat、ttsChunk、漫画画面文字和 CTA 中的每个产品事实都必须列出 `claimIds`；
- 问题型 hook 可以描述仓库要解决的生产摩擦，但不得暗示不存在的用户、客户、市场份额、准确率、节省比例
  或收入效果；
- “更快、更智能、自动、可靠、领先”等相对性词汇，只有 source packet 提供比较基准和证据时
  才能出现；
- 规划中能力必须明确标识，默认不得当成已上线能力演示；
- screenshot 中出现第三方名称、个人数据、账号、URL 或密钥时，先脱敏并重新做 checksum/
  manifest，不允许运行时临时遮挡未审原图；
- 任一 `claimId` 或 source checksum 漂移，会使 StoryCheck、Scene task input、review、
  FinalAssembly 和旧 approval 失效。

## 5. 2–3 分钟叙事结构与预计 StoryBeat

### 5.1 预计结构

本计划锁定 10 个预期 Beat 和稳定技术 `meaningId`。它们只允许使用 current repo truth 已证明的
功能名。Task 2 根据 repo source snapshot 调整每段文案和时长预算；如确实需要增删 Beat，必须在
真实 TTS 前先更新本计划的 Beat 表、Scene 目录表和 staging 表，不能在 Scene 阶段静默改变。

| 顺序 | meaningId              | 叙事职责                                        | 预计秒数 | 必需 source              |
| ---: | ---------------------- | ----------------------------------------------- | -------: | ------------------------ |
|    1 | `problem-hook`         | 用一个真实、可识别的用户痛点建立注意力          |    10–14 | 目标用户、问题事实       |
|    2 | `problem-friction`     | 展示现有流程的摩擦与为什么值得解决              |    12–16 | 当前流程/限制，禁止夸大  |
|    3 | `product-reveal`       | 给出项目名称、一句话定位和核心结构              |    10–14 | README、最终产品目标     |
|    4 | `core-capabilities`    | 把 3–5 个能力组织成一个系统，而不是功能清单刷屏 |    18–24 | 能力状态与准确描述       |
|    5 | `workflow-input`       | 真实流程第一步：输入/准备/发起                  |    12–16 | 典型流程、真实 UI        |
|    6 | `workflow-create`      | 真实流程核心处理：用户与产品如何协作            |    16–22 | 关键交互与产品输出       |
|    7 | `workflow-result`      | 真实流程完成态与可验证结果                      |    12–18 | 输出样例、可验证事实     |
|    8 | `differentiated-value` | 说明差异化来自哪里，不做无证据竞品贬损          |    14–20 | 对比基准/设计取舍        |
|    9 | `proof-and-fit`        | 回到目标用户：什么场景适合、什么边界不承诺      |    12–18 | 使用边界、证据/限制      |
|   10 | `call-to-action`       | 清晰复述价值并给固定的流程型 CTA                |     8–14 | repo-first source packet |

预算合计为 124–176 秒，给自然停顿留出空间后仍须以 sealed PCM 为唯一权威。若封存实测小于
120 秒或超过 180 秒，回到 Story/Narration 改写并重新生成；禁止 time-stretch、改变 playback
rate、缩短 Scene、覆盖 spoken frame 或通过 transition 吞帧来“适配时长”。

### 5.2 StoryBeat 与 authored ttsChunks 规则

- 每个 Beat 恰好一个 `meaningId`，顺序与 SceneCoverageMap 完全相同；
- `ttsChunks` 按语义、语气和朗读节奏创作。一个 chunk 可以跨标点，一个句子也可以拆成多个
  语气单元；工具不得按标点重新切分；
- 显式停顿只来自 NarrationSpec 的已创作 pause 或 sealed PCM 实测自然静音；
- 每个 chunk 的文字要适配顶层字幕在 360×640 等效移动端上的可读长度；不能靠缩小字幕字号
  挽救过长 chunk；
- Shot/Scene 绑定 `meaningId`，不绑定 CaptionCue 或 ttsChunk 分块；画面节拍可以响应已封存
  语义 timing，但不得把字幕块当作 Scene DSL；
- StoryCheck 固定检查 Beat 顺序、叙事完整性、authored chunks、voice profile 和发音风险；
  用户不需要逐 Beat 审批。

## 6. 9:16 漫画设计系统

VisualStyleSpec 之外，M9 新增 project-local `comic-design-system.json` 和纯类型/校验代码；它是
当前作品的设计约束，不是能生成任意 Scene 的自动布局器。

### 6.1 panel、边框、留白和阅读方向

- 默认阅读方向为从上到下、同一行从左到右；每个 Scene 只有一个 dominant panel，最多两个
  supporting inset；
- panel 的数量、区域和 reveal order 必须在各 Scene 的 `visual-plan.json` 中显式创作；没有
  `autoGrid()`、关键词选版、动态 packing 或任意 `panels[]` runtime DSL；
- 外框、格间留白、bleed、圆角/直角、破格元素和 panel overlap 都有固定语法；破格只用于
  叙事焦点，不能让流程节点、人物脸或正式字幕被裁切；
- 竖屏建议硬安全区：top 120 px、左右各 72 px、bottom 240 px。正式 CaptionLayer 使用
  RenderSpec safe area；漫画气泡、拟声词、项目标题、CTA 不能侵入 bottom caption band；
- 必须在 1080×1920 原始画面和 360×640 等效手机尺寸两套 review 中通过；只在桌面放大图
  上看清不算通过。

### 6.2 角色与产品形象一致性

- `character-model-sheet.json` 记录角色 silhouette、服装、面部特征、姿态限制和允许表情；没有
  人物时也要记录“无固定角色”，不能不同 Scene 临时发明替身；
- `system-model-sheet.json` 绑定 Story、sealed narration、SemanticTiming、ScenePackage、
  Registry、Global assembly、evidence、approval 等核心对象的统一漫画符号和关系；
- 代码、合同或 evidence 的漫画化再绘必须建立 source/adaptation 配对。可以简化次要字段，
  不能伪造不存在的命令、状态、检查结果或 runtime 行为；
- 跨 Scene 延续同一角色、设备、产品状态和关键道具；continuity review 显式检查入口/出口帧。

### 6.3 色板、线条、网点、速度线和拟声词

- palette 是本片 project-local 漫画艺术指导，不宣称为官方品牌色；由主 Agent根据 9:16 可读性、
  功能分层和全片连续性固化为 ink/paper/accent/success/failure/timing tokens；
- 固定线宽层级：panel border、角色/产品主轮廓、内部信息线、速度/情绪线；不能各 Scene
  随意改变“漫画感”；
- halftone 只用于局部深度/情绪，不得覆盖正文、产品关键文字或 CaptionLayer；需检查摩尔纹、
  H.264 压缩和移动端缩放；
- speed line 绑定明确运动方向和叙事重音，使用 frame-derived opacity/length/origin；
- onomatopoeia 是 Scene 语义资产，须列出语言、含义、入/出帧、音效 cue 和 caption
  非重复声明；无对应 Scene-local 声音时不能用拟声词暗示不存在的声音；
- 画面文字分为 `dialogue-balloon`、`onomatopoeia`、`diegetic-product-text`、`label` 四类；
  每项必须有 semantic purpose，并与正式 CaptionCue 做 non-duplication check。

### 6.4 漫画转场与 motion grammar

- 默认 Beat 边界为 hard cut 或显式 page/panel turn；不得跨边界移动、缩短或吞掉 spoken frame；
- transition 只能覆盖现有 Scene 输出，不能改写 ScenePackage 的 timing authority；
- 可用语法包括 panel reveal、ink wipe、page turn、impact hold、speed-line carry，但每次使用都由
  project-local JSX 显式实现；
- transition、panel、气泡、网点和 GlobalVisual 均使用 `useCurrentFrame()`、`interpolate()`、
  `spring()`、`Sequence` 等 frame API；
- GlobalVisual 只可拥有本产品作品的 paper/ink continuity treatment 和跨 Scene motif；它不
  渲染字幕、不选择 Scene、不布局 panel、不读取目录，也不复制 GPS 的时空 motif。

## 7. video-shotcraft 全量 inventory / coverage 与 exact fidelity

### 7.1 已完成的上游调查事实

本计划编写时已从官方 Git 仓库和 Gallery release 现场核验：

- repository：`https://github.com/vincentwei1021/video-shotcraft.git`；
- `main`/HEAD 准确完整 commit：`d4915443232e89527fdc9d7e79f132ba411fc440`；
- `gallery/api/library.json` 内部 revision：`bdd94be16d60fa8f`；该值不是 Git commit，不能代替
  immutable lineage；
- 104 张 card、161 个 style、161 个 preview；104 个 card 文档全部含意图、参数表、已知坑、
  参考实现；
- 分类为 camera 7/13、data 8/13、effects 10/22、interaction 11/15、opening 9/9、
  outro 5/6、rhythm 10/19、transition 15/25、typography 14/20、ui-entrance 15/19
  （格式为 cards/styles）；
- 161 个 release preview 共 99,920,525 bytes，已逐个 checksum 读取、`ffprobe` 并完整解码到
  EOF；总计 22,320 帧，全部 30 fps/H.264，其中 150 个为 1920×1080、11 个为 960×540；
- preview 最短 43 帧、最长 200 帧；全部 style preview 按原时长相加为 744 秒，即 12 分 24 秒；
- 上游源码 LICENSE 是 Apache-2.0；Gallery preview 是上游 demo render，需要单独记录来源与
  attribution；`assets/audio/ATTRIBUTION.md` 明确存在无法反查或商用前需确认的音频，不能把
  bundled audio 的代码许可证误当成媒体许可证；
- 上游某些 demo 使用产品截图或示例图片，这些只可作为 demo input，不得直接进入本产品
  runtime；必须替换为当前产品获授权资产并保留 source/adaptation evidence；
- card 到准确 demo 不是一律“card name = 单一 TSX”：存在多 style、目录式声明、template
  source、helper 文件和特殊映射；`shot-transitions` 等条目需要逐 style 显式解析，不能猜文件。

### 7.2 “参考全部 shot”的锁定解释

“全部”在 M9 中固定为：完整读取、登记和判断全部 104 cards / 161 styles，而不是强迫 161 个
style 全部进入 2–3 分钟成片。

如果把全部 161 个 preview 按原演示时长实际播放，时长为 12 分 24 秒，已超过 3 分钟上限
4.13 倍；即使把 161 项硬压进 180 秒，每项平均只有约 1.12 秒且尚未给旁白、产品流程和
静止阅读留时间。该做法会破坏产品叙事、移动端可读性和正常速度辨识度，因此不属于本计划的
默认实现。若用户另行明确要求“161 个 style 全部实际出片”，必须先改成独立范围、重新定时长，
不得在 M9 内默默偷换。

### 7.3 inventory 与 coverage matrix 结构

Task 5 必须生成并提交：

```text
src/projects/product-comic-vertical/references/video-shotcraft/
  upstream-receipt.generated.json
  shot-inventory.generated.json
  shot-coverage.json
  shot-selection.json
  selected-source-adaptation-review.json
```

`shot-inventory.generated.json` 每个 style 一行，共 161 行，至少包含：

- source repository、commit、library revision、card category/name、card checksum；
- style key/label/description、preview release asset URL、preview checksum、width/height/fps/frames；
- 完整 card recipe/parameter/known-pitfalls checksum；
- exact demo status：`resolved`、`ambiguous`、`missing` 或 `special-template`；
- demo entry path、closure root、静态 relative imports、bare packages、local assets、source checksums；
- source code license、preview license、媒体/字体/音频各自的 license status；
- inventory fingerprint。

`shot-coverage.json` 对每个 style 都必须包含：

- `applicability`: `strong` / `conditional` / `not-applicable`；
- 适合哪些 Beat/叙事功能，以及对 9:16 漫画语法的适配风险；
- `decision`: `selected-exact` / `selected-inspiration` / `not-selected`；
- 不少于一句的选择或不选择理由；不能只写“没用到”；
- exact eligibility：demo、preview、closure、package、license 任一不清楚都为 false；
- 若 selected，绑定唯一 `meaningId`、预计 frame window 和正常速度可辨识度目标。

coverage 的完成门固定为：104/104 cards、161/161 styles、161/161 previews；category 和 style key
均无重复；任何遗漏、未知决定、空理由或 inventory/coverage fingerprint drift 都 fail closed。

### 7.4 选择与本地化策略

- 选择只服务产品叙事和漫画 motion grammar，不按卡名、熟悉度或“看起来炫”挑选；
- 每个 Scene 最多一个 `exact-demo-localized` reference。其余 Shotcraft 影响只能标为
  `inspiration-only`，不能拿多个 exact receipt 拼成一条未建模的保真声明；
- `exact-demo-localized` 必须从 frozen commit 的准确 style → preview → demo entry 映射进入；
  `ambiguous`/`missing` 项不得 exact 选择；
- 本地化只复制 entry、递归静态 relative import、真实 local asset、LICENSE 和必要 package
  identity；禁止复制整仓、运行时 import 上游、远程 URL 或目录扫描；
- bare package 只允许目标仓库 `package.json` 中已存在、版本满足当前 lockfile 的显式 allowlist；
  不为单个 shot 静默安装或升级依赖；
- 上游截图、音频、字体和第三方媒体按各自 license 处理。代码 Apache-2.0 不能自动覆盖 bundled
  media；不确定时移除/替换，不能以 attribution 文本掩盖未知授权；
- 适配可改变颜色、文字、截图、panel crop 和 9:16 framing，但必须保留所选 exact reference
  的运动因果、阶段、frame state 和正常速度辨识度；
- Renderer 必须真实 import adaptation 并用 `useCurrentFrame()`/props 驱动。只把上游源码放进
  目录、只贴 screenshot 或伪造 receipt 均 fail；
- 每个 exact selection 产生 source/adaptation 同相位 still pairs、完整正常速度 source/
  adaptation preview、Renderer import graph 和 pass-only ReferenceFidelityReceipt。

## 8. 新 Story/project 目录与所有权

### 8.1 固定项目根

```text
src/projects/product-comic-vertical/
  brief.json
  story.json
  narration.json
  render.json
  visual-style.json
  comic-design-system.json
  character-model-sheet.json
  system-model-sheet.json
  resource-catalog.json
  global-sound-plan.json
  global-visual-plan.json
  final-assembly-plan.json
  Composition.tsx
  scene-runtime-data.ts
  final-assembly-data.ts
  renderer-registry.generated.ts
  sources/
  references/video-shotcraft/
  reviews/
  generated/
  global-visual/GlobalVisualLayers.tsx
  scenes/<meaningId>/
```

```text
public/projects/product-comic-vertical/
  narration/<sealed-fingerprint>/complete.wav
  product-assets/<content-addressed-name>
  scene-audio/<meaningId>/<content-addressed-name>.wav
  global-audio/cross-scene-ambience.wav
  global-audio/global-bgm.wav
```

输出只进入：

```text
out/product-comic-vertical/
out/m9-product-comic-vertical/
```

`out/` 是 review/output，不作为 runtime 权威。只有 generated receipt 记录其 checksum；不得把
完整 MP4、stills 或 contact sheet 默认加入 Git，除非仓库当前 evidence policy 明确要求某个
小型 artifact 入库且用户另行批准。

### 8.2 Scene 独占边界

10 个 Scene 根固定为：

```text
scenes/problem-hook/
scenes/problem-friction/
scenes/product-reveal/
scenes/core-capabilities/
scenes/workflow-input/
scenes/workflow-create/
scenes/workflow-result/
scenes/differentiated-value/
scenes/proof-and-fit/
scenes/call-to-action/
```

每个目录只拥有自己的 `Renderer.tsx`、local Shot components、task input、visual/shot/sound/
sync plans、selected resources、optional localized exact reference 和 generated ScenePackage。
Scene 不修改 shared contracts、其他 Scene、顶层 caption、GlobalSound 或 GlobalVisual。

共享输入（Story、sealed timing、VisualStyle、Catalog、Shotcraft inventory/coverage）由主 Agent
独占；aggregate coverage、registry、review、final assembly、staging 和 commit 也由主 Agent
完成。用户已于执行期明确要求十个 Beat 的 ScenePackage 均通过子代理制作，并进一步批准所有
剩余 Beat 按无共享写入的合理方式同时 authoring。因此 6A–6J 每个 Scene 必须各派发一个独立且
不跨 Beat 复用的子代理；每个子代理只拥有一个 Scene 目录、对应 test 与 `out/` review 产物，
必须亲自完成该 Scene 的 Red、
Green、正常速度 preview 与证据回报，不得提交、不得修改 shared inputs、其他 Scene 或已封存
PCM。所有未完成 Beat 子代理可以同时运行；它们不得读取彼此未提交的 Scene 文件，只能
读取主 Agent 冻结的 continuity brief、shared Story/VisualStyle/comic/model 权威和已提交前序 Scene。
主 Agent 独立运行聚焦验证、GPS protection、精确 staging 和本地 commit，并始终按 6A–6J Story
顺序验收和提交。若并行 Scene 在轮到验收时与已提交前序 Scene 不连续，必须交回原 Scene owner
子代理做最小修正并重跑证据；主 Agent 不代写 ScenePackage。Remotion/Chromium/ffmpeg 重型
媒体命令软限制为同时 3 个，authoring、ScenePackage 生成和聚焦测试不设并发上限。

## 9. 通用执行纪律

每个实施 Task 都必须遵守：

1. 开始前运行 `git status --short --branch`、`git rev-parse HEAD`，记录 expected HEAD，保护
   用户新增修改；发现额外改动先绕开，不能 reset/checkout 覆盖；
2. 用 CodeGraph 先定位符号、caller 和修改面；只有 CodeGraph 不足时才用 `rg`/读取文件；
3. TDD：先写一个能证明目标行为的失败测试并单独运行，确认失败原因准确；再做最小实现；
4. 先跑聚焦 test，再跑 typecheck/lint/相关真实命令；高风险视觉改动补真实 still/preview；
5. 每个 writer 必须 pass-only、canonical、atomic；read-only check 不得悄悄修复或重写；
6. 任一输入、checksum、fingerprint、帧数、license 或 review drift 必须 fail closed；
7. 每个 Task commit 前运行 GPS protection check：

   ```bash
   git diff --exit-code f89bf6d95decde27c7a128eaa90568526db49942 -- \
     src/projects/gps-relativity \
     public/projects/gps-relativity \
     docs/evidence/m8-gps-relativity-final-assembly.md
   ```

8. staging 只使用该 Task 列出的逐文件路径；禁止 `git add .`、`git add -A`、glob 或目录级
   “顺手全加”；提交前检查 `git diff --cached --name-status` 和 staged diff；
9. 未知 checksum、sealed fingerprint、selected style key 和 product asset filename 在本计划中用
   `<...>` 表示 execution-time identity；这些不是可直接执行的 shell 占位符。对应 Task 必须先
   生成带 fingerprint 的 staging manifest，再由主 Agent把每个值展开成字面量路径，审阅后才
   运行 `git add --`；任何未展开命令都禁止执行；
10. 每个 commit 后工作树应干净；不 push；下一个 Task 只能建立在前一个通过的本地 commit 上；
11. 删除、覆盖、force、生产发布、权限、账号、密钥变更仍须另行明确授权；
12. Task 10 的 FinalPreviewApproval 是强制停点。没有用户明确批准，禁止执行 Task 11。

## 10. Gate A：执行前 requirement/source freeze（不修改、不提交）

**前置：** 用户批准本计划。产品资料直接由第 4.1 节 repo-first source 生成，不再要求用户填表。

**检查：**

```bash
pwd -P
git branch --show-current
git rev-parse HEAD
git status --short --branch
test -d .codegraph
node --version
npm --version
ffmpeg -version
ffprobe -version
npm run check
```

同时验证 `video-shotcraft` 官方 remote 的 commit 仍为
`d4915443232e89527fdc9d7e79f132ba411fc440`。若 upstream HEAD 已改变，M9 仍使用本计划冻结的
commit；只有用户明确要求升级时才重做 104/161 inventory 基线和计划评审。

**停点：** repo source snapshot 不完整、工作树出现计划和受保护 voice inputs 之外的未知修改、
基线测试失败、上游 commit 无法取得、voice source checksum 漂移、prompt transcript 未通过
人工逐字听校或 private VoxCPM high-fidelity profile 无法解析，任一项成立都停止。Gate A 无
文件、无 staging、无 commit。

## 11. Task 1：解除第二主题夹具耦合并补齐高质量声音克隆 adapter

### 11.1 目标

在不改 GPS 产物的前提下，最小泛化 baseline evidence、Shotcraft reference identity、final
preview evidence path，并为当前 narration provider 增加真实 `high-fidelity-clone` 分支。只修
阻塞第二 Story 的具体硬编码与 provider mode 缺口，不抽新视觉 capability。

### 11.2 Red

新增/扩展测试，先证明当前失败：

- 1080×1920、30 fps、动态 `durationInFrames` 的第二 Composition 被 baseline evidence 因
  `GpsRelativity/1731` 拒绝；
- caption evidence frame 应从第一个 active CaptionCue 的可见区间选取，而不是固定 15；
- 非 `draw-svg-trace` card/style 无法通过 ExternalReferenceSnapshotSchema/CLI/resolver；
- multi-style、template entry、ambiguous/missing demo 映射若被猜测为 exact，必须失败；
- closure 遇到目标仓库未批准 bare import、动态 import、远程 asset 或逃逸 source root 时失败；
- M9 canonical `generated/final-preview-evidence.generated.json` 当前无法被 final-v2 读取；
- GPS legacy M8 evidence path 在泛化后仍必须读到完全相同 fingerprint；
- `public/voice_profile/my_voice.m4a` 当前因非 `.wav` 被 profile resolver 拒绝；
- `high-fidelity-clone` profile、`/clone_with_prompt`、prompt audio/transcript 当前均不受支持；
- prompt transcript 漂移、source checksum 漂移、canonical WAV 不合规、在 high-fidelity request
  中出现 `control`/`emotion`、错误 multipart 字段或非 raw-WAV response 都必须失败；
- normalization 必须写入 candidate/private workspace；任何覆盖、改名或改写用户原始 M4A/text
  的行为必须失败。

聚焦红灯：

```bash
node --import tsx --test \
  tests/baseline/evidence.test.ts \
  tests/external-references/cli.test.ts \
  tests/external-references/snapshot.test.ts \
  tests/external-references/video-shotcraft-resolver.test.ts \
  tests/external-references/dependency-closure.test.ts \
  tests/project-check/final-run.test.ts \
  tests/narration/private-config.test.ts \
  tests/narration/voxcpm-client.test.ts \
  tests/narration/high-fidelity-clone.test.ts
```

### 11.3 Green

- baseline evidence 从 registry descriptor、SemanticTiming 和 actual ffprobe 解析 fps/frame count；
  caption frame 选择第一个非空 cue 的区间内可见帧，并记录所选 cue/frame；
- cardId/styleKey 改为严格 slug schema；resolver 接收冻结 library entry 和显式 demo mapping，
  不从名字猜 demo；
- dependency closure 只允许静态相对 import 和 target package allowlist；每个 package/version 进入
  closure fingerprint；
- final-v2 优先唯一 canonical path；只有 `gps-relativity` 且 canonical 不存在时允许 legacy
  `m8-...` path；两者同时存在或非 GPS 使用 legacy 均失败；
- private profile 和 safe provider descriptor 使用 `controllable-clone | high-fidelity-clone`
  discriminated union；高质量分支绑定 source M4A、prompt transcript、canonical prompt WAV、
  mode/model/parameters checksums，不泄露绝对路径、endpoint 或 token；
- 高质量分支把 M4A 确定性规范化为 candidate workspace 内 48 kHz mono s16le WAV，逐字读取
  prompt transcript，并向 `/clone_with_prompt` 发送 `text`、`prompt_text`、`prompt_audio`、
  `reference_audio` 和冻结生成参数；同一经过验证的 canonical WAV 可同时承担 prompt/reference，
  不为凑字段伪造第二个声音来源；
- `high-fidelity-clone` transport 明确禁止 `control`、`controlInstruction`、`emotion` 或情绪标签；
  本片语气只由 authored 文案、重音、断句、节奏和显式 pause 形成；
- 原有 `/clone` controllable adapter、GPS provider attempt identity 和现有 tests 保持兼容；
- 对 GPS 运行 registry/baseline/narrative/final read-only checks，确认所有 generated bytes 不变。

### 11.4 验证

```bash
node --import tsx --test \
  tests/baseline/evidence.test.ts \
  tests/external-references/*.test.ts \
  tests/project-check/final-run.test.ts \
  tests/project-check/invalidation.test.ts \
  tests/narration/private-config.test.ts \
  tests/narration/voxcpm-client.test.ts \
  tests/narration/high-fidelity-clone.test.ts
npm run typecheck
npm run lint
npm run registry:check
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- \
  --project gps-relativity --level narrative
npm run project:check -- --project gps-relativity --level final
```

### 11.5 精确 staging / commit

```bash
git add -- \
  src/contracts/external-reference.ts \
  src/contracts/narrative-baseline.ts \
  src/contracts/shot-recipe.ts \
  scripts/baseline/evidence.ts \
  scripts/external-references/adapters/video-shotcraft.ts \
  scripts/external-references/cli.ts \
  scripts/external-references/dependency-closure.ts \
  scripts/external-references/snapshot.ts \
  scripts/external-references/video-shotcraft-resolver.ts \
  scripts/narration/adapters/private-config.ts \
  scripts/narration/adapters/prompt-audio-normalizer.ts \
  scripts/narration/adapters/voxcpm-client.ts \
  scripts/narration/domain/provider-input.ts \
  scripts/project-check/final-run.ts \
  tests/baseline/evidence.test.ts \
  tests/contracts/narrative-baseline.test.ts \
  tests/external-references/cli.test.ts \
  tests/external-references/dependency-closure.test.ts \
  tests/external-references/snapshot.test.ts \
  tests/external-references/video-shotcraft-resolver.test.ts \
  tests/narration/private-config.test.ts \
  tests/narration/voxcpm-client.test.ts \
  tests/narration/high-fidelity-clone.test.ts \
  tests/project-check/final-run.test.ts \
  tests/project-check/invalidation.test.ts
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(m9): unlock second theme and high fidelity clone"
```

如果实现无需触及某个列出文件，不得为“对齐 staging 表”制造空改动；从 `git add` 中删除该
字面量。若需要未列出的 production file，先更新本计划并说明原因，不能顺手扩大 Task。

## 12. Task 2：产品 source packet、叙事规格与 StoryCheck

### 12.1 Red

- 为 source packet canonicalization、claim coverage、asset permission、forbidden claim、CTA、
  10 Beat 顺序、authored chunks 和 9:16 RenderSpec 写项目测试；
- 确认 repo source 未绑定 HEAD/checksum、把未实现目标写成已实现、加入品牌/官网/客户/商业
  数据、改变固定 CTA、voice source checksum 漂移或 mode 不是 high-fidelity 时失败；
- 确认未绑定 claimId 的产品效果词、按标点机械重切 chunk、重复 meaningId、非
  1080×1920@30fps、错误 safe area、tone policy 出现 emotion/control 都失败。

### 12.2 Green

- 只根据 current repo truth 与 GPS evidence 写五个 source 文件和 receipt，不要求用户重述产品；
- 写 `brief.json`、`story.json`、`narration.json`、`render.json`；
- 写 10 个 StoryBeat 与按语义/语气/节奏创作的 ttsChunks；
- `narration.json` 固定引用 `m9-project-my-voice`；`voice-profile.json` 固定
  `high-fidelity-clone`、两份用户源文件 identity 和 `tone-not-emotion-v1`，endpoint/token 仍只
  在仓库外 private config；
- 旁白采用清晰、自然、克制、有推进感的说明语气；不写情绪标签，不调用 controllable mode，
  不为制造表现力添加夸张感叹、煽情问句或表演性停顿；
- 内容只讲项目功能、M1–M8 流程、确定性边界和 GPS 已验证事实；不解释 Logo、官方品牌色、
  官网、Git remote 或发布；CTA 使用第 2.1 节固定文案；
- 写 Agent-authored `reviews/story-check.json`，不新增用户逐段 approval；
- target duration 设为 120–180 秒，safe area 固定进入 RenderSpec。

### 12.3 验证

```bash
node --import tsx --test \
  tests/projects/product-comic-vertical-source.test.ts \
  tests/projects/product-comic-vertical-story.test.ts \
  tests/narration/story-check.test.ts
# `narration:check` reads Task 3 sealed narration and SemanticTiming, so Task 2
# validates the source bundle and current StoryCheck through its project tests.
# The real read-only `narration:check` remains mandatory in Task 3.
npm run typecheck
npm run lint
```

### 12.4 精确 staging / commit

产品源资产文件名只能在用户资料进入后确定。Task 2 先生成
`src/projects/product-comic-vertical/sources/task-2-staging.generated.json`，其中列出每个允许提交
源资产的字面量 repo-relative path、checksum 和 permission；主 Agent 逐项展开，禁止 glob。

固定路径：

```bash
git add -- \
  src/projects/product-comic-vertical/sources/product-source.json \
  src/projects/product-comic-vertical/sources/claims.json \
  src/projects/product-comic-vertical/sources/asset-sources.json \
  src/projects/product-comic-vertical/sources/voice-profile.json \
  src/projects/product-comic-vertical/sources/source-receipt.generated.json \
  src/projects/product-comic-vertical/sources/task-2-staging.generated.json \
  src/projects/product-comic-vertical/brief.json \
  src/projects/product-comic-vertical/story.json \
  src/projects/product-comic-vertical/narration.json \
  src/projects/product-comic-vertical/render.json \
  src/projects/product-comic-vertical/reviews/story-check.json \
  tests/projects/product-comic-vertical-source.test.ts \
  tests/projects/product-comic-vertical-story.test.ts
```

随后把 staging manifest 中每个获准本地化产品资产作为单独字面量追加到同一 `git add --`。
`public/voice_profile/my_voice.m4a` 和 `my_voice_text.txt` 是受保护的用户输入，不属于 Task 2
staging；不得因它们当前 untracked 而加入 commit。

```bash
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(product): freeze m9 source and narrative specifications"
```

## 13. Task 3：真实 VoxCPM、PCM 封存与绝对时间线

### 13.1 Red

- 在隔离 fixture 中验证候选可续跑、attempt checksum 选择、错误 voice profile、chunk text drift、
  PCM 格式/采样率/声道错误、累积 timing、seal supersede 和 active seal drift；
- 验证 M4A/text source checksum、人工 transcript confirmation、canonical prompt WAV、
  `high-fidelity-clone` request fingerprint 和 raw WAV response；任一 drift 均产生新 attempt identity；
- 验证 request 没有 `control`/`emotion` 字段，NarrationSpec 未使用 controllable clone；
- 特别验证逐 chunk 浮点秒转帧后相加与累计 sample-frame 的差异会被拒绝；
- 验证工具没有按标点修改 Task 2 已创作 chunks。

### 13.2 Green / 真实生产

```bash
npm run narration:generate -- --project product-comic-vertical
npm run narration:seal -- \
  --project product-comic-vertical \
  --attempt <candidate-sha256>
npm run narration:check -- --project product-comic-vertical
```

- 使用仓库外 `RSP_VOXCPM_PRIVATE_CONFIG`；日志/evidence 不记录 endpoint、token、private path；
- 首先保护并复核 `public/voice_profile/my_voice.m4a`/`my_voice_text.txt` checksum；人工逐字听校
  prompt transcript，随后由 Task 1 normalizer 在 candidate/private workspace 生成 canonical
  prompt WAV；不修改或 staging 两个原始用户文件；
- 每个 authored chunk 通过 `/clone_with_prompt` 做高质量克隆；请求带准确 prompt text/audio 和
  reference audio，不带 emotion/control；
- 每个 chunk 试听发音、断句、音色一致性、语气是否清晰自然克制、噪声、截断和是否出现意外
  情绪化表演；失败则调整 authored 文案/断句或生成新 attempt，不能编辑 WAV 冒充同一 checksum；
- 只在选中真实 attempt 后原子 seal；输出 48 kHz mono s16le PCM complete WAV、active manifest、
  SemanticTiming 和内嵌 CaptionCues；
- 实测总时长超出 120–180 秒，回到 Task 2 新 commit 修订 Story/Narration，再重新生成与 seal；
  不在 Task 3 偷改文案；
- 封存后记录完整 WAV checksum、sample count、sample rate、duration frames、每 chunk cumulative
  sample boundary 和 fingerprint。

### 13.3 验证

```bash
node --import tsx --test tests/narration/*.test.ts
npm run narration:check -- --project product-comic-vertical
ffprobe -v error -show_streams -show_format -of json \
  public/voice_profile/my_voice.m4a
ffprobe -v error -show_streams -show_format -of json \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/complete.wav
ffmpeg -nostdin -v error \
  -i public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/complete.wav \
  -f null -
npm run typecheck
```

### 13.4 精确 staging / commit

seal 完成后，先把 `<sealed-fingerprint>` 和实际 generated file 列入
`generated/task-3-staging.generated.json`；下列命令必须替换为字面量后再运行：

```bash
git add -- \
  src/projects/product-comic-vertical/generated/sealed-narration.generated.json \
  src/projects/product-comic-vertical/generated/semantic-timing.generated.json \
  src/projects/product-comic-vertical/generated/task-3-staging.generated.json \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/problem-hook-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/problem-hook-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/problem-friction-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/problem-friction-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/product-reveal-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/core-capabilities-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/core-capabilities-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/workflow-input-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/workflow-input-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/workflow-create-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/workflow-create-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/workflow-create-03.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/workflow-result-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/workflow-result-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/differentiated-value-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/differentiated-value-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/proof-and-fit-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/proof-and-fit-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/call-to-action-01.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/chunks/call-to-action-02.wav \
  public/projects/product-comic-vertical/narration/05c0328669049d453e30baaf9770f513fcbb7cded69826b48e105089ebad61c8/complete.wav
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(product): seal m9 narration and semantic timing"
```

候选 workspace、canonical prompt WAV、失败 attempts、私有 config 和临时音频不得 staging；
`public/voice_profile/my_voice.m4a` 与 `my_voice_text.txt` 继续作为受保护用户输入，不纳入本 Task
commit。

## 14. Task 4：9:16 Narrative Baseline、Registry 与 narrative AutoCheck

### 14.1 Red

- 写第二 Composition registry/lazy-load、1080×1920 descriptor、sealed duration、透明 frame 0、
  active-caption frame 与全长 baseline evidence 测试；
- 证明旧的固定 frame 15/1731 假设在第二 Story 上失败；
- 证明 Scene 目录、RendererRegistry、GlobalVisual 或 Shotcraft 不是 Narrative Baseline 前置条件；
- 对 source、StoryCheck、seal、timing、registry、Composition、baseline media 任一 drift 做隔离
  fail-closed 测试。

### 14.2 Green / 真实媒体

- 创建透明的 `Composition.tsx`，只装配 sealed narration 与唯一 CaptionLayer；
- registry 静态生成且只含字面量 lazy import；
- render frame 0 透明 still、第一个 active CaptionCue 区间内 still、完整 H.264/AAC baseline MP4；
- baseline evidence 从 registry/timing/ffprobe 复算，不写死 M9 帧数；
- 写 passing narrative AutoCheck。

```bash
npm run registry:generate
npm run compositions
remotion still src/index.ts ProductComicVertical \
  out/product-comic-vertical/m3-transparent-frame-0.png \
  --frame=0 --image-format=png --log=error
remotion still src/index.ts ProductComicVertical \
  out/product-comic-vertical/m3-caption-frame-<active-frame>.png \
  --frame=<active-frame> --image-format=png --log=error
remotion render src/index.ts ProductComicVertical \
  out/product-comic-vertical/m3-narrative-baseline.mp4 \
  --codec=h264 --audio-codec=aac --log=error
npm run baseline:evidence -- --project product-comic-vertical
npm run project:check -- \
  --project product-comic-vertical --level narrative --write-auto-check
npm run project:check -- --project product-comic-vertical --level narrative
```

### 14.3 移动端字幕 gate

- 以完整正常速度播放 baseline，不只看 still；
- 在 360×640 等效显示尺寸检查每个 CaptionCue 的可读时间、断行、字数、底部安全区；
- CaptionLayer 当前固定 40 px；优先修订过长 authored chunk，而不是给 M9 复制第二套字幕层；
- 若共享 CaptionLayer 在合法短 chunk 下仍无法满足竖屏安全区，必须先单独 TDD 修复共享
  responsive layout，并用 GPS + M9 回归；不能在 Scene renderer 画字幕绕过问题。

### 14.4 精确 staging / commit

```bash
git add -- \
  scripts/baseline/evidence.ts \
  scripts/project-check/run.ts \
  src/projects/product-comic-vertical/Composition.tsx \
  src/projects/product-comic-vertical/generated/narrative-baseline-evidence.generated.json \
  src/projects/product-comic-vertical/generated/narrative-auto-check.generated.json \
  src/projects/project-registry.generated.ts \
  tests/projects/product-comic-vertical-composition.test.tsx \
  tests/registry/project-registry.test.ts \
  tests/registry/project-registry.test.tsx \
  tests/baseline/evidence.test.ts \
  tests/project-check/project-check.test.ts \
  tests/project-check/invalidation.test.ts
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(product): prove m9 vertical narrative baseline"
```

`out/` 媒体不 staging；其 checksum 只进入 baseline evidence。

## 15. Task 5：全量 Shotcraft coverage、漫画设计系统与资源冻结

### 15.1 Red

为 project-local inventory/coverage generator 写测试，至少覆盖：

- 104/161 数量不足、重复 card/style、missing preview、checksum drift；
- library revision 与 Git commit 混淆；
- card 必需章节缺失；
- multi-style、template、helper、ambiguous/missing demo；
- local/remote/dynamic imports、source-root escape、缺 package/version、缺 code/media license；
- coverage 空理由、未决 decision、selected exact 无唯一 meaningId、一个 Scene 多 exact；
- selected exact 未真实本地化完整最小闭包；
- comic design token 缺失、caption band 侵入、自动布局/DSL 字段、CSS animation 声明；
- 产品资产 checksum/permission 与 Catalog 不一致。

### 15.2 Green

- 从 frozen local clone `d491...` 和已下载 release previews 生成完整 inventory；
- 主 Agent 逐 card/style 阅读 card、完整配方、准确 demo、preview、依赖和 license，并根据 Task 2
  repo-first 产品事实和本片叙事逐项完成 coverage；脚本只验证完整性，不替 Agent 做主观选择；
- 写 9:16 漫画设计系统、角色/产品 model sheet、VisualStyleSpec；
- 建立 shared base Catalog + M9 project overlay，登记本地化产品资产和未来 global audio；
- 对 selected exact 执行最小闭包本地化；未选条目不复制到 runtime；
- 输出 selected source/adaptation review skeleton，真实 adaptation evidence 在对应 Scene 完成后
  才允许变为 pass。

### 15.3 验证

```bash
node --import tsx --test \
  tests/m9-product/shotcraft-inventory.test.ts \
  tests/m9-product/comic-design-system.test.ts \
  tests/external-references/*.test.ts \
  tests/catalog/*.test.ts
node --import tsx scripts/m9-product/shotcraft-inventory.ts check \
  --project product-comic-vertical \
  --source-root <frozen-video-shotcraft-root> \
  --preview-root <frozen-gallery-preview-root>
npm run catalog:check
npm run typecheck
npm run lint
```

### 15.4 精确 staging / commit

固定路径：

```bash
git add -- \
  scripts/m9-product/shotcraft-inventory.ts \
  scripts/m9-product/comic-design-system.ts \
  src/projects/product-comic-vertical/references/video-shotcraft/upstream-receipt.generated.json \
  src/projects/product-comic-vertical/references/video-shotcraft/shot-inventory.generated.json \
  src/projects/product-comic-vertical/references/video-shotcraft/shot-coverage.json \
  src/projects/product-comic-vertical/references/video-shotcraft/shot-selection.json \
  src/projects/product-comic-vertical/references/video-shotcraft/selected-source-adaptation-review.json \
  src/projects/product-comic-vertical/visual-style.json \
  src/projects/product-comic-vertical/comic-design-system.json \
  src/projects/product-comic-vertical/character-model-sheet.json \
  src/projects/product-comic-vertical/system-model-sheet.json \
  src/projects/product-comic-vertical/resource-catalog.json \
  src/projects/product-comic-vertical/generated/resource-catalog.generated.json \
  src/projects/product-comic-vertical/generated/task-5-staging.generated.json \
  tests/m9-product/shotcraft-inventory.test.ts \
  tests/m9-product/comic-design-system.test.ts
```

`task-5-staging.generated.json` 必须列出 selected exact 的每个 LICENSE、card、preview evidence、
demo entry、relative dependency、local asset 和 manifest 的字面量 destination path；主 Agent 逐项
追加，禁止目录级 add。完整 100 MB preview 库和未选源码不得提交。

```bash
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(product): freeze m9 shotcraft coverage and comic system"
```

### 15.5 Task 5A：Scene-local PCM 与 Catalog identity 一次性预冻结（执行期最小修订）

Task 6 首次 Red 前确认了一个原计划内部冲突：通用 `scene:package` 要求 `sound-plan` 的每个
Scene cue 已由 current ResourceCatalog 提供 descriptor identity；但第 16.1 节同时要求各 Scene
任务才生成音频，而第 16.2 节的固定 staging 又不允许 Scene 任务修改共享 project Catalog。
若逐 Scene 改 Catalog，已完成 Scene 的 `taskInputFingerprint`、`resourceCatalogFingerprint` 和
ScenePackage 会随下一 Scene 立即失效。

因此在 6A 前增加一次性、project-local 的 Task 5A：

1. Red：扩展 `comic-design-system.test.ts`，要求十个 meaningId 各有且只有一个 verified、
   project-authored、48 kHz mono PCM Scene cue descriptor，并证明缺文件、checksum drift、错误 role
   或 Catalog identity 会失败；
2. Green：用 `scripts/m9-product/scene-audio.ts` 确定性生成十条短 PCM，文件只进入
   `public/projects/product-comic-vertical/scene-audio/<meaningId>/`；一次性更新 project overlay 和
   merged Catalog；不生成 narration、BGM 或 cross-scene ambience；
3. 运行脚本 `check`、M9 Catalog/设计系统测试、`typecheck`、`lint`、shared `catalog:check` 和 GPS
   protection check；
4. 精确 staging：脚本、两个 project Catalog 文件、测试和十个字面量 WAV；单独提交
   `fix(product): prefreeze m9 scene audio catalog identities`；
5. 6A–6J 的 Scene 任务只创作并绑定各自已预冻结的 cue，不覆盖 PCM、不再修改共享 Catalog。

该修订不提升共享 capability，不改变 M1–M8/GPS，不改变 Scene ownership；它只把原本必需却
顺序矛盾的 checksum/Catalog identity 提前到所有 Scene task input 冻结之前。

## 16. Tasks 6A–6J：十个独占 ScenePackage 的红绿制作

### 16.1 每个 Scene 共用的 TDD 顺序

每个 Scene 是一个独立 Task 和一个本地 commit。所有剩余 Beat 可按固定 ownership 并行
authoring，但主 Agent 必须严格按 Story 顺序验收和提交。后一个 Scene 只能读取主 Agent 冻结的
continuity brief 与已提交前序 Scene 的 exit state，不得读取其他子代理的未提交目录，也不得修改
前一个目录；在其提交前必须针对届时已提交的前序 exit state 重新完成 continuity 检查。

每个 Scene 的 Red：

1. 先写 `task-input.generated.json` identity test，绑定 StoryBeat、sealed absolute frame window、
   VisualStyle、comic system、Catalog、Shotcraft coverage/selection 和相邻 continuity；
2. 写 VisualPlan/ShotPlan/SyncAnchor/SoundPlan/selected resources 的 fail-closed test；
3. 若 exact selected，先证明缺 localization/fidelity/Renderer import/frame binding 会失败；
4. 写 ScenePackage check，确认 visual renderer 与 Scene-local sound 都存在且不拥有 narration/
   caption/global audio；
5. 首次运行必须红在“Renderer/plan/package 尚未完成”，不能红在错误 fixture 或 GPS 路径。

每个 Scene 的 Green：

1. 显式创作 panel composition、product/character states、local Shot components 和 frame motion；
2. 绑定 Task 5A 已封存的 Scene-local SFX PCM 并钉到 Scene-local frame；不覆盖 PCM，不写
   narration、BGM 或 cross-scene ambience；
3. 若 exact selected，真实 import adaptation，生成 source/adaptation phase pairs 和 pass-only receipt；
4. 生成 ScenePackage；
5. render 入口/中段/出口 still 和完整正常速度 Scene authoring preview；
6. 检查 1080×1920、360×640、caption band、漫画文字类别、panel reading order 和连续性；
7. 只修改本 Scene 目录和本 Scene 的 `public/.../scene-audio/<meaningId>/`。

通用验证命令（把 `<meaningId>` 替换为表中字面量）：

```bash
npm run scene:package -- \
  --project product-comic-vertical --meaning <meaningId> --write
npm run scene:package -- \
  --project product-comic-vertical --meaning <meaningId> --check
node --import tsx --test tests/m9-product/<meaningId>.test.tsx
remotion compositions \
  src/projects/product-comic-vertical/scenes/<meaningId>/authoring/index.ts
remotion render \
  src/projects/product-comic-vertical/scenes/<meaningId>/authoring/index.ts \
  ProductComicVertical-<meaningId>-Authoring \
  out/m9-product-comic-vertical/scenes/<meaningId>/preview.mp4 \
  --codec=h264 --audio-codec=aac --log=error
ffmpeg -nostdin -v error \
  -i out/m9-product-comic-vertical/scenes/<meaningId>/preview.mp4 \
  -f null -
```

子代理只运行本 Scene 的 Red/Green、`scene:package --write/--check`、聚焦 test、targeted lint、
Composition 枚举和一次真实正常速度媒体证据；它不重复运行全仓 typecheck/lint/GPS/voice 检查，
也不要求主 Agent 重渲染同一 preview。所有并行 Scene Green 后，主 Agent统一运行一次全仓
typecheck/lint 和 protected-input batch check；每个 Scene 提交前仍独立复跑该 Scene 的聚焦 test、
package check、媒体 checksum/EOF/ffprobe、continuity 与 GPS protection。只有媒体 identity、证据或
视觉复核不一致时才重渲染。exact selected Scene 仍额外完成其 lineage、closure、真实 import/frame
binding、配对证据和正常速度 fidelity review。

### 16.2 每个 Scene 固定 staging 文件集

对表中每个字面量 `<meaningId>`，只 stage：

```text
src/projects/product-comic-vertical/scenes/<meaningId>/Renderer.tsx
src/projects/product-comic-vertical/scenes/<meaningId>/authoring/Composition.tsx
src/projects/product-comic-vertical/scenes/<meaningId>/authoring/Root.tsx
src/projects/product-comic-vertical/scenes/<meaningId>/authoring/index.ts
src/projects/product-comic-vertical/scenes/<meaningId>/selected-resources.json
src/projects/product-comic-vertical/scenes/<meaningId>/shot-plan.json
src/projects/product-comic-vertical/scenes/<meaningId>/shot-recipe-selection.json
src/projects/product-comic-vertical/scenes/<meaningId>/sound-plan.json
src/projects/product-comic-vertical/scenes/<meaningId>/sync-anchors.json
src/projects/product-comic-vertical/scenes/<meaningId>/task-input.generated.json
src/projects/product-comic-vertical/scenes/<meaningId>/visual-plan.json
src/projects/product-comic-vertical/scenes/<meaningId>/generated/reference-fidelity.generated.json
src/projects/product-comic-vertical/scenes/<meaningId>/generated/scene-package.generated.json
src/projects/product-comic-vertical/scenes/<meaningId>/shots/<project-shot>.tsx
tests/m9-product/<meaningId>.test.tsx
```

Scene-local PCM 已由 Task 5A 逐文件提交；6A–6J 的 staging 不重复加入这些已跟踪文件。

若 Task 5 为该 Scene 选择 exact reference，再追加：

```text
src/projects/product-comic-vertical/scenes/<meaningId>/generated/reference-fidelity-review.generated.json
src/projects/product-comic-vertical/scenes/<meaningId>/shots/video-shotcraft/<style-key>/LICENSE
src/projects/product-comic-vertical/scenes/<meaningId>/shots/video-shotcraft/<style-key>/localization-manifest.generated.json
src/projects/product-comic-vertical/scenes/<meaningId>/shots/video-shotcraft/<style-key>/upstream/<each-literal-closure-path>
src/projects/product-comic-vertical/scenes/<meaningId>/shots/video-shotcraft/<style-key>/AdaptedShot.tsx
```

非 exact Scene 的固定 receipt 必须为与 selection 绑定的 `not-applicable`；exact Scene 在同一路径
写 pass-only receipt，并额外生成 fidelity review/artifacts。通用 `scene:package` 对两类 Scene 都
读取该固定路径。

`<project-shot>`、`<literal-audio-file>`、`<style-key>` 和 closure paths 必须已由 Task 5/当前 Scene
staging manifest 展开；不能运行带占位符的命令。out preview 不 staging。

### 16.3 Scene Task 与 commit 表

| Task | meaningId              | commit message                                        |
| ---- | ---------------------- | ----------------------------------------------------- |
| 6A   | `problem-hook`         | `feat(product): author m9 problem hook scene`         |
| 6B   | `problem-friction`     | `feat(product): author m9 problem friction scene`     |
| 6C   | `product-reveal`       | `feat(product): author m9 product reveal scene`       |
| 6D   | `core-capabilities`    | `feat(product): author m9 core capabilities scene`    |
| 6E   | `workflow-input`       | `feat(product): author m9 workflow input scene`       |
| 6F   | `workflow-create`      | `feat(product): author m9 workflow create scene`      |
| 6G   | `workflow-result`      | `feat(product): author m9 workflow result scene`      |
| 6H   | `differentiated-value` | `feat(product): author m9 differentiated value scene` |
| 6I   | `proof-and-fit`        | `feat(product): author m9 proof and fit scene`        |
| 6J   | `call-to-action`       | `feat(product): author m9 call to action scene`       |

每个 Task 使用第 16.2 节对应 literal path 的 `git add --`，再运行：

```bash
git diff --cached --name-status
git diff --cached --check
git commit -m "<table-commit-message>"
```

## 17. Task 7：全 ready coverage、registry、Scene projection 与批量 review

### 17.1 Red

- 10 Scene story order、missing/stale package、重复 rendererId、动态 import、caption ownership、
  Scene-local audio window、reference receipt、source graph 和 projection fingerprint 测试；
- SceneVisualCheck、SceneSoundCheck、continuity review 必须绑定同一批真实 still/contact sheet/
  normal-speed preview；
- 任一 Scene 单独 drift，只失效对应 package + aggregate identities；不能重写 sealed timing。

### 17.2 Green

- 生成 10/10 ready SceneCoverageMap 和 10 个 literal import RendererRegistry；
- 生成 StoryVisual/SoundDesign projection 和 `scene-runtime-data.ts`；
- 顶层 Composition 接入 10 Scene visuals 与 Scene-local sounds，NarrativeCore 仍唯一拥有旁白/
  CaptionLayer；
- 每 Scene 至少入口/中段/出口 still；额外覆盖每个 exact phase、panel handoff、拟声词峰值、
  transition boundary；
- contact sheet 按 Story 顺序，至少 5×6 以覆盖 30 个 Scene review frame；
- 完整正常速度 Scene review MP4 使用 sealed full duration；批量检查 SceneVisual、SceneSound、
  相邻 continuity、漫画系统一致性和 360×640 可读性；
- review 不能改 Story、旁白或 timing。发现叙事问题回滚到相应上游 Task 做新 commit，再使所有
  downstream receipt 自然失效。

### 17.3 验证

```bash
npm run scene:coverage -- --project product-comic-vertical --write
npm run scene:coverage -- --project product-comic-vertical --check
npm run renderer:generate -- --project product-comic-vertical
npm run renderer:check -- --project product-comic-vertical
node --import tsx --test tests/m9-product/scene-assembly.test.tsx
npm run compositions
node --import tsx scripts/m9-product/scene-evidence.ts render
node --import tsx scripts/m9-product/scene-evidence.ts write
node --import tsx scripts/m9-product/scene-evidence.ts check
npm run project:check -- \
  --project product-comic-vertical --level final --write-final-check
npm run project:check -- --project product-comic-vertical --level final
```

此时 `project:check --level final` 预期通过 Scene branch，但因尚无 FinalAssembly，可保持 v1/非 M8
分支语义；不得提前伪造 v2。

### 17.4 精确 staging / commit

```bash
git add -- \
  scripts/m9-product/scene-evidence.ts \
  src/projects/product-comic-vertical/generated/scene-coverage.generated.json \
  src/projects/product-comic-vertical/generated/m9-scene-production-evidence.generated.json \
  src/projects/product-comic-vertical/generated/final-mechanical-check.generated.json \
  src/projects/product-comic-vertical/renderer-registry.generated.ts \
  src/projects/product-comic-vertical/scene-runtime-data.ts \
  src/projects/product-comic-vertical/Composition.tsx \
  src/projects/product-comic-vertical/reviews/scene-review.json \
  tests/m9-product/scene-assembly.test.tsx \
  tests/m9-product/scene-evidence.test.ts
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(product): assemble and review m9 scene packages"
```

## 18. Task 8：GlobalSound、GlobalVisual 与 FinalAssembly

### 18.1 Red

- GlobalSound 只接受一条 full-length cross-scene ambience 和一条 full-length BGM；列出任何
  Scene cue、改变 narration gain/playback/timing、错误 sample rate/duration/checksum 均失败；
- ducking 只由 sealed spoken segments 的 absolute `[startFrame,endFrame)` 产生，attack/release
  clamp 到 Composition，重叠取最小；
- GlobalVisual 只接受 project-local frame treatment 和 product/comic continuity motif，出现
  caption、Scene chooser、自动布局、动态 module、CSS animation 或 GPS motif 均失败；
- FinalAssembly 必须绑定 source/narrative/scene/references/catalog/global/Composition identities；
  任一变化使旧 assembly 失败。

### 18.2 Green

- 生成两条 48 kHz PCM 全局音频；若使用第三方音乐/音效，先完成逐资产 license/attribution，
  未确认的 Shotcraft bundled audio 禁止进入；
- 写 resource overlay、GlobalSoundPlan、FinalSoundProjection；narrationGain 固定 1；
- mastering policy 在真实 evidence 前冻结，初始验收范围为 -24 至 -16 LUFS、true peak 与
  sample peak 均不高于 -1.0 dBTP；不能在 evidence writer 中为了通过而动态放宽；
- 实现 `global-visual/GlobalVisualLayers.tsx`，只消费静态 project-local data；
- 写 GlobalVisualProjection、FinalAssemblyPlan、`final-assembly-data.ts`，顶层 Composition 按
  Scene → GlobalVisual → Caption、narration → Scene-local → cross-scene ambience/BGM 的固定
  order 装配；
- 写/检查 FinalAssembly，不生成 approval。

### 18.3 验证

```bash
node --import tsx --test \
  tests/m9-product/global-sound.test.ts \
  tests/m9-product/global-visual.test.tsx \
  tests/final-assembly/*.test.ts
node --import tsx scripts/m9-product/global-audio.ts check
npm run final:assembly -- --project product-comic-vertical --write
npm run final:assembly -- --project product-comic-vertical --check
npm run compositions
npm run typecheck
npm run lint
```

### 18.4 精确 staging / commit

```bash
git add -- \
  scripts/m9-product/global-audio.ts \
  src/projects/product-comic-vertical/resource-catalog.json \
  src/projects/product-comic-vertical/generated/resource-catalog.generated.json \
  src/projects/product-comic-vertical/global-sound-plan.json \
  src/projects/product-comic-vertical/global-visual-plan.json \
  src/projects/product-comic-vertical/final-assembly-plan.json \
  src/projects/product-comic-vertical/final-assembly-data.ts \
  src/projects/product-comic-vertical/generated/global-audio.generated.json \
  src/projects/product-comic-vertical/generated/global-visual-projection.generated.json \
  src/projects/product-comic-vertical/generated/final-assembly.generated.json \
  src/projects/product-comic-vertical/global-visual/GlobalVisualLayers.tsx \
  src/projects/product-comic-vertical/Composition.tsx \
  public/projects/product-comic-vertical/global-audio/cross-scene-ambience.wav \
  public/projects/product-comic-vertical/global-audio/global-bgm.wav \
  tests/m9-product/global-sound.test.ts \
  tests/m9-product/global-visual.test.tsx \
  tests/m9-product/final-assembly.test.tsx
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(product): assemble m9 global sound and visual layers"
```

## 19. Task 9：完整最终媒体、技术 evidence 与批量 review

### 19.1 真实媒体生成

- 自动选择 review frames：每个 Scene 入口/中段/出口、每个 transition 边界前后、每个 exact
  reference 关键 phase、代表性 caption/balloon/onomatopoeia、首帧和末帧；
- still 数量不得只为凑表，预计 34–50 张；contact sheet 必须按时间排序并保留可读尺寸；
- 渲染完整正常速度 MP4，不允许只用低帧率 GIF、短片或 still 代替；
- review media 使用 current FinalAssembly fingerprint，任何重渲染 checksum 变化都要求重做
  evidence/review。

```bash
node --import tsx scripts/m9-product/final-evidence.ts render
```

### 19.2 技术检查

固定检查：

1. `ffprobe`：H.264、1080×1920、30/1 fps、video stream 恰好 1；AAC、48 kHz、stereo、audio
   stream 恰好 1；frame count 精确等于 sealed/registry `durationInFrames`；duration 与帧数误差在
   单帧容限内；
2. 完整解码：

   ```bash
   ffmpeg -nostdin -v error \
     -i out/m9-product-comic-vertical/product-comic-vertical-final-preview.mp4 \
     -map 0:v:0 -map 0:a:0 -f null -
   ```

3. 固定版本 `ebur128`/true-peak analysis：integrated loudness 在已冻结 -24 至 -16 LUFS，
   true peak 和 sample peak 不高于 -1.0 dBTP；不得把 mean volume 当 LUFS、sample peak 当
   true peak；
4. 声道：左右声道存在、无意外 mono metadata、无相位抵消；narration 中心清楚；
5. ducking：spoken window 的 BGM/ambience gain、attack/release、pause recovery 与 plan
   byte-exact；Scene-local SFX 不被 GlobalSoundPlan 第二次列举；
6. 帧边界：每个 spoken segment 全部存在，transition/global layer 没有移动、缩短或遮吞；
7. 文件 checksum、ffprobe JSON、decode-to-EOF、音频分析和 review fingerprint 全部进入 canonical
   `generated/final-preview-evidence.generated.json`。

### 19.3 批量创意/可用性 review

主 Agent 一次性批量记录，不要求用户逐 still 审批：

- 产品问题、能力、流程、差异化、限制与 CTA 是否完全符合 source packet；
- 10 Scene 是否构成一条连贯叙事，而非 10 张互不相关的 demo；
- 漫画 panel 阅读方向、角色/产品一致性、线条/网点/速度线/拟声词/转场是否同一系统；
- 正式字幕与气泡/拟声词/画面文字是否明确区分；
- 1080×1920 和 360×640 下是否可读，CTA 与字幕不被移动端 UI/safe area 挤压；
- 每个 selected exact reference 在正常速度可辨识，且没有为了保真牺牲产品信息；
- narration、Scene-local ambience/SFX、global ambience/BGM 的层级与同步是否清楚；
- 首尾、每个 Scene 边界和最后 CTA 有足够 readable hold。

只有所有 review 项 pass，evidence 才能写 `ready-for-user-approval`。脚本不能代替主观 review，
Agent review 也不能代替用户 FinalPreviewApproval。

### 19.4 验证

```bash
node --import tsx --test tests/m9-product/final-evidence.test.ts
node --import tsx scripts/m9-product/final-evidence.ts write
node --import tsx scripts/m9-product/final-evidence.ts check
npm run final:assembly -- --project product-comic-vertical --check
npm run project:check -- --project product-comic-vertical --level final
```

此时最后一条预期因缺 FinalPreviewApproval 以明确 code 失败；不能为获得绿色而代签。

### 19.5 精确 staging / commit

```bash
git add -- \
  scripts/m9-product/final-evidence.ts \
  src/projects/product-comic-vertical/generated/final-preview-evidence.generated.json \
  src/projects/product-comic-vertical/reviews/final-assembly-review.json \
  tests/m9-product/final-evidence.test.ts
git diff --cached --name-status
git diff --cached --check
git commit -m "test(product): bind m9 final preview evidence"
```

`out/m9-product-comic-vertical/` 的 MP4、stills 和 contact sheet 不默认 staging；evidence 绑定它们的
相对路径和 checksum。

## 20. Task 10：强制用户 FinalPreviewApproval 停点

Task 9 commit 后，主 Agent 只向用户交付：

- 完整正常速度 MP4 的可点击绝对路径；
- contact sheet 与关键 still；
- preview checksum、FinalAssembly fingerprint、evidence fingerprint；
- 技术 facts：尺寸、fps、帧数、时长、codec、采样率、声道、integrated loudness、true peak、
  sample peak、完整解码结果；
- 批量 review 结论、任何已知限制；
- 明确询问用户是否批准“当前这一个 checksum 的完整 preview”。

没有用户明确批准，保持：

```text
src/projects/product-comic-vertical/reviews/final-preview-approval.json       absent
src/projects/product-comic-vertical/generated/final-preview-approval.generated.json absent
final-mechanical-check-v2                                                   fail/absent
```

Task 10 不写文件、不 staging、不 commit。用户要求修改时，回到对应 Task 做新 commit、重新生成
所有 downstream identity，并再次停在 Task 10；旧口头批准或旧 checksum 不可复用。

## 21. Task 11：批准 receipt、v2、失效矩阵与 M9 closeout

**唯一前置：** 用户在当前对话中明确批准 Task 10 展示的当前 preview checksum、evidence
fingerprint 和 FinalAssembly fingerprint。

### 21.1 Red

- generic/project-local approval writer 在无 explicit-user authorization、错误 checksum、旧 evidence、
  旧 assembly、错误 story/composition 时失败；
- final-v2 必须固定 15 项全部 pass；
- 对 source claim、Story、sealed WAV、timing、caption、registry、VisualStyle、Catalog、Shotcraft
  inventory/coverage/selection、exact receipt、任一 Scene、coverage/registry/projection、GlobalSound、
  GlobalVisual、FinalAssembly、preview media/evidence/approval 的隔离 drift 逐项 fail；
- GPS v2 仍 current；M9 drift matrix 不得修改 GPS fixture/产物。

### 21.2 Green

- 只根据用户明确授权写 authoring approval record 和 generated approval；
- 写 passing M9 `final-mechanical-check.generated.json` v2；
- 完成两主题 generalization report：哪些合同/runtime 零修改复用、哪些只是去夹具耦合、哪些仍是
  GPS/M9 project-local；
- 对确实被两个主题证明稳定的候选，只写 proposal，包含 source fingerprints、目标 API、精确
  files、target `src/remotion/capabilities/...`、迁移风险和回滚；不执行 promotion；
- 同步 README、ITERATION_STATUS、ROADMAP、ARCHITECTURE、PRODUCTION_WORKFLOW、
  DETERMINISTIC_EXECUTION 和 TERMINOLOGY 的真实完成状态；不得把 M10 说成已开始；
- package scripts 增加 M9 read-only checks，使 `npm run check` 同时保护 GPS 与第二主题，不生成
  媒体、不访问网络、不读取私有 VoxCPM config。

### 21.3 验证

```bash
node --import tsx scripts/m9-product/approval.ts \
  write explicit-user-current-preview
node --import tsx scripts/m9-product/approval.ts check
npm run project:check -- \
  --project product-comic-vertical --level final --write-final-check
npm run project:check -- --project product-comic-vertical --level final
node --import tsx --test tests/m9-product/fail-closed-matrix.test.ts
npm run check
git diff --exit-code f89bf6d95decde27c7a128eaa90568526db49942 -- \
  src/projects/gps-relativity \
  public/projects/gps-relativity \
  docs/evidence/m8-gps-relativity-final-assembly.md
```

### 21.4 精确 staging / commit

```bash
git add -- \
  package.json \
  scripts/m9-product/approval.ts \
  src/projects/product-comic-vertical/reviews/final-preview-approval.json \
  src/projects/product-comic-vertical/generated/final-preview-approval.generated.json \
  src/projects/product-comic-vertical/generated/final-mechanical-check.generated.json \
  src/projects/product-comic-vertical/generated/m9-generalization-report.generated.json \
  src/projects/product-comic-vertical/generated/m9-fail-closed-matrix.generated.json \
  src/projects/product-comic-vertical/reviews/generalization-review.json \
  docs/evidence/m9-product-comic-vertical-generalization.md \
  docs/promotions/m9-product-comic-vertical-promotion-proposals.md \
  README.md \
  docs/ITERATION_STATUS.md \
  docs/ROADMAP.md \
  docs/ARCHITECTURE.md \
  docs/PRODUCTION_WORKFLOW.md \
  docs/DETERMINISTIC_EXECUTION.md \
  docs/TERMINOLOGY.md \
  tests/m9-product/approval.test.ts \
  tests/m9-product/fail-closed-matrix.test.ts
git diff --cached --name-status
git diff --cached --check
git commit -m "docs: close m9 product generalization proof"
```

完成后仍不 push。

## 22. fail-closed matrix

Task 11 的隔离副本必须至少覆盖下表；每个 mutation 只改一项，先证明 relevant check fail，再
恢复隔离副本，不修改正式工作树。

| 变更                                                | 必须失效                                     |
| --------------------------------------------------- | -------------------------------------------- |
| product source/claim checksum 变化                  | Story/source receipt、下游 assembly/approval |
| 加入无 evidence 的营销 claim                        | source gate、StoryCheck                      |
| StoryBeat 顺序/meaningId 变化                       | timing、coverage、registry、assembly         |
| authored ttsChunk 文本变化                          | seal、timing、caption、narrative check       |
| voice source M4A/text checksum 变化                 | source receipt、provider attempt、seal       |
| prompt transcript 未逐字确认或 canonical WAV 漂移   | high-fidelity generation gate                |
| high-fidelity request 带 control/emotion            | provider adapter gate                        |
| voice profile mode/parameters 变化                  | StoryCheck、provider attempt、seal           |
| complete WAV 单 byte 变化                           | seal、timing、所有下游                       |
| PCM sample count/rate/channel 变化                  | seal/timing                                  |
| SemanticTiming frame/window 变化                    | narrative、Scene task inputs、ducking        |
| CaptionCue 改动或 Scene 渲染正式字幕                | narrative/Scene review                       |
| Registry import/descriptor/duration drift           | baseline、assembly                           |
| 9:16 width/height/fps drift                         | baseline、media evidence                     |
| Shotcraft commit/library/card/style 漂移            | inventory/coverage/selection                 |
| inventory 少一个 card/style/preview                 | full coverage                                |
| coverage 空理由或未决 decision                      | full coverage                                |
| ambiguous/missing demo 选 exact                     | reference gate                               |
| exact closure 少文件/多文件/checksum drift          | localization/fidelity                        |
| 未批准 bare import/remote/dynamic import            | source guard                                 |
| code license 冒充 media license                     | Catalog/reference gate                       |
| Renderer 未 import exact adaptation                 | fidelity/final                               |
| exact frame-state/phase pair drift                  | fidelity review                              |
| comic system 增加 auto-layout/DSL/CSS animation     | design/renderer checks                       |
| 产品/角色 model sheet drift                         | affected Scene + continuity                  |
| Scene visual plan/source drift                      | 单 Scene package、coverage、assembly         |
| Scene-local audio drift/越界                        | 单 Scene package、sound projection           |
| Scene 拥有 narration/caption/global BGM             | ownership check                              |
| coverage missing/stale/out-of-order                 | coverage/registry/final                      |
| registry 动态路径/目录扫描                          | registry/runtime check                       |
| GlobalSound 列出 Scene SFX                          | global-sound ownership                       |
| narration gain/playback/timing 改动                 | global-sound/final                           |
| duck envelope/spoken window drift                   | final sound/evidence                         |
| GlobalVisual 渲染 caption/选择 Scene/复制 GPS motif | global-visual/final                          |
| Composition z-order/mix-order/source drift          | FinalAssembly                                |
| MP4 单 byte/truncate/frame count/duration drift     | final evidence/approval                      |
| audio stream/48k/stereo/decode-to-EOF 失败          | final evidence                               |
| LUFS/true peak/sample peak 越阈                     | final evidence                               |
| still/contact sheet/review fingerprint drift        | final evidence                               |
| approval checksum/evidence/assembly 不匹配          | approval/v2                                  |
| approval 缺失                                       | v2 final fail，writer 不代签                 |
| GPS 任一受保护 path 改动                            | M9 protection gate                           |

## 23. M9 泛化结论与 promotion proposal 边界

最终 report 必须把发现分成四类：

1. `reused-without-change`：第二主题直接复用且 GPS 回归不变的合同、runtime、CLI；
2. `fixture-decoupling-fix`：M3/M6/M8 本应通用但被 GPS/draw-svg-trace/M8 文件名写死的修复；
3. `project-local-by-design`：漫画设计、10 个 Scene、产品 model sheet、GlobalVisual、声音制作、
   M9 evidence orchestration；
4. `promotion-candidate`：两主题都证明稳定、但尚未迁移的能力。

每个 promotion proposal 必须独立列出：

- GPS 与 M9 两份 source fingerprints/调用证据；
- 建议 API 和明确非目标；
- source files、target files、目标 `src/remotion/capabilities/<name>/`；
- 迁移后 GPS/M9 的 import changes；
- tests、media proof、rollback 和 failure modes；
- 为什么不是 Scene DSL、自动布局器、自动导演或 GPS GlobalVisual 复制。

proposal 得到用户对范围、API、文件和目标位置的明确批准前，不得移动代码。笼统“可以复用”
不等于迁移授权。M9 closeout 后也不自动开始 M10。

## 24. 计划自审

### 24.1 与 authority docs 一致

- M9 是第二真实主题全链验证，不修改 GPS 样例；
- 实测 sealed PCM 是唯一时间权威，累计 sample-frame 转帧；
- 一 Beat/meaningId/Scene/ScenePackage 一一对应；
- CaptionLayer 唯一拥有正式字幕；
- ScenePackage 拥有 Scene-local visual/sound；GlobalSound 不重复 Scene SFX；
- exact Shotcraft 走 immutable snapshot、准确 demo、最小闭包、runtime binding 和 paired proof；
- runtime 无 Agent/skill/MCP/Git/network/scan，所有资产本地且有 manifest/license；
- GlobalVisual project-local，不形成通用 DSL；promotion 只提 proposal；
- FinalPreviewApproval 由用户明确作出；无批准不写 v2 pass；
- M10、封面、发布、账号、网络、权限和密钥配置均不在 M9。

### 24.2 与当前代码/命令一致

- 使用真实 `narration:*`、`registry:*`、`scene:*`、`renderer:*`、`final:assembly`、
  `project:check` 命令形状；
- 不虚构独立 CaptionCue 文件；使用 SemanticTiming 内当前 CaptionCues；
- 明确列出 baseline、external reference、final evidence 的现有硬编码，并先 TDD 修复；
- GPS-specific M7/M8 orchestration 不假装已经通用；M9 project-local scripts 完成第二证据后再提
  promotion；
- `npm run check` 只在 M9 closeout 后加入 read-only 第二主题门，不调用 TTS/网络/媒体 writer；
- Remotion 包保持当前完全一致的精确版本；只用宿主 Node/npm/Remotion CLI，不加 Docker。

### 24.3 对用户要求的覆盖

- source-of-truth 与禁止编造：第 4 节；
- repo-first 产品范围与高质量克隆声音边界：第 2.1、3.4、4.1、11–13 节；
- 2–3 分钟与预计 StoryBeat：第 5 节；
- 9:16 漫画设计系统：第 6 节；
- Shotcraft 全量 inventory/coverage：第 7、15 节；
- localization/fidelity：第 7.4、16 节；
- ID 与目录：第 8 节；
- 真实 TTS、Scene、global assembly、最终媒体：第 13–19 节；
- TDD 红/绿：第 11–19、21 节；
- fail-closed matrix：第 22 节；
- 每 Task staging/commit：各 Task 尾部及 Scene commit 表；
- still/contact sheet/full-speed MP4/ffprobe/decode/LUFS/true peak/声道/帧数/时长/review：
  第 17、19 节；
- FinalPreviewApproval 停点：第 20 节；
- 泛化结论/promotion proposal：第 23 节。

## 25. 本轮停止边界

本计划落盘后，本轮立即停止。当前不执行任何 Task，不创建产品文件，不下载到工作树，不生成
媒体，不 commit，不 push。下一步只等待用户审阅/批准修订后的计划；产品 source、声音源和
固定 CTA 已由当前 repo truth 与本轮用户指令锁定，获批后从 Gate A 开始，不再要求产品问卷。
