# M7 GPS Relativity Formal Scene Production Implementation Plan

> **归档说明：** 历史实施快照；其中命令、路径和状态不再代表当前仓库事实。

> **状态：** 待用户复审。本文件只规划 M7，不开始实现、不创建 Scene/资产、不提交、不
> push、不创建分支。本轮计划编写与修订由主 Agent 在当前对话 inline 完成，不调用子代理、
> plan runner 或假定存在的 `executing-plans` skill；该 planning-only 限制不覆盖获批后的 M7
> 实施。正式执行 Task 2 时必须遵守已批准的 M5 并行协议：一个 meaningId 对应一个独立 Scene
> 子 Agent，主 Agent 只负责共享输入冻结、分发、汇总、跨 Scene 审核与确定性装配。

**目标：** 为 `gps-relativity` 的五个 StoryBeat 制作五个正式、`ready`、可审核的
ScenePackage，把它们通过 composition-local RendererRegistry 投影到真实
`GpsRelativity` Composition 的 StoryVisualTrack 与 Scene-local SoundDesignTrack，并在不改动
M2/M3 叙事权威、不提前实现 M8 的前提下，让当前
`project:check --level final` 从预期失败变为通过。

**生产模式：** code-first programmable video（Remotion）。M7 的主要交付是一个真实 Story
Composition 内的五个正式 Scene，而不是模板 API、旧 Composition 复刻或 synthetic proof。
项目级创意方向由执行 M7 的主 Agent 冻结；每个 Scene 的最终创意决定由独占该 meaningId 的
子 Agent 在冻结输入内完成，主 Agent 做跨 Scene 审核。合同、fingerprint、writer、registry、
projection 与机械 gate 只验证已经确定的输入，不自动选 Shot、选卡、布局、导演或判断审美。

**总体策略：** 保持五个顶层 Task。先把项目画风、连续性、项目自有局部音频、Catalog 与
五份 task input 一次冻结；再在一个 production wave 内并行分发五个互不重叠的 meaningId
子 Agent 任务；主 Agent 收齐并预检后统一生成 package/coverage/registry 并接入真实
Composition；再做批量视听/连续性/fidelity 审核和定向返工闭环；最后写入 final report、同步
authority docs 并运行完整 gate。五个 Scene 是五个独立 Agent 制作任务，但不拆成五个顶层
Task。

## 1. 当前 repo truth（2026-08-03）

- Repository 物理路径：`/data/projects/repos/remotion-story-producer`；同一 checkout 也从
  `/home/zzzxc/projects/repos/remotion-story-producer` 暴露。
- Branch：`codex/foundation`。
- HEAD：`31c55407be78ced268eb8051e997a9a1b1d0d874`。
- 本计划开始前 staged、unstaged、untracked 全为空；执行时必须重新核对，不能假定仍为空。
- `.codegraph/` 存在；实现时继续先用 CodeGraph 定位受影响符号，再读取/修改源码。
- 当前实测：`npm test` 为 257 pass / 0 fail，`npm run typecheck`、`catalog:check`、
  `registry:check` 均通过。
- 当前 ResourceCatalog 有 17 项：2 个仅用于 M6 synthetic proof 的 project-authored asset、
  9 个 approved capability、6 个 approved style profile。当前没有 GPS 正式 Scene 资产，M6
  proof asset 不得选入 GPS ScenePackage。
- 当前 ProjectRegistry 只有一个 Story entry；正常 listing 只有：

```text
CapabilityGallery    30 fps  1920x1080   150 frames
GpsRelativity        30 fps  1920x1080  1731 frames
```

- 当前 `gps-relativity` 只有 M1–M4 source/generated/review 和 narrative-only
  `Composition.tsx`；没有 `visual-style.json`、`scenes/`、SceneCoverageMap、RendererRegistry 或
  persisted final report。
- 当前 narrative 真实通过，report fingerprint 为
  `sha256:dd1dc79547123cc2a3c69a3f95ce81cdf951f3e569afbbdb94b51345bc52424c`。
- 当前 final in-memory report 中只有 `narrative=pass`；其余九项均因 M7 正式输入缺失而
  fail closed。CLI 退出 1，且
  `src/projects/gps-relativity/generated/final-mechanical-check.generated.json` 不存在。
- M6 synthetic proof 完全位于 `src/remotion/proofs/m6-scene-runtime/`，有独立 entry、数据、
  registry 和 evidence；它未进入 `src/projects/project-registry.generated.ts`，不得复制其
  Scene 创意、Renderer、still/contact sheet 或布局到 GPS。M7 只可复用已批准的通用合同、
  generator/runtime 接口和隔离模式。

### 1.1 当前五个冻结语义窗口

| 顺序 | meaningId                  | narrativePurpose                     | 绝对帧范围     | Scene-local 帧数 | 计划目录                                                       |
| ---: | -------------------------- | ------------------------------------ | -------------- | ---------------: | -------------------------------------------------------------- |
|    1 | `position-is-time`         | 把日常定位问题还原为精密计时问题     | `[15, 361)`    |              346 | `src/projects/gps-relativity/scenes/position-is-time/`         |
|    2 | `two-relativistic-effects` | 分别解释速度与引力对卫星钟的相反影响 | `[361, 696)`   |              335 | `src/projects/gps-relativity/scenes/two-relativistic-effects/` |
|    3 | `net-drift`                | 说明两种相对论效应叠加后的净时间偏差 | `[696, 1018)`  |              322 | `src/projects/gps-relativity/scenes/net-drift/`                |
|    4 | `error-accumulation`       | 把微小钟差连接到会破坏导航的测距误差 | `[1018, 1433)` |              415 | `src/projects/gps-relativity/scenes/error-accumulation/`       |
|    5 | `practical-conclusion`     | 以手机蓝点收束相对论的现实用途       | `[1433, 1716)` |              283 | `src/projects/gps-relativity/scenes/practical-conclusion/`     |

Composition 仍有 `[0, 15)` lead-in 和 `[1716, 1731)` tail。Scene 不拥有这两段，也不能改变
任何 Beat 窗口。Shot 只绑定所在 meaningId；不得把上表内部范围按两个 TTSChunk、CaptionCue
或标点机械切半。

### 1.2 当前 RenderSpec 与时间权威

```text
compositionId  GpsRelativity
fps            30
size           1920x1080
locale         zh-CN
lead/tail      15 / 15 frames
safe area      top 72 / right 96 / bottom 96 / left 96
output         MP4 + H.264 + AAC, 2 channels
timing         pcm-cumulative-ceil-v1, 1731 frames
```

M7 只读消费 `story.json`、`render.json` 和
`generated/semantic-timing.generated.json`。任何发现需要改台词、chunk、pause、sealed WAV、
CaptionCue 或 timing 的情况都是上游真实 blocker；不能由 Scene 延长、裁切或错位来遮盖。

## 2. 当前接口与必须补齐的最小 repo gaps

### 2.1 直接复用的真实接口

- `buildSceneTaskInput`；
- `buildSceneVisualPlan`、`buildShotPlanSet`、`buildSceneSyncAnchors`、
  `buildSceneSoundPlan`、`validateScenePlanBundle`；
- `buildShotRecipeSelection`、`buildNotApplicableFidelityReceipt`、
  `generateReferenceFidelityReceipt`；
- `buildScenePackage`、`generateScenePackage`、`buildSceneCoverageMap`、
  `generateSceneCoverage`；
- `collectRendererSourceGraph`、`generateRendererRegistryFromProjectFiles`；
- `buildStoryVisualProjection`、`resolveSceneSound`、`buildSoundDesignProjection`；
- `StoryVisualTrack`、`SoundDesignTrack`、`CompositionAssembly`；
- `runFinalMechanicalCheck` 及 pass-only final report writer。

所有 JSON writer 继续使用现有 canonical/pass-only/atomic/byte-stable 语义；check mode 只读，
失败保留最后一份有效产物。

### 2.2 M7 开始前确认的两个真实实现缺口

1. `scene:coverage` CLI 虽接受 `coverage --project <slug> --write|--check`，默认 context 没有
   file-backed generator，会直接报
   `Coverage generation requires current project package inputs.`。Task 3 必须先用红测试补
   `generateSceneCoverageFromProjectFiles`，不能手写 coverage fingerprint。
2. `generateScenePackageFromProjectFiles` 当前只 checksum `Renderer.tsx` 单文件；final runner
   和 RendererRegistry 使用 `collectRendererSourceGraph` 对 `Renderer.tsx` 与所有本地 Shot/
   capability 依赖做完整 source-graph fingerprint。正式 Renderer 拆出 `shots/*.tsx` 时，两者会
   不一致。Task 3 必须先让 package writer 与 final/registry 共用同一 graph collector。

这两个 gap 是 M7 内的最小 writer 对齐，不是 M8、通用 Scene DSL 或共享 capability 提取。

### 2.3 Shotcraft 三态执行规则

每个 Scene 的允许范围由主 Agent 在 Task 1 冻结；具体选择由独占该 meaningId 的子 Agent 在
Task 2 作出一次显式创意决定，并由主 Agent 在收集阶段复核：

- `exact-demo-localized`：只有存在 immutable snapshot、当前合同可唯一识别的准确
  card/style/demo/preview、最小依赖闭包、本地 Renderer/frame-state binding、配对 evidence、
  owning Scene 子 Agent 正常速度自审、主 Agent 收集复审和逐项 license 时才可选；必须生成
  current pass receipt。
- `inspiration-only`：记录 snapshot/card provenance 和选择原因，不生成/宣称 exact pass；
  fidelity receipt 必须是 `not-applicable`，reason 为 `inspiration-only`。
- `empty`：合法默认，不伪造 `none` card，不因没有 Shotcraft 而失败；fidelity receipt 必须是
  `not-applicable`，reason 为 `empty`。

当前通用 `ExternalReferenceSnapshot`/CLI 只识别冻结的 `draw-svg-trace` card/style，且生产 CLI
要求显式 adapter context；M7 不把这一点偷换成“可自动浏览整个 Shotcraft Gallery”。如果
当前五个 Scene 没有语义上合适且可完整证明的 exact/inspiration 选择，owning Scene 子 Agent
必须选择
`empty` 并自定义 composition-local Shot。若确实需要合同尚不识别的其他 card，则这是范围
扩张 blocker，必须先停下请求用户决定，不能在 M7 中悄悄扩展为通用选卡系统。

## 3. 全局硬边界

- 不修改 Story、StoryBeat、`ttsChunks`、NarrationSpec、StoryCheck、sealed manifest/WAV、
  CaptionCue、SemanticTiming、M3 evidence 或 persisted Narrative AutoCheck。
- Shot 绑定 meaningId，不绑定 TTSChunk、CaptionCue、字幕分块或标点。
- 不搜索、打开、比较、模仿或复制旧生产 Scene、旧 Composition、历史 still/contact sheet、
  旧布局或旧 render；M6 proof 只用于核对通用接口与隔离方式，不作为创意参考。
- 不复制整个 `video-shotcraft` 仓库、Gallery、模板集合、全部 demos 或音频库；命中 exact 时
  只本地化所选 card 的最小闭包和许可证。
- 不强迫任何 Scene 使用 Shotcraft，不做关键词选卡、自动导演、自动布局器或通用 Scene
  DSL。
- 不向 `src/remotion/capabilities/` 提取新共享能力；新视觉和 project-authored audio generator
  保持 GPS composition-local/project-specific。
- SceneRenderer 只输出视觉；不 import/mount Audio、NarrativeCore、NarrationAudioTrack、
  CaptionLayer、complete WAV 或 SceneSoundPlan。
- Scene-local sound 只由 `SceneSoundPlan` 与固定 runtime 挂载；不做 GlobalSoundPlan、全局
  BGM、跨 Scene ambience、ducking、mastering 或自动混音。
- 不增加 GlobalVisualLayers、FinalPreviewApproval、approval receipt、release/publish/cover。
- runtime 不调用 Agent、skill、MCP、Git、网络、Catalog query 或目录扫描。
- 所有 render-critical motion 使用 Remotion frame API；无 CSS animation/transition/Tailwind
  animation utilities。
- 所有选中媒体必须位于 `public/`、进入 assets manifest/Catalog，并有 checksum、allowed-use、
  item-level license/attribution；unknown/unverified/blocked 不得进入 package。
- 只使用宿主机 Node/npm/Remotion CLI；不新增 Docker、不修改 Remotion 精确版本、不新增
  npm dependency。
- Task 2 的每个子 Agent 只写自己的 `src/projects/gps-relativity/scenes/<meaningId>/` 与对应
  `public/projects/gps-relativity/scenes/<meaningId>/`；不得修改或读取另一个子 Agent 的源码，
  不修改 shared scripts/tests、VisualStyleSpec、Catalog、Story、timing、Composition、coverage
  或 registry。
- 共享 scripts/tests/package scripts、五份任务分发、结果预检、精确 staging 和 commit 只由主
  Agent 负责；子 Agent 不 stage、不 commit、不创建分支，也不启动嵌套子 Agent。
- 每个顶层 Task 一个小步本地 commit；只精确 stage 该 Task 文件；完成 Task 5 后停止，不
  push。

## 4. 执行前保护与共同协议

执行 M7 的第一个命令组必须重新记录：

```bash
git branch --show-current
git rev-parse HEAD
git status --short --branch
git diff --stat
git diff --cached --stat
git ls-files --others --exclude-standard
```

把执行起点记为 `M7_BASE_HEAD`，并在每个 Task commit 前运行：

```bash
git diff --exit-code "$M7_BASE_HEAD" -- \
  src/projects/gps-relativity/story.json \
  src/projects/gps-relativity/narration.json \
  src/projects/gps-relativity/render.json \
  src/projects/gps-relativity/reviews/story-check.json \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  src/projects/gps-relativity/generated/narrative-auto-check.generated.json \
  public/projects/gps-relativity/narration \
  src/remotion/runtime/narrative-core \
  src/projects/project-registry.generated.ts
```

该命令必须无 diff。另运行 narrative gate，证明 Scene 工作没有反向成为 Baseline 前置条件。
任一保护失败都停止 Scene 分支；不 reset、不自动修复、不覆盖用户修改。

所有 Task 的 writer 共同遵守：

1. 先在内存完整 parse/build/check；
2. 只有 pass 才写临时文件并 fsync/rename；
3. 相同 bytes 不改 mtime；
4. check mode 不创建目录、不修复 drift；
5. 失败保留最后有效的 Catalog、task、plan、fidelity、package、coverage、registry、review、
   final report 和 evidence；
6. error 只输出 safe code/message，不泄露绝对 private path、token、provider config 或 raw stack。

Task 2 额外遵守以下并行调度协议：

1. 主 Agent 先完成共享红测试、按 meaningId 的 authoring/check/still 入口和五份 current
   SceneTaskInput，确认五个写入范围互不重叠后才分发；
2. 五个子 Agent 同时启动，每个只收到自己的 task input、允许资源/reference IDs、相邻连续性
   摘要、固定帧窗口、验证命令和独占目录；
3. 子 Agent 不依赖另一个子 Agent 的未完成源码，也不通过旧 Scene/still/contact sheet 推断
   连续性；连续性只读来自主 Agent 冻结的 previous/next brief；
4. 主 Agent 收集后先检查越权写入和共享输入零修改，再逐 Scene preflight；失败只退回 owning
   meaningId 定向修订，其他已通过 Scene 保持有效；
5. 只有五个 Scene 都通过各自 focused gate，主 Agent 才运行全 wave 检查并创建 Task 2 的唯一
   commit。

## 5. Task 1 — 冻结 GPS 画风、连续性、资源快照与五份 SceneTaskInput

**目标与范围：** 一次完成 M7 的所有 project-global/只读输入：主 Agent 创作并自审
VisualStyleSpec；确定跨 Scene 对象、空间、色彩和 motion continuity；设计五个 project-authored
Scene-local cue；把音频资产登记进当前 ResourceCatalog；对每个 meaningId 冻结 exact StoryBeat、
timing、allowlist、允许 snapshot 和相邻摘要。Task 1 不写 SceneVisualPlan、ShotPlan、Renderer
或 ScenePackage。

### Files

Create:

- `scripts/m7-gps/generate-local-audio.ts`
- `scripts/m7-gps/freeze-inputs.ts`
- `tests/m7-gps/freeze-inputs.test.ts`
- `src/projects/gps-relativity/visual-style.json`
- `src/projects/gps-relativity/scenes/position-is-time/task-input.generated.json`
- `src/projects/gps-relativity/scenes/two-relativistic-effects/task-input.generated.json`
- `src/projects/gps-relativity/scenes/net-drift/task-input.generated.json`
- `src/projects/gps-relativity/scenes/error-accumulation/task-input.generated.json`
- `src/projects/gps-relativity/scenes/practical-conclusion/task-input.generated.json`
- `public/projects/gps-relativity/scenes/position-is-time/assets/signal-arrival-pulse.wav`
- `public/projects/gps-relativity/scenes/two-relativistic-effects/assets/dual-clock-pulse.wav`
- `public/projects/gps-relativity/scenes/net-drift/assets/net-drift-lock.wav`
- `public/projects/gps-relativity/scenes/error-accumulation/assets/error-accumulation-alert.wav`
- `public/projects/gps-relativity/scenes/practical-conclusion/assets/blue-dot-lock.wav`

Modify:

- `src/remotion/catalog/assets.manifest.json`
- `src/remotion/catalog/resource-catalog.generated.json`
- `package.json`

Conditional only when Task 1 actually approves a permitted external recipe:

- `src/projects/gps-relativity/generated/external-reference-snapshot.generated.json`
- exact content-addressed snapshot/localization license files listed by the chosen immutable source.

### 红测试

1. `generate-local-audio.ts check` 在文件缺失、非 canonical PCM、checksum/duration/sample-rate
   drift、不同 bytes 或路径逃逸时失败且不覆盖；write 重复执行 bytes/mtime 稳定。
2. 五个 WAV 均为 project-authored、48 kHz mono PCM `s16le`、短 Scene cue，不是 narration、
   BGM、跨 Scene ambience 或 M6 proof asset；每个 manifest item 的 license evidence 绑定自身
   checksum。
3. Catalog 从 17 项增加恰好五个 GPS audio asset；五个 descriptor 均
   `runtime-approved`、`scene-sfx`、verified，ID/path/meaningId 一一对应；M6 proof 两项仍不被
   GPS allowlist 选中。
4. VisualStyleSpec strict、`storyId=gps-relativity`、style profile 唯一解析到 current Catalog；
   art direction/continuity/forbidden 均非空、无重复，fingerprint 覆盖 resolved style descriptor。
5. 五份 task input 精确绑定当前 Story fingerprint、RenderSpec fingerprint、SemanticTiming
   fingerprint、VisualStyle fingerprint 和同一 Catalog fingerprint；timing ranges 与第 1.1 表
   完全一致。
6. `allowedDirectories` 必须为当前 meaningId 独占目录；`allowedResourceIds` 只包含主 Agent 已
   批准的 capability/当前 Scene audio/可选视觉资产；不含 M6 proof asset、另一个 Scene 的
   audio、Narration WAV 或 arbitrary path。
7. continuity previous/next identity 与 Story order 严格相邻；摘要来自当前 Story
   `narrativePurpose`/Task 1 创作约束，不含旧 Scene、旧 still 或历史 layout 路径。
8. ExternalReference allowlist 可以为空；若非空，只接受 current immutable snapshot 与明确
   allowed card。浮动 branch/tag、任意 URL、全 Gallery 或不在当前合同内的 card 失败。
9. writer 中没有自动选 style/卡、关键词导演、布局 DSL、provider/network runtime 或目录扫描。

### 最小实现与创作责任

1. 主 Agent 先只读查询六个 current style profile 和 approved capabilities，结合五个
   `narrativePurpose` 写一个项目级 VisualStyleSpec。选择结果是创作决定；测试只检查它 current
   且足够完整，不判断“哪个 profile 最美”。
2. Visual direction 至少固定：同一地球/卫星/接收机语义身份、轨道与信号传播方向、时间差
   的正负视觉符号、数值层级、字幕安全区避让、连续 palette/typography，以及禁止无动机 HUD、
   自动 layout、随机镜头和旧作品模仿。
3. 五个 project-specific cue 用确定性 PCM synthesis 生成，但音色/节奏由主 Agent 设计：信号
   到达、双时钟对比、净漂移锁定、误差告警、蓝点锁定。generator 只是重建已确定波形，不
   自动创作/选声音；输出只属于对应 Scene public 目录。
4. 写 manifest 后先 `catalog:generate`，再冻结 VisualStyle/SceneTaskInput，避免 Task 2 才新增
   asset 导致 Catalog fingerprint 反向使全部 Task 1 产物 stale。
5. `freeze-inputs.ts` 复用 `computeStoryFingerprint`、`computeRenderSpecFingerprint`、
   `computeVisualStyleFingerprint`、`buildSceneTaskInput` 和现有 atomic writer；不手写 fingerprint。
6. Task 1 同时记录每个 Scene 是否允许 external snapshot。允许不等于必须选择；Task 2 仍可
   在允许范围内选择 `empty`。没有完整来源证据时 allowlist 留空。

### 聚焦验证

```bash
node --import tsx --test tests/m7-gps/freeze-inputs.test.ts
npm run m7:gps:audio -- check
npm run catalog:check
npm run m7:gps:freeze -- check
npm run typecheck
npm run lint
npm run baseline:evidence -- --project gps-relativity
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
```

Task 1 没有 Scene renderer，真实媒体证据使用既有 M3 Baseline evidence 复验，证明新增 Catalog/
task inputs 未改变 NarrativeCore；不得生成假 Scene still。

### Fingerprint / fail-closed / 不包含

- audio byte/license、Catalog、style profile/art direction、Story/Render/timing、allowlist、snapshot
  或 continuity 任一变化，使对应下游 task stale；Narrative fingerprint 保持不变。
- 任一 asset 生成/manifest/Catalog 失败时，不写 VisualStyle 或 task inputs。
- 不包含 Scene plans、Renderer、fidelity、package、coverage、registry、Composition slots、M8。

### 精确 staging 与 commit

只 stage 上述 required files；如果 external snapshot 分支未命中，明确验证该文件不存在。如果
命中，先把实际 snapshot/localization 文件逐项追加到 `git add -- <exact paths>`，不得用目录
通配或 `git add .`。

建议 commit：

```text
feat(gps): freeze m7 scene inputs and local audio assets
```

## 6. Task 2 — 一个 formal Scene production wave 并行完成五个 meaningId

**目标与范围：** 在一个顶层 Task 内，由主 Agent 先建立共享但按 meaningId 隔离的验证/预览
入口，再并行启动五个独立 Scene 子 Agent。每个子 Agent 独占一个 meaningId，完成该 Scene 的
authoring、visual-only Renderer、Scene-local sound declaration、selected resources 与
recipe/fidelity applicability。主 Agent 统一收集、检查越权写入、运行全 wave 验证并创建一个
commit。五个子 Agent 任务不是五个顶层 Task。

### Files

Create main-Agent-owned dispatch/validation surface before spawning Scene agents:

- `scripts/m7-gps/author-scenes.ts`
- `tests/m7-gps/scene-authoring.test.ts`
- `tests/m7-gps/scene-authoring.test.tsx`

Modify by main Agent only:

- `package.json`

For each of the five Scene directories, create:

- `visual-plan.json`
- `shot-plan.json`
- `sync-anchors.json`
- `sound-plan.json`
- `selected-resources.json`
- `shot-recipe-selection.json`
- `Renderer.tsx`
- `generated/reference-fidelity.generated.json`
- `authoring/index.ts`
- `authoring/Root.tsx`
- `authoring/Composition.tsx`

Planned composition-local Shot source files:

- `scenes/position-is-time/shots/PositionTimingShot.tsx`
- `scenes/two-relativistic-effects/shots/RelativisticEffectsShot.tsx`
- `scenes/net-drift/shots/NetDriftShot.tsx`
- `scenes/error-accumulation/shots/ErrorAccumulationShot.tsx`
- `scenes/practical-conclusion/shots/PracticalConclusionShot.tsx`

Conditional exact branch only:

- `shots/video-shotcraft/<cardId>/**` minimal localized closure + license/NOTICE;
- `generated/localization-manifest.generated.json`;
- `generated/reference-fidelity-review.generated.json`;
- paired source/adaptation evidence files under the current Scene/evidence scope.

Each isolated `scenes/<meaningId>/authoring/` entry imports only its owning Scene renderer, is
authoring-only and must never enter `src/index.ts`, normal ProjectRegistry or final coverage. It lets that
Scene 子 Agent render early/mid/late frames without waiting for another Scene and is not a Story,
synthetic fallback or final Composition.

### 并行 ownership 与分发

主 Agent 必须在 spawn 前把 Task 1 的五份 current SceneTaskInput 映射为以下互斥任务；五个任务
可以并行运行，但共享文件始终只读：

| 子 Agent      | meaningId                  | 独占源码目录                                                   | 独占 public 目录                                                  | 冻结局部音频                          |
| ------------- | -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| Scene Agent A | `position-is-time`         | `src/projects/gps-relativity/scenes/position-is-time/`         | `public/projects/gps-relativity/scenes/position-is-time/`         | `assets/signal-arrival-pulse.wav`     |
| Scene Agent B | `two-relativistic-effects` | `src/projects/gps-relativity/scenes/two-relativistic-effects/` | `public/projects/gps-relativity/scenes/two-relativistic-effects/` | `assets/dual-clock-pulse.wav`         |
| Scene Agent C | `net-drift`                | `src/projects/gps-relativity/scenes/net-drift/`                | `public/projects/gps-relativity/scenes/net-drift/`                | `assets/net-drift-lock.wav`           |
| Scene Agent D | `error-accumulation`       | `src/projects/gps-relativity/scenes/error-accumulation/`       | `public/projects/gps-relativity/scenes/error-accumulation/`       | `assets/error-accumulation-alert.wav` |
| Scene Agent E | `practical-conclusion`     | `src/projects/gps-relativity/scenes/practical-conclusion/`     | `public/projects/gps-relativity/scenes/practical-conclusion/`     | `assets/blue-dot-lock.wav`            |

每个 spawn prompt 必须附 exact SceneTaskInput、当前 M5 ownership 条款、该 Scene checklist、允许
reference/resource IDs、单 Scene 验证命令和禁止路径，并明确“你不是仓库中唯一 Agent，不要
撤销或整理其他 Agent 的修改”。子 Agent 不修改 `scripts/`、`tests/`、`package.json`、Catalog、
`visual-style.json`、其他 Scene、coverage、registry 或 Composition；不 stage/commit/push。
虽然 `task-input.generated.json` 和冻结 cue 位于 owning 目录内，它们仍是主 Agent 已封存的
只读输入；子 Agent 的写入 allowlist 只包含本 Task 列出的 authored/generated Scene 输出与
明确允许的本地化资产/evidence，不能覆盖 task input 或 cue。

### 红测试

1. `author-scenes.ts --meaning <id> --write|--check` 只加载一个 current task input，只能读写该
   meaningId 的声明/receipt；另一个 Scene 缺失或失败不得阻断本 Scene，路径逃逸、共享文件写入
   或跨 Scene 读取必须失败且不覆盖上一份有效 generated JSON。`--all --check` 只供主 Agent
   收集后聚合验证，不承担创作或自动修复。
2. 每个 VisualPlan 的 semantic objective/subject/action/causal link/composition/style/continuity
   非空，orderedShotIds 与 ShotPlan 严格一致；不得出现 chunkId、CaptionCue、subtitle、
   renderer/module path。
3. Shot ranges 使用当前 Scene-local `[0, duration)`，按 order 单调、无 overlap、无越界；可以
   跨越两个 TTSChunk，不能以 CaptionCue 边界作为合同输入。
4. sync anchor eventId 唯一且在窗口内；每个 sound cue 的 anchor/explicit timing 互斥，完整
   cue range 不越界、不 clamp、不 spill。
5. 五个 SoundPlan 均显式引用本 Scene 的 project-authored cue，volume 有限且保守；不接受
   narration/BGM/cross-scene/ducking/mastering/provider/URL。
6. selected-resources 精确覆盖 VisualPlan/ShotPlan/SoundPlan 引用；descriptor/catalog/license
   current；M6 proof asset、另一个 meaningId asset、blocked/unknown 失败。
7. 每个 Scene 的 recipeDecision、ShotRecipeSelection 和 fidelity receipt 三者一致：exact→pass，
   inspiration/empty→对应 `not-applicable`；同一 Scene 不混用 exact/inspiration 模式。
8. Renderer 恰好一个 default export，只输出视觉；完整 source graph 无 Audio/Caption/
   Narration、remote/upstream/global-skill import、CSS animation/transition、动态 import 或目录扫描。
9. Renderer 实际使用 `sceneFrame`，内部 Shot 使用派生 local frame；至少两个 probe frame 的
   rendered state 有感知差异，不能用静态 JSX/metadata 冒充运动。
10. authoring-only entry 从 normal Root/ProjectRegistry 隔离；正常 `npm run compositions` 仍不
    新增任何 authoring/synthetic entry。
11. ownership 测试记录 Task 2 开始时的 shared-input fingerprints 和允许目录；任一子 Agent
    触碰 shared file、另一个 Scene/public 目录或创建额外 registry/Composition entry 时，全 wave
    收集失败，但不删除其他 Agent 的有效输出。

### 五个并行 Scene 子任务 checklist

#### A. `position-is-time` — 346 frames

- 语义任务：让观众先理解 GPS 定位本质上测量多颗信号的到达时间，再由 `c × Δt` 得到距离。
- 视觉计划候选：固定接收机/卫星语义身份与传播方向；多路信号波前到达后形成测距几何，
  不是按第一/第二句机械切镜。
- 局部声音：`signal-arrival-pulse.wav` 只绑定一个明确可见的信号到达 anchor。
- 连续性出口：把卫星时钟/时间脉冲作为下一 Scene 可继承对象，不改变地球/轨道方向。

#### B. `two-relativistic-effects` — 335 frames

- 语义任务：同时看清速度导致约 `-7 μs/day` 与弱引力导致约 `+45 μs/day` 的相反方向。
- 视觉计划候选：同一卫星/时钟在统一坐标和 palette 中展示两种效应，避免两个无关 panel
  或自动 layout；数值正负与箭头方向跨 Scene 保持一致。
- 局部声音：`dual-clock-pulse.wav` 绑定两个效应汇合前的视觉 event；尾部 300ms 叙事停顿只
  是既有 timing，Scene 不据此扩展或重排。
- 连续性出口：保留 `-7/+45` 两个可组合量进入 net drift。

#### C. `net-drift` — 322 frames

- 语义任务：把 `-7 + 45 = +38 μs/day` 与 `1 μs ≈ 300 m` 连成一个视觉因果。
- 视觉计划候选：先在同一数轴/时钟系统合成净漂移，再把微秒尺度投影为传播距离；不把
  公式卡和距离卡做成互不关联的模板切换。
- 局部声音：`net-drift-lock.wav` 绑定净值锁定 anchor。
- 连续性出口：将净漂移累积方向传给 error Scene。

#### D. `error-accumulation` — 415 frames

- 语义任务：从微小钟差扩展到公里级定位误差，再说明卫星、地面控制、接收机共享时间基准。
- 视觉计划候选：误差范围扩张与三端网络是同一因果链；避免无依据灾难化、随机地图或旧
  layout。400ms 叙事停顿仍由 sealed timing 拥有。
- 局部声音：`error-accumulation-alert.wav` 绑定误差跨越阈值的 Scene-local anchor，音量不能
  掩盖旁白。
- 连续性出口：把校正后的共享时间网络收束到手机接收机。

#### E. `practical-conclusion` — 283 frames

- 语义任务：从完整时间网络收束到手机地图蓝点，明确相对论修正正在日常定位中工作。
- 视觉计划候选：复用前面确定的信号/时钟语法，并把它压缩为手机蓝点背后的可见因果，不
  引入新的全局视觉层、品牌 UI 或发布 CTA。
- 局部声音：`blue-dot-lock.wav` 绑定蓝点稳定锁定 anchor。
- 连续性出口：在固定 Beat 结束前完成 settle，不 spill 到 tail/global sound。

上述是本计划从当前 Story 推导的 authoring brief，不是自动生成结果。每个 Scene 子 Agent
必须在自己的 VisualPlan/ShotPlan 中写出最终创意决定并对 probe frames 自审；机械 writer
不得根据这些文字自动布局或选卡。子 Agent 只收到相邻连续性摘要，不打开另一个 Scene 的
Renderer/Shot/still；主 Agent 在收集阶段负责全片连续性判断。

### 最小实现步骤

1. 主 Agent 先写失败测试和 `author-scenes.ts`/package scripts，使其支持严格的
   `--meaning <id>` 隔离入口及只读 `--all --check`；共享测试必须在任何 Scene 源码出现前红。
2. 主 Agent 核对五份 SceneTaskInput current、允许目录互不重叠、protected/shared fingerprints
   已记录，然后同时 spawn 五个 owning Scene 子 Agent。
3. 每个子 Agent 只把自己已写定的 project-specific declarations 交给
   `author-scenes.ts --meaning <id>` 生成 fingerprints/receipts；writer 不根据关键词或文本创造
   Shot。
4. 每个 Renderer 只静态 import 自己的 main Shot 与 approved capabilities；不得读取另一个
   Scene 源码。main Shot 内可实现多个 ShotPlan range，但仍只有一个 Scene registry entry。
5. 视觉默认 code-first/frame-driven；只有真正需要且 Task 1 已允许时才选/本地化外部 recipe。
6. 每个 SoundPlan 引用 Task 1 为本 meaningId 冻结的 verified local cue。没有适当 ambience 时
   保持 `ambience: null`，不放占位 ambience。
7. 每个 Scene-local authoring entry 使用真实 task/style/plan/Renderer props，只供本 Scene early/
   mid/late still；不装旁白、字幕或 Scene audio，不产生 coverage。
8. 主 Agent 等待五个任务结束后，先用 `git status`/允许路径清单检查 ownership，再运行五次
   单 Scene check/still；失败只把该 meaningId 和具体证据退回原 owning Agent 修订。
9. 五个 Scene 都通过后，主 Agent 运行 `--all --check`、normal composition listing、narrative
   gate 和全 wave tests；子 Agent 输出未经主 Agent 收集审查不得进入 Task 2 commit。

### 聚焦验证与真实早期证据

```bash
node --import tsx --test tests/m7-gps/scene-authoring.test.ts tests/m7-gps/scene-authoring.test.tsx
npm run m7:gps:author -- --meaning position-is-time --check
npm run m7:gps:author -- --meaning two-relativistic-effects --check
npm run m7:gps:author -- --meaning net-drift --check
npm run m7:gps:author -- --meaning error-accumulation --check
npm run m7:gps:author -- --meaning practical-conclusion --check
npm run m7:gps:author -- --all --check
npm run typecheck
npm run lint
npm run m7:gps:authoring:compositions -- --all
npm run m7:gps:authoring:stills -- --all
npm run compositions
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
```

每个子 Agent 在交付前对自己的 authoring entry 运行 `compositions --meaning <id>` 和 `stills
--meaning <id>`；主 Agent 收集后再运行上面的 `--all`。stills 至少为每个 Renderer 取 early/
mid/late 三个 Scene-local frame，输出到 ignored `out/gps-relativity/m7-authoring/<meaningId>/`；
只证明真实 frame-driven source 可渲染，不作为 Task 4 contact sheet、final coverage 或创意批准。

### Fingerprint / fail-closed / 不包含

- 单 Scene VisualPlan/Shot/Renderer/visual resource 变化只使该 Scene visual/fidelity/package 与
  下游 StoryVisual/Preview stale；anchor 不变时其 sound fingerprint 保持有效。
- anchor 变化使该 Scene visual+sound+package stale；SoundPlan/audio 变化只使 sound/package
  及下游 sound projection stale；其他四个 Scene 与 NarrativeCore 保持有效。
- exact 证据任何一项不 current 时该 Scene 不得生成 pass fidelity；选择 empty 不因此失败。
- 一个子 Agent 失败只使其 owning meaningId 未完成；不得污染、回滚或重新生成其他四个 Scene。
  Task 2 顶层 commit 仍要求五个 Scene 全部通过，不能用 partial/fallback 收口 M7。
- 不包含 ScenePackage、coverage、registry、真实 Story projection/Composition slots、M8。

### 精确 staging 与 commit

子 Agent 不 stage 或 commit。主 Agent 在 ownership/preflight 全通过后，stage shared
authoring script/tests/package script、每个 Scene 的八个标准文件、三个 Scene-local authoring
文件和一个明确命名的 main Shot 文件；如果 exact 分支命中，逐文件追加该 Scene 的最小
closure/license/evidence。不得 stage `out/`、`.reference-workspaces/`、整个 `scenes/` 目录或
任何子 Agent 越权文件。

建议 commit：

```text
feat(gps): author five formal m7 scenes
```

## 7. Task 3 — 统一生成 packages/coverage/registry 并接入真实 Composition

**目标与范围：** 先修复第 2.2 节两个最小 file-backed writer gap，再为五个 Scene 生成 current
ScenePackage、全 `ready` SceneCoverageMap、literal RendererRegistry；建立真实 GPS
projection/data module，并把 StoryVisualTrack、SoundDesignTrack 与受保护 NarrativeCore 在同一
Composition 中实时叠加。

### Files

Modify:

- `scripts/scene-package/generate.ts`
- `scripts/scene-package/cli.ts`
- `tests/scene-package/generate.test.ts`
- `tests/scene-package/coverage.test.ts`
- `tests/scene-package/cli.test.ts`
- `src/projects/gps-relativity/Composition.tsx`
- `tests/projects/gps-relativity-composition.test.tsx`

Create:

- `src/projects/gps-relativity/scene-runtime-data.ts`
- `tests/m7-gps/package-integration.test.ts`
- `tests/m7-gps/invalidation.test.ts`
- each Scene's `generated/scene-package.generated.json`
- `src/projects/gps-relativity/generated/scene-coverage.generated.json`
- `src/projects/gps-relativity/renderer-registry.generated.ts`

No authored visual/sound plan may be silently rewritten by this Task.

### 红测试

1. A formal Renderer importing its main `shots/*.tsx` produces the same
   `collectRendererSourceGraph().sourceGraphFingerprint` in package writer, registry writer and final
   runner; old direct-Renderer checksum behavior fails the red test.
2. `scene:coverage -- --project gps-relativity --write|--check` works without injected test context,
   reads current Story order and exactly five package receipts, and writes/checks
   `generated/scene-coverage.generated.json` atomically/byte-stably.
3. coverage CLI rejects missing/stale/duplicate/unknown/out-of-order package and any fallback for this M7
   project path; failed write preserves the last all-ready coverage.
4. Each `scene:package --check` rebuilds from current task/plan/selection/fidelity/selected resources/full
   renderer graph and matches persisted bytes; all five rendererIds are exactly
   `gps-relativity-<meaningId>`.
5. RendererRegistry contains exactly five literal static imports, one per ready Scene; no Shot component,
   JSON path, dynamic import, symlink, fallback, M6 proof or unknown renderer entry。
6. StoryVisualProjection uses the five absolute Beat windows, all four transitions are current `hard-cut`
   with duration 0, total stays 1731；SoundDesignProjection has five ready entries and only Scene-local
   contributions.
7. `scene-runtime-data.ts` parses all current JSON, validates registry source graph identities, resolves
   visual asset `staticFile()` paths if any, resolves five sound projections, and builds
   `rendererPropsByMeaning` with no runtime directory/Catalog scan.
8. `Composition.tsx` passes exact `storyVisualTrack` and `soundDesignTrack` props plus the existing
   `narrativeCore`; complete narration remains mounted once, top-level CaptionLayer remains above Scene
   visuals, no Scene renderer/audio duplicates it.
9. Normal ProjectRegistry entry metadata remains `GpsRelativity`, 30 fps, 1920×1080, 1731 frames；normal
   listing remains two entries and contains no M6 proof/authoring entry.
10. Isolated mutation matrix proves:
    - one Scene Renderer/main Shot changes only that package, registry/visual projection/final；
    - one SoundPlan/audio changes only that sound/package/sound projection/final；
    - one anchor changes both branches of only that Scene；
    - Catalog/VisualStyle/timing global changes invalidate the documented wider set；
    - all mutations preserve protected narrative bytes, other ready packages, failed writer target bytes
      and mtime.

### 最小实现步骤

1. Replace direct `readFile(Renderer.tsx)` checksum in
   `generateScenePackageFromProjectFiles` with `collectRendererSourceGraph`；pass its graph fingerprint to
   both renderer binding and current authority input.
2. Add `generateSceneCoverageFromProjectFiles` that loads StoryBeat order and the five current package
   files, calls existing `generateSceneCoverage`, and uses no fallback/stale auto-repair. Wire it as the
   default `coverage` CLI implementation.
3. Generate/write five packages in Story order, then all-ready coverage, then RendererRegistry；rerun all
   three in check mode before touching Composition.
4. Implement `scene-runtime-data.ts` following the M6 runtime interfaces, not its creative proof data：
   static JSON imports, strict schema parse, current registry check, visual props, sound resolution and
   projection builders.
5. Use hard cuts because current final runner deterministically recomputes hard cuts. Do not add a second
   transition declaration system or M8 overlay/global layer.
6. Add real Composition slots only after all five ready packages/registry/projections are current；no
   partial package set or fallback is allowed to enter GPS production.

### 聚焦验证与真实 Composition evidence

```bash
node --import tsx --test \
  tests/scene-package/generate.test.ts \
  tests/scene-package/coverage.test.ts \
  tests/scene-package/cli.test.ts \
  tests/m7-gps/package-integration.test.ts \
  tests/m7-gps/invalidation.test.ts \
  tests/projects/gps-relativity-composition.test.tsx
npm run scene:package -- --project gps-relativity --meaning position-is-time --check
npm run scene:package -- --project gps-relativity --meaning two-relativistic-effects --check
npm run scene:package -- --project gps-relativity --meaning net-drift --check
npm run scene:package -- --project gps-relativity --meaning error-accumulation --check
npm run scene:package -- --project gps-relativity --meaning practical-conclusion --check
npm run scene:coverage -- --project gps-relativity --check
npm run renderer:check -- --project gps-relativity
npm run typecheck
npm run lint
npm run compositions
npm exec remotion still src/index.ts GpsRelativity out/gps-relativity/m7-integration/frame-857.png --frame=857 --log=error
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
```

Frame 857 is inside `net-drift` and is a representative integration still, not a historical reference or
approval. It must show current Scene pixels with the top-level CaptionLayer still owned by NarrativeCore.

### Fingerprint / fail-closed / 不包含

- package/coverage/registry/projection/Composition identities all derive from current inputs；no handwritten
  hash or fake ready status。
- 任一 package/registry/projection failure keeps prior generated files intact and prevents Composition
  slot wiring commit。
- Narrative gate remains independently passable before/after Scene integration。
- 不包含 subjective review/evidence receipt、M8 global sound/visual、approval/release。

### 精确 staging 与 commit

Stage only the five generated package JSON files, one generated coverage JSON, one generated registry TS,
the two modified scene-package scripts/tests, new M7 integration/invalidation tests, `scene-runtime-data.ts`,
`Composition.tsx` and its test. Do not stage Task 2 early stills or any `out/` file.

建议 commit：

```text
feat(gps): assemble m7 packages and scene projections
```

## 8. Task 4 — 批量 SceneVisualCheck/SceneSoundCheck/连续性与 fidelity 证据闭环

**目标与范围：** 对真实 `GpsRelativity` Composition 一次批量审核五个 Scene 的语义、构图、
motion、连续性、局部音效、同步和可读性；生成真实 contact sheet、代表 still、完整 M7 review
preview，以及仅在命中条件时的 motion strip/short preview/exact fidelity evidence。机械 evidence
collector 只绑定 Agent 已作出的 review 结论与 current fingerprints，不自动审美。

### Files

Create:

- `scripts/m7-gps/evidence.ts`
- `src/projects/gps-relativity/reviews/m7-scene-review.json`
- `src/projects/gps-relativity/generated/m7-scene-production-evidence.generated.json`
- `tests/m7-gps/evidence.test.ts`

Modify:

- `package.json`
- any Scene authored/source/generated files that fail the Task 4 review；主 Agent 必须把问题和
  current evidence 定向退回原 owning Scene 子 Agent，每次修订只落在对应 meaningId，并由主
  Agent 重新生成该 package、全局 coverage/registry/projections/evidence。

Ignored outputs only:

- `out/gps-relativity/m7-review/stills/*.png`
- `out/gps-relativity/m7-review/gps-relativity-m7-contact-sheet.png`
- `out/gps-relativity/m7-review/gps-relativity-m7-review.mp4`
- conditionally required motion strips/short previews for meaning-changing/high-risk/exact shots。

### 红测试

1. Review JSON strict binds Story ID, five package visual/sound fingerprints, coverage, registry, visual/
   sound projection fingerprints, and ordered per-Scene Agent conclusions；unknown/missing/out-of-order
   entries fail。
2. Each SceneVisualCheck requires Agent notes for semantic objective, style realization, composition,
   motion legibility, caption-safe readability and adjacent continuity；script cannot infer/pass them from
   pixels or metadata。
3. Each SceneSoundCheck requires Agent notes for cue necessity, audibility under narration, anchor sync,
   volume and Beat boundary；mechanical code only verifies declared resource/range/checksum/current identity。
4. Four continuity checks bind adjacent meaningIds and both current visual fingerprints；one-side Scene
   change makes the corresponding boundary review stale。
5. Contact sheet manifest has early/mid/late representative absolute frames for all five Beat windows in
   Story order；missing/duplicate/wrong-window/historical asset path fails。
6. Full review MP4 is 1731 frames, 30 fps, 1920×1080, H.264 with one AAC output stream；the stream is the
   real-time mix of protected narration and Scene-local contributions, not BGM/mastering evidence。
7. Exact Shotcraft Scene（若存在）必须另外绑定 current source/adaptation phase pairs、normal-speed
   preview 和 `reference-fidelity.generated.json`；inspiration/empty 不得生成 fake exact pass。
8. Evidence writer is pass-only、atomic、byte-stable；failed/stale Agent conclusion or media checksum
   does not overwrite the last valid receipt。
9. Review/evidence source does not add FinalPreviewApproval、user approval、NarrativeCheck、release、
   global audio/visual or auto-aesthetic score。

### 最小实现与审核责任

1. Render 15 stills from current Story Composition：each Beat at approximately 25%/50%/75% of its own
   fixed range；persist exact frame numbers/checksums in evidence, not in runtime。
2. Compose one 5×3 contact sheet in Story/phase order。The contact sheet is the primary batch visual
   surface；do not manufacture multiple redundant still sets。
3. Render one full 57.7-second M7 review MP4 at normal speed so Agent can review cross-Scene pacing and all
   five local cues under protected narration。Label it review evidence, never FinalPreviewApproval。
4. Main Agent writes one consolidated review record after reading all owning Scene self-reviews。The
   evidence tool only checks `status=pass` was explicitly authored and still matches current
   package/projection/media fingerprints。
5. When review finds an issue, main Agent sends the exact failed review item/current media back to the
   original owning Scene Agent；that Agent revises only its Scene and reruns the single-meaning gate。Main
   Agent then regenerates that package, coverage/registry, rerenders affected evidence and reruns all five
   batch checks。Do not patch the review receipt, let another Agent edit the Scene, or loosen a checker to
   accept stale work。
6. Generate motion strip/short preview only for meaning-changing motion, visually ambiguous transition or
   selected exact recipe；empty/simple readable scenes do not need redundant strips。

### 聚焦验证与真实 evidence

```bash
node --import tsx --test tests/m7-gps/evidence.test.ts
npm run m7:gps:evidence:write
npm run m7:gps:evidence
npm run m7:gps:author -- --all --check
npm run scene:coverage -- --project gps-relativity --check
npm run renderer:check -- --project gps-relativity
npm run typecheck
npm run lint
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
```

`m7:gps:evidence:write` 的内部固定步骤包括真实 Remotion still/render、contact sheet、ffprobe/
checksum 收集和 pass-only receipt write；check mode 只复验已存在 media/receipt，不重渲染或
重写。

### Fingerprint / fail-closed / 不包含

- 单 Scene visual/sound/anchor/fidelity 变化精确使对应 review item、受影响 continuity boundary、
  evidence receipt 及下游 preview stale；其余 Scene review 与 NarrativeCore 保持 current。
- coverage/registry/projection/Composition 变化使 consolidated evidence stale。
- 主观 review 由 Agent 负责；机械 checker 只绑定 current evidence，不声称自动判断画面好坏、
  声音品味或正常速度可辨识度。
- 不包含用户批准、M8 global tracks、mastering、release。

### 精确 staging 与 commit

Base staging set only includes `scripts/m7-gps/evidence.ts`、review JSON、generated evidence receipt、
test and `package.json`。如果 review 触发 Scene 修订，先用 `git diff --name-only` 得到实际受影响
meaningId，再逐文件 stage 该 Scene 的 authored/source/generated files 和 regenerated coverage/
registry；不得 stage 其他 Scene 或 `out/`。

建议 commit：

```text
test(gps): bind m7 scene review evidence
```

## 9. Task 5 — GPS final-level、M7 evidence 与 authority-doc closeout

**目标与范围：** 在五个 Scene 全 ready 且 Task 4 evidence current 后，显式写入第一份 passing
FinalMechanicalCheck，再用默认 read-only form 复验；同步 README/AGENTS/authority docs 与 M7
evidence，运行完整 gate 后停止。Task 5 不开始 M8 或 push。

### Files

Create:

- `src/projects/gps-relativity/generated/final-mechanical-check.generated.json`
- `docs/evidence/2026-08-03-gps-relativity-m7-scene-production.md`

Modify:

- `README.md`
- `AGENTS.md`
- `docs/FINAL_PRODUCT_GOAL.md`
- `docs/PRODUCTION_WORKFLOW.md`
- `docs/ITERATION_STATUS.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/DETERMINISTIC_EXECUTION.md`
- `docs/TERMINOLOGY.md`
- `docs/CAPABILITY_CATALOG.md`
- `docs/REVIEW_MODEL.md`

### 红检查

1. Before `--write-final-check`, default final fails only because persisted passing report is absent；all
   ten in-memory checks already pass。
2. `--write-final-check` refuses any non-pass branch and is atomic/byte-stable；second write preserves
   checksum/mtime；default final rejects malformed/unknown/stale bytes without repair。
3. Final input identity binds current narrative report、VisualStyle、Catalog、conditional reference/fidelity、
   five packages、all-ready coverage、five-entry registry、both projections and current Composition source。
4. coverage entries are exactly five `ready` in Story order；zero fallback/missing/stale；no M6 proof
   package/fingerprint/rendererId appears。
5. Authority docs no longer say GPS formal Scene/M7 review is missing；they still say NarrativeCheck and
   M8 GlobalSound/GlobalVisual/FinalPreviewApproval/release are not implemented。
6. README only documents real commands/interfaces；does not claim automatic aesthetics, arbitrary Shotcraft
   selection, global mix, approval or publishing。
7. Evidence doc records current branch/commit range, five meaningIds/ranges/package fingerprints, Catalog/
   registry/projection/final/evidence fingerprints, exact reference modes, real media facts and review
   boundary；no private path/token/provider config。
8. Normal Composition listing remains only `CapabilityGallery` + `GpsRelativity`；M6 proof and M7
   authoring entry remain explicit isolated entries only。
9. Protected M2/M3/M4 source/media checksums and Git diff remain zero；no secret、temporary reference
   workspace、`out/`、`build/`、unrelated file is tracked/staged。

### 最小实现步骤

1. Run final in-memory/default form to prove Scene branch passes but persisted report is absent；then run
   the explicit writer once and the default read-only form twice。
2. Capture current mechanical/review/media identities into the M7 evidence document；never paste raw
   absolute temp paths or creative approval claim。
3. Update status/roadmap：M1–M7 complete，M8 becomes the only next milestone；do not create any M8 file。
4. Update Review Model to say M7 Agent SceneVisual/SceneSound/continuity reviews are implemented as
   current evidence-bound batch records，while FinalPreviewApproval remains future M8。
5. Run focused docs check，then the complete gate below；any failure returns to the owning Task, not by
   editing final report/evidence fingerprints manually。

### Final report write/read sequence

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level final --write-final-check
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level final
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level final
```

### 完整 gate

```bash
npm exec prettier -- --check "README.md" "AGENTS.md" "docs/**/*.md"
npm test
npm run typecheck
npm run lint
npm run docs:check-links
npm run catalog:check
npm run registry:check
npm run build
npm run compositions
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level final
npm run m7:gps:evidence
git diff --check
```

真实视觉/音频 gate 还必须复验：

- GPS contact sheet checksum/current frame manifest；
- at least one representative actual Composition still per Scene；
- full normal-speed M7 review MP4：1731 frames、H.264、one AAC output stream；
- exact recipe 命中时对应 normal-speed paired fidelity evidence；未命中时明确 not-applicable；
- 五个 Scene-local audio asset 的 PCM/checksum/license 和五份 SceneSoundCheck conclusion。

保护与污染 gate：

```bash
git diff --exit-code "$M7_BASE_HEAD" -- \
  src/projects/gps-relativity/story.json \
  src/projects/gps-relativity/narration.json \
  src/projects/gps-relativity/render.json \
  src/projects/gps-relativity/reviews/story-check.json \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json \
  src/projects/gps-relativity/generated/narrative-auto-check.generated.json \
  public/projects/gps-relativity/narration \
  src/remotion/runtime/narrative-core \
  src/projects/project-registry.generated.ts
git ls-files 'out/**' 'build/**' '.reference-workspaces/**'
git status --short --untracked-files=all
git diff --cached --check
git diff --cached --name-only
```

`git ls-files` 对 ignored output/workspace/build 必须无输出。逐项检查 staged diff 无 `.env`、token、
private config、raw provider URL、临时 source checkout、M6 proof copy 或无关文件。

### Fingerprint / fail-closed / 不包含

- final writer only on aggregate pass；失败保留最后 valid report。
- docs/evidence 不能让 runtime fingerprint 通过；代码/asset/receipt gate 先通过才更新状态。
- 不包含 M8 files、GlobalSoundPlan、BGM、cross-Scene ambience、ducking、mastering、
  GlobalVisualLayers、FinalPreviewApproval、release/publish 或 shared capability promotion。

### 精确 staging 与 commit

Stage one final generated report、one M7 evidence doc and the exact authority/README files listed above。
Before commit，inspect `git diff --cached --name-only` and confirm no Scene/source file unexpectedly changed
after Task 4。

建议 commit：

```text
docs: close gps relativity m7 scene production
```

完成本 commit 后停止；不创建 M8 计划/文件，不 push。

## 10. Task 依赖、合并策略与 commit 顺序

```text
Task 1  project style + audio assets + Catalog + five frozen task inputs
   ↓
Task 2  main Agent creates isolated dispatch/check surface
   ├── Scene Agent A: position-is-time
   ├── Scene Agent B: two-relativistic-effects
   ├── Scene Agent C: net-drift
   ├── Scene Agent D: error-accumulation
   └── Scene Agent E: practical-conclusion
        ↓ all five return to main Agent ownership/preflight gate
   ↓
Task 3  package + all-ready coverage + registry + real Composition projections
   ↓
Task 4  batch visual/sound/continuity/fidelity review + evidence revision loop
   ↓
Task 5  passing final report + evidence/docs + full gate
```

不能继续合并的独立失败边界：

- Task 1 的 project-global Catalog/style/task fingerprint 一旦不稳，五个 Scene 全部不应开始；
- Task 2 是五个隔离子 Agent 的创意/source production wave；单 Scene 可独立失败和定向返工，
  但主 Agent 收齐前不能宣称 wave、package、registry 或 final ready；
- Task 3 是 pass-only aggregation/runtime boundary，必须拒绝部分 Scene；
- Task 4 是主观 Agent review + current evidence，不应伪装成 Task 3 机械 gate；
- Task 5 只有在前四项完成后才能改变 authority status/persist final report。

因此最终顶层 Task 数保持 5；五个 Scene 合并为 1 个 production wave，同时保留 5 个独立并行
Agent 制作任务，没有第二 Scene batch，也没有把 Scene、测试、generator、docs 机械拆成顶层
Task。

## 11. Failure recovery

- **Task 1 Catalog/style/task freeze 失败：** 保留旧 17-entry Catalog/既有 narrative；修复 audio/
  manifest/allowlist 后重新生成，不创建半套 task inputs。
- **单个 Scene 子 Agent 失败：** 主 Agent 保留其他四个 valid authored output，只把失败证据
  和同一冻结 task input 退回原 owning meaningId 定向修订；不能让另一个子 Agent 接管并读取
  其半成品，不能标 fallback/ready，不能修改 timing/共享输入/其他 Scene。Task 2 commit 等待
  五个 Scene 全部通过，但不要求已通过 Agent 重做。
- **子 Agent 越权写入：** 主 Agent 停止收集该 meaningId 并报告具体路径；不 reset、不自动
  删除、不把越权文件纳入 staging。确认用户工作与其他 Agent 输出安全后，才允许 owning Agent
  在正确目录重新交付。
- **Shotcraft exact 失败：** 降级只能由 Agent 重新作出并记录为 inspiration/empty；不能由
  checker 自动降级、换卡或近似宣称 exact。
- **Package/coverage/registry 失败：** 保留最后 pass artifacts；Narrative Baseline 继续通过；
  不以手写 hash/status 或 runtime discovery 修复。
- **Composition render 失败：** M7 不能完成；React unit test 或 authoring still 不能代替真实
  Story Composition evidence。
- **Scene review 失败：** 主 Agent 只把失败项退回原 owning Scene 子 Agent，修订该 Scene 后
  重算其 package 和所有必要 downstream；不让其他 Agent 接管、不改 review status/fingerprint
  冒充 pass。
- **Final writer 失败：** 保留无 report 或最后 valid report；先修上游 current identity；不扩大
  到 M8。
- **Narrative gate 失败：** 真实 blocker；停止 M7 并恢复/核对受保护 M1–M4 权威，不能用 Scene
  遮盖。
- **用户已有修改与计划文件重叠：** 停止并报告，不 reset/overwrite/reorder 用户工作。

## 12. 计划自审

1. **M7 每项交付均有 Task/测试/证据：通过。** Task 1 冻结 style/Catalog/reference/task；Task 2
   由五个独立子 Agent 并行完成五 Scene authoring，主 Agent 做隔离检查与汇总；Task 3
   package/coverage/registry/projection/Composition；Task 4 batch review/contact sheet/preview/
   fidelity；Task 5 final/evidence/docs/full gate。
2. **Scene wave 与并行边界：通过。** 五个 meaningId 全在 Task 2 一个 wave，映射为五个互斥
   Agent 任务；一个 meaningId/一个独占 Scene 目录/一个 Agent/一个 ScenePackage，未拆五个
   顶层 Task。共享输入、tests/scripts、Catalog、registry、Composition 和 commit 仍由主 Agent
   所有。
3. **Task 数：通过。** 总数恰好 5，无需解释第 6/7 项。
4. **叙事/时间/Shot ownership：通过。** M2/M3 artifacts explicit protected；Shot 只绑定
   meaningId/local range，不消费 CaptionCue/TTSChunk 边界，不移动 Beat。
5. **Shotcraft：通过。** exact/inspiration/empty 三态明确；不强迫、不 metadata-only、不整仓
   vendoring；当前 contract 不支持的 card 明确为 blocker 而非暗中扩展。
6. **M8/DSL/promotion：通过。** 无 GlobalSound/GlobalVisual/approval/release、自动导演/布局/
   通用 DSL、新 shared capability。
7. **主观审核边界：通过。** owning Scene 子 Agent 先自审，主 Agent 批量执行
   SceneVisual/Sound/continuity/fidelity review；mechanical tools 只绑定 current
   fingerprints/media，不自动审美。
8. **真实接口/命令/commit/recovery：通过。** 使用当前 `--meaning`、`renderer:generate/check`、
   existing builders/runtime/final writer；两个真实 writer gap 明确红测和最小修复；每 Task 有
   focused command、staging、commit 和 pass-only recovery。
9. **Narrative independence 与 final 转绿因果：通过。** narrative 每 Task 独立通过；final 只有
   五个真实 ready package + coverage/registry/projection/Composition/current report 后才 pass；
   synthetic/fallback 不能满足 M7。
10. **Planning-only 与执行期子 Agent 边界：通过。** 本轮计划编写/修订没有启动子 Agent，只
    修改本计划文档；获批后的 Task 2 明确使用五个独立 Scene 子 Agent。当前没有创建 Scene、
    asset、script/test/runtime/generated artifact，没有 commit、push 或 branch 操作。

## 13. Planning-only stop condition

本计划经 Prettier、Markdown links、`git diff --check`、路径/Task/范围自审后，本轮必须停止。
只有用户后续明确批准，才从 Task 1 开始执行；Task 1、Task 2 的共享准备/收集以及 Task 3–5
由主 Agent inline 主导，Task 2 中段按五个 meaningId 并行启动五个独立 Scene 子 Agent。完成
M7 后停止，不自动开始 M8，不 push。
