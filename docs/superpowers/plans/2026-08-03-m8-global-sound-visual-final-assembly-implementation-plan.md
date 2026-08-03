# M8 Global Sound / Global Visual / Final Assembly 实施计划

> 日期：2026-08-03
>
> 状态：待用户审阅；本文件只定义实施顺序，不代表 M8 已实现
>
> 执行方式：获批后由当前对话中的主 Agent inline 执行；不依赖 plan runner，
> 不假定存在 `executing-plans` skill
>
> 基线分支：`codex/foundation`
>
> 基线提交：`02aed6dc827cfde23d3e074ffef1725cff05f03f`

## 1. 目标与完成定义

M8 在不改写 M1–M7 权威产物的前提下，把已经通过 M7 的
`gps-relativity` 五个正式 ScenePackage 装配成可供用户作出唯一创意批准的最终视频。
本里程碑必须同时交付：

- 可复算的 `GlobalSoundPlan`，拥有全局 BGM、跨 Scene ambience、narration
  ducking 和确定性 gain-stage/mastering 输入，但不拥有 Scene-local SFX；
- 可复算的 `GlobalVisualLayers` 强语义计划和 project-local 静态 renderer；
- 显式、静态、可指纹化的 Final Assembly，将 NarrativeCore、M7 Scene 视觉、
  Scene-local sound、GlobalSound 和 GlobalVisual 的来源与顺序绑定为一个身份；
- 完整正常速度最终 MP4、代表 still/contact sheet、媒体技术检查、批量 Agent review
  和 pass-only evidence；
- 由真实用户作出的唯一创意批准 `FinalPreviewApproval`；Agent、脚本和 checker
  均不得代签或推导批准；
- `final-mechanical-check-v2`、失效矩阵、authority docs closeout，以及完整工程门禁。

M8 完成不是“视频能播放”，而是同时满足以下条件：

1. M1–M4 narrative check 仍独立通过，sealed narration 与实测时间线身份不变；
2. M7 五个 ScenePackage、coverage、registry、visual/sound projection 仍 current；
3. 所有新增运行时资产位于 `public/`，manifest、checksum、license/attribution、
   ResourceCatalog identity 全部 current；
4. 最终 Composition 的视觉 z-order、音频 mix order、边界帧和音量包络可由输入复算；
5. 最终正常速度 MP4 已完整解码，并通过帧数、时长、音视频流、响度、峰值和
   ducking evidence 检查；
6. 当前 review/evidence 的指纹精确绑定被用户实际观看并批准的 MP4；
7. 用户批准后，`final-mechanical-check-v2` 才允许持久化 `pass`；
8. `npm run check`、M8 专项门禁和真实最终 render 均通过。

## 2. 现场核验的仓库事实

本计划编写前已经现场核验以下事实；执行时仍须重新核验，不能把本节当作跳过检查的授权。

### 2.1 Git 与 M7 基线

- 当前分支是 `codex/foundation`；
- 当前 HEAD 是 `02aed6dc827cfde23d3e074ffef1725cff05f03f`；
- 编写计划前 staged、unstaged、untracked 均为空；
- 最近提交依次包含 M7 closeout、M7 review evidence、M7 projection/assembly、五个
  Scene authoring、输入与局部音频封存；
- 当前测试为 274 项全部通过；
- `GpsRelativity` 当前是 30 fps、1920×1080、1731 帧；
- narrative report、M7 evidence、`final-mechanical-check-v1` 均为 passing current
  artifact，但 v1 不包含 M8 身份。

### 2.2 当前代码接口，而非目标文档中的假想接口

- `CompositionAssemblyProps` 当前只有一个必填 `narrativeCore` 和两个可选槽位
  `storyVisualTrack`、`soundDesignTrack`；实际渲染顺序是 StoryVisual、NarrativeCore、
  SoundDesign；
- `StoryVisualTrack` 只消费 M7 coverage、registry 和 Scene visual projection，Beat
  之间的 transition overlay 也在该 track 内；
- `SoundDesignTrack` 的 projection 版本是 `scene-audio-runtime-v1`，只渲染每个
  ScenePackage 的 `SceneSoundContribution`；
- `SceneSoundContribution` 以绝对 Beat 起点加 Scene-local 相对帧渲染
  `scene-ambience` / `scene-sfx`，当前 volume 是固定回调；
- GPS `Composition.tsx` 静态导入 `scene-runtime-data.ts`，并把 M7 visual、NarrativeCore、
  M7 sound 三个节点交给 `CompositionAssembly`；
- `NarrativeCore` 仍只拥有一条完整 sealed narration 和顶层 `CaptionLayer`；
- 当前 `final-mechanical-check-v1` 固定 10 个 check ID，并把 narrative、style、Catalog、
  references、Scene coverage/package/registry/projection 和 Composition checksum
  绑定为 v1 identity；
- `writeFinalMechanicalCheckIfPassed` 是 pass-only、atomic writer，read-only checker
  要求持久化文件与重算结果 byte-exact；
- `ResourceMediaRole` 已包含 `global-bgm`，但 selected resource/use-context 尚未完整覆盖
  M8 的 global BGM、跨 Scene ambience 和 global visual 使用语义；
- M7 evidence writer 只检查 still/contact sheet/MP4 的基本流、帧、时长事实，尚无
  loudness、true peak、ducking、FinalPreviewApproval 或 final assembly identity；
- 当前 GPS 正式 M7 evidence 记录的整片音频约为 mean `-21.6 dB`、peak `-2.9 dB`；
  这只是 M7 媒体事实，不是 M8 mastering 目标。

### 2.3 必须保持只读的 M1–M7 权威

实现期间下列输入只允许读取、校验和绑定指纹，不得改写或重新生成：

- `src/projects/gps-relativity/brief.json`
- `src/projects/gps-relativity/story.json`
- `src/projects/gps-relativity/narration.json`
- `src/projects/gps-relativity/render.json`
- `src/projects/gps-relativity/generated/sealed-narration.generated.json`
- `src/projects/gps-relativity/generated/semantic-timing.generated.json`
- `src/projects/gps-relativity/generated/caption-cues.generated.json`
- NarrativeCore、CaptionLayer 及 sealed WAV；
- `src/projects/gps-relativity/scenes/` 下五个正式 Scene 目录与 ScenePackage；
- M7 coverage、renderer registry、StoryVisual/SoundDesign projection；
- `src/projects/gps-relativity/scene-runtime-data.ts`；
- M7 review、M7 evidence 和对应真实媒体。

若任何上述文件在 M8 执行中发生 byte change，应立即停止该 Task，恢复到 Task 开始前的
本地提交并调查原因；不能以“重新生成”消除差异。

## 3. 已锁定的设计决定

### 3.1 Final mechanical check 新增 v2，不原地扩展 v1

M8 必须新增 `final-mechanical-check-v2`，保留 v1 schema、parser、writer/checker 兼容性，
不改变 v1 固定 ID 和既有 M6/M7 tests。原因是 v1 的 10 个 ID、identity shape 和
pass 语义已经是已持久化的 M6/M7 权威；原地加字段会让历史 report 无法解析，且把
“M7 Scene assembly pass”错误改写成“M8 用户批准 pass”。

v2 的固定 check order 是：

1. `narrative`
2. `visual-style`
3. `resource-catalog`
4. `external-references`
5. `reference-fidelity`
6. `scene-coverage`
7. `scene-packages`
8. `renderer-registry`
9. `scene-projections`
10. `composition-assembly`
11. `global-sound`
12. `global-visual`
13. `final-assembly`
14. `final-preview-evidence`
15. `final-preview-approval`

v2 必须复用 v1 前十项的真实 checker 结果，不得复制一套较弱检查。GPS 当前持久化的
`final-mechanical-check.generated.json` 仅在 Task 4 获得真实用户批准后，从 v1 原子迁移为
v2；批准前 v1 文件保持 current，M8 v2 checker 必须以“缺少批准”显式 fail，而不是写入
半完成 report。

### 3.2 M7 Scene projection 身份保持不变

M8 不修改 `SoundDesignProjection` 或五个 `SceneSoundProjection` 的结构、内容和指纹。
新增 `FinalSoundProjection`，绑定：

- M7 `soundDesignProjectionFingerprint`；
- `GlobalSoundPlan` fingerprint；
- BGM 与跨 Scene ambience 的 Catalog/resource/checksum identity；
- narration duck envelope fingerprint；
- mix/mastering policy ID 与 fingerprint；
- Composition fps、总帧数和半开帧区间。

这样既能证明 Scene-local sound 未被第二份计划覆盖，也能让任一 M8 音频输入漂移使
Final Assembly fail closed。

### 3.3 音频所有权、mix order 与 ducking

逻辑 mix 顺序固定为：

```text
narrationBus = sealed narration × 1.0
sceneBus     = M7 Scene-local contributions × explicit sceneBusGain
ambienceBus  = cross-scene ambience × ambienceGain × duckEnvelope(frame)
bgmBus       = global BGM × bgmGain × duckEnvelope(frame)
finalMix     = narrationBus + sceneBus + ambienceBus + bgmBus
```

约束如下：

- sealed narration 的媒体、时间、播放速率和增益保持不变；
- Scene-local ambience/SFX 仍由各 ScenePackage 拥有，GlobalSoundPlan 只能通过单一
  `sceneBusGain` 消费整个既有 bus，不能列出、覆盖、替换或重排单个 Scene cue；
- 跨 Scene ambience 必须真正在 Scene 边界两侧连续，不得伪装成 Scene-local cue；
- BGM 和跨 Scene ambience 均使用完整 0..durationInFrames 半开区间的本地 PCM 资产；
- `duckEnvelope(frame)` 使用 `semantic-spoken-min-envelope-v1`：只从 sealed
  `SemanticTiming.segments` 中 `kind === "chunk"` 的绝对 `[startFrame,endFrame)`
  生成 spoken window；`pause` 自身不算 spoken，但 attack/release 可以跨入 pause；
- attack 发生在 spoken `startFrame` 之前，release 发生在 spoken `endFrame` 之后，线性
  插值并 clamp 到 Composition `[0,durationInFrames)`；重叠 envelope 逐帧取最小值；
- 恰在 `startFrame` 的帧已经达到 duck gain，恰在 `endFrame` 的帧从 release 曲线开始；
  最后一帧是 `durationInFrames - 1`，不得访问或生成第 `durationInFrames` 帧；
- 所有 gain、attack/release 帧、目标响度窗口和 peak ceiling 都是 schema 中的有限数值，
  禁止运行时分析音频后自适应改变 volume；
- `deterministic-gain-stage-v1` 只允许显式线性 gain 与 frame-derived envelope；不得在
  render runtime 使用 adaptive limiter、compressor、`loudnorm` 或渲染后替换音轨。

真实 MP4 的 integrated loudness、true peak、声道和 ducking 对比是 evidence gate，
不是运行时反馈环。具体 gain 值和验收阈值在 Task 2 通过正常速度试听与测量确定后写入
计划 JSON；阈值必须在写 evidence 前固定并进入 fingerprint，不能为迁就结果而由 writer
静默放宽。

### 3.4 GlobalVisualLayers 是强语义对象，不是通用 DSL

GPS 的 `GlobalVisualPlan` 只允许两个 project-specific layer：

- `frameTreatment`：全片统一的安全区内边框、轻量 vignette/grain 等既定成片处理；
- `continuityMotif`：只用于跨 Scene 连续性的 GPS/时空语义 motif，使用明确的 frame
  windows 和固定视觉参数。

禁止引入通用 `layers[]`、任意 component ID、动态 module path、keyframe DSL、自动布局器、
自动导演或能表达任意 Scene 的 Track。renderer 固定为
`src/projects/gps-relativity/global-visual/GlobalVisualLayers.tsx`，由 Composition 静态导入；
JSON 不含 JSX 或可执行表达式。

视觉 z-order 从底到顶固定为：

1. Scene renderer 输出；
2. `StoryVisualTrack` 内部 transition overlay；
3. `GlobalVisualLayers`；
4. NarrativeCore 中唯一的 `CaptionLayer`。

为使该顺序可测试，`CompositionAssembly` 新增显式 `globalVisualLayers` 槽位，并将
`narrativeCore` 放在其后。GlobalVisual 必须遵守 caption safe area，不渲染字幕、不复制
CaptionCue、不拥有 caption z-index，且设置 `pointerEvents: "none"`。所有 motion 只使用
`useCurrentFrame()`、`interpolate()`、`spring()` 等 Remotion frame API，禁止 CSS animation、
transition 或 Tailwind animation utilities。

### 3.5 Final Assembly identity 是一条单向链

身份链固定为：

```text
M1–M7 current identities
  + GlobalSoundPlan / GlobalVisualPlan / current Catalog
  -> FinalSoundProjection + GlobalVisualProjection
  -> FinalAssemblyPlan + Composition source checksum
  -> full-speed preview media identity + batch review
  -> FinalPreviewEvidence
  -> explicit user FinalPreviewApproval
  -> final-mechanical-check-v2 pass
```

`FinalAssemblyPlan` 必须显式绑定：storyId、compositionId、fps、width、height、总帧数、
narrative report fingerprint、sealed narration checksum/fingerprint、SemanticTiming fingerprint、
CaptionCue fingerprint、M7 coverage/package/registry/visual/sound projection fingerprints、
GlobalSound/FinalSound fingerprints、GlobalVisual fingerprint、Catalog fingerprint、静态
Composition source checksum、z-order version 和 mix-order version。

任一上游变化都必须使下游 read-only checker 报 stale/identity mismatch。writer 只写
`aggregateStatus: "pass"` 的 canonical JSON，禁止持久化 fail report、时间戳、绝对路径、
Git 工作树路径、endpoint、token 或异常 stack。

### 3.6 FinalPreviewApproval 是唯一创意批准，且必须来自用户

Task 3 只生成 `ready-for-user-approval` evidence 并停下。它不得创建 approval JSON，也不得
运行会持久化 v2 pass 的命令。用户需要实际观看 evidence 精确绑定的完整正常速度 MP4，
然后明确批准或要求修改。

批准文件采用双阶段、pass-only 流程：

- 用户批准前：`reviews/final-preview-approval.json` 和
  `generated/final-preview-approval.generated.json` 必须不存在；checker 返回固定
  `missing-approval`，不写任何文件；
- 用户明确批准后：主 Agent 才创建最小 authoring record，包含固定 approval decision、
  用户批准所绑定的 preview/evidence fingerprints 和无歧义的批准记录；writer 复算全部
  identity 后生成 canonical approval artifact；
- Agent review 的 `pass`、媒体 checker 的 `pass`、用户沉默或计划获批都不能代替
  FinalPreviewApproval；
- 若用户要求 revise，Task 2–3 按受影响身份回退并重新生成 preview/evidence，旧批准不能
  复用。

## 4. 实施范围与文件布局

以下是计划中的目标文件；执行时先用 CodeGraph 和现有命名约定复核，只有出现真实接口
冲突时才在 Task 内调整，并在 commit handoff 中说明。

### 4.1 共享合同、纯函数和机械脚本

新增：

- `src/contracts/global-sound.ts`
- `src/contracts/global-visual.ts`
- `src/contracts/final-assembly.ts`
- `src/contracts/final-preview.ts`
- `src/remotion/runtime/global-sound/ducking.ts`
- `src/remotion/runtime/global-sound/resolve-global-sound.ts`
- `src/remotion/runtime/global-sound/GlobalSoundTrack.tsx`
- `src/remotion/runtime/global-sound/index.ts`
- `scripts/final-assembly/domain.ts`
- `scripts/final-assembly/files.ts`
- `scripts/final-assembly/cli.ts`
- 对应 `tests/contracts/`、`tests/runtime/`、`tests/final-assembly/` tests。

修改：

- `src/contracts/assets.ts`
- `src/contracts/resource-catalog.ts`
- `src/contracts/final-check.ts`
- `src/contracts/index.ts`
- `src/remotion/runtime/composition-assembly/CompositionAssembly.tsx`
- `scripts/project-check/final-run.ts`
- `scripts/project-check/final-report-files.ts`
- `scripts/project-check/cli.ts`
- `package.json`

### 4.2 GPS project-local 生产输入与 runtime

新增：

- `src/projects/gps-relativity/global-sound-plan.json`
- `src/projects/gps-relativity/global-visual-plan.json`
- `src/projects/gps-relativity/final-assembly-plan.json`
- `src/projects/gps-relativity/final-assembly-data.ts`
- `src/projects/gps-relativity/global-audio.json`
- `src/projects/gps-relativity/generated/global-audio.generated.json`
- `src/projects/gps-relativity/global-visual/GlobalVisualLayers.tsx`
- `public/projects/gps-relativity/global-audio/global-bgm.wav`
- `public/projects/gps-relativity/global-audio/cross-scene-ambience.wav`
- `scripts/m8-gps/generate-global-audio.ts`
- `scripts/m8-gps/freeze-inputs.ts`
- `tests/m8-gps/` 专项 tests。

修改：

- `src/projects/gps-relativity/Composition.tsx`
- `src/projects/gps-relativity/resource-catalog.json`
- `src/projects/gps-relativity/generated/resource-catalog.generated.json`
- 仅由既有 generator 产生的静态 registry/Catalog 衍生产物（若 current output 实际改变）；
- `package.json`。

### 4.3 Review、approval 与 closeout

新增：

- `src/projects/gps-relativity/reviews/m8-final-assembly-review.json`
- `src/projects/gps-relativity/generated/final-assembly.generated.json`
- `src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json`
- 用户批准后才新增
  `src/projects/gps-relativity/reviews/final-preview-approval.json`；
- 用户批准后才新增
  `src/projects/gps-relativity/generated/final-preview-approval.generated.json`；
- `scripts/m8-gps/evidence.ts`
- `scripts/m8-gps/approval.ts`
- `docs/evidence/m8-gps-relativity-final-assembly.md`；
- `tests/m8-gps/evidence.test.ts`
- `tests/m8-gps/approval.test.ts`
- `tests/m8-gps/invalidation.test.ts`。

修改：

- 用户批准后原子迁移
  `src/projects/gps-relativity/generated/final-mechanical-check.generated.json` 到 v2；
- `README.md`
- `AGENTS.md`
- `docs/FINAL_PRODUCT_GOAL.md`
- `docs/PRODUCTION_WORKFLOW.md`
- `docs/ITERATION_STATUS.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/DETERMINISTIC_EXECUTION.md`
- `docs/TERMINOLOGY.md`
- `docs/REVIEW_MODEL.md`
- `docs/CAPABILITY_CATALOG.md`。

真实 review media 写入 gitignored `out/m8-gps-final-assembly/`，不提交大体积媒体；evidence
提交其 checksum、probe/decode/分析事实和相对路径。若仓库当前 ignore 规则未覆盖该目录，
Task 3 只精确补充对应 ignore 项，不扩大忽略范围。

## 5. 通用执行纪律

每个 Task 开始时：

1. 核对 branch、HEAD、`git status --short`、staged/unstaged/untracked；
2. 保护其他人的既有修改；若出现非本计划文件且来源不明的改动，停止并报告；
3. 用 CodeGraph 重新读取将要修改的符号、caller 和测试，不根据本计划臆造接口；
4. 记录本 Task 开始提交，保证失败时可以在不破坏用户改动的前提下定位边界；
5. 先写可观察到正确失败原因的 red test，再做最小实现。

每个 Task 结束时：

1. 跑聚焦 tests，再跑本 Task 的 read-only checker 和真实媒体检查；
2. 对所有 writer 做“先 check 失败、write、check byte-exact、重复 write 幂等”验证；
3. 运行本 Task 失效样例并证明 fail closed；
4. `git diff --check`，检查 secrets、绝对路径、临时文件和意外媒体；
5. 只用本 Task staging 小节明列的逐文件路径执行 `git add --`，检查
   `git diff --cached --name-only`；
6. 建立一个本地 commit 并写 handoff；不 push；
7. 不自动开始下一个 Task，先确认当前 Task 验收完整。

以下四个顶层 Task 是完整实施顺序，不能把内部子步骤拆成额外顶层 Task。

## 6. Task 1：M8 合同、身份与确定性生产输入闭环

**目标：** 在不接入 GPS runtime 的情况下，先建立可复算、严格、fail-closed 的 M8
合同、资产/Catalog 语义、Final Assembly identity、v2 final check 和 pass-only 文件边界。

**允许修改：** 4.1 所列合同、纯函数、脚本、tests、`package.json`，以及为 red/green
fixture 必需的 `tests/fixtures/m8/`。本 Task 不修改 GPS Composition、M7 project artifacts、
正式 Catalog 或任何正式媒体。

### 6.1 红测试：先冻结合同和版本边界

新增测试并确认失败原因来自“能力尚不存在”，而不是 fixture 或 import 拼错：

- `tests/contracts/global-sound.test.ts`
  - `GlobalSoundPlan` 固定 `schemaVersion`、`planVersion`、story/composition/fps/duration；
  - 只接受 `global-bgm` 和明确的 `cross-scene-ambience` resource usage；
  - 只接受完整帧区间、正整数 attack/release、有限 linear gain 和固定 policy ID；
  - 拒绝 cue list、meaningId、Scene SFX override、动态路径、URL、未知字段和越界帧；
  - 证明 input 顺序 canonicalize 后产生相同 fingerprint，任何语义值变化都会变指纹。
- `tests/contracts/global-visual.test.ts`
  - 只接受 `frameTreatment` 和 `continuityMotif` 两个强语义字段；
  - frame windows 均为绝对、左闭右开、排序、不重叠或按合同明确允许的确定性叠加；
  - 拒绝通用 `layers`、component/module path、任意 expression、caption content 和未知字段；
  - 显式 caption safe area 约束与 Composition bounds 参与 fingerprint。
- `tests/contracts/final-assembly.test.ts`
  - `FinalAssemblyPlan` 要求 3.5 中全部 M1–M8 identity，禁止 null/duplicate/乱序；
  - `zOrderVersion`、`mixOrderVersion`、source checksum 和 exact Remotion version 均参与身份；
  - 任一上游 fingerprint、总帧数、边界策略或 source checksum 改动都会使 plan stale。
- `tests/contracts/final-preview.test.ts`
  - evidence 必须绑定 final assembly、Catalog、完整 MP4、still/contact sheet、review；
  - approval 必须绑定 evidence 与 MP4 的 exact fingerprints；
  - approval decision 只有显式 `approved`，没有 Agent-generated 默认值；
  - 拒绝时间戳、绝对路径、自由格式主观批准、未知媒体和遗漏的技术事实。
- 扩充 `tests/contracts/resource-catalog.test.ts` 和 `tests/catalog/resource-catalog.test.ts`
  - selected-resource/use-context 能准确表达 global BGM、跨 Scene ambience、global visual；
  - `global-bgm` 不再只是枚举中的孤立 role；
  - license、attribution、public path、checksum 和 Catalog identity 缺一即拒绝。
- 扩充 `tests/contracts/final-check.test.ts`
  - v1 历史 fixture 继续 byte/parse compatible；
  - v2 固定 15 项且顺序不可变；
  - v2 pass 要求 M8 五个新增身份和 checks；
  - 未批准、evidence stale、assembly mismatch、global plan stale 均只能 fail；
  - v1 与 v2 不能互相冒充或由同一个 version literal 解析。
- 扩充 `tests/project-check/final-report-files.test.ts` 与
  `tests/project-check/final-run.test.ts`
  - v1 existing path 不回归；
  - v2 writer 仍只写 pass，失败不创建/不覆盖文件；
  - checker 是 read-only，要求 canonical byte-exact；
  - approval 缺失时只返回安全固定错误，不泄露路径、stack 或环境信息。

红测命令：

```bash
node --import tsx --test \
  tests/contracts/global-sound.test.ts \
  tests/contracts/global-visual.test.ts \
  tests/contracts/final-assembly.test.ts \
  tests/contracts/final-preview.test.ts \
  tests/contracts/resource-catalog.test.ts \
  tests/catalog/resource-catalog.test.ts \
  tests/contracts/final-check.test.ts \
  tests/project-check/final-report-files.test.ts \
  tests/project-check/final-run.test.ts
```

### 6.2 最小实现：合同、纯函数和双版本 final check

1. 在 `src/contracts/global-sound.ts` 定义严格 Zod schema 与 fingerprint helper：
   - asset refs 只保存 Catalog entry ID、media role、public path、checksum 和 license identity；
   - `duckingPolicy` 固定为 `semantic-spoken-min-envelope-v1`；
   - `masteringPolicy` 固定为 `deterministic-gain-stage-v1`；
   - attack/release、spoken gain、unspoken gain、bus gains 和验收阈值全部显式；
   - `semanticTimingFingerprint`、fps、duration 必填；
   - plan 不包含每个 Scene cue，也不拥有 narration 文件。
2. 在 `src/remotion/runtime/global-sound/ducking.ts` 实现纯函数：
   - 从已解析 SemanticTiming 生成 canonical spoken ranges；
   - 将累计绝对帧保持为整数，不做 seconds round-trip；
   - 生成逐帧可求值 envelope 或 canonical segments；
   - 暴露边界函数给 runtime 与 checker 共用，避免两套数学；
   - 单测覆盖开头/结尾 clamp、相邻 chunk、显式 pause、overlap min、最后一帧。
3. 在 `src/contracts/global-visual.ts` 定义 GPS 能力需要的强语义 schema；共享合同只表达
   受限概念和 bounds，不提供通用 renderer registry。所有颜色、opacity、inset、motif
   windows 和 motion policy 均是有限、可验证字段。
4. 在 `src/contracts/final-assembly.ts` 建立 identity chain 和
   `createFinalAssemblyFingerprint()`；checksum 只接受标准 SHA-256，数组排序/去重规则明确。
5. 在 `src/contracts/final-preview.ts` 分离：
   - authoring review；
   - technical media evidence；
   - explicit user approval；
     三者 schema 和 fingerprint 不能相互替代。
6. 扩充资产/Catalog 合同：
   - 保留既有 role 的兼容性；
   - 为跨 Scene ambience 和 global visual 增加准确 use context；
   - 不把 `global-bgm` 误当 Scene contribution；
   - checker 要求所有 runtime assets under `public/`、存在、checksum 相符、license/attribution
     完整且属于当前 Catalog fingerprint。
7. 把当前 `final-check.ts` 重构为显式 v1/v2 两套 schema 与常量：
   - v1 export 与行为保持不变；
   - v2 新增常量、schema、identity 和 15 项 refinement；
   - 如需共享 failure schema/helper，只提取无版本语义的部分；
   - 不修改 v1 persisted JSON 或 M6/M7 fixture 来“适配”v2。
8. 在 `scripts/final-assembly/` 实现 repository-generic domain/files/CLI：
   - `write` 只在全部上游 current 时写 canonical pass artifact；
   - `check` 全程 read-only，重算并 byte compare；
   - project path 仍从固定一级目录约定解析，不接受 JSON 动态路径；
   - 脚本不加载 Composition renderer，不扫描任意目录，不调用网络/Agent/skill/MCP/Git；
   - 错误仅使用枚举 code 和安全固定消息。
9. 扩展 `project:check --level final`：
   - 现有无 M8 project 或历史 fixture 仍走 v1；
   - 显式存在 M8 assembly plan 的 project 必须走 v2，不能 fallback 到 v1 获得假 pass；
   - v2 复用 narrative checker 并要求其独立 current；
   - approval 缺失时返回 fail，不写 report。
10. 增加 package scripts，但此时不指向尚未创建的正式 GPS 输入；generic fixture 验证即可。

### 6.3 聚焦绿测与 fail-closed 矩阵

除红测原命令外，至少运行：

```bash
npm run typecheck
npm run lint -- --quiet
npm run catalog:check
npm run project:check -- --project gps-relativity --level narrative
npm run project:check -- --project gps-relativity --level final
```

最后一条在 Task 1 必须仍按当前 v1 pass，因为正式 GPS M8 plan 尚不存在；测试 fixture 中
则必须证明一旦声明 M8，缺少任一新身份时 v2 fail。失效矩阵至少逐一篡改：

- GlobalSound/GlobalVisual/FinalAssembly schema version；
- SemanticTiming fingerprint、duration、fps；
- public path、asset checksum、license/attribution、Catalog fingerprint；
- duck attack/release 和边界帧；
- z-order/mix-order version；
- M7 sound projection、ScenePackage 或 Composition source checksum；
- preview evidence 或 approval fingerprint；
- v2 check ID 顺序、重复 identity、额外未知字段；
- persisted report 的一个 byte。

每个样例都必须报预期固定 failure code，不能 throw raw filesystem/Zod stack，不能修复或
覆盖被篡改文件。

### 6.4 真实检查、精确提交与验收

本 Task 尚无正式 M8 媒体，因此“真实媒体检查”限定为：重读当前 M7 full preview 的 ffprobe
事实和 Catalog 中真实文件，证明新合同不会把不存在的分析结果当输入；不得生成假 M8
evidence。用临时 fixture PCM 验证 probe/checksum reader 后立即清理，不能提交。

精确暂存仅包含本 Task 合同、generic scripts、tests、fixtures 和 `package.json`：

```bash
git add -- \
  src/contracts/assets.ts \
  src/contracts/resource-catalog.ts \
  src/contracts/final-check.ts \
  src/contracts/global-sound.ts \
  src/contracts/global-visual.ts \
  src/contracts/final-assembly.ts \
  src/contracts/final-preview.ts \
  src/contracts/index.ts \
  src/remotion/runtime/global-sound/ducking.ts \
  src/remotion/runtime/global-sound/resolve-global-sound.ts \
  src/remotion/runtime/global-sound/GlobalSoundTrack.tsx \
  src/remotion/runtime/global-sound/index.ts \
  scripts/final-assembly/domain.ts \
  scripts/final-assembly/files.ts \
  scripts/final-assembly/cli.ts \
  scripts/project-check/final-run.ts \
  scripts/project-check/final-report-files.ts \
  scripts/project-check/cli.ts \
  tests/contracts/global-sound.test.ts \
  tests/contracts/global-visual.test.ts \
  tests/contracts/final-assembly.test.ts \
  tests/contracts/final-preview.test.ts \
  tests/contracts/resource-catalog.test.ts \
  tests/contracts/final-check.test.ts \
  tests/catalog/resource-catalog.test.ts \
  tests/runtime/global-sound-ducking.test.ts \
  tests/final-assembly/files.test.ts \
  tests/final-assembly/final-run.test.ts \
  tests/fixtures/m8/final-assembly.ts \
  tests/project-check/final-report-files.test.ts \
  tests/project-check/final-run.test.ts \
  package.json
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(m8): define final assembly contracts and identity"
```

若实现时 CodeGraph 证明某个列出的新文件无需存在，则从命令删除；若真实接口要求新增文件，
必须先把该路径补入 Task handoff 再显式暂存。禁止用宽目录代替清单。验收条件：v1 无回归、
v2 fail-closed、正式 GPS 没有任何 byte change、一个本地 commit、未 push。

## 7. Task 2：GPS 全局声音、全局视觉与真实 Composition 装配闭环

**目标：** 创作并封存 GPS 的真实全局音频和强语义全局视觉，把它们静态接入正式
Composition，同时保持 NarrativeCore 和 M7 五个 ScenePackage byte-identical。

**允许修改：** 4.2 所列 GPS M8 新文件、Catalog 衍生产物、Composition 的最小静态 wiring、
CompositionAssembly/GlobalSound runtime 的 Task 1 预留实现、对应 tests 和 package scripts。

### 7.1 红测试：冻结 GPS production input 与 assembly 行为

新增 tests：

- `tests/m8-gps/freeze-inputs.test.ts`
  - 读取真实 M1–M7 identities，生成 expected M8 authoring input；
  - GlobalSound/GlobalVisual/Assembly plan 必须精确绑定当前 narrative、timing、M7 projection、
    Scene package、Catalog 和 Composition metadata；
  - 两个全局音频必须是仓库内 PCM WAV、完整时长、预期采样率/声道、checksum current；
  - asset receipt、license/attribution 与 Catalog entry 一致；
  - write/check 双模式 byte-exact、重复 write 幂等、check 不写盘。
- `tests/runtime/global-sound-track.test.tsx`
  - FinalSoundProjection 同时绑定 M7 Scene sound 与 GlobalSoundPlan，但不复制 Scene cue；
  - render tree 保留现有 `SoundDesignTrack`，另外只挂载两个 global audio buses；
  - volume callback 只由 current frame、固定 bus gain 和共享 ducking function 决定；
  - `frame=0`、spoken start/end、pause 中心、相邻 chunk、末帧和越界均精确断言；
  - 没有 CSS animation、网络、目录扫描、动态 import、post-render DSP。
- 扩充 `tests/runtime/composition-assembly.test.tsx`
  - 新的四个语义槽位顺序精确为 StoryVisual、GlobalVisual、NarrativeCore、SoundDesign；
  - NarrativeCore 仍必填且只出现一次；
  - M6 synthetic proof 未提供 GlobalVisual 时保持兼容；
  - CaptionLayer 在视觉 DOM 顺序的最上层，声音节点不影响 z-order。
- `tests/m8-gps/final-assembly.test.tsx`
  - GPS Composition 静态 import `final-assembly-data.ts` 和 GlobalVisual component；
  - 不在 runtime 扫目录/读任意 module path/调用外部系统；
  - assembly identity 绑定真实 static imports 和 source checksum；
  - `scene-runtime-data.ts`、五个 Scene renderer 和 M7 projection 未改写；
  - GlobalVisual 遵守 caption safe area、pointer-events 和强语义字段。
- 扩充 `tests/projects/gps-relativity-composition.test.tsx`
  - metadata 仍是 30 fps、1920×1080、1731 帧；
  - complete narration src、lead-in、CaptionCue 完全不变；
  - `CompositionAssembly` 的新 slots 全部来自静态 current data；
  - render-critical motion 和 volume 均由 Remotion frame API 驱动。

先运行上述 tests 并确认 red：

```bash
node --import tsx --test \
  tests/m8-gps/freeze-inputs.test.ts \
  tests/runtime/global-sound-track.test.tsx \
  tests/runtime/composition-assembly.test.tsx \
  tests/m8-gps/final-assembly.test.tsx \
  tests/projects/gps-relativity-composition.test.tsx
```

### 7.2 创作、封存并登记真实全局音频

1. 先读取当前五个 Scene 的语义、实际 timing、M7 local sound 和相邻连续性；不得搜索、
   打开或模仿旧 Production Scene/Composition/still/contact sheet。
2. `scripts/m8-gps/generate-global-audio.ts` 使用固定参数在本地生成或导入两条真实 PCM：
   - `global-bgm.wav`：低密度、非旋律抢占、适合旁白主导的持续音乐床；
   - `cross-scene-ambience.wav`：在五个 Scene 边界连续的低层环境纹理；
   - 生成/处理命令、source identity、采样率、声道、sample count、checksum、license 和
     attribution 写入 canonical receipt；
   - 若使用第三方源，必须先完成 license/attribution 与本地化；不确认 license 的 bundled
     audio 不得进入 package；
   - 两条 PCM 的 sample count 必须按 sealed PCM 累计整数边界覆盖精确 1731 帧，禁止逐段
     浮点秒转帧后累计。
3. generator 提供显式 `write` / `check`：

```bash
npm run m8:gps:audio -- write
npm run m8:gps:audio -- check
```

`check` 只读并复算 WAV header、sample count、checksum/receipt；`write` 不覆盖非本工具且
checksum 不匹配的文件。4. 在 `resource-catalog.json` 登记两项资源并运行既有 Catalog generator；确认生成 artifact
的 fingerprint 改变只来自新增 M8 entries，既有 22 项 identity/content 不变。5. 编写 `global-sound-plan.json`：

- 选择已登记的两项资源；
- 明确 `sceneBusGain`、`ambienceGain`、`bgmGain`、spoken duck gain、attack/release frames；
- 明确目标 integrated loudness range 和 true-peak ceiling；
- 绑定 current SemanticTiming/Catalog/duration；
- 不列出任何 Scene-local cue，不修改 narration gain。

6. 用纯函数生成 `FinalSoundProjection`；运行静态断言证明它消费 M7 projection fingerprint，
   但 M7 projection 本身 byte-identical。

### 7.3 实现 GlobalVisualLayers 和 Composition 静态接线

1. 根据 GPS StoryBeat、M7 SceneVisualPlan、当前 style 与 caption safe area 编写
   `global-visual-plan.json`，只描述：
   - `frameTreatment` 的固定视觉参数；
   - `continuityMotif` 的少量、显式绝对 frame windows 和 GPS/时空语义参数。
2. 实现 project-local `GlobalVisualLayers.tsx`：
   - 不 export 通用 registry 或 DSL；
   - 不读 JSON 动态模块；
   - 不渲染任何字幕文本；
   - 使用 `AbsoluteFill`、`useCurrentFrame()` 和确定性插值；
   - 在 caption safe area 外保持视觉克制，使用明确 z-index/pointer-events；
   - 对 0、Scene 边界、motif 起止、caption 高密度帧、末帧写 render-tree/snapshot tests。
3. 扩展 `CompositionAssembly` 为四个语义槽位，顺序固定；兼容 M6 proof 与无 M8 的
   Composition。不要抽象成通用 track array。
4. 新建 `final-assembly-data.ts`，静态解析 M8 plans、current Catalog 与 M1–M7 imports，
   构造 final sound/global visual/final assembly projections；不要修改
   `scene-runtime-data.ts`。
5. 最小修改 GPS `Composition.tsx`：
   - StoryVisualTrack 仍消费原 M7 projection；
   - GlobalVisualLayers 使用新 projection；
   - NarrativeCore props 构造保持原样；
   - SoundDesignTrack 仍消费原 M7 Scene sound projection；
   - GlobalSoundTrack 作为最终声音节点的一部分消费两个 global buses；
   - Composition 内不调用 generator/checker/ffmpeg/fs/network。
6. `final-assembly-plan.json` 绑定所有 current identities，运行 pass-only writer 生成
   `generated/final-assembly.generated.json`；重复 write 必须相同。

推荐 package scripts：

```json
{
  "m8:gps:audio": "node --import tsx scripts/m8-gps/generate-global-audio.ts",
  "m8:gps:freeze": "node --import tsx scripts/m8-gps/freeze-inputs.ts",
  "final:assembly": "node --import tsx scripts/final-assembly/cli.ts"
}
```

### 7.4 聚焦绿测、真实 still/短片和失效矩阵

先跑：

```bash
npm run m8:gps:audio -- check
npm run catalog:check
npm run m8:gps:freeze -- check
npm run final:assembly -- --project gps-relativity --check
node --import tsx --test \
  tests/m8-gps/freeze-inputs.test.ts \
  tests/runtime/global-sound-track.test.tsx \
  tests/runtime/composition-assembly.test.tsx \
  tests/m8-gps/final-assembly.test.tsx \
  tests/projects/gps-relativity-composition.test.tsx \
  tests/m7-gps/package-integration.test.ts \
  tests/m7-gps/invalidation.test.ts
npm run typecheck
npm run lint -- --quiet
npm run compositions
```

真实视觉/听觉聚焦验证不得只看 still：

```bash
remotion still src/index.ts GpsRelativity \
  out/m8-gps-final-assembly/task2-frame-0.png --frame=0 --log=error
remotion still src/index.ts GpsRelativity \
  out/m8-gps-final-assembly/task2-caption-safe.png --frame=1280 --log=error
remotion still src/index.ts GpsRelativity \
  out/m8-gps-final-assembly/task2-scene-boundary.png --frame=696 --log=error
remotion render src/index.ts GpsRelativity \
  out/m8-gps-final-assembly/task2-boundary-preview.mp4 \
  --frames=666-726 --codec=h264 --log=error
```

主 Agent 以正常速度播放短片，检查：跨 Scene ambience 确实连续、BGM 在旁白时下降且停顿时
平滑恢复、Scene-local SFX 仍可辨识、边界无 click/pop、GlobalVisual 连续且不遮字幕。记录
观察但不把 Task 2 短片冒充最终 evidence。

失效矩阵至少逐一验证：

- 改一个 PCM byte、WAV sample count、receipt checksum 或 license；
- 从 Catalog 删除 global asset，或让 generated Catalog stale；
- 修改一个 spoken window、attack/release、bus gain、duration 或 fps；
- 将 GlobalSoundPlan 填入 Scene cue/meaningId；
- 修改 M7 projection fingerprint 或任一 M7 ScenePackage fingerprint；
- 交换 z-order、让 GlobalVisual 进入 Caption safe area、添加 CSS transition；
- 修改 Composition source 后不刷新 assembly identity；
- 删除 final assembly artifact，或手改 persisted canonical JSON。

所有 checker 必须在 render 前 fail closed；只读命令不得自动重写。

### 7.5 保护性 diff、精确提交与验收

提交前分别对 2.3 的 protected files 运行 checksum/diff 检查，特别确认：

```bash
git diff --exit-code HEAD^ -- \
  src/projects/gps-relativity/story.json \
  src/projects/gps-relativity/narration.json \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  src/projects/gps-relativity/scene-runtime-data.ts \
  src/projects/gps-relativity/scenes
```

执行时不要机械照抄 `HEAD^`；应使用本 Task 开始提交作为比较基线。精确暂存只包含 M8
runtime/project inputs、Catalog 的预期更新、tests 和 package scripts：

```bash
git add -- \
  src/remotion/runtime/composition-assembly/CompositionAssembly.tsx \
  src/remotion/runtime/global-sound/resolve-global-sound.ts \
  src/remotion/runtime/global-sound/GlobalSoundTrack.tsx \
  src/projects/gps-relativity/global-audio.json \
  src/projects/gps-relativity/global-sound-plan.json \
  src/projects/gps-relativity/global-visual-plan.json \
  src/projects/gps-relativity/final-assembly-plan.json \
  src/projects/gps-relativity/final-assembly-data.ts \
  src/projects/gps-relativity/global-visual/GlobalVisualLayers.tsx \
  src/projects/gps-relativity/Composition.tsx \
  src/projects/gps-relativity/resource-catalog.json \
  src/projects/gps-relativity/generated/global-audio.generated.json \
  src/projects/gps-relativity/generated/resource-catalog.generated.json \
  src/projects/gps-relativity/generated/final-assembly.generated.json \
  public/projects/gps-relativity/global-audio/global-bgm.wav \
  public/projects/gps-relativity/global-audio/cross-scene-ambience.wav \
  scripts/m8-gps/generate-global-audio.ts \
  scripts/m8-gps/freeze-inputs.ts \
  tests/m8-gps/freeze-inputs.test.ts \
  tests/m8-gps/final-assembly.test.tsx \
  tests/runtime/global-sound-track.test.tsx \
  tests/runtime/composition-assembly.test.tsx \
  tests/projects/gps-relativity-composition.test.tsx \
  package.json
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(gps): assemble m8 global sound and visual layers"
```

验收条件：正式 Composition 能真实渲染；正常速度边界短片通过主 Agent 检查；M7 Scene-local
sound、Scene visuals、NarrativeCore、CaptionCue、sealed timing 全部未改写；M8 input/assembly
checkers current；一个本地 commit、未 push。

## 8. Task 3：完整正常速度 review、审批前 evidence 与明确停点

**目标：** 生成用户真正可审的完整正常速度 final preview 和 evidence，完成技术检查及
批量 Agent review；提交 `ready-for-user-approval` 产物后明确停止，等待真实用户决定。

**允许修改：** 4.3 中 approval 之前的 review/evidence scripts、tests、evidence doc、package
scripts 和精确 ignore 项；不得创建两个 approval 文件，不得把 final report 迁移为 v2 pass。

### 8.1 红测试：先固定 evidence 与“不批准”边界

新增/扩展：

- `tests/m8-gps/evidence.test.ts`
  - evidence 必须绑定 current final assembly、Catalog、plans、M7 evidence 和媒体 checksum；
  - still/contact sheet/full MP4 都存在且相对路径、checksum current；
  - ffprobe 事实精确包含 codec、width/height、fps、frame count、duration、audio codec、
    sample rate、channel layout；
  - 完整 decode 结果必须成功到 EOF，而不是只 probe header；
  - integrated loudness、true peak、全片 bus/ducking measurements 满足冻结阈值；
  - review 必须覆盖 GlobalSound、GlobalVisual、跨 Scene 连续性、字幕安全区和正常速度可辨识度；
  - evidence writer pass-only/atomic/idempotent，checker read-only/byte-exact。
- `tests/m8-gps/approval.test.ts`
  - 当前无 approval 文件时返回固定 `missing-approval`；
  - evidence pass 不能自动生成 approval；
  - Agent review `pass` 不能被解析为 user approval；
  - approval writer 在 Task 3 没有明确授权输入时拒绝写盘；
  - `project:check --level final` 在 approval 缺失时 v2 fail，且保留当前 v1 report 不变。
- `tests/m8-gps/invalidation.test.ts`
  - preview MP4、任一 still、contact sheet、review、probe result、loudness/peak/duck measurement、
    assembly fingerprint 任一漂移都使 evidence stale；
  - 重新 render 后旧 evidence/未来旧 approval 不能复用；
  - writer 失败不覆盖最后一个 current pass artifact。

红测：

```bash
node --import tsx --test \
  tests/m8-gps/evidence.test.ts \
  tests/m8-gps/approval.test.ts \
  tests/m8-gps/invalidation.test.ts
```

### 8.2 实现 pass-only evidence writer/checker

`scripts/m8-gps/evidence.ts` 只允许 `write` / `check`，并完成以下机械步骤：

1. 先运行 narrative、M7、Catalog、M8 freeze、Final Assembly read-only checks；任一失败即停止；
2. 验证媒体相对路径固定在 `out/m8-gps-final-assembly/`，拒绝绝对路径和任意外部文件；
3. 对所有媒体计算 SHA-256；
4. 用 `ffprobe` 读取机器可解析 JSON，并验证：
   - video 是 H.264，1920×1080，30 fps，帧数精确 1731；
   - audio stream 存在，codec/sample rate/channel layout 与渲染命令预期一致；
   - container duration 与 1731/30 的允许 mux tolerance 一致；
5. 用 `ffmpeg -v error -i out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4
-f null -` 完整解码到 EOF；只 probe 不算通过；
6. 使用固定版本/参数的分析命令测 integrated loudness、true peak、sample peak 和声道事实；
   parser 只接受完整机器输出，缺字段、NaN、命令失败均 fail；
7. 通过一组冻结的 spoken/pause windows 比较 BGM/ambience bus 或可复算的 mix evidence，证明：
   - spoken window 达到计划 duck gain；
   - pause 恢复符合 attack/release envelope；
   - Scene-local SFX 未被错误 duck 或重复混入；
   - 边界 sample/frame 没有 off-by-one；
8. 解析一份批量 review JSON，要求每一类 review 都绑定同一 preview/evidence input identity；
9. 只有全部 pass 才 canonicalize 并原子写入
   `generated/m8-final-preview-evidence.generated.json`；失败只返回固定 code/message。

如果 ffmpeg 当前版本不能直接可靠输出 true peak，执行时必须先用真实命令验证可用 filter；
若需仓库内小型纯解析器，应把工具版本、命令参数和原始分析 artifact checksum 一起绑定。
不得把 mean volume 冒充 integrated loudness，也不得把 sample peak 冒充 true peak。

### 8.3 生成代表媒体和完整正常速度 preview

先清空/覆盖目标媒体属于可再生输出，但仍要精确指定文件，不能递归删除宽目录。生成顺序：

1. 代表 still 的基础固定帧至少包含
   `0,188,360,361,530,695,696,855,1017,1018,1280,1420,1421,1432,1433,1580,1715,1730`，
   并由冻结的 GlobalVisualPlan 追加 motif 起止帧；去重、升序后的 exact frame list 写入
   evidence input。该集合覆盖：
   - frame treatment 稳态；
   - 每个 Scene 的主要语义状态；
   - 四个 Scene 边界前后；
   - continuity motif 起止；
   - 字幕最密集/最长 cue；
   - 开头、尾帧。
2. 用固定帧号与固定版式生成 contact sheet；不得人工挑换到只剩好看的帧。
3. 用正式入口、正式 Composition、完整 0..1730 帧生成一条 H.264 正常速度 MP4；不得
   用倍速、跳帧、静帧拼接或只渲染局部来代替。

命令形状：

```bash
npm run compositions
remotion still src/index.ts GpsRelativity \
  out/m8-gps-final-assembly/stills/frame-1280.png \
  --frame=1280 --log=error
node --import tsx scripts/m8-gps/evidence.ts contact-sheet
remotion render src/index.ts GpsRelativity \
  out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4 \
  --codec=h264 --log=error
ffprobe -v error -show_streams -show_format -of json \
  out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4
ffmpeg -v error -i \
  out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4 \
  -f null -
```

实际脚本需固定 browser/render 参数和工具版本；任何 retry 都要重新计算媒体 checksum，不能
保留旧 evidence。

### 8.4 批量 Agent review 与正常速度人工检查

主 Agent 一次性审阅完整 MP4、contact sheet 和代表 still，写入
`reviews/m8-final-assembly-review.json`，至少包含以下四组结论：

- `GlobalSoundReview`
  - 旁白始终清楚、BGM 不抢语义；
  - duck attack/release 可听但不抽吸；
  - 跨 Scene ambience 连续且不和 Scene-local sound 重复争权；
  - SFX 同步与可辨识度仍符合 M7；
  - 开头/Scene 边界/尾部无 click、pop 或突然截断。
- `GlobalVisualReview`
  - frame treatment 稳定，motif 有清晰 GPS/时空语义；
  - 不成为通用装饰层，不模糊 Scene 主体；
  - 全程不遮挡 CaptionLayer，不复制字幕；
  - motion 正常速度下可辨识、无抖动或不必要高频变化。
- `FinalContinuityReview`
  - 五个 Scene 之间视觉、声音和语义承接自然；
  - transition、GlobalVisual、ambience 的边界一致；
  - 没有改变 spoken frame、吞掉旁白或产生 A/V drift。
- `NormalSpeedReview`
  - 明确记录整片从头到尾以 1× 速度播放完成；
  - 记录实际 review media checksum；
  - 若有任何需 revise 项，aggregate 必须 fail，不能靠注释豁免。

这些是 Agent 批量 review，不是用户批准。review 文件禁止出现
`FinalPreviewApproval: approved` 或等价暗示。

### 8.5 写入 evidence、运行失效矩阵并提交

推荐命令：

```bash
npm run m8:gps:evidence:write
npm run m8:gps:evidence
npm run m8:gps:evidence
npm run m8:gps:approval
npm run project:check -- --project gps-relativity --level final
```

预期结果：前 3 条 evidence write/check/current；后 2 条明确以 `missing-approval` fail，且不写
approval/v2 report。这两个预期 fail 必须由专项 test/命令断言，不能用 shell `|| true` 抹掉。

再运行完整失效矩阵，至少覆盖：

- MP4 truncate/单 byte change、still/contact sheet 漂移、frame count 改变；
- 音频流缺失、声道或采样率改变、decode EOF 失败；
- integrated loudness/true peak 超阈、spoken duck 不足、pause recovery 错位；
- review 缺一组、绑定旧 checksum、正常速度未完成、aggregate fail；
- Final Assembly/Catalog/M7 evidence 变化；
- 人工创建空 approval 或 Agent review 冒充 approval；
- evidence writer 失败后现有 pass artifact 仍 byte-identical。

更新 `docs/evidence/m8-gps-relativity-final-assembly.md`，只陈述已生成、已测量和已审阅的
事实，明确当前状态是“等待用户 FinalPreviewApproval”，不写“M8 complete”。

精确暂存：

```bash
git add -- \
  src/projects/gps-relativity/reviews/m8-final-assembly-review.json \
  src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json \
  scripts/m8-gps/evidence.ts \
  scripts/m8-gps/approval.ts \
  tests/m8-gps/evidence.test.ts \
  tests/m8-gps/approval.test.ts \
  tests/m8-gps/invalidation.test.ts \
  docs/evidence/m8-gps-relativity-final-assembly.md \
  .gitignore \
  package.json
git diff --cached --name-only
git diff --cached --check
git commit -m "test(gps): bind m8 final preview evidence"
```

如果 `out/m8-gps-final-assembly/` 已被现有规则覆盖，则从清单删除 `.gitignore`；若
`package.json` 在本 Task 没有实际 diff，也从清单删除。不得暂存 `out/` 媒体、approval 文件、
v2 final report 或 authority closeout 文档。验收条件：
完整正常速度 preview 和 evidence current；全部 Agent review pass；approval checker 以正确原因
fail；一个本地 commit、未 push。

### 8.6 强制停止并交给用户

Task 3 commit 后必须停止执行并向用户提供：

- 完整正常速度 MP4 的绝对可点击路径；
- contact sheet 和代表 still；
- 媒体 checksum、时长/帧数、integrated loudness、true peak、decode 结论；
- GlobalSound/GlobalVisual/continuity review 摘要；
- 明确选择：批准当前 final preview，或列出需要 revise 的具体项。

没有用户明确“批准当前绑定 checksum 的最终预览”，不得开始 Task 4。

## 9. Task 4：用户批准、最终机械门、失效矩阵与 authority closeout

**前置条件：** 用户已经明确批准 Task 3 evidence 所绑定的 exact preview checksum。若用户
要求 revise，本 Task 不开始，返回 Task 2 或 Task 3 的受影响最小闭环。

**目标：** 把真实用户批准固化为可校验但不可由 Agent 伪造的 artifact，生成
`final-mechanical-check-v2` pass，完成全量门禁、失效矩阵和 M8 authority docs closeout。

### 9.1 红测试：真实 approval 尚未持久化

在创建 approval authoring record 前重新运行：

```bash
npm run m8:gps:evidence
npm run m8:gps:approval
npm run project:check -- --project gps-relativity --level narrative
npm run project:check -- --project gps-relativity --level final
```

预期：evidence current、narrative pass；approval 和 v2 final 仍以 `missing-approval` fail。记录
用户批准所指的 preview/evidence fingerprints，与 Task 3 artifact 对比；任何不一致都必须
停止并要求用户重新看 current preview。

补齐 approval/final tests：

- 只有主 Agent 根据当前对话中的明确用户决定创建 authoring record 后，writer 才接受；
- authoring record 精确绑定 approved preview checksum、evidence fingerprint、final assembly
  fingerprint 和固定 decision；
- 旧 preview、旧 evidence、不同 assembly、缺失用户决定、`revise` 或自由文本都不能 pass；
- approval writer pass-only/atomic/idempotent，checker read-only/byte-exact；
- v2 final report 必须包含 15 项且全部 applicable/pass；
- v2 report 的 approval identity 必须来自 current generated approval，不接受 review 替代；
- v1 parser/tests 继续通过，历史 M6/M7 fixture 不被迁移。

先确认新增 assertions 对缺失 authoring record 是 red，再进入写入步骤。

### 9.2 固化用户批准并生成 v2 final report

1. 创建 `reviews/final-preview-approval.json`，仅保存最小、可审计、非推导数据：
   - schema/version；
   - story/composition；
   - decision `approved`；
   - approved preview checksum；
   - FinalPreviewEvidence fingerprint；
   - FinalAssembly fingerprint；
   - 来自本次用户明确决定的固定 approval reference；
   - 不保存对话全文、用户隐私、绝对路径或 Agent 自评。
2. 运行 approval writer；它先复算 evidence、media、assembly identity，只有全 current 才写
   `generated/final-preview-approval.generated.json`。
3. 连续两次运行 approval check，证明 byte-exact/idempotent。
4. 运行 `project:check --level final` 的 write 模式，原子迁移 GPS persisted report 为
   `final-mechanical-check-v2`；不能手工编辑 generated JSON。
5. 运行 read-only final check，确认 15 项顺序、identity 和 aggregate pass。

命令形状：

```bash
npm run m8:gps:approval:write
npm run m8:gps:approval
npm run m8:gps:approval
npm run project:check -- --project gps-relativity --level final --write
npm run project:check -- --project gps-relativity --level final
```

若既有 CLI 的 write flag 形状不同，执行前依据当前代码采用真实接口；计划不授权创建第二个
绕过 `project:check` 的 final report writer。

### 9.3 完整机械门与失效矩阵

先证明所有上游门独立 current：

```bash
npm run project:check -- --project gps-relativity --level narrative
npm run m7:gps:freeze -- check
npm run m7:gps:evidence
npm run m8:gps:audio -- check
npm run m8:gps:freeze -- check
npm run final:assembly -- --project gps-relativity --check
npm run m8:gps:evidence
npm run m8:gps:approval
npm run project:check -- --project gps-relativity --level final
```

然后在临时副本/fixture 中运行完整 fail-closed matrix，不直接篡改并恢复正式 production
artifact。至少包括：

| 变更                                                   | 必须失效的最早门                   | 不得发生            |
| ------------------------------------------------------ | ---------------------------------- | ------------------- |
| Story/StoryBeat/ttsChunks 或 narrative identity 改变   | narrative / final v2               | 自动重写 M8 inputs  |
| sealed WAV、SemanticTiming、CaptionCue 改变            | narrative / GlobalSound / assembly | 重新 timing 或吞帧  |
| 任一 M7 ScenePackage/coverage/registry/projection 改变 | M7 / assembly                      | M8 重新制作 Scene   |
| global PCM/checksum/license/Catalog 改变               | Catalog / GlobalSound              | runtime 远程取资源  |
| duck/gain/mastering 参数改变                           | GlobalSound / assembly             | 自动适应旧 evidence |
| GlobalVisual 参数、source 或 z-order 改变              | GlobalVisual / assembly            | 接管 CaptionLayer   |
| Composition source 或 Remotion exact version 改变      | assembly                           | 复用旧 preview      |
| MP4/still/contact sheet/review 改变                    | evidence                           | 自动更新 checksum   |
| evidence fingerprint 改变                              | approval                           | 复用旧用户批准      |
| approval 缺失、malformed 或绑定旧媒体                  | approval / final v2                | Agent 代签          |
| persisted v2 report 单 byte 改变                       | final read-only check              | checker 自行修复    |

额外断言累计时间与边界：

- 旁白 chunk 按 sealed PCM 累计整数 sample-frame 边界；
- Scene/transition/GlobalVisual/GlobalSound 不移动或缩短 spoken frames；
- 所有 `[startFrame,endFrame)` 到末帧无 gap/overlap/off-by-one；
- CaptionLayer 仍是唯一字幕 renderer；
- runtime 不调用 Agent、skill、MCP、Git、network、directory scan；
- 所有 Remotion 与 `@remotion/*` 仍完全相同的精确版本。

### 9.4 Authority docs closeout

只在 v2 final pass 后同步文档，且区分“目标”“已实现事实”“保留边界”：

- `README.md`
  - 增加 M8 production/check/review 命令和最终批准入口；
  - 不把 Agent review 写成用户批准。
- `AGENTS.md`
  - 当前里程碑改为 M8 已完成；
  - 固化 GlobalSound/GlobalVisual/FinalPreviewApproval ownership 与禁区。
- `docs/FINAL_PRODUCT_GOAL.md`
  - 只更新 M8 已兑现的最终装配能力，不扩张到编辑器/自动导演。
- `docs/PRODUCTION_WORKFLOW.md`
  - 从 M7 Scene review 到 global assembly、正常速度 preview、唯一用户批准、final gate
    的真实执行顺序；
  - 明确批准前后的 artifact 状态。
- `docs/ITERATION_STATUS.md`
  - 用 commit/evidence/report 事实标记 M8 完成；
  - 清楚写出下一阶段尚未开始，不把计划目标说成实现。
- `docs/ROADMAP.md`
  - M8 gate 勾选必须与 v2 pass、用户批准和 full preview evidence 对齐；
  - 不提前启动后续 milestone。
- `docs/ARCHITECTURE.md`
  - CompositionAssembly 四槽位、视觉 z-order、音频 bus/mix order、identity chain；
  - M7 Scene ownership 与 M8 global ownership 的边界。
- `docs/DETERMINISTIC_EXECUTION.md`
  - duck envelope、gain-stage、frame/sample 边界、writer/checker、media analysis 的确定性规则；
  - 明确 runtime 无 adaptive mastering。
- `docs/TERMINOLOGY.md`
  - 定义 GlobalSoundPlan、FinalSoundProjection、GlobalVisualLayers、FinalAssembly、
    FinalPreviewEvidence、FinalPreviewApproval；
  - 区分 Scene ambience 与跨 Scene ambience。
- `docs/REVIEW_MODEL.md`
  - GlobalSound/GlobalVisual/FinalContinuity batch review 与唯一用户创意批准；
  - 明确 Agent/checker 不可批准。
- `docs/CAPABILITY_CATALOG.md`
  - 仅登记实际新增的 contract/runtime/checker 能力；
  - GPS project-local GlobalVisual 不晋升共享 capability。
- `docs/evidence/m8-gps-relativity-final-assembly.md`
  - 从等待批准更新为绑定 exact approval/v2 report 的 closeout 事实。

运行 `npm run docs:check-links`，并用 docs tests/`rg` 检查没有残留“M8 是唯一下一步”、
“M8 尚未实现”或把 v1 report 说成 v2 final pass 的矛盾表述。

### 9.5 全量验证、真实 render 复核、精确提交

fresh full gate：

```bash
npm test
npm run typecheck
npm run lint
npm run docs:check-links
npm run catalog:check
npm run registry:check
npm run build
npm run compositions
npm run project:check -- --project gps-relativity --level narrative
npm run m7:gps:evidence
npm run m8:gps:evidence
npm run m8:gps:approval
npm run project:check -- --project gps-relativity --level final
npm run check
```

为避免 `npm run check` 的当前定义只包含 narrative 而产生假安全感，M8 三个专项 read-only
checks 和 final v2 必须单独运行；closeout 时再决定把这些门纳入 `npm run check`，并通过
tests 固定。

重新运行完整 preview 的 ffprobe、完整 decode 和 analysis read-only check，确认它仍是用户
批准的 exact checksum；不要在批准后重新 render 并沿用旧批准。如果任何构建步骤改变
runtime source/bundle identity，需要重新执行 Task 3 并重新请用户批准。

提交前：

1. `git status --short` 检查没有 `out/` 媒体、临时分析文件、私有配置或未知改动；
2. 对 M1–M7 protected paths 与 Task 1/2/3 baseline commit 做 byte/diff 核验；
3. `git diff --check`；
4. 只暂存 approval、v2 report、M8 tests/scripts 的必要尾部修改和 authority docs；
5. 核对 staged 文件逐项属于本 Task。

```bash
git add -- \
  src/projects/gps-relativity/reviews/final-preview-approval.json \
  src/projects/gps-relativity/generated/final-preview-approval.generated.json \
  src/projects/gps-relativity/generated/final-mechanical-check.generated.json \
  tests/m8-gps/approval.test.ts \
  tests/m8-gps/invalidation.test.ts \
  README.md \
  AGENTS.md \
  docs/FINAL_PRODUCT_GOAL.md \
  docs/PRODUCTION_WORKFLOW.md \
  docs/ITERATION_STATUS.md \
  docs/ROADMAP.md \
  docs/ARCHITECTURE.md \
  docs/DETERMINISTIC_EXECUTION.md \
  docs/TERMINOLOGY.md \
  docs/REVIEW_MODEL.md \
  docs/CAPABILITY_CATALOG.md \
  docs/evidence/m8-gps-relativity-final-assembly.md \
  package.json
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m "docs: close gps relativity m8 final assembly"
```

验收条件：narrative 独立 pass、M7 五个 ScenePackage/current evidence pass、M8 assembly/
evidence/approval pass、final v2 15 项 pass、完整工程门和真实媒体复核 pass、authority docs
一致、一个本地 commit、工作树干净、未 push。到此停止，不自动开始后续 milestone。

## 10. 执行依赖、回退与提交边界

```text
Task 1 contracts/identity/v2 compatibility
  -> Task 2 GPS assets/runtime/final assembly
  -> Task 3 full-speed preview/review/evidence
  -> STOP: real user FinalPreviewApproval
  -> Task 4 approval/v2 final/docs closeout
```

- Task 1、2、3 各形成一个本地 commit；Task 4 仅在用户批准后形成第四个本地 commit；
- 不 squash、不 amend 用户既有提交、不 push；
- 一个 Task 失败时只修复该 Task 的最小原因，不顺手重构无关代码；
- 若 Task 2 改变 narrative 或 M7 identity，视为边界违规，不进入 Task 3；
- 若 Task 3 review fail，回到 Task 2 调整显式 M8 plan/asset/runtime，再重做全部受影响媒体；
- 若用户 revise，旧 preview evidence 和任何旧 approval 均作废；
- 若用户批准后 source/build 发生变化，approval 必须 fail stale，不能只重写 v2 report；
- 任何共享 capability promotion 都需要独立 fingerprint proposal 和用户明确批准，不属于 M8。

## 11. 计划自审

### 11.1 对用户目标的覆盖

- 顶层 Task 数量严格为 4，没有把合同、runtime、测试、媒体、evidence、文档拆成微型 Task；
- 每个 Task 均包含红测试、最小实现、聚焦绿测、真实检查、fail-closed 矩阵、精确 staging
  和一个本地 commit；
- GlobalSoundPlan、BGM、跨 Scene ambience、ducking、deterministic mastering、
  GlobalVisualLayers、assembly identity、完整正常速度 preview、唯一用户批准、mechanical
  gate、evidence 和 docs closeout 均有明确 owner；
- 根据当前 v1 schema 的固定 10 项和持久化事实，具体选择新增
  `final-mechanical-check-v2`，而不是原地扩展 v1；
- Task 3 明确停在用户批准，Task 4 不能被 Agent 自动开始。

### 11.2 对硬边界的覆盖

- M1–M4 narrative、sealed WAV、CaptionCue、SemanticTiming、NarrativeCore 只读；
- M7 五个 ScenePackage、coverage/registry/projection、Scene-local sound 只读；
- GlobalSoundPlan 不列 Scene cue，不建立第二份 Scene SFX 权威；
- GlobalVisual 只有两个强语义对象，不提供 Track/Scene DSL、自动布局器或自动导演；
- CaptionLayer 保持唯一且视觉最顶层；
- z-order、mix order、duck frame 边界和末帧行为明确；
- render-critical motion/volume 只用 Remotion frame API；
- runtime 无 Agent、skill、MCP、Git、网络、目录扫描或动态 module path；
- 所有运行时资产 under `public/` 且绑定 manifest/checksum/license/Catalog identity；
- 用户批准前不会持久化 approval 或 v2 pass。

### 11.3 对当前 repo truth 的一致性

- 计划以当前三槽位 `CompositionAssembly`、Scene-only `SoundDesignTrack`、M7
  `StoryVisualTrack`、GPS 静态 `scene-runtime-data.ts` 和 v1 final writer 为迁移起点；
- 保留 `SoundDesignProjection` 的 M7 identity，新增 FinalSoundProjection，避免虚构 M7
  已有 global sound API；
- 保留 M6 proof 对 optional slots 的兼容测试；
- 把 current Catalog 对 `global-bgm` 的部分支持视为待补全 use-context，而不是宣称已完成；
- M7 evidence 的 mean/peak 仅作为基线事实，不冒充 M8 loudness/mastering evidence；
- 完整视频仍由正式 `src/index.ts` / `GpsRelativity` Composition 渲染，不另造 proof
  Composition 代替正式 Story。

### 11.4 实施开始前必须再次核验

计划获批后的第一条实现命令仍应检查 branch、HEAD、工作树和最近提交；如基线已前移，先
重读 authority docs、CodeGraph 相关符号和 diff，再把本计划中的路径/测试命令与最新 repo
truth 对齐。对齐只允许修正接口事实，不能自行放宽本计划的 ownership、审批和只读边界。

## 12. 本轮 planning-only 停止边界

本轮只创建并自审本计划文件。不修改生产代码、tests、package scripts、authority docs 或
媒体，不运行 M8 writer，不生成 approval，不提交，不 push。计划获批不等于
FinalPreviewApproval，也不授权跳过 Task 3 的完整正常速度预览。
