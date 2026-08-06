# Production Orchestration

> 文档类型：操作指南
>
> 最后复核：2026-08-06
>
> 自动流程的唯一成功终点是
> `preview-ready / awaiting-user-preview`；它不表示 reviewed、approved、quality-pass 或
> released。

首次真实试跑已用 `rounded-airplane-windows` 验证该终点；完整 run/replacement、媒体与保护
证据见 [M9.5 首次真实生产试跑与 hardening 实证](../evidence/2026-08-05-m9-5-production-trial-and-hardening.md)。
新对话可显式调用
[$remotion-story-producer-video](../../.agents/skills/remotion-story-producer-video/SKILL.md)，粘贴完整
内容后直接执行本流程，不先编写计划。正常路径只加载 Skill 入口、精简直接流程和当前项目
输入；故障参考与权威文档仅在对应失败、合同冲突或范围变化时按需读取。

## 固定命令

所有命令只接受下面的 exact form；未知、重复、缺失或额外参数都会非零退出。

```bash
npm run production:preflight -- --project <storyId>
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
npm run production:scene:freeze -- --run <runId>
npm run production:scene:check -- --run <runId> --scene <meaningId>
npm run production:scene:submit -- --run <runId> --scene <meaningId>
npm run production:scene:fail -- --run <runId> --scene <meaningId> --code <CODE> --description "<safe description>"
npm run production:watch -- --run <runId>
npm run production:preview:check -- --run <runId>
```

`production:start` 只接受已经存在且 current 的 authored inputs 和
`src/projects/<storyId>/production/requirements.json`。`production:narrative` 按固定顺序调用
现有旁白生成/封存、timing、ProjectRegistry、Narrative Baseline media/evidence 和 AutoCheck
节点；真实运行可能调用已配置 VoxCPM，但默认测试只使用依赖注入 fake provider，不访问
网络或私有配置。

`production:preflight` 是 transient、read-only 的 Run-before-write 诊断。它固定调用 VoxCPM
`/health` 检查 liveness，再用 `/ready` 区分 resident 与允许自动装载的
`cold-auto-load-on-first-tts`；`503/loading` 通过且不预热、不发送测试 TTS，`500` 归类为脱敏
external model blocker。随后使用与正式 compositions 相同的 Remotion executable、entry 和
args 启动 Chromium；sandbox/permission denial 是 external blocker，不使用 fallback 或降低
sandbox。preflight 不进入 ProductionRun ledger，不写 event/state/scaffold/narration work，也不
成为作品 authority。`production:start` 在任何写入和 clock/runId 生成前强制复用同一逻辑。
真实 production preflight 必须直接以宿主权限运行；沙箱内失败只能作为环境诊断，不能据此判定
VoxCPM 不可用。复检仍使用同一固定命令，不发送测试 TTS，也不 fallback 或降低 Chromium
sandbox 安全设置。

同一权限边界也适用于仓库验证：`npm run check:static` 是不启动 Chromium 的沙箱安全子集；
完整 `npm run check` 会进入 `npm run check:host` 并执行 `npm run compositions`，因此二者首次
执行必须直接使用宿主权限。所有直接或间接调用 `remotion compositions`、`remotion still`、
`remotion render` 的命令都不得把受限沙箱试跑作为正常路径。

## 未来 production 的统一可读性冻结

代码变更之后开始的新 Run 只接受 `production-requirements-freeze-v3`。它把 Composition 的
width/height 与 `production-readability-v1` 完整解析结果结构化封存并 fingerprint；这是一条
适用于所有画幅的生产规则，不是 9:16 或 portrait policy。已有 v1/v2 requirements/Run 继续按
原合同读取和检查，不注入默认字段、不迁移、不重写任何旧作品或 identity。

策略用整数有理数 `scale = max(1080, min(width, height)) / 1080` 计算：90/36/40/180/30/38
分别按明确的整数 round 解析为 edge inset、Scene 最小字号、字幕字号、字幕 bottom inset、
caption gap 和 vertical padding；两行字幕盒按 `ceil(2 × font × 135 / 100) + padding`，Scene
bottom inset 再向上取整到 10 的倍数。1080 short edge 的结果为
`90/36/40/180/146/360`，更小画幅不低于该基线；同一规则同时生成
`sceneContentSafeAreaPx` 与 `captionSafeAreaPx`。

`caption-display-unit-v1` 以确定性 Unicode grapheme 计数：ASCII grapheme 为 1 half-unit，
非 ASCII grapheme 为 2 half-units，推荐/硬上限为 64/72 half-units（32/36 display units）。
`production:start` 在任何 provider、候选音频或 seal 前联合 Story、Render 和冻结策略检查全部
chunks；超限只返回可定位到 `chunkId` 的 Agent-owned authoring failure，不自动拆分、改写、
裁剪或缩小字号。

Scene freeze 将完整策略和 `scene-composition-boundary-v1` 写入 v3 task/assignment；
package/result/mechanical identity、watcher 与 post-Scene Preview 都复检同一组 identity。
Composition 的 `SceneSafeArea` exactly once 直接消费 frozen policy 并提供 SceneText context；v3
Renderer 只输出 semantic content，不接收 raw policy，也不拥有安全框、CaptionLayer、
GlobalVisualLayers 或 audio。完整 source graph 中可见 HTML/SVG
文字仍必须静态证明达到字号下限，未知/继承/相对单位/缩小 scale 均 fail closed。

v3 scaffold 直接把 StoryVisualTrack 挂入已有视觉 node，不建立临时 project-global wrapper。
`GlobalVisualLayers` 在正式进入 production 前保持 absent；未来只由该既有 enhancement 拥有全屏
背景、纹理、非语义装饰与连续性 motif，不建立第二套 global visual authority、Track、Scene
DSL、自动布局器或自动导演。顶层 CaptionLayer 仍由 NarrativeCore 唯一渲染。v1/v2 scaffold、
Renderer、package/result/check path 与所有现有正式项目保持原样，不回填、不迁移。

Narrative 到达 `baseline-ready` 后，主 Agent 写 current `visual-style.json`、
`production/story-resource-pool.json` 和 `production/scene-production-brief.json`，再运行
`production:scene:freeze`。每个 meaningId 得到一份只读 assignment，并由主 Agent 启动一个
独立 Scene 子 Agent。子 Agent 只拥有 assignment 声明的 Scene/source/public 输出路径；完成后
运行不写 Scene result/event/state 的 `production:scene:check`。检查失败只退回同一 owning 子
Agent 返工。检查通过后，主 Agent 复检写入范围并串行运行 submit；只有真正无法完成时才运行
fail。子 Agent 不写中央 events、state、result、coverage、registry 或 Composition。

主 Agent 分发 Scene 后保持当前任务运行，并以宿主权限由 `production:watch` 等待结果。repo
CLI 不创建或托管 Agent，也不承诺主任务结束后的 detached lifecycle；若当前环境不能创建
独立子 Agent，生产在 Scene authoring 前报告 blocker，不静默退回主 Agent inline 制作。

## 状态与单写者

`.producer-runs/<runId>/` 是 ignored 制作期运行目录：

```text
run.json                 immutable run manifest
events/                  append-only stage events
scene-results/           immutable per-meaningId success/failure results
state.generated.json     events + results + current fingerprints 的派生投影
lock/                    central writer lock
```

`state.generated.json` 不是可编辑 status。每个命令都会读取 strict contracts、检查 event 顺序、
previous-state fingerprint 和 current artifact identities，再复算状态；手改 state、event gap、
冲突 writer、malformed result、stale assignment、共享输入漂移、未知 Scene、越权资源和 timeout
都会 fail closed。中央脚本是 events/state 的唯一 writer；重复相同操作保持 bytes/mtime 稳定。

`production:status` 只读取 current run projection。失败会保存结构化、脱敏的
`ProductionError`，不持久化 raw stack、token、私有 endpoint 或绝对路径。Agent-owned authored
input 或 Scene 被固定校验拒绝时，由对应 Agent 返工；若已经形成 terminal event，则返工完成后
创建新 Run。不得手改中央 state 跳过失败。

固定 contract/CLI/ledger/watcher/registry/projection/render/media inspection/evidence/check 在 valid
current input 下失败，属于通用流程缺陷，不允许 resume、retry、跳过或手工补产物。必须停止并
保存脱敏现场，经 Red → 最小 common-flow fix → Green → local commit 后，从
`production:start` 创建新 Run 完整重验。首次真实试跑由此固化了四条流程不变量：统一 strict
selected-resources parser、保留 Composition listing stdout、只替换 byte-exact generated
scaffold，以及用 video stream duration/fps/frame count 而非 AAC-padded container duration
验证时间线。

## Preview 产物与交接

全部 Scene result mechanically ready 后，watcher 固定生成/检查 SceneCoverageMap、
composition-local RendererRegistry、visual/Scene-local sound projections、Composition、静态
ProjectRegistry、完整 MP4、三个代表 still、contact sheet、Preview evidence 和 mechanical
check。运行产物位于：

```text
out/<storyId>/production/<runId>/preview.mp4
out/<storyId>/production/<runId>/still-<frame>.png
out/<storyId>/production/<runId>/contact-sheet.png
src/projects/<storyId>/generated/production-preview-assembly.generated.json
src/projects/<storyId>/generated/production-preview-evidence.generated.json
src/projects/<storyId>/generated/production-preview-mechanical-check.generated.json
```

机械检查绑定画幅、fps、帧数、音视频流、完整解码、coverage、registry、projection、assembly
和媒体 checksum。v3 PreviewAssembly v2 额外绑定 shared boundary，
同时仍显式禁止 GlobalSoundPlan、BGM、跨 Scene ambience、ducking 和 GlobalVisualLayers；
Scene-local ambience/SFX 仍归 ScenePackage 所有。它不执行 NarrativeCheck
或 Scene Agent 审美审核。

成功 stdout 返回 `runId`、`status: preview-ready`、MP4 relative path/checksum、evidence
fingerprint、state path 和 `awaiting explicit user preview decision`。之后必须由用户观看完整
Preview 决定；M9.5 不创建 `FinalPreviewApproval`，也不实现用户预览后的 Scene 修改循环。

## 验证与范围

M9.5 单元/集成测试位于 `tests/production/`，使用 fake provider、fake process runner、fake
clock/scheduler 和临时 fixture，覆盖正常两 Scene 流程、expected/unexpected failure、timeout、
malformed/stale result、共享输入漂移、幂等与受保护正式作品 checksum。运行：

```bash
node --import tsx --test tests/production/*.test.ts
npm run check:static
npm run check
```

`npm run check` 保持完整仓库门禁语义，等价于先运行浏览器无关的 `check:static`，再以宿主权限
运行包含 Composition 枚举和真实作品检查的 `check:host`。

本里程碑没有修改 GPS/ProductComicVertical 的真实媒体、approval、evidence 或 final report，
没有执行 promotion，也没有实现发布、上传、账号、网络、密钥、权限、自动导演、通用 Scene
DSL 或 M10。设计与阶段边界见
[历史实施计划](../archive/implementation-plans/2026-08-04-m9-5-contract-driven-production-orchestration-plan.md)、
[生产流程](../PRODUCTION_WORKFLOW.md) 与 [确定性执行](../DETERMINISTIC_EXECUTION.md)。
