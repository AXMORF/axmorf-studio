# 当前实现状态

> 文档类型：当前事实权威
>
> 最后复核：2026-08-09
>
> 当前阶段：clean-break production render handoff 与自动交付已实现

## 当前基线

仓库只有一套 current production/delivery 路径。production 从 strict 当前输入开始，经 immutable
Scene/GlobalVisual results 和 append-only Run 投影，到达
`render-ready / awaiting-automatic-delivery`。随后 `delivery:build` 确定性准备非 MP4 包并发起
detached Remotion render；收到 OS spawn acknowledgement 后返回 `delivery-render-started`。

该终点不是媒体成功证据。current scripts 不等待 detached child，不读取、hash、probe 或 decode
计划 MP4，也不从旧 Run、旧作品或旧 delivery 推断状态。

当前工作树是 zero-Project baseline。历史本地 Projects、Runs、媒体和 deliveries 已按用户明确
授权删除；下一个新视频将是本流程的第一个真实 Project。新的 `deliveries/` 不是
checksum-bound verified release，ledger 只封存 immutable 非 MP4 bytes。

## 已实现

### 叙事、时间与 Scene

- strict VideoBrief、StorySpec、NarrationSpec、RenderSpec、StoryBeat、Agent-authored ttsChunks。
- VoxCPM 候选、sealed PCM、checksum/fingerprint、`pcm-cumulative-ceil-v1`、SemanticTiming 与
  CaptionCue。
- Composition-owned `SceneSafeArea`、唯一顶层 CaptionLayer、透明语义 Scene root。
- 每个 meaningId 一个 Scene owner；每个 Story 一个独立 GlobalVisual owner；immutable result
  contracts 由 single-writer watcher 汇合。
- ResourceCatalog、composition-local RendererRegistry、ScenePackage、Coverage、visual/sound
  projection 与 FinalAssembly。

### 当前 production render handoff

- current `ProductionRequirementsFreeze`、append-only events、派生 ProductionRunState。
- fixed preflight/start/narrative/scene freeze/check/submit/fail、GlobalVisual
  check/submit/fail、watch、status 与 render-ready check。
- `production-render-plan-v1` 绑定 Story/Run、Composition、source checksum、尺寸、fps、帧数、
  layer/mix order 和固定 Remotion policy。
- `production-render-ready-v1` 绑定 render plan 与全部 current assembly identities；终态固定为
  `render-ready / awaiting-automatic-delivery`。
- render-ready check 只重算 current contracts，保持 events 与产物 byte/mtime 不变。

### PublishingIntent、Cover 与自动交付

- PublishingIntent 在 Story 阶段绑定 Story fingerprint；title 由 StorySpec 独占，章节 frame/time
  从 SemanticTiming 确定性投影。
- 独立 Cover assignment/package/result 与 `delivery:cover:freeze/check/submit` 保留；Cover owner
  只消费 StorySpec、VisualStyleSpec 和固定 CoverSpec，不加入 production watcher/state。
- `delivery-launch-manifest-v1`、`render-launch-intent-v1`、`render-launch-receipt-v1` 与
  `detached-spawn-acknowledgement-v1` 已实现。
- `deliveryId` 绑定 PublishingIntent、Cover result、render-ready、render plan、Composition 与
  exact argv/policy；同一 current 输入得到同一 identity。
- build 先在 staging 写 Covers、publishing、handoff、manifest、intent 和 immutable checksum
  ledger，完整检查后原子提升，再 detached spawn Remotion。
- receipt 只在 OS `spawn` 事件后 exclusive write；已有 receipt 的重复 build 只读复验并
  `noOp: true`。
- intent 已存在但 receipt 缺失时状态永久 launch-ambiguous，命令 fail closed 且禁止重试。
- `delivery:check` 校验非 MP4 包与 receipt，但明确忽略 exact 计划 MP4 路径，不读取其 metadata
  或内容。

### 工程与可删除性

- `scripts/production` 与 `scripts/delivery` 均按 cli/application/domain/adapters 分层。
- `public/`、`src/projects/`、Registry/Catalog 投影、`out/`、`deliveries/` 和 Run 均是 ignored
  本地产物；bootstrap 从 zero Project 重建 core proof 与 zero-safe 聚合。
- 默认 source gate 不读取历史媒体；显式 media 检查 fail closed；Project deletion matrix 只在
  隔离副本中验证。
- render runtime 不调用 Agent、Skill、MCP、Git、目录扫描或网络服务；所有 motion 使用
  Remotion frame API。

## 明确不实现

- detached render 的后台状态机、轮询、重试、完成标记或媒体检查。
- 平台上传、账号、网络发布、密钥或权限管理。
- NarrativeCheck、主观审美 gate、自动修片和未批准的 capability promotion。
- 对旧 Run、旧作品、旧 release 或旧媒体的 runtime compatibility、迁移或回填。

下一阶段只从 [ROADMAP.md](ROADMAP.md) 进入；执行合同见
[PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。
