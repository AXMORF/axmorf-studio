# 当前实现状态

> 文档类型：当前事实权威
>
> 最后复核：2026-08-11
>
> 当前阶段：detached watcher、独立线程 owner receipt 与自动交付已实现

## 当前基线

仓库只有一套 current production/delivery 路径。production 从 strict 当前输入开始，经 immutable
Scene/GlobalVisual/Cover owner receipts 和 append-only Run 投影，到达
`render-ready / awaiting-automatic-delivery`。detached watcher 随后自动执行 `delivery:build` 并发起
detached Remotion render；收到 OS spawn acknowledgement 后返回 `delivery-render-started`。

该终点不是媒体成功证据。current scripts 不等待 detached child，不读取、hash、probe 或 decode
计划 MP4，也不从旧 Run、旧作品或旧 delivery 推断状态。

core 与 fresh clone 是 zero-Project-safe；ignored 本地 Project、narration work、Run、media/out 和
delivery 集由当前工作目录动态决定，不属于 capability 状态权威，也不在本文枚举。current
`deliveries/` 不是 checksum-bound verified release，ledger 只封存 immutable 非 MP4 bytes。

## 已实现

### 统一制作配置

- ignored `private/producer.config.json` 是 render 默认值、Scene 基准边缘留白、合集数组与通用 TTS
  provider/声线/语速/目标 LUFS 的唯一配置 authority；旧 VoxCPM 配置可一次性无泄露迁移。
- `npm run dev` 同时启动 loopback 配置控制台 `:3100` 与 Remotion Studio `:3101`；显式
  `npm run dev:lan` 让两者通过可信 LAN IP 访问。token 按要求完整回传、显示、可修改，同时使用
  精确同源写入、no-store、无浏览器持久化和 `0600` 原子写入。
- `production-readability-v2` 从可配置边缘留白派生字幕底边与 Scene 底边；RenderSpec 已移除冗余
  caption safe area。
- PublishingIntent v2 只能选择配置数组中的一个合集并封存目录 fingerprint；TTS 语速进入
  provider attempt，目标 LUFS 进入 mastered narration v2 policy/fingerprint。

### 叙事、时间与 Scene

- strict VideoBrief、StorySpec、current-only NarrationSpec v2、RenderSpec、StoryBeat、
  Agent-authored ttsChunks；NarrationSpec v1/`seed` 无 runtime compatibility。
- VoxCPM clone adapters v2、完整 generation parameter/provider-attempt binding、候选、sealed
  PCM、checksum/fingerprint、`pcm-cumulative-ceil-v1`、SemanticTiming 与
  CaptionCue。
- Composition-owned `SceneSafeArea`、唯一顶层 CaptionLayer、透明语义 Scene root。
- 每个 meaningId 一个独立 Codex task；每个 Story 一个 GlobalVisual task 与一个 Cover task；共享
  checkout 使用不重叠 exclusive paths。owner 只发布 immutable receipt，single-writer watcher
  串行验证并写正式 result。
- repository-local `remotion-best-practices` router v4.0.506 已完整纳入仓库；Scene assignment
  policy 与 owner 编排要求制作前完整读取入口，并按 Renderer 需要加载 routed references。
- ResourceCatalog、composition-local RendererRegistry、ScenePackage、Coverage、visual/sound
  projection 与 FinalAssembly。

### 当前 production render handoff

- current `ProductionRequirementsFreeze`、append-only events、派生 ProductionRunState。
- fixed production-start-preflight-v2、start/narrative/Scene+GlobalVisual freeze、Cover freeze、
  owner-ready/failed receipt、detached watch start/worker、status 与 render-ready check。
- watcher launch intent/receipt 使用 fixed cwd/argv/log、`shell:false`、`detached:true`；intent-only
  永久 ambiguous。缺失 owner receipt 永久 `waiting-for-owner-results`，无 timeout/retry/heartbeat。
- `production-render-plan-v2` 绑定 Story/Run、sealed/mastered narration、Composition、source
  checksum、尺寸、fps、帧数、layer/mix order 和固定 Remotion policy。
- `production-render-ready-v2` 绑定 render plan 与全部 current assembly identities；终态固定为
  `render-ready / awaiting-automatic-delivery`。
- GlobalVisual validator、generated Composition 与目标 Project compile gate 共享无 Props
  `GlobalVisualLayers` 类型合同；compile 使用仓库 tsconfig、`noEmit` 且只以 current
  `Composition.tsx` 为 root，其他 ignored Projects 不进入该门禁。
- render-ready check 只重算 current contracts，保持 events 与产物 byte/mtime 不变。

### PublishingIntent、Cover 与自动交付

- PublishingIntent v2 在 Story 阶段绑定 Story fingerprint 与所选配置合集；title 由 StorySpec
  独占，章节 frame/time 从 SemanticTiming 确定性投影。
- 独立 Cover assignment/package/result 保留；Cover owner 只消费 StorySpec、VisualStyleSpec 和固定
  CoverSpec，通过 receipt 进入 watcher，但不阻止 render-ready 或进入 production state。
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
- `public/`、`src/projects/`、Registry/Catalog 投影、`.narration-work/`、`out/`、`deliveries/` 和
  Run 均是 ignored 本地产物；bootstrap 从 zero Project 重建 core proof 与 zero-safe 聚合。
- 默认 source gate 不读取历史媒体；显式 media 检查 fail closed；Project deletion matrix 只在
  隔离副本中验证。
- `project:delete` 是真实作品清理入口，支持一个、多个或全部 storyId；它删除 Project、项目媒体、
  narration work、Runs、out 和 deliveries 的完整绑定数据，重建零安全 Registry/Catalog，并保护
  core 与 `public/voice_profile/`。非空 delivery staging、writer lock 与不安全路径均在删除前阻断。
- render runtime 不调用 Agent、Skill、MCP、Git、目录扫描或网络服务；所有 motion 使用
  Remotion frame API。

## 明确不实现

- detached render 的后台状态机、轮询、重试、完成标记或媒体检查。
- 平台上传、账号、网络发布、密钥或权限管理。
- NarrativeCheck、主观审美 gate、自动修片和未批准的 capability promotion。
- 对旧 Run、旧作品、旧 release 或旧媒体的 runtime compatibility、迁移或回填。

下一阶段只从 [ROADMAP.md](ROADMAP.md) 进入；执行合同见
[PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。
