# 确定性执行

> 文档类型：执行语义权威
>
> 最后复核：2026-08-18

## 确定性的对象

仓库保证相同 sealed/current inputs 产生相同合同 identity、路径与 canonical JSON；不保证 TTS 波形
或 Remotion 媒体 bit-for-bit 相同，因此最终媒体必须在每次 build 后实测并以 checksum 绑定。

所有 persisted JSON 使用 strict schema、stable key order、newline-terminated canonical bytes 和
namespace/version-bound SHA-256 fingerprint。未知字段、非 current contract、path escape、symlink、
identity drift 或 malformed bytes fail closed。

NarrationSpec 与 narration generation input 是 current-only v2；已删除的 VoxCPM `seed` 不参与
任何合同。VoxCPM provider-attempt v2 继续绑定 adapter v2、完整 generation parameters 与安全内容
checksum；SpeechSDK provider-attempt v2 与 Edge provider-attempt v1 分别绑定 direct adapter、
vendor/service、model/profile/voice、单请求限制、零重试策略与 opaque private-config fingerprint。
provider-neutral chunk request v2 再绑定
authored chunk，因此 adapter、凭证或任一参数漂移都不能复用错误候选。

ProducerConfig 自身使用 `producer-config-v4` strict discriminated provider schema 与 fingerprint。
合法 v1/v2/v3 先校验各自原 fingerprint，再只在内存中升级；v3 云声线迁移为显式 `catalog`
绑定；GET 不改写私有文件，页面保存后才原子写成 v4。它是新
authoring/freeze 的默认/选择 authority，不是已封存 Project 的可变 runtime dependency：Scene template
在 `project:configure` 时复制为 Project-local source/assets/instance，合集选择连同 catalog fingerprint
进入 PublishingIntent v2，边缘留白进入 production-readability-v2，语速进入 provider-attempt，目标
LUFS 进入 mastering policy。声线文件与可选 BGM 预设只接受规范化仓库相对路径；绝对路径、URL、
反斜杠与目录逃逸 fail closed。BGM 在 `project:configure` 时复制为 Project-local 资产，并以 checksum、
descriptor fingerprint、独立音量和 `sound.json` fingerprint 进入 requirements、render 与 delivery identity。
`project:configure` 要求显式 readability，不再存在创建阶段的 90px fallback。

start 的同一次 provider resolution 同时供 provider-aware preflight 与
`NarrationExecutionSnapshot` v3 使用。VoxCPM 保留 loopback health/ready/info 检查；SpeechSDK 与 Edge
只做 strict config/profile 校验，明确把凭证（如适用）与网络验证延迟到真实生成，不 warm-up、不产生
诊断费用。
快照复用 provider-attempt fingerprint 与完整 mastering policy；provider-attempt 额外绑定 opaque
private-config fingerprint，从而让 URL/token/path 变化触发 drift，但 raw token、URL、绝对路径、
声线内容和 transcript 不进入 Project、Run、events、错误或日志。generation 在请求前重算并比较
快照；mastering 只使用 Run policy。云端执行只使用 `createOpenAI()` direct factory 与用户 key，
不使用 Speechbase gateway、字符串路由、SDK timestamp/normalize 或 provider fallback。已冻结
Project/Run 不因全局配置变化而改变。

## 时间确定性

旁白封存后，累计 PCM samples 是唯一时间 authority：

```text
frameBoundary = ceilDiv(cumulativeSamples * fps, sampleRate)
```

不得逐 chunk 把浮点秒数转 frame 再累加。Scene 与 transition 不能移动、缩短或覆盖 spoken
frames。planned duration 只能由 `frameCount / fps` 推导，不伪装为媒体实测。

SemanticTiming v3 从 `leadInFrames` 开始，按 StoryBeat 顺序写入 silent preset 固定窗口与 narrated
PCM 累计窗口，再追加真正的 `tailFrames`。silent Scene 不产生 segment 或 CaptionCue；完整旁白从
`narrationStartFrame` exactly once 播放。`scene-package-timeline-v1` 的 Composition、Registry、render
plan 和 delivery 直接使用 `SemanticTiming.durationInFrames`，章节直接使用 narrated Scene 的绝对帧。
内容 BGM 的半开窗口固定为首个 narrated Scene 的 `startFrame` 到最后一个 narrated Scene 的
`endFrame`；因此首尾 silent Scene 无论是否存在自己的音效，均不会播放内容 BGM。

配置选择的 reusable Scene template 在 `project:configure` 时复制源码、Renderer、资源与 exact sound
cues，并冻结 template/instance/source graph fingerprint。之后 freeze 只读取 Project-local
`template-copy` instance，机械投影 plans、anchors 与 selected resources；本地 source/cue 漂移即 fail
closed，重复 configure/freeze 必须 byte/mtime 稳定。全局选择或共享模板后续变化不改变既有 Project。
`scene-owner` silent preset 仍走 Agent owner；`null` 配置不插入边界 Scene。

## Production ledger

Run manifest immutable；events append-only、连续编号并绑定 previous-state fingerprint；Scene 与
GlobalVisual result immutable；state 是由 events/results/current fingerprints 重算的 projection。
重复 check 不写 event，不改变 bytes/mtime。

任何 fixed-stage failure 形成 terminal event 后，该 Run 永不恢复。公共流修复完成后必须从
current authored inputs 创建 fresh Run，不能编辑 event/state/result。

owner receipt inbox 是按 assignment identity 隔离的 multi-writer 边界。receipt 绑定 current
run/story/assignment/task/requirements、排序后的规范化 output manifest/checksum 与 receipt
fingerprint；同内容重放 no-op，同 identity 不同内容、malformed、stale、symlink、escape、unknown
file 或 checksum drift fail closed。owner-receipts 不含 child identity/chat/progress/heartbeat。

Agent 文件写入同样分段冻结。production start 在 fixed scaffold 后保存 project-authoring protected
workspace fingerprint，narrative 固定生成完成后刷新一次 Project checkpoint；Scene freeze 先验证 Root authoring 未越过 current Project，再基于 Scene、
GlobalVisual、Cover exclusive paths 保存 owner-authoring fingerprint。receipt publication 与 finalize
复验后一份 fingerprint；render-ready 的 fixed writers 完成后再保存 Cover-only fingerprint，允许补
Cover 时继续机械检查。普通 public 文件使用内容 checksum，private、voice 与私密 env 只使用脱敏
metadata；不把脚本生成的 Run、Catalog、Registry、out 或 delivery 文件归因给 Agent。该机制只在
确定性阶段门检测漂移，不是进程级预防性 sandbox；`public/projects/<storyId>/` 属于 current Project
allowlist，`public/assets/library/` 共享素材仍受保护。

receipt rename 前的 deterministic `.pending` 已包含完整 canonical bytes。publisher 中断但 receipt
尚未出现时，处理同一 immutable assignment 的替代线程可用相同语义内容完成 atomic rename；首次
pending 的 occurredAt/fingerprint 保持不变，不同语义内容仍冲突。这里不使用会把缺失 receipt 永久
锁死的空 publication lock。

foreground finalize 先获取唯一 Run writer lock，并以单一 expected-owner 规则校验 inbox。required
Scene/GlobalVisual receipt 缺失时，在任何 event/result/state 写入前返回稳定排序的
`owner-receipts-incomplete`。required 齐全后串行处理 immutable receipts/results；幂等重放不重复接受
identity。Cover missing/failed 只在 render-ready 后返回 delivery blocked。

## Render-ready identity

`production-render-plan-v5` 固定：

- storyId/runId/compositionId；
- Composition source path 与 checksum；
- width/height/fps、ScenePackage timeline、semanticTimingFrameCount/final frameCount；
- `VideoBrief.sourceReferences` fingerprint；
- FinalAssembly、sealed/mastered narration、semantic timing、renderer registry 与 projections；
- layer/mix order；
- fixed Remotion render policy。

`production-render-ready-v5` 再绑定 plan fingerprint，并固定 status/handoff。该 artifact 只证明
所有 render-critical inputs current，不证明媒体存在。

在 ready artifact 写入前，目标 Project Composition 必须通过仓库固定 TypeScript/tsconfig 的
`noEmit` 编译。编译 root 只有 `src/projects/<storyId>/Composition.tsx`，依赖由真实 import graph
决定；失败只暴露去重后的 TypeScript diagnostic codes，不输出源码、绝对路径或完整 diagnostic。

## Project build identity 与受控交付

默认 build 先机械刷新由 current authoring source 可重算的 ScenePackage、coverage、registry 与生成式
Composition，再对 Project source、Project-owned public media、shared contracts/runtime 和固定 build
配置生成排序文件清单与 `project-authoring-source-snapshot` fingerprint。assignment、receipt、
ProductionRenderPlan/Ready、owner result 和 run-bound generated package 显式排除，因此 runId 不污染
可复用内容 identity。

`build-<sha256>` 绑定 storyId、source snapshot、Composition、fps、frameCount、width/height 与
`synchronous-atomic-project-build-v1` policy。同 buildId staging 中每个媒体只有在 metadata 与 EOF
检查通过后才以 canonical 文件名落位；中途失败保留已验证文件供下一次相同 buildId 复用。
`publish.json` 必须最后写，exactly 绑定：

```text
video.mp4
cover-4x3.png
cover-3x4.png
```

publish 自身连同三项媒体构成 current slot 的 exact 四文件集合。提升前和提升后都重新 parse schema、
hash 文件并复验媒体；source 在渲染期间漂移则拒绝发布。新 staging 完成前绝不改动上一版 delivery。
捕获到的 promotion 失败恢复上一版；real-directory slot 的两次 rename 不声明进程崩溃级原子性。

## Audited delivery identity 与 canonical launch package

deliveryId 从 PublishingIntent fingerprint、canonical publishing checksum、CoverResult fingerprint、
render-ready fingerprint、render-plan fingerprint、Composition、实际使用资源的 attribution
fingerprint/checksum、Project 固定 output path、exact render args 和 launch policy 计算。真实 intent
fingerprint exact command/argv/output/log；deliveryId 仍是 current package 的校验 identity，但不再
作为存储目录名。

staging 中先写并校验：

```text
cover-4x3.png
cover-3x4.png
publishing.json
asset-attributions.json
delivery-launch-manifest.json
HANDOFF.md
immutable-checksums.sha256
render-launch-intent.json
```

这些 bytes 通过后才原子提升。receipt 是 spawn 后新增的唯一允许文件；exact planned MP4 不属于
immutable ledger。

## Launch protocol

intent-before-spawn/receipt-after-spawn 协议只用于最终 detached Remotion render。production finalize
本身是 foreground 固定命令，不写 launch intent/receipt，也不 detached。

```mermaid
stateDiagram-v2
    [*] --> NoPackage
    NoPackage --> IntentRecorded: package promoted with intent
    IntentRecorded --> ReceiptRecorded: OS spawn acknowledgement
    ReceiptRecorded --> ReceiptRecorded: repeated build is no-op check
    IntentRecorded --> Ambiguous: spawn error or receipt write gap
    Ambiguous --> Ambiguous: automatic retry forbidden
```

协议约束：

1. intent 必须 exclusive write 并在 spawn 前 durable visible；
2. adapter 使用 `shell: false`、fixed cwd/argv/log 和 `detached: true`；
3. promise 只由 `spawn` 或 `error` settle；spawn 后立即 unref；
4. receipt 只在 spawn acknowledgement 后 exclusive write；
5. receipt exists 才能通过 public delivery check；
6. intent without receipt 永远 launch-ambiguous，never retry；
7. 不监听 exit/close，不保存 PID，不轮询，不读取/hash/probe/decode MP4。

receipt bytes 先写同目录 temporary 并 fsync，再以 exclusive hard-link 原子发布；destination 一旦
可见就是完整 canonical bytes。

因此 `delivery-render-started` 是精确而有限的事实：OS 已确认启动 child。任何 render completion
或媒体质量结论都需要另一个被用户明确授权的系统。

## Idempotence 与 deletion

- render-ready check：current → no-op；drift → fail closed。
- delivery build：receipt current → no-op；intent-only → ambiguous；different/unknown target → fail。
- delivery check：只读 current package，不修复、不创建 receipt。
- 配置页 production progress 只展示 source Project 或 current Run manifest 明确拥有的 storyId，
  不从 `out/`、deliveries 等 output-only 根推断 Project；随后按 Project 独立选择 `createdAt` 最新
  current Run，并只从校验后的 manifest/events/state 和 fingerprint-bound delivery intent/receipt
  投影；轮询不写仓库状态。
- 用户明确授权后，真实作品只由 `project:delete` 按 storyId 删除 Project、public media、
  narration work、Runs、out 与 deliveries，并确定性重建 Registry/Catalog；core source gate
  保持有效，其他显式 project/media/delivery 命令继续 fail closed。删除预检只投影 Run 的严格
  `runId/storyId` 所有权，不验证或解释已移除的 production contract/state/event。删除与其他
  Project-level mutation 共享 repository operation lock；目标 Run lock、持锁重检、删除前 Registry
  预发布和异常后的磁盘真实状态重建保证并发与失败路径不会暴露 stale projection。
- deletion matrix 只在隔离副本执行，真实 production artifacts 不作为测试夹具删除。
