# M9.5 Production Orchestration

> 状态：2026-08-05 已实现。自动流程的唯一成功终点是
> `preview-ready / awaiting-user-preview`；它不表示 reviewed、approved、quality-pass 或
> released。

首次真实试跑已用 `rounded-airplane-windows` 验证该终点；完整 run/replacement、媒体与保护
证据见 [M9.5 首次真实生产试跑与 hardening 实证](evidence/2026-08-05-m9-5-production-trial-and-hardening.md)。

## 固定命令

所有命令只接受下面的 exact form；未知、重复、缺失或额外参数都会非零退出。

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

`production:start` 只接受已经存在且 current 的 authored inputs 和
`src/projects/<storyId>/production/requirements.json`。`production:narrative` 按固定顺序调用
现有旁白生成/封存、timing、ProjectRegistry、Narrative Baseline media/evidence 和 AutoCheck
节点；真实运行可能调用已配置 VoxCPM，但默认测试只使用依赖注入 fake provider，不访问
网络或私有配置。

Narrative 到达 `baseline-ready` 后，主 Agent 写 current `visual-style.json`、
`production/story-resource-pool.json` 和 `production/scene-production-brief.json`，再运行
`production:scene:freeze`。每个 meaningId 得到一份只读 assignment。Scene Agent 只拥有该
assignment 声明的 Scene/source/public 输出路径；完成后运行 submit，无法完成时运行 fail。
Scene Agent 不写中央 events、state、coverage、registry 或 Composition。

主 Agent 分发 Scene 后保持当前任务运行，并由 `production:watch` 等待结果。repo CLI 不创建
或托管 Agent，也不承诺主任务结束后的 detached lifecycle。

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
`ProductionError`，不持久化 raw stack、token、私有 endpoint 或绝对路径。修复已报告的输入
或 Scene 后，应按状态重新执行对应固定命令；不得手改中央 state 跳过失败。

真实 replacement 还固定了四条恢复语义：selected-resources envelope 在 submit 与 post-scene
共用 strict parser；Composition listing 必须保留待解析 stdout；只有 byte-exact generated
Preview scaffold 可在 replacement start 恢复为 Narrative scaffold；媒体时间线以唯一视频流的
duration/fps/frame count 为权威，不用包含 AAC tail padding 的 container duration。

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
和媒体 checksum。M9.5 Preview 显式禁止 GlobalSoundPlan、BGM、跨 Scene ambience、ducking 和
GlobalVisualLayers；Scene-local ambience/SFX 仍归 ScenePackage 所有。它不执行 NarrativeCheck
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
npm run check
```

本里程碑没有修改 GPS/ProductComicVertical 的真实媒体、approval、evidence 或 final report，
没有执行 promotion，也没有实现发布、上传、账号、网络、密钥、权限、自动导演、通用 Scene
DSL 或 M10。设计与阶段边界见
[实施计划](superpowers/plans/2026-08-04-m9-5-contract-driven-production-orchestration-plan.md)、
[生产流程](PRODUCTION_WORKFLOW.md) 与 [确定性执行](DETERMINISTIC_EXECUTION.md)。
