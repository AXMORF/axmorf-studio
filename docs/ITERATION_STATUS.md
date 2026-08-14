# 当前实现状态

> 文档类型：当前事实权威
>
> 最后复核：2026-08-15
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

- ignored `private/producer.config.json` 是 render 默认值、Scene 基准边缘留白、合集数组、通用 TTS
  provider/声线/语速/目标 LUFS 与可选本地 BGM 预设的唯一配置 authority；旧 VoxCPM 配置可一次性
  无泄露迁移。页面将 width/height 合为常用画面规格下拉，声线与 BGM 文件只接受仓库相对路径。
- `npm run dev` 同时启动 loopback 配置控制台 `:3100` 与 Remotion Studio `:3101`；显式
  `npm run dev:lan` 让两者通过可信 LAN IP 访问。token 按要求完整回传、显示、可修改，同时使用
  精确同源写入、no-store、无浏览器持久化和 `0600` 原子写入。
- `project:configure` 是新 Project 的固定冻结入口：从 Project `producer-input.json` 与一次
  ProducerConfig 读取生成 NarrationSpec、RenderSpec、StoryCheck、PublishingIntent v2 和
  ProductionRequirementsFreeze；输出 conflict 时拒绝覆盖。
- 配置 API 已覆盖 GET/PUT、strict validation、同源拒绝和原子写入；页面提供只读的声线来源、
  VoxCPM health/ready 与 Remotion browser 诊断，并即时维护唯一 ID 与有效默认声线。
- 配置页“制作进度”只把 `src/projects/` source directory 或 current Run manifest storyId 识别为
  可展示 Project，不纳入 `out/`、deliveries 等 output-only 清理目标；每个 Project 只投影
  `createdAt` 最新的一条 current Run，选择后展示六个关键 production/delivery 步骤并每 3 秒刷新。
  它严格复用 Run events/state 与 fingerprint-bound delivery intent/receipt，不启动脚本、不追踪
  PID、不把 spawn acknowledgement 表述为 MP4 完成，也不提供历史 Run 列表。
- Project 详情可在输入完整 Project ID 后删除；同源 API 复用 `project:delete` 的完整预检与删除语义，
  清理该 Project 代码及全部本地产物并重建 Catalog/Registry，不扩张到其他 Project、私有配置或
  受保护声线。删除与 production start、Project configure、delivery build 共享跨进程 operation
  lock，并独占目标 Run writer locks、持锁重检完整目标集，竞态或漂移在删除前 fail closed；Project
  源码删除前先发布不再引用目标 Composition 的 Registry，防止本地 Studio 中断删除 API；后续清理
  报错时按磁盘真实状态重建 Registry/Catalog，仍在磁盘的 Project 不会被投影隐藏。
- `production-readability-v2` 从可配置边缘留白派生字幕底边与 Scene 底边；RenderSpec 已移除冗余
  caption safe area。
- PublishingIntent v2 只能选择配置数组中的一个合集并封存目录 fingerprint；TTS 语速进入
  provider attempt，目标 LUFS 进入 mastered narration v2 policy/fingerprint。
- 新 Run 在同一次 VoxCPM preflight 中冻结 private-safe NarrationExecutionSnapshot；generation
  重算不一致时在 provider request 前拒绝，mastering 只消费 Run policy。服务连接只以 opaque
  private-config fingerprint 进入 provider-attempt，raw token/URL/path/voice content 不持久化。

### 叙事、时间与 Scene

- strict VideoBrief、StorySpec v2 discriminated narrated/silent Scene、current-only NarrationSpec v2、RenderSpec、StoryBeat、
  Agent-authored ttsChunks；NarrationSpec v1/`seed` 无 runtime compatibility。
- VoxCPM clone adapters v2、完整 generation parameter/provider-attempt binding、候选、sealed
  PCM、checksum/fingerprint、`pcm-cumulative-ceil-v1`、SemanticTiming 与
  CaptionCue。
- Composition-owned `SceneSafeArea`、唯一顶层 CaptionLayer、透明语义 Scene root。
- intro/content/outro 已统一走普通 ScenePackage；SemanticTiming v2 覆盖连续全片窗口，CaptionCue
  只覆盖 narrated chunks。默认 intro/outro preset 分别绑定 60/240 帧、视觉/音效意图、本地 PCM
  Resource ID 与 fingerprint；Project source 可显式替换或关闭。`leadInFrames`/`tailFrames` 只保留
  真正空白 padding，NarrativeCore 从 `narrationStartFrame` 挂载唯一完整旁白。
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
- `production-render-plan-v4` 绑定 Story/Run、sealed/mastered narration、Composition、source
  checksum、sourceReferences fingerprint、尺寸、fps、SemanticTiming 全片帧数、ScenePackage timeline、
  layer/mix order 和固定 Remotion policy。
- `production-render-ready-v4` 绑定 render plan 与全部 current assembly identities；终态固定为
  `render-ready / awaiting-automatic-delivery`。
- GlobalVisual validator、generated Composition 与目标 Project compile gate 共享无 Props
  `GlobalVisualLayers` 类型合同；compile 使用仓库 tsconfig、`noEmit` 且只以 current
  `Composition.tsx` 为 root，其他 ignored Projects 不进入该门禁。
- render-ready check 只重算 current contracts，保持 events 与产物 byte/mtime 不变。

### 外部图片准入与 ResourceCatalog

- Scene freeze 对所有 Project（包括无外部素材的 code-led Project）无条件冻结 Project-local
  ResourceCatalog 快照；render-ready 与 delivery 通过 current freeze 重查同一 canonical bytes，
  不再依赖是否曾执行 asset import。
- `project:asset:import` 已严格适配 stock-assets-mcp Pexels image acquisition receipt v1，不引入
  MCP/provider SDK 或网络 runtime；receipt、candidate 与私有配置不进入仓库提交。
- 导入校验 absolute receipt、同目录 containment、regular/no-symlink、MIME/扩展名、dimensions、
  size、SHA-256、license 与 attribution，原子本地化到 Project public 路径并保存不可变来源证据和
  `project-asset-manifest-v2`，随后重建并检查 ResourceCatalog。
- Resource ID 是 provider-aware、Project-local 且稳定的；相同 identity 重放只读 no-op，receipt、
  文件或 identity 漂移 fail closed，不覆盖共享素材库或冻结后的 Run。
- `external-asset-acquisition-v1` 使用 image/video/audio 独立 discriminated branches；当前只有 image
  import 可用，video/audio 明确未开放且 fail closed。

### PublishingIntent、Cover 与自动交付

- PublishingIntent v2 在 Story 阶段绑定 Story fingerprint 与所选配置合集；6–7 个唯一话题均不得
  包含空白字符；title 由 StorySpec 独占，章节只覆盖 narrated Scene 并直接使用 SemanticTiming
  的全片绝对 frame/time。
- 独立 Cover assignment/package/result 保留；Cover owner 只消费 StorySpec、VisualStyleSpec 和固定
  CoverSpec，通过 receipt 进入 watcher，但不阻止 render-ready 或进入 production state。
- `delivery-launch-manifest-v4`、`render-launch-intent-v4`、`render-launch-receipt-v4` 与
  `detached-spawn-acknowledgement-v1` 已实现。
- delivery 从 render plan 实际引用的 ScenePackage/GlobalVisualPackage 资源解析绑定 Catalog，写入
  去重且 fingerprint-bound 的 `asset-attributions.json`；未使用资源不输出，空结果也稳定存在，
  attribution checksum/fingerprint 进入 delivery identity、ledger 与 HANDOFF。
- `delivery-publishing-v2` 在发布元数据中包含固定 `outputFileName`，以及分别指向
  `cover-4x3.png`、`cover-3x4.png` 的 `coverFileNames`。
- `deliveryId` 绑定 PublishingIntent、canonical publishing checksum、Cover result、render-ready、
  render plan、Composition 与 exact argv/policy；同一 current 输入得到同一 identity。
- 每个 Project 只有 `deliveries/<storyId>/` 一个 current slot。build 先在 staging 写 Covers、
  publishing、handoff、manifest、intent 和 immutable checksum ledger，完整检查后原子提升；新
  identity 通过 staging 受控替换旧 package，不累积多个 delivery 目录，再 detached spawn Remotion。
- receipt 只在 OS `spawn` 事件后 exclusive write；已有 receipt 的重复 build 只读复验并
  `noOp: true`。
- intent 已存在但 receipt 缺失时状态永久 launch-ambiguous，命令 fail closed 且禁止重试。
- `delivery:check` 校验非 MP4 包与 receipt，但明确忽略 exact 计划 MP4 路径，不读取其 metadata
  或内容。

### 工程与可删除性

- `scripts/production` 与 `scripts/delivery` 均按 cli/application/domain/adapters 分层；通用文本进程
  port、受限媒体进程 adapter 与 Remotion executable resolution 位于窄 `scripts/shared/`，delivery
  不再反向复用 production adapter，domain 不依赖 application/adapters。架构测试阻止层级回退。
- owner output 路径安全、manifest 收集与 receipt/result inbox 持久化已拆为独立 adapter；
  production status 是 application use case，CLI 只保留精确命令解析与输出边界。
- `public/`、`src/projects/`、Registry/Catalog 投影、`.narration-work/`、`out/`、`deliveries/` 和
  Run 均是 ignored 本地产物；bootstrap 从 zero Project 重建 core proof 与 zero-safe 聚合。
- 默认 source gate 不读取历史媒体；显式 media 检查 fail closed；Project deletion matrix 只在
  隔离副本中验证。
- `project:delete` 是真实作品清理入口，支持一个、多个或全部 storyId；它删除 Project、项目媒体、
  narration work、Runs、out 和 deliveries 的完整绑定数据，重建零安全 Registry/Catalog，并保护
  core 与 `public/voice_profile/`。非空 delivery staging、writer lock 与不安全路径均在删除前阻断。
- 删除器为清理只读取 Run 的严格 `runId/storyId` 所有权，因此已移除的旧 Run contract 不会让作品
  变成不可删除；production/delivery runtime 仍保持 current-only，绝不解释旧 state/event/result。
- render runtime 不调用 Agent、Skill、MCP、Git、目录扫描或网络服务；所有 motion 使用
  Remotion frame API。

## 明确不实现

- 配置页中的 `audioDefaults.globalBgm` 目前只保存相对路径与音量预设；current production 仍固定
  `globalSound: none`，没有自动 BGM 本地化、封存、混音或 render runtime 挂载。
- detached render 的后台状态机、轮询、重试、完成标记或媒体检查。
- 外部 video/audio 导入、provider 搜索实现、转码或除当前 Pexels image receipt 外的 adapter。
- 平台上传、账号、网络发布、密钥或权限管理。
- NarrativeCheck、主观审美 gate、自动修片和未批准的 capability promotion。
- 对旧 Run、旧作品、旧 release 或旧媒体的 runtime compatibility、迁移或回填。

下一阶段只从 [ROADMAP.md](ROADMAP.md) 进入；执行合同见
[PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。
