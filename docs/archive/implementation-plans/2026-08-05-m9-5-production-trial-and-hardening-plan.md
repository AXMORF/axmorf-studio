# M9.5 首次真实生产试跑与流程优化实施计划

> **归档说明：** 历史实施快照；其中命令、路径和状态不再代表当前仓库事实。

> **状态：** 2026-08-05 已按 Task 1–Task 12 inline 执行完成。受控 Run A 正确 expected-fail；
> 其后四个编排缺陷均按 Red → 最小修复 → Green → immutable replacement 收口，最终 Run E
> 达到 `preview-ready / awaiting-user-preview`。未创建 approval、未开始 M10、未 push。
>
> **里程碑位置：** M9.5 实现完成后的首次真实生产验收与 hardening；不改变 M9.5 的
> `preview-ready / awaiting-user-preview` 终点，也不开始 M10。
>
> **生产模式：** code-first programmable video。继续使用仓库现有 Remotion、React/TypeScript、
> 宿主机 Node/npm、FFmpeg/ffprobe 和本地 VoxCPM adapter。

## 1. 结论与试跑定义

本计划使用一个全新的两 Beat 真实 Story `rounded-airplane-windows`，先完成一次受控的
expected-failure Run A，再以 immutable replacement Run B 从 current authored inputs 重跑并
推进到：

```text
preview-ready / awaiting-user-preview
```

Run A 用真实合同、真实 Narrative Baseline 和真实 Scene handoff 验证 partial/out-of-order
Scene result、显式 `production:scene:fail`、watcher fail-fast 和 replacement 决策；Run B 使用
真实本地 VoxCPM 产物、真实 Scene renderer、真实 Remotion/FFmpeg 媒体链和中央 watcher 完成
机械 Preview。timeout、malformed、stale、shared drift 和意外错误继续用 fake clock/scheduler、
临时 fixture 和必要的新 Red 测试安全验证，不污染正式试跑合同。

主 Agent 是两次 run 的唯一 lifecycle owner。分发 Scene 后，主 Agent 保持当前 Codex 任务
运行，持续等待 watcher 和 Scene 结果；repo scripts 不创建 Agent，不托管 detached lifecycle，
也不承诺当前任务结束后的 Scene Agent 存活。

本计划的成功不表示：

- reviewed、quality-pass 或审美通过；
- FinalPreviewApproval；
- M10 complete、released、uploaded 或 published；
- NarrativeCheck 或 Scene Agent 审美 gate 已实现；
- 新 capability 已 promotion。

## 2. 开始前 repo truth

### 2.1 当前 Git 与实现基线

计划编写时核对到：

```text
branch: codex/foundation
HEAD:   f24fb6ea98bade75791c316341d4e55cff4e170f
status: ?? public/voice_profile/
```

`public/voice_profile/` 是用户现有未跟踪目录。本计划及后续执行都不得读取其内容、修改、
移动、删除、stage 或提交该目录。允许按用户要求通过 `git status --short` 确认它仍保持同一
未跟踪保护状态，但不得对其递归列目录、计算 checksum 或把它放进任何 glob。

### 2.2 M9.5 十个本地提交

当前 M9.5 实现由以下十个连续本地提交组成：

1. `1acc9a5 feat(production): add frozen production requirements contract`
2. `8a2ff5d feat(production): add fail-closed run state ledger`
3. `78f8cb8 feat(production): start contract-bound production runs`
4. `21fb6f7 feat(production): orchestrate narrative baseline deterministically`
5. `161d82c feat(production): freeze story resource pool and scene assignments`
6. `fca4c61 feat(production): accept isolated scene result contracts`
7. `cda7e04 feat(production): monitor scene contracts with a central watcher`
8. `b209fb4 feat(production): assemble mechanically ready scene previews`
9. `933c412 test(production): prove contract-driven orchestration end to end`
10. `f24fb6e docs(production): close m9.5 orchestration milestone`

执行前必须重新确认 branch、HEAD、status 和这十个提交仍为 current。若用户或其他工作已使
基线变化，先重读受影响代码、测试与 authority docs，再更新本计划执行记录；不得把本节快照
当成永远有效的事实。

### 2.3 当前可执行面

固定 package scripts 已存在：

```bash
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
npm run production:scene:freeze -- --run <runId>
npm run production:scene:submit -- --run <runId> --scene <meaningId>
npm run production:scene:fail -- --run <runId> --scene <meaningId> --code <CODE> --description "<safe description>"
npm run production:watch -- --run <runId>
npm run production:preview:check -- --run <runId>
```

当前 production contracts 位于：

```text
src/contracts/production-requirements.ts
src/contracts/production-run.ts
src/contracts/production-scene-result.ts
src/contracts/production-preview.ts
```

当前制作编排实现位于 `scripts/production/`，覆盖 requirements/current input loader、Narrative
runner、append-only events、derived state、single-writer lock、Scene freeze/submit/fail、watcher、
Preview scaffold、coverage/registry/projection、真实媒体 inspection 和 mechanical evidence。

当前 `tests/production/` 共 17 个 test files；2026-08-05 计划编写轮次实际执行：

```bash
node --import tsx --test tests/production/*.test.ts
```

结果为 17/17 files pass、0 fail。当前测试的真实边界是：Narrative e2e 使用 fake provider，
post-scene 使用 fake dependencies，媒体 inspection 使用 fake process runner，watcher 使用 fake
clock/scheduler，所有项目输入位于临时 fixture。它们没有运行一个 tracked 新项目上的默认
VoxCPM、真实 Remotion render、真实 ffmpeg/ffprobe、真实 contact sheet、真实 Scene Agent 或
真实长轮询。因此 M9.5 已有“合同和 fake orchestration proof”，但还没有“首次真实新作品
production trial”的 repo fact。

### 2.4 当前实现的恢复边界

`ProductionRunState` 由 events、Scene results 和 current fingerprints 复算，不是可编辑状态。
当前 state/command 恢复面必须按下表执行：

| current state | 允许的动作 | 原 run 是否可继续 |
| --- | --- | --- |
| `initialized` | `production:narrative` | 是，前提是 requirements current |
| `baseline-ready` | narrative check-only no-op；`production:scene:freeze` | 是 |
| `scene-inputs-frozen` | submit/fail；启动 `production:watch` | 是 |
| `scenes-running` | submit/fail；重新进入 watcher，前提是 lock 已正常释放 | 是 |
| `post-scene-running` | `production:preview:check` 继续固定 post-scene | 是 |
| `preview-ready` | `production:preview:check` check-only no-op | 是，只读验证 |
| `failed` | 不删 event/result、不改 state；创建 replacement run | 否 |

若进程中断后留下无法由公开 CLI 安全恢复的 active state 或 lock，先分类为 orchestration defect，
保存现场并写 Red；不得手删 lock、event 或 `state.generated.json` 来伪造恢复。

## 3. 试跑项目冻结边界

### 3.1 Story 和输出

新项目固定为：

```yaml
storyId: rounded-airplane-windows
compositionId: RoundedAirplaneWindows
locale: zh-CN
render:
  width: 1080
  height: 1920
  fps: 30
  format: h264 + aac mp4
  leadInFrames: 12
  tailFrames: 18
beats:
  - meaningId: square-corner-stress
    purpose: 解释高空增压循环与方形尖角的应力集中
    ttsChunks: 2 个 authored 朗读单元
  - meaningId: rounded-load-path
    purpose: 解释圆角如何分散载荷并降低疲劳裂纹风险
    ttsChunks: 2 个 authored 朗读单元
```

四个 `ttsChunks` 在 Task 2 作为创作单元明确写入；工具不得按标点重切。两个 Beat 之间若需要
额外叙事停顿，必须在 Story 中显式声明；最终帧数只服从 sealed PCM 的实测累计 sample-frame
边界，不在计划中猜测秒数。

### 3.2 视觉与资产最小包

```yaml
visualStyle:
  styleProfileId: editorial-tech
  direction: 深蓝工程图底、米白结构线、橙红应力流、克制的大字和剖面示意
resourcePolicy:
  allowedResourceIds: []
  allowedSnapshots: []
  selfAuthoredVisualsAllowed: true
sceneLocalSound: none
globalSound: none
globalVisual: none
```

两个 Scene 都只使用 project-local React/Remotion frame API、CSS 静态样式和必要的已批准共享
primitive；不下载图片、字体、音频或代码，不使用远程 URL，不选择 Shotcraft recipe，不创建
新的 public Scene 资产。`StoryResourcePool` 仍必须存在且 fingerprint current；空 allowlist 是
本次明确选择，不是漏做资源冻结。

Scene 制作不得搜索、打开、比较、模仿或复制 `gps-relativity`、
`product-comic-vertical` 的 Scene、Composition、still、contact sheet 或历史布局。两套正式
作品只允许在保护基线和只读 checker 中被读取。

### 3.3 QA 与交接

本试跑的机械 QA 包含：

- current contracts、StoryCheck、sealed narration、SemanticTiming 和 narrative AutoCheck；
- all-ready SceneCoverage、RendererRegistry、visual projection 和 optional-none Scene sound；
- 1080×1920、30 fps、exact frame count、1 H.264 video stream、1 AAC audio stream；
- MP4 完整解码到 EOF；
- frame 0、中间帧、最后一帧三个 representative still 和 3×1 contact sheet；
- Preview/Still/Contact sheet checksum；
- GlobalSoundPlan、BGM、cross-scene ambience、ducking、GlobalVisualLayers 显式 absent；
- `production:preview:check` 重复执行 bytes/mtime/fingerprint current。

唯一下一 handoff 是用户观看完整 Preview。计划执行不会创建
`final-preview-approval.generated.json` 或任何等价 approval artifact。

## 4. 主 Agent lifecycle 与持续监控协议

### 4.1 唯一 lifecycle owner

主 Agent 负责：

1. 记录保护基线并维护 exact staging；
2. 冻结 authored inputs 和 requirements；
3. 启动每个固定 production command，并持续读取 stdout/stderr；
4. 读取 append-only events、derived state、Scene result contracts、deadline 和 current
   fingerprints；
5. 使用当前 Codex 原生 Agent 能力分发两个 Scene；
6. 启动并保持 `production:watch` 的 yielded terminal session；
7. 在 watcher 和 Scene Agent 活跃期间保持当前任务运行；
8. 对真实问题执行分类、TDD 修复、commit、resume/replacement 决策；
9. 一直工作到 replacement Run B 稳定到达 `preview-ready` 或遇到真实外部 blocker。

主 Agent 不把“Scene Agent 仍在思考”当作生产状态。可复算的生产状态只来自命令输出、
events、result contracts、state projection 和 fingerprints。

### 4.2 Scene Agent 所有权

每个 Scene Agent 只收到：

- 当前 replacement assignment 的绝对路径；
- assignment 声明的 `sceneRoot` 和 `publicAssetRoot`；
- current requirements/Story/Beat/timing/style/resource pool 只读路径与 fingerprints；
- exact submit/fail 命令；
- deadline；
- 禁止修改的共享路径。

固定所有权：

```text
square-corner-stress Agent
  owns src/projects/rounded-airplane-windows/scenes/square-corner-stress/
  owns public/projects/rounded-airplane-windows/scenes/square-corner-stress/（预计不用）

rounded-load-path Agent
  owns src/projects/rounded-airplane-windows/scenes/rounded-load-path/
  owns public/projects/rounded-airplane-windows/scenes/rounded-load-path/（预计不用）
```

Scene Agent 不得修改 Story、旁白、字幕、timing、VisualStyleSpec、Catalog、production shared
inputs、events、state、coverage、RendererRegistry、Composition 或其他 Scene。成功只能执行
`production:scene:submit`；阻塞只能执行 `production:scene:fail`。中央 scripts 是 event/state 的
唯一 writer。

### 4.3 轮询与进度更新

- watcher 使用 run manifest 中的 poll interval 和 assignment deadline；主 Agent 不另造隐藏
  timeout；
- 主 Agent 每次收到 terminal chunk、Scene message、event sequence 或 state 变化时立即更新；
- 长时间没有状态变化时，最多每 45–60 秒向用户说明当前 state、已完成 meaningId、剩余
  meaningId、deadline 和下一轮检查；
- `exec`/terminal 长任务使用 yielded session 和不超过 60 秒的 wait/poll，不做长时间阻塞
  sleep；
- 不承诺当前 Codex 任务结束后的 detached Scene Agent lifecycle。

## 5. 失败现场、分类和恢复协议

### 5.1 失败现场

每个真实失败至少保存以下脱敏信息：

```text
out/rounded-airplane-windows/production/<runId>/diagnostics/
  <sequence>-<stage>-failure-summary.json
```

summary 只包含：UTC 时间、exact command、exit status、runId、stage、event sequence、derived
state、ProductionError safe fields、相关 artifact IDs/fingerprints、Scene meaningId、deadline、
修复/恢复决定和复验命令。`.producer-runs/<runId>/` 原始 strict events/results/state 保留现场，
不删除、不重写。

不得持久化 raw stack、环境变量、token、provider endpoint、私有配置内容、绝对私有路径、
Agent transcript 或 `public/voice_profile/` 内容。若 CLI stderr 仍含敏感信息，先视为 redaction
defect；只保存人工脱敏摘要，不把 raw stderr 写入 tracked 或 ignored report。

### 5.2 三类问题

| 分类 | 判据 | 处理 |
| --- | --- | --- |
| 项目输入错误 | authored JSON、source binding、style/pool/brief、Scene 文件本身违反现有明确合同 | 修正当前项目输入；若 frozen fingerprint/assignment 已变化，replacement run |
| 预期生产失败 | 本地 provider 不可用、Scene 明确 blocked、deadline 到期等已由稳定 error code 表达 | 保存现场；按当前 state 和 immutable result 判断 resume 或 replacement；不修改编排代码 |
| M9.5 编排缺陷 | CLI/contract/state/watcher/post-scene 与已承诺语义不符，错误不精确、恢复不安全、真实 process seam 失败或测试漏掉真实参数行为 | 先 Red，再最小 fix、Green、commit；继续同一试跑 |

“看起来可以绕过”不是 input fix。任何需要手改 `state.generated.json`、event、accepted result、
coverage、registry 或 Composition 来跳过中央脚本的情况，都先按 orchestration defect 处理。

### 5.3 原 run resume 与 replacement 判断

只有同时满足以下条件才允许 resume 原 run：

- 没有 terminal `stage-failed` event，state 不是 `failed`；
- run manifest、requirements、assignments、已接受 Scene results 和相关 fingerprints current；
- single-writer lock 已由 owner 正常释放；
- 文档化 CLI 接受当前 state；
- 重试不会覆盖 immutable event/result 或改变已经冻结的 identity。

以下任一条件强制 replacement run：

- state 已是 `failed`；
- Scene failure result 已写入或 accepted result 与新 assignment 冲突；
- Story、NarrationSpec、RenderSpec、requirements、SemanticTiming、VisualStyle、Catalog、pool、
  brief 或 assignment fingerprint 变化；
- 修复改变 stage output 算法、generated bytes 或 current identity；
- 无法证明原 run 的 lock/event/state 可由公开 CLI 安全恢复。

纯文档、仅改善 stderr 文案且不改变合同/identity 的修复，可以在 active run 上继续；代码修复
后仍要重新读取 state、events、fingerprints 并执行当前 state 的 check-only command。failed run
绝不复活，replacement run 必须使用新的 runId；旧 run 保留作诊断证据。

## 6. 真实 defect 的强制 TDD 循环

以下循环是 Task 3–Task 9 的中断处理协议；每发现一个 orchestration defect 都完整执行一次：

1. 冻结失败现场和脱敏摘要；
2. 在最窄的 `tests/production/<area>.test.ts` 或现有相邻测试中加入一个失败测试；
3. 单独运行该测试，确认 Red 原因是刚发现的真实问题，而不是 fixture/拼写/环境错误；
4. 只修改最小 contract/runner/adapter/CLI/doc surface；
5. 运行 focused Green、`node --import tsx --test tests/production/*.test.ts`、
   `npm run typecheck`、`npm run lint`；
6. `git diff --check`，并确认 diff 不包含两套正式作品或 `public/voice_profile/`；
7. 使用 `git add -- <逐个精确文件>`，不得使用 `git add .`、glob 或目录级模糊 staging；
8. 创建 `fix(production): <准确根因>` 本地 commit；测试先行但与最小 fix 同 commit；
9. 按第 5.3 节决定 resume 或 replacement；
10. 继续 watcher/试跑，不能因一次 fix 通过就提前收工；
11. 在最终 report 记录 symptom、classification、Red、root cause、changed files、commit、
    recovery choice 和验证结果。

未知问题不能预写虚假文件名。实际进入 TDD 前，主 Agent必须先用 CodeGraph/当前 call path
确定 exact production source 和 test file，再把 exact staging list 写入该问题的诊断记录。允许的
最小落点映射为：

| 问题面 | 首选 production file | 首选 Red test |
| --- | --- | --- |
| requirements/preflight | `src/contracts/production-requirements.ts`、`scripts/production/start.ts` | `production-requirements.test.ts`、`start.test.ts` |
| narrative/provider/process | `scripts/production/narrative.ts`、`adapters/process-runner.ts` | `narrative-runner.test.ts` |
| events/state/lock | `production-run.ts`、`run-store.ts`、`projection.ts` | `run-state.test.ts`、`run-store.test.ts` |
| Scene freeze/handoff | `production-scene-result.ts`、`scene-freeze.ts` | `scene-freeze.test.ts`、`story-resource-pool.test.ts` |
| submit/fail | `scene-submit.ts`、`scene-fail.ts` | `scene-submit.test.ts`、`scene-fail.test.ts` |
| watcher/deadline | `watch.ts` | `watch.test.ts`、`orchestration-e2e.test.ts` |
| Preview/scaffold/media | `post-scene.ts`、`post-scene-default.ts`、`project-scaffold.ts`、`preview-evidence.ts` | `post-scene.test.ts`、`project-scaffold.test.ts`、`preview-evidence.test.ts` |
| CLI/UX | `cli.ts`、`docs/PRODUCTION_ORCHESTRATION.md` | `cli.test.ts` |

## 7. 实施 Tasks

### Task 1：Repo truth、保护基线与真实 preflight

**目标：** 在任何新文件、run 或 provider 调用前，记录可复验基线并区分环境 blocker 与代码
问题。

**读取/输出：**

- 只读：本计划第 2 节列出的 authority docs、package scripts、production contracts/scripts/tests；
- ignored：`out/m9-5-production-trial/protection-baseline.json`；
- 不读取：`public/voice_profile/` 内容。

**Red / 正确失败原因：** 本 Task 不改实现，不人为制造单元测试 Red。preflight 任一缺失必须在
`production:start` 前失败：错误 branch/HEAD、已有同名项目、production tests 非 current、Node
依赖缺失、Remotion/FFmpeg/ffprobe 不可执行、默认 private config 缺失或不可读、selected voice
profile 不存在、private config 指向非本地 provider，或 profile source 指向受保护
`public/voice_profile/`。本地 VoxCPM 是否真正接受生成请求留到 Task 3 验证；Task 1 不为
“健康检查”提前发送 TTS 请求。

**最小 Green：**

1. 记录 `git branch --show-current`、`git rev-parse HEAD`、`git status --short` 和十个提交；
2. 运行 production tests、`npm run catalog:check`、`npm run registry:check`；
3. 验证 host Node/npm、Remotion、FFmpeg、ffprobe 可执行；
4. 默认读取 Git-ignored `voxcpm/voxcpm.private.json`；若设置
   `RSP_VOXCPM_PRIVATE_CONFIG`，则将其作为绝对路径覆盖。只验证最终解析路径可读且未进入
   staging，不输出路径或私有值；
5. 使用 private-config schema 在进程内确认 provider URL 只指向 loopback/local service，并确认
   候选 voice profile ID/mode；输出仅限 safe profile ID、
   mode 和 checksum identities；不输出 endpoint、token 或 source path；
6. 若 profile 的音频/文本路径落在 `public/voice_profile/`，在读取该文件前停止并报告真实
   blocker；
7. 不发送 provider 请求，不做互联网访问；真正的本地 VoxCPM 可用性和生成留到 Task 3；
8. 对下列十个正式 artifact 计算 before checksum：

```text
src/projects/gps-relativity/generated/final-assembly.generated.json
src/projects/gps-relativity/generated/final-mechanical-check.generated.json
src/projects/gps-relativity/generated/final-preview-approval.generated.json
src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json
out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4
src/projects/product-comic-vertical/generated/final-assembly.generated.json
src/projects/product-comic-vertical/generated/final-mechanical-check.generated.json
src/projects/product-comic-vertical/generated/final-preview-approval.generated.json
src/projects/product-comic-vertical/generated/final-preview-evidence.generated.json
out/m9-product-comic-vertical/product-comic-vertical-final-preview.mp4
```

**聚焦验证：**

```bash
node --import tsx --test tests/production/*.test.ts
npm run catalog:check
npm run registry:check
git status --short
```

**精确 staging / commit：** 无 tracked 变更，不创建空 commit。

**rollback/resume：** 任一环境 preflight 失败时不创建 project/run；报告 blocker 后停止。代码
测试失败先按 defect TDD 修复，不能进入 Task 2。

**主 Agent 监控点：** 确认 provider 尚未被调用、`.producer-runs/` 没有新 run、同名 project
不存在、保护 checksum 已写入 ignored baseline。

### Task 2：创作并冻结 Trial project authored inputs

**目标：** 创建 2 Beat/4 chunk 的新 Story、StoryCheck、RenderSpec 和完整 requirements，在
任何真实 TTS 前使它们成为 current tracked inputs。

**修改文件：**

```text
src/projects/rounded-airplane-windows/brief.json
src/projects/rounded-airplane-windows/story.json
src/projects/rounded-airplane-windows/narration.json
src/projects/rounded-airplane-windows/render.json
src/projects/rounded-airplane-windows/reviews/story-check.json
src/projects/rounded-airplane-windows/production/requirements.json
```

**Red / 正确失败原因：**

- 在临时 fixture 中先验证缺少 requirements、错误 source checksum、错误 voice summary、错误
  1080×1920 summary 或未显式声明 global enhancement absent 会被 current schemas/start 拒绝；
- 若现有测试已经精确覆盖，不增加重复测试；只有 trial 暴露合同缺口才新增 Red；
- 对真实项目，`production:start` 前只做 strict parse/current resolver，不通过即为输入错误，
  不调用 provider。

**最小 Green：**

- 主 Agent 创作两个 StoryBeat 和四个 authored `ttsChunks`，完成非用户阻塞的 StoryCheck；
- `NarrationSpec.voiceProfileId` 只使用 Task 1 已安全确认的 profile；不在 repo 写 endpoint/token；
- `RenderSpec` 固定 1080×1920/30 fps/zh-CN、caption safe area、12 lead-in、18 tail；
- requirements 绑定五个 source artifact checksums/fingerprints，并生成自身 requirements
  fingerprint；显式 `storyVisual: required`、
  `sceneLocalSound: none`、`globalSound: none`、`globalVisual: none`；
- additional requirements 明确工程图风格、不得使用旧作品/远程资产、最终只需机械 Preview、
  user preview 负责语义和审美；
- requirements builder 生成 canonical fingerprint；不手算、不复制旧项目 fingerprint。

**聚焦验证：**

```bash
node --import tsx --test tests/production/production-requirements.test.ts tests/production/start.test.ts
npm run typecheck
git diff --check
```

另以 current schemas/resolver 只读解析六个真实文件，确认没有 provider call、没有 scaffold、
没有 `.producer-runs/`。

**精确 staging：** 只 stage 上述六个路径；执行前用 `git diff --cached --name-only` 确认清单
完全相等。

**计划 commit：** `feat(trial): freeze rounded airplane windows production inputs`

**rollback/resume：** commit 前可直接修正 authored inputs；commit 后任何 Story/Narration/
Render/StoryCheck/requirements identity 变化都必须重新 commit，并使后续 run 使用新 identity。

**主 Agent 监控点：** 记录五个 source bindings、requirements fingerprint、选择的 safe voice
profile identity 和 provider-call count=0；再次确认 `public/voice_profile/` 没有进入
diff/staging。

### Task 3：Run A start 与真实 Narrative trial

**目标：** 第一次通过默认 `production:start`/`production:narrative` 调用本地 VoxCPM，产生
真实 sealed narration、SemanticTiming、Narrative Baseline、registry、完整 Baseline MP4 和
passing AutoCheck。

**预期修改/生成：**

```text
src/projects/rounded-airplane-windows/Composition.tsx
src/projects/rounded-airplane-windows/generated/sealed-narration.generated.json
src/projects/rounded-airplane-windows/generated/semantic-timing.generated.json
src/projects/rounded-airplane-windows/generated/narrative-baseline-evidence.generated.json
src/projects/rounded-airplane-windows/generated/narrative-auto-check.generated.json
src/projects/project-registry.generated.ts
public/projects/rounded-airplane-windows/narration/<sealed-id>/chunks/<four exact chunk files>.wav
public/projects/rounded-airplane-windows/narration/<sealed-id>/complete.wav
out/rounded-airplane-windows/m3-*.png|mp4            ignored
.producer-runs/<runA>/                               ignored
```

`<sealed-id>` 和 chunk paths 必须从 current sealed manifest 解析后形成 exact staging 清单，不
使用 glob。

**Red / 正确失败原因：** 真实媒体生成不强行新增单元测试。若默认 runner 在 provider、seal、
registry、Remotion、evidence 或 AutoCheck seam 失败，先保存现场；只有确定为 orchestration
defect才按第 6 节新增最窄 Red。provider/config 不可用属于真实 blocker/expected failure，不
伪造音频绕过。

**最小 Green：**

```bash
npm run production:start -- --project rounded-airplane-windows
npm run production:status -- --run <runA>
npm run production:narrative -- --run <runA>
npm run production:status -- --run <runA>
npm run production:narrative -- --run <runA>
```

第一次 narrative 必须监控固定各 stage；第二次必须是 current check-only `noOp: true`。验证
candidate resume、seal/check identities、真实 audio checksum、累计 sample-frame timing、
Composition listing、Baseline media 和 AutoCheck；失败不得产生假的 `baseline-ready`。

**聚焦验证：**

```bash
npm run narration:check -- --project rounded-airplane-windows
npm run baseline:evidence -- --project rounded-airplane-windows
npm run project:check -- --project rounded-airplane-windows --level narrative
npm run registry:check
npm run compositions
```

记录第二次 narrative 前后所有 persisted narrative JSON、sealed WAV、baseline media 的 checksum
和 mtime；合同/封存产物应 current，若媒体 writer 有预期的 overwrite 行为必须在报告区分，
不得笼统声称所有 Remotion bytes 可重复。

**精确 staging：** stage 本节列出的 tracked JSON/TS 和从 manifest 解析出的五个 exact WAV
路径；不 stage `out/`、`.producer-runs/` 或任何 voice profile。

**计划 commit：** `feat(trial): seal rounded airplane windows narrative baseline`

**rollback/resume：** active `initialized` 可继续 narrative；`baseline-ready` 只读 no-op。若 run
写入 failed event，Run A 保留，修复后启动 replacement；不得删 failed event。若 TTS 已生成但
未 seal，replacement run 只可按同 generation input 的既有 candidate resume 规则复用。

**主 Agent 监控点：** stdout/stderr、event sequence、state、candidate progress、provider
attempt fingerprint、sealed fingerprint、timing fingerprint、AutoCheck fingerprint 和第二次
no-op 的 bytes/mtime。

### Task 4：Scene 第二次冻结与 Run A 分发准备

**目标：** 在 current Baseline 上冻结 `VisualStyleSpec`、空 `StoryResourcePool`、两 Scene
生产简报并生成一 meaningId 一 assignment。

**修改文件：**

```text
src/projects/rounded-airplane-windows/visual-style.json
src/projects/rounded-airplane-windows/production/story-resource-pool.json
src/projects/rounded-airplane-windows/production/scene-production-brief.json
src/projects/rounded-airplane-windows/production/scene-assignments/square-corner-stress.generated.json
src/projects/rounded-airplane-windows/production/scene-assignments/rounded-load-path.generated.json
```

**Red / 正确失败原因：** 用现有 focused tests确认 stale requirements/timing/style/pool/brief、
pool 外资源、assignment 重叠和错误 Beat 顺序仍 fail closed；真实 `scene:freeze` 若拒绝 current
输入，先分类为输入错误或 orchestration defect。

**最小 Green：**

- style 使用 current shared Catalog 的 `editorial-tech` descriptor 和 catalog fingerprint；
- pool 的 resources/snapshots 均为空、self-authored visual 为 true；
- brief 为两个 Beat 定义明确主体、主要动作、含义、构图、运动、连续性和 `sceneLocalSound:
  none`；
- 运行 `production:scene:freeze` 两次，第二次 byte/mtime stable no-op；
- 确认一个 meaningId、一个独占 `sceneRoot`、一个 assignment、同一 frozen deadline。

**聚焦验证：**

```bash
node --import tsx --test tests/production/story-resource-pool.test.ts tests/production/scene-freeze.test.ts
npm run production:scene:freeze -- --run <runA>
npm run production:status -- --run <runA>
npm run production:scene:freeze -- --run <runA>
```

**精确 staging：** 本 Task 先只 stage `visual-style.json`、`story-resource-pool.json`、
`scene-production-brief.json` 三个 authored shared inputs；Run A assignments 带 run identity，先
保留 unstaged 供 controlled failure，最终只提交 replacement Run B current assignments。

**计划 commit：** `feat(trial): freeze rounded airplane windows scene brief`

**rollback/resume：** freeze 前可修正 shared inputs；freeze 后修改任一 fingerprint 会使 Run A
失败并要求 replacement。不得为延长 deadline 手改 assignment。

**主 Agent 监控点：** state `scene-inputs-frozen`、两个 assignment fingerprints、deadline、
allowed dirs、empty pool、additional requirements 投影完整性。

### Task 5：受控非 happy-path Run A

**目标：** 在真实新项目上验证 out-of-order/partial result、明确 Scene failure、watcher
fail-fast 和 immutable replacement 边界，不生成 Preview。

**修改文件：**

- `rounded-load-path` Scene Agent 只修改自己的 Scene 目录；
- `square-corner-stress` 本 Run 不制作，使用固定 fail CLI 返回
  `TRIAL_EXPECTED_BLOCKER`；
- ignored Run A result/events/state/diagnostic；
- 不修改 central coverage/registry/Composition。

**Red / 正确失败原因：** 这是一次受控 expected production failure，不新增“让失败通过”的
单元测试。若 watcher 没有接受先到的 `rounded-load-path` success、没有因第二个 explicit fail
立即非零退出、错误写成 unexpected、或继续进入 post-scene，则是 orchestration defect，必须
补 `watch.test.ts`/`orchestration-e2e.test.ts` Red。

**最小 Green：**

1. 分发 `rounded-load-path` Agent；主 Agent立即以 yielded terminal 启动
   `production:watch -- --run <runA>`；
2. Scene Agent 完成 project-local Scene，并通过 `production:scene:submit`；
3. watcher 接受第二个 StoryBeat 的 out-of-order success，state 保持 `scenes-running`；
4. 主 Agent 对 `square-corner-stress` 执行固定 `production:scene:fail`，description 只包含安全
   诊断；
5. watcher 立即写 failed event、非零退出，不生成 coverage、registry、PreviewAssembly、MP4、
   PreviewEvidence 或 preview-ready；
6. 重跑 status，证明 Run A terminal failed；保留全部 events/results。

**聚焦验证：**

```bash
npm run production:status -- --run <runA>
node --import tsx --test tests/production/scene-submit.test.ts tests/production/scene-fail.test.ts tests/production/watch.test.ts tests/production/orchestration-e2e.test.ts
```

并验证 Run A 项目下不存在 production preview assembly/evidence/check，`out/.../<runA>/preview.mp4`
不存在。

**精确 staging：** main Agent 审查并只 stage `rounded-load-path` Scene Agent 交付的 exact 文件
清单；不得 stage Run A assignments、ignored run 或 diagnostics。若 Scene Agent创建了计划外
文件，先审查并移出 staging，不顺手提交。

**计划 commit：** `feat(trial): author rounded airplane load path scene`

**rollback/resume：** Run A 已 failed，禁止 resume。输入未变时，`rounded-load-path` Scene
源码/package 可以在 replacement assignment 下重新校验并提交新 result，但 Run A result 本身
不可复用或复制。

**主 Agent 监控点：** watcher terminal 始终在线；记录 result 到达顺序、accepted meaningId、
fail result fingerprint、failed event sequence、error kind/code、从 fail 到 watcher exit 的耗时。

### Task 6：Replacement Run B 与 current identity 重验

**目标：** 使用完全相同的 authored requirements 创建新 run，证明 failed Run A 不被复活，
current narrative artifacts 可以按既有 resume/check 语义安全复用，并生成新的 immutable
assignments。

**预期修改：** 两个 `scene-assignments/*.generated.json` 更新为 Run B identity/deadline；若
Narrative runner 合法刷新了 current evidence，按实际 checksum 精确记录，不预设 bytes 必须
变化或不变。

**Red / 正确失败原因：** 若 start 复用 Run A runId、覆盖 Run A、narrative 重生成并静默覆盖
sealed narration、replacement assignment 仍绑定 Run A，或相同 current generation input
无法按已承诺 resume 语义运行，则先写最窄 Red。

**最小 Green：**

```bash
npm run production:start -- --project rounded-airplane-windows
npm run production:narrative -- --run <runB>
npm run production:scene:freeze -- --run <runB>
npm run production:status -- --run <runB>
```

要求 Run B runId/fingerprint 与 Run A 不同；requirements、Story、sealed narration、timing 和
style/pool/brief 保持 current；Run A files unchanged；Run B assignments 只改变 run-bound 字段和
由此推导的 assignment identity。若 default narrative runner发起 provider dependency resolution，
记录是否真的发送 chunk request；已有完整 current candidates 时不得无说明覆盖 sealed
artifacts。

**聚焦验证：**

```bash
npm run narration:check -- --project rounded-airplane-windows
npm run project:check -- --project rounded-airplane-windows --level narrative
npm run production:scene:freeze -- --run <runB>
```

第二次 freeze 必须 no-op；比较 Run A/Run B manifest、events、assignments 和所有 narrative
checksum/mtime。

**精确 staging：** stage 两个 Run B current assignment 文件；若 narrative tracked artifact
bytes 合法变化，逐个列出并先说明原因，不能用目录 staging。

**计划 commit：** `chore(trial): bind replacement scene assignments`

**rollback/resume：** Run B 仍 active 且 identities current 时继续；任何 source/frozen input
变化再创建 Run C，不修改 Run B assignment。若只是 Run B assignment generation defect，按
TDD fix 后依据 event/state 决定新 run。

**主 Agent 监控点：** 新旧 run 完全隔离、Run A mtime 不变、provider request count、current
narrative fingerprints、Run B deadline。

### Task 7：Run B Scene 分发与中央 watcher 实时监控

**目标：** 两个独占 Scene Agent 在 current assignment 下完成 Scene，主 Agent 从分发到
all-success 全程保持任务和 watcher 活跃。

**修改文件：**

每个 Scene 允许的标准交付：

```text
src/projects/rounded-airplane-windows/scenes/<meaningId>/task-input.generated.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/visual-plan.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/shot-plan.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/sync-anchors.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/sound-plan.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/selected-resources.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/shot-recipe-selection.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/Renderer.tsx
src/projects/rounded-airplane-windows/scenes/<meaningId>/shots/<only if actually needed>
src/projects/rounded-airplane-windows/scenes/<meaningId>/generated/reference-fidelity.generated.json
src/projects/rounded-airplane-windows/scenes/<meaningId>/generated/scene-package.generated.json
```

empty recipe 必须是合法 `not-applicable` receipt；`sound-plan` 和 selected resources 必须明确
没有 Scene-local sound/resource，而不是漏文件。

**Red / 正确失败原因：** Scene 真实创作不强行写单元测试。submit 因 Agent 交付违反当前
合同而失败属于项目输入错误；focused compile、source graph、zero-resource、empty recipe 或
合法 ScenePackage 被编排误拒绝才是 orchestration defect并补 Red。

**最小 Green：**

1. 主 Agent 以 Run B assignments 分发两个 Scene；
2. 立即启动 yielded `production:watch -- --run <runB>`，不等 Scene 先完成；
3. `rounded-load-path` Agent 重新打开 Run B assignment，对 Task 5 已有 Scene 做 current
   revalidation 并提交新 Run B result；
4. `square-corner-stress` Agent 完成独占 Scene 并 submit；
5. main Agent持续读取 watcher stdout/stderr、events、state、result files、deadline 和 current
   fingerprints；
6. 监控 partial/out-of-order arrival；缺失结果在 deadline 前只是 waiting，不手写 result；
7. all-success 后 watcher 只触发一次 post-scene。

同时安全执行临时 fixture failure canary：使用 fake scheduler 分别复验 timeout、malformed、
stale、unknown result、shared drift 和 two-watcher lock；不修改 Run B result 目录，不为演示失败
手写真实 result/state。

**聚焦验证：**

```bash
node --import tsx --test tests/production/scene-submit.test.ts tests/production/watch.test.ts tests/production/orchestration-e2e.test.ts
npm run production:status -- --run <runB>
```

对每个 Scene 单独运行 submit/check 和 focused TypeScript validation；全量 typecheck 由主 Agent
在合并后运行。

**精确 staging：** 主 Agent 根据两个 Scene Agent 的实际交付分别列 exact paths，逐 Scene
stage；不 stage central generated files直到 Task 8。Task 5 已提交且 byte-identical 的
`rounded-load-path` 文件不重复提交；如 Run B assignment导致合法文件变化，单独列明。

**计划 commit：** `feat(trial): complete rounded airplane window scenes`

**rollback/resume：** active `scenes-running` 且 lock 正常释放时可重新启动 watcher；任何 Scene
result failure使 Run B terminal failed并启动 replacement。已 accepted success 只能在 assignment
和 package identity完全相同时保留，不能覆盖。

**主 Agent 监控点：** 每次 poll 的 state/sequence、result arrival order、accepted result
fingerprints、deadline remaining、shared freeze revalidation、watcher/post-scene只触发一次。

### Task 8：真实 Post-scene mechanical Preview

**目标：** 让 fixed scripts 从 all-success 继续生成 coverage/registry/runtime/Composition、真实
MP4、stills、contact sheet、PreviewEvidence 和 mechanical check，并停在 preview-ready。

**预期修改/生成：**

```text
src/projects/rounded-airplane-windows/generated/scene-coverage.generated.json
src/projects/rounded-airplane-windows/renderer-registry.generated.ts
src/projects/rounded-airplane-windows/production-scene-runtime.generated.ts
src/projects/rounded-airplane-windows/Composition.tsx
src/projects/rounded-airplane-windows/generated/production-preview-assembly.generated.json
src/projects/rounded-airplane-windows/generated/production-preview-evidence.generated.json
src/projects/rounded-airplane-windows/generated/production-preview-mechanical-check.generated.json
src/projects/project-registry.generated.ts
out/rounded-airplane-windows/production/<runB>/preview.mp4
out/rounded-airplane-windows/production/<runB>/still-0.png
out/rounded-airplane-windows/production/<runB>/still-<middle>.png
out/rounded-airplane-windows/production/<runB>/still-<last>.png
out/rounded-airplane-windows/production/<runB>/contact-sheet.png
```

**Red / 正确失败原因：** 真实 render/ffmpeg/ffprobe/contact-sheet 不强行写形式化 unit test；
任何默认参数、quoted filter、path、stream、frame count、decode、scaffold 或 write/check seam 的
真实失败先保存现场。若为 orchestration defect，必须以 fake process runner精确复现真实 argv/
stdout/stderr 语义并确认 Red，再最小修复。

**最小 Green：** watcher all-success 自动进入 post-scene；若 state 已合法停在
`post-scene-running`，使用 `production:preview:check` 继续。必须证明：

- coverage 两项均 ready，registry 两入口，projection 顺序与 StoryBeat 一致；
- Composition 只装配 StoryVisualTrack、NarrativeCore，Scene sound selection 为 none；
- MP4 为 exact 1080×1920/30 fps/`durationInFrames`、1 H.264 + 1 AAC；
- ffmpeg `-xerror` 完整 decode 到 EOF；
- 三张 still 和 contact sheet checksums current；
- assembly/evidence/check 显式 absent global sound/BGM/cross-scene ambience/ducking/global visual；
- aggregate 只能是 `mechanically-ready`；
- state/stdout 为 `preview-ready` 和 `awaiting explicit user preview decision`。

**聚焦验证：**

```bash
npm run production:status -- --run <runB>
npm run production:preview:check -- --run <runB>
npm run compositions
npm run registry:check
```

记录第一次 current check 后所有 assembly/evidence/check、MP4/stills/contact sheet 和 state 的
bytes/checksum/mtime，再重复 `production:preview:check`；第二次必须 check-only、fingerprints 和
bytes/mtime stable。Remotion 不重渲染。

**精确 staging：** 只 stage本节前八个 tracked paths；`out/` 和 `.producer-runs/` 保持 ignored。
提交前确认没有 `final-preview-approval`、GlobalSoundPlan 或 GlobalVisualLayers 文件。

**计划 commit：** `feat(trial): assemble m9.5 mechanical production preview`

**rollback/resume：** `post-scene-running` 用 preview check 续跑；`preview-ready` 只读 check。
post-scene/preview failed event要求 replacement run；不得删除已生成文件后手写成功 state。若 fix
只改善 check-only 读法但 run 已 failed，仍新建 replacement。

**主 Agent 监控点：** real process argv/exit、render进度、ffprobe facts、decode、media checksum、
event sequence、Preview fingerprints、第二次 check 的 no-op/mtime。

### Task 9：稳定性复验与第二次 current/idempotent check

**目标：** 在没有新创作或修复的情况下重新执行所有 current mechanical reads，证明最终状态
不是一次性偶然成功。

**修改文件：** 无预期 tracked 修改；只更新 ignored verification snapshot。

**Red / 正确失败原因：** 若 current check 改 bytes/mtime、重新渲染、改变 event sequence、
重新调用 provider 或使 fingerprint 漂移，先以相邻 production test 写 Red；这是 idempotence
defect，不接受“再运行一次就好了”。

**最小 Green：**

```bash
npm run production:status -- --run <runB>
npm run production:preview:check -- --run <runB>
npm run production:preview:check -- --run <runB>
npm run project:check -- --project rounded-airplane-windows --level narrative
npm run registry:check
```

两次 preview check 的返回 identity一致，tracked generated files、MP4、stills、contact sheet、
state 和 accepted Scene result bytes/mtime 全部稳定；events 不追加。

**聚焦验证：**

```bash
node --import tsx --test tests/production/*.test.ts
npm run typecheck
npm run lint
git diff --check
```

**精确 staging / commit：** 无正常变更，不创建空 commit；若发现并修复 defect，按第 6 节创建
独立 `fix(production): ...` commit。

**rollback/resume：** 任何 drift 先停止 closeout；修复后依据 Run B state决定 resume/replacement，
并重新执行 Task 7–Task 9 的受影响部分。

**主 Agent 监控点：** provider call count=0、render call count=0、event count/sequence unchanged、
all bytes/mtime snapshots equal。

### Task 10：全量回归与受保护作品零差异

**目标：** 证明 trial/hardening 没有破坏仓库全局门、GPS/ProductComicVertical 或保护目录。

**修改文件：** 无预期；失败修复按第 6 节独立 commit。

**Red / 正确失败原因：** 全量命令任一失败都是 closeout blocker；先判断是 trial input、预期
新项目 registry变化导致需同步 fixture，还是 orchestration/general regression。不得改正式作品
产物让检查变绿。

**最小 Green / 完整验证：**

```bash
npm run docs:check-links
npm test
npm run typecheck
npm run lint
npm run catalog:check
npm run registry:check
npm run build
npm run compositions
npm run check
git diff --check
git status --short
```

另执行：

- `production:status` 为 Run B `preview-ready`；
- `production:preview:check` pass；
- exact Preview MP4 完整可解码；
- Task 1 十个 GPS/ProductComicVertical artifact after checksums 与 before 完全相等；
- 两套正式作品 approval/evidence/report current；
- `public/voice_profile/` 仍只显示原未跟踪保护状态，未读取内容、未 stage、未提交；
- `git log` 没有 M10/release/promotion commit；
- 无 push。

**精确 staging / commit：** 无正常变更，不创建空 commit。

**rollback/resume：** 任一 gate 失败回到产生该 failure 的最小 Task；完成 fix 后重新跑完整 Task
10，不能用聚焦测试代替全量门。

**主 Agent 监控点：** 长命令每 45–60 秒给进度；`npm run check` 中每个子 gate 的开始/完成、
保护 checksum 和最终 status。

### Task 11：Trial/hardening report 与 authority closeout

**目标：** 把真实 run、失败、修复、恢复、媒体和保护证据写入权威报告，同步操作文档，但不
创建 approval 或开始 M10。

**修改文件：**

```text
docs/evidence/2026-08-05-m9-5-production-trial-and-hardening.md
docs/PRODUCTION_ORCHESTRATION.md
docs/ITERATION_STATUS.md
docs/ROADMAP.md
docs/ARCHITECTURE.md
docs/DETERMINISTIC_EXECUTION.md
README.md
docs/README.md
docs/superpowers/plans/2026-08-05-m9-5-production-trial-and-hardening-plan.md
```

`FINAL_PRODUCT_GOAL.md`、`PRODUCTION_WORKFLOW.md`、`TERMINOLOGY.md`、`REVIEW_MODEL.md` 只有在
真实 trial 暴露并修正这些文档所描述的合同/边界时才同步；不得为制造大 diff 机械改写。

**Red / 正确失败原因：** docs link/check 或 report schema 没有专用新测试时，不为形式新增
单元测试；`docs:check-links` 是 Red/Green gate。若实现新增 CLI/error/recovery semantics，必须
先有对应 production Red test，文档只在 Green 后同步。

**最小 Green：** report 至少记录：

- branch/HEAD、十提交和 Task 1 protection baseline；
- trial Story/Render/voice safe identity，不含私有值；
- Run A/Run B IDs、event timeline、state transitions 和 deadlines；
- Run A partial/out-of-order success + expected fail 的现场与正确分类；
- 每个真实问题的 symptom/root cause/Red/fix commit/recovery/verification；
- narrative/Scene/Preview fingerprints、MP4/stills/contact sheet checksums 和 ffprobe facts；
- idempotence bytes/mtime 结果；
- GPS/ProductComicVertical before/after zero-diff；
- 最终仅 `preview-ready / awaiting-user-preview`；
- 没有 FinalPreviewApproval、NarrativeCheck、Scene aesthetic gate、global enhancements、M10、
  promotion 或 push。

authority docs 只把“首次真实 trial 达到 preview-ready”写成已完成事实；不得把用户尚未观看的
作品写成 approved/reviewed/quality-pass。

**聚焦验证：**

```bash
npm run docs:check-links
git diff --check
git diff --name-only
git status --short
```

必要时重新执行 Task 10 完整门，确保 docs closeout 没破坏 `npm run check`。

**精确 staging：** 只 stage 实际修改的上述 docs paths和本计划；执行前保存
`git diff --cached --name-only` 到 report，确认没有 source/media/protected path 混入。

**计划 commit：** `docs(production): record first m9.5 production trial`

**rollback/resume：** 文档若与 code/test/media事实不一致，修改文档而不是篡改产物；Task 10
未全绿或 Run B 非 preview-ready 时不得写 closeout 结论或 commit。

**主 Agent 监控点：** 每条完成事实都有当前 artifact/command 依据；所有措辞停在 mechanical
Preview；未创建 approval 文件。

### Task 12：用户 Preview handoff 与停止

**目标：** 向用户交付完整 MP4 路径、checksum、evidence/check fingerprints 和试跑报告，等待
用户实际观看决定。

**修改文件 / Red / Green：** 不修改文件，不新增测试。handoff 只有在 Task 10–Task 11 全部
通过后发生。

**交付内容：**

- `out/rounded-airplane-windows/production/<runB>/preview.mp4`；
- contact sheet 和三张 still；
- ProductionPreviewEvidence / mechanical check fingerprints；
- trial/hardening report；
- local commits 列表；
- 已知问题和是否发生 replacement；
- 明确文字：`awaiting explicit user preview decision`。

**精确 staging / commit：** 无；不 push。

**rollback/resume：** 用户观看后的任何 Scene 修改、FinalPreviewApproval 或发布都需要新的明确
请求和独立计划/边界；不在本 Task 自动开始。

**主 Agent 监控点：** 最终 Git status 只能包含用户原有未跟踪保护目录或用户另有未提交变化；
不把工作树干净错误等同于 approval。

## 8. Commit 顺序与 exact staging 纪律

正常 trial 预期本地 commits：

```text
feat(trial): freeze rounded airplane windows production inputs
feat(trial): seal rounded airplane windows narrative baseline
feat(trial): freeze rounded airplane windows scene brief
feat(trial): author rounded airplane load path scene
chore(trial): bind replacement scene assignments
feat(trial): complete rounded airplane window scenes
feat(trial): assemble m9.5 mechanical production preview
docs(production): record first m9.5 production trial
```

每个真实 orchestration defect 在发现处插入独立：

```text
fix(production): <准确根因>
```

提交前统一要求：

- focused Green 和对应 typecheck/lint 已通过；
- `git diff --check` 通过；
- `git diff --cached --name-only` 与 Task exact list 相等；
- 无 `.producer-runs/`、`out/`、private config、token、endpoint、raw log、临时文件；
- 无 GPS/ProductComicVertical 正式 artifact；
- 无 `public/voice_profile/`；
- 不使用 `git add .`、`git add -A` 或 glob；
- 不 push。

若某 Task 没有 tracked 变化，不创建空 commit。若生成的 exact content-addressed path 只有运行后
才能知道，先从 current manifest/schema解析完整路径并写入 staging checklist，再逐文件 stage。

## 9. 完成门槛

只有全部满足才可宣布本计划执行完成：

1. 新 project `rounded-airplane-windows` 使用真实 authored StoryBeat/ttsChunks、真实 StoryCheck、
   RenderSpec 和 ProductionRequirementsFreeze；
2. 真实本地 VoxCPM 旁白已生成、实测、checksum、fingerprint 和封存；
3. Narrative Baseline 和 AutoCheck current；
4. Run A 真实证明 partial/out-of-order submit + explicit fail + watcher fail-fast，且没有 Preview；
5. Run B 是新的 immutable replacement，不修改或复活 Run A；
6. 两个 Scene Agent 各自只写独占目录，success/failure 只经固定 CLI；
7. 主 Agent 从分发到 watcher/post-scene完成始终保持当前任务运行并持续监控；
8. coverage、RendererRegistry、projection、Composition、MP4、stills、contact sheet 全部真实生成；
9. MP4 画幅、fps、帧数、流、时长、完整解码和 checksum 通过；
10. ProductionPreviewEvidence 和 `production:preview:check` 通过；
11. 第二次 current check 的 bytes/mtime/events/fingerprints 稳定；
12. timeout/malformed/stale/shared drift/two-watcher 由 fake fixture current tests 覆盖，实际改动
    没有削弱这些 failure paths；
13. 每个真实 orchestration defect 都有 Red、最小 fix、focused Green、本地 commit 和明确
    recovery 决策；
14. `npm run docs:check-links`、`npm test`、`typecheck`、`lint`、`catalog:check`、
    `registry:check`、`build`、`compositions`、`check`、`git diff --check` 全部通过；
15. GPS/ProductComicVertical 十个关键 artifact checksums before/after 一致；
16. `public/voice_profile/` 未读取内容、未修改、未 stage、未提交；
17. 无 FinalPreviewApproval、NarrativeCheck、Scene aesthetic gate、GlobalSoundPlan/BGM/cross-scene
    ambience/ducking/GlobalVisualLayers、M10、promotion 或 push；
18. 最终状态和交接文字严格是 `preview-ready / awaiting-user-preview`。

## 10. 计划自审

### 10.1 主 Agent 是否真的全程监控

- 是。Task 5 和 Task 7 都要求主 Agent 在 Scene 分发后立即启动 yielded watcher，并保持当前
  Codex 任务；明确读取 stdout/stderr、events、derived state、results、deadline、fingerprints
  和 post-scene outputs；最长 45–60 秒提供一次无变化状态更新。
- 没有把“启动 watcher 后结束任务”写成完成，也没有承诺 detached lifecycle。

### 10.2 repo script 与 Agent lifecycle 是否分离

- 是。repo scripts 只读/写 strict contracts和 state；Scene Agent只写 assignment 的独占目录并
  调 submit/fail；主 Agent 使用当前原生 Agent 能力分发并拥有生命周期。
- 中央 scripts 是 events/state/coverage/registry/Composition 的 writer；Scene Agent 不写中央
  state。

### 10.3 是否有真实 defect 的 TDD 和继续试跑循环

- 是。第 6 节要求每个 orchestration defect 先保存现场、Red、最小 fix、Green、exact stage、
  local commit，再做 resume/replacement，并回到同一 trial继续；不因一次修复提前结束。

### 10.4 是否区分三类失败

- 是。第 5.2 节分别定义项目输入错误、预期生产失败和 M9.5 编排缺陷；Run A 的
  `TRIAL_EXPECTED_BLOCKER` 明确属于 expected failure，不以修改实现让它“通过”。

### 10.5 是否定义 resume 与 replacement

- 是。第 2.4 和 5.3 节按 current state、failed event、immutable result、lock 和 fingerprint
  给出 fail-closed 规则；failed run 永不复活，绝不手改 `state.generated.json`。

### 10.6 是否保护正式作品和用户未跟踪目录

- 是。Task 1/10 对同一十个正式 artifact 做 before/after checksum；Scene authoring 明确禁止
  打开旧 Scene/媒体；`public/voice_profile/` 不进入读取、checksum、glob、stage 或 commit。

### 10.7 终点是否严格限制为 preview-ready

- 是。所有 contracts、report、handoff 和完成门槛只允许 `mechanically-ready`、
  `preview-ready / awaiting-user-preview`；Task 12 明确停下等待用户观看，不创建 Approval。

### 10.8 是否避免扩大到 M10、审美 gate 或自动导演

- 是。计划不实现发布、上传、账号、网络/密钥管理、全片 BGM、跨 Scene ambience、ducking、
  GlobalVisualLayers、NarrativeCheck、Scene Agent 审美 gate、用户预览后的自动修改循环、通用
  Scene DSL、自动布局器、自动导演、detached lifecycle 或 capability promotion。

### 10.9 是否逐 Task 给出文件、Red、Green、命令、commit 和门槛

- 是。Task 1–Task 12 均列目标、文件/输出、Red或真实媒体不强行单测的理由、最小 Green、
  聚焦验证、exact staging、计划 commit、rollback/resume 和主 Agent监控点；无 tracked 变化的
  Task 明确不创建空 commit。

## 11. 执行结果与停止边界

Task 1–Task 12 已在当前主对话 inline 执行。实际历史包含两个前置 narrative failed run、受控
expected-failure Run A、三个 post-scene failed replacement、一次在创建 run 前失败的 scaffold
恢复尝试，以及最终 Run E
`rounded-airplane-windows-run-20260805070223-e10d9e901f06`。计划预期的 Run B all-success 因真实
缺陷扩展为 Run B–Run E；failed runs 均保持 terminal immutable，没有手改中央 state。

Run E 的 MP4 checksum 为
`sha256:4c8c3ce6035ff52870f489f8faefcb05672c199ac4f10a8df6e1dc84baec4d86`，Preview evidence 为
`sha256:bc58b2d70dad81a799817858d02c448ecbb4e5c9d7bd3effcf8139f62cc2e510`，mechanical check 为
`sha256:b670a8c941a07fc91a1a3c06f94f9aac55d50955cfc48f3c9376c6ca2cfcd160`。全量门通过，GPS 与
ProductComicVertical 十个保护产物 zero-diff。完整事实见
[M9.5 Production Trial and Hardening Evidence](../../evidence/2026-08-05-m9-5-production-trial-and-hardening.md)。

本计划现停在 `preview-ready / awaiting-user-preview`：未读取受保护目录的文件字节，未创建
新作品 approval，未执行 NarrativeCheck、Scene aesthetic gate、全局增强、promotion、M10、
发布或 push。用户观看后的任何修改或批准属于新的明确请求。
