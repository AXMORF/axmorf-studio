# 当前实现状态

> 文档类型：当前事实权威
>
> 最后复核：2026-08-18
>
> 当前阶段：build-centric final artifact alignment 已实现；audited production 保留为可选能力

## 当前基线

默认交付路径是 `project:build`。它不创建/读取 ProductionRun、owner receipt 或 finalize，在一个
可复用 staging 内同步生成并验证成片与两个 Cover，最后写 `publish.json`，然后受控替换 current
delivery。相同 source snapshot 且四个文件完整时 no-op；捕获到的失败保留或恢复上一版，重试只补
受影响 artifact。

append-only Run、owner receipt、foreground finalize、render-ready 与 `delivery:build` 仍可显式使用，
但只承担 audited production；其 `delivery-render-started` 不是媒体成功证据，也不阻塞默认 rebuild。

core 与 fresh clone 是 zero-Project-safe；ignored 本地 Project、narration work、Run、media/out 和
delivery 集由当前工作目录动态决定，不属于 capability 状态权威，也不在本文枚举。current
默认 `deliveries/<storyId>/` 是 checksum/media-verified 四文件 current release。

## 已实现

### Build-centric final artifact alignment

- `npm run project:build -- --project <storyId>` 统一生成 `video.mp4`、4:3 Cover、3:4 Cover 和
  `publish.json`；publish 绑定 buildId、source snapshot、实际路径/checksum/size 与媒体实测事实。
- source snapshot 覆盖 Project source、Project-owned assets 与 shared render runtime，排除 runId、
  assignments、receipts、render plan/ready 与 owner result。
- Scene Renderer 改动会确定性重算 ScenePackage、coverage、RendererRegistry 和生成式 Composition；
  template-copy Scene 保持脚本投影，不派发 Agent。
- Remotion 前台完成后使用 ffprobe/ffmpeg 检查 H.264/AAC、声道、尺寸、fps、frame count 和 EOF decode；
  三类媒体全部通过后才写 publish 并提升。
- buildId staging 可跨失败复用已验证媒体；新 identity 失败不会替换上一版 current delivery。
- `project-build-progress-v1` 在 ignored staging 原子投影准备、视频、两个 Cover、验证与提升阶段；失败
  保留安全阶段状态和上一版 delivery，成功后由 `publish.json` 接管完成 authority 并清理临时状态。

### 统一制作配置

- ignored `private/producer.config.json` 是 render 默认值、Scene 基准边缘留白、合集数组、通用 TTS
  provider/声线/语速/目标 LUFS 与可选本地 BGM 预设的唯一配置 authority；`producer-config-v4`
  strict union 同时支持仓库专用 VoxCPM、Edge Read Aloud 与经审计的 SpeechSDK direct/BYOK
  factories，合法 v1/v2/v3 可在读取时迁移。页面将 width/height 合为常用画面规格下拉，声线与 BGM
  文件只接受仓库相对路径。
- `npm run dev` 同时启动 loopback 配置控制台 `:3100` 与 Remotion Studio `:3101`；显式
  `npm run dev:lan` 让两者通过可信 LAN IP 访问。token 按要求完整回传、显示、可修改，同时使用
  精确同源写入、no-store、无浏览器持久化和 `0600` 原子写入。
- `project:configure` 是新 Project 的固定冻结入口：从 Project `producer-input.json` 与一次
  ProducerConfig 读取生成 NarrationSpec、RenderSpec、PublishingIntent v2 和
  ProductionRequirementsFreeze；同时将可选 BGM 本地化并冻结为 Project `sound.json` 与 manifest
  资源。输出 conflict 时拒绝覆盖。
- 配置 API 已覆盖 GET/PUT、strict validation、同源拒绝和 `0600` 原子写入；页面可新增、删除、切换
  mixed provider/profile，提供 VoxCPM health/ready、SpeechSDK/Edge 静态配置状态与 Remotion browser
  诊断，并即时维护唯一 ID 与有效默认项；secret 不进入浏览器持久化或日志。
- 配置页“制作进度”只把 `src/projects/` source directory 或 current Run manifest storyId 识别为
  可展示 Project，不纳入 `out/`、deliveries 等 output-only 清理目标。schema v3 以默认 build 六阶段、
  current source snapshot 与严格四文件交付为主状态，区分未构建、构建中、完成、待重建、失败和异常；
  每 3 秒只读刷新，不重复 media probe/decode，也不启动 build。最新 current audited Run 保留为默认
  折叠的次级投影；legacy Run 被忽略，不影响普通 build 状态。
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
- 新 Run 在同一次 provider-aware preflight 中冻结 private-safe NarrationExecutionSnapshot v3；
  generation 重算不一致时在 provider request 前拒绝，mastering 只消费 Run policy。VoxCPM 保留
  health/ready/info，SpeechSDK 与 Edge 不生成 probe 音频，只标注真实生成时再校验凭证/网络。服务连接
  只以 opaque private-config fingerprint 进入 provider-attempt，raw secret/URL/path/voice content
  不持久化。

### 叙事、时间与 Scene

- strict VideoBrief、StorySpec v3 discriminated narrated/silent Scene、current-only NarrationSpec v2、RenderSpec、StoryBeat、
  Agent-authored ttsChunks；NarrationSpec v1/`seed` 无 runtime compatibility。
- VoxCPM clone adapters v2、SpeechSDK direct adapter v2、Edge adapter v1 与 provider-neutral dispatcher、
  完整 generation parameter/provider-attempt binding、候选、sealed PCM、checksum/fingerprint、
  `pcm-cumulative-ceil-v1`、SemanticTiming 与
  CaptionCue。
- Composition-owned `SceneSafeArea`、唯一顶层 CaptionLayer、透明语义 Scene root。
- 首尾 silent Scene 与 content 已统一走普通 ScenePackage；SemanticTiming v3 覆盖连续全片窗口，
  CaptionCue 只覆盖 narrated chunks。ProducerConfig 选择普通 Scene template，`project:configure`
  把源码和资源复制到 Project-local Scene 并冻结独立 instance；freeze 机械投影 plans，验证冻结
  identity、复制 checksum、资源与 ScenePackage 绑定后直写结果，不进入通用 Scene check/审查，也不创建
  owner receipt。Project 也可使用 `scene-owner` 或关闭。`leadInFrames`/`tailFrames` 只保留
  真正空白 padding，NarrativeCore 从 `narrationStartFrame` 挂载唯一完整旁白。
- zero-Project Root 的 `System` folder 提供两个 Scene template 的独立可听预览 Composition。bootstrap
  从 ignored `scene-template-sound-overrides.json` 生成 authoring-only 声音投影；当前片头从第 0 帧裁取
  60 帧 Mixkit impact，片尾从第 0 帧播放 240 帧 Deep Urban closing music contribution。配置 Project
  时仍复制为 Project-local runtime 资源，不形成共享 runtime 依赖或第二套音频所有权。
- 每个 `ownerMeaningIds` meaningId 一个运行环境原生子 Agent；每个 Story 一个 GlobalVisual child 与
  一个 Cover child；共享 checkout 使用不重叠 exclusive paths。owner 自行 focused check，只发布
  immutable receipt 并返回最小终态信号。主 Agent等待全部 child 终态后只调用一次 foreground
  `production:finalize`，由唯一 Run writer 串行验证并写正式 result。
- audited production 已冻结两段 Agent direct-write boundary：start 后 Root authoring 只允许 current
  Project；Scene freeze 后 child authoring 只允许 assignments 的 exclusive paths。owner receipt 与
  finalize 会复验 core、共享素材、其他 Project 及 protected metadata 未漂移；fixed scripts 继续按
  原有确定性路径写 Project、Run、Catalog、Registry、out 与 delivery。render-ready 后以 Cover-only
  checkpoint 继续约束后补 Cover，不永久放宽 fixed-owned 路径。这是阶段 checkpoint 检测门而非 OS
  sandbox；current `public/projects/<storyId>/` 在 Project allowlist，`public/assets/library/` 仍受保护。
- repository-local `remotion-best-practices` router v4.0.506 已完整纳入仓库；Scene assignment
  policy 与 owner 编排要求制作前完整读取入口，并按 Renderer 需要加载 routed references。
- ResourceCatalog、composition-local RendererRegistry、ScenePackage、Coverage、visual/sound
  projection 与 FinalAssembly。

### 当前 production render handoff

- current `ProductionRequirementsFreeze`、append-only events、派生 ProductionRunState。
- fixed production-start-preflight-v4、start/narrative/Scene+GlobalVisual freeze、Cover freeze、
  owner-ready/failed receipt、foreground finalize、status 与 render-ready check。
- finalize 先以单一 expected-owner 规则校验 inbox 和 required receipts；缺失 Scene/GlobalVisual receipt
  在任何 stage/result/event/state 写入前返回稳定排序的 `owner-receipts-incomplete`。Cover missing/failed
  保留 render-ready，只阻塞 automatic delivery；boundary fingerprint 漂移则返回
  `agent-write-boundary-violated`，同样不推进中央状态。
- `production-render-plan-v5` 绑定 Story/Run、sealed/mastered narration、Composition、source
  checksum、sourceReferences fingerprint、尺寸、fps、SemanticTiming 全片帧数、ScenePackage timeline、
  统一 sound projection、实际 BGM 资源、layer/mix order 和固定 Remotion policy。内容 BGM 只覆盖
  首个 narrated Scene 起点至最后一个 narrated Scene 终点，不进入片头片尾 silent Scene。
- `production-render-ready-v5` 绑定 render plan 与全部 current assembly identities；终态固定为
  `render-ready / awaiting-automatic-delivery`。
- GlobalVisual validator、generated Composition 与目标 Project compile gate 共享无 Props
  `GlobalVisualLayers` 类型合同；compile 使用仓库 tsconfig、`noEmit` 且只以 current
  `Composition.tsx` 为 root，其他 ignored Projects 不进入该门禁。
- render-ready check 只重算 current contracts，保持 events 与产物 byte/mtime 不变。

### 外部图片准入与 ResourceCatalog

- ResourceCatalog 可选合并 ignored `private/reference-assets/assets.manifest.json`，用于用户已人工确认
  许可的跨 Project `localize-asset` 参考音频；只接受 `public/assets/library/` 下的非旁白音频，并将
  许可绑定到 fixed ignored evidence 文件。路径、文件、checksum、authority 或 evidence 异常仍
  fail closed，manifest 缺失则保持 zero-safe，不将参考库伪装为 Project，也不允许直接进入计划。
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
  CoverSpec，通过 receipt 进入 finalize，但不阻止 render-ready 或进入 production state。
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

- active contract、测试 API、proof identity 与错误文本已使用领域语义命名；架构回归阻止已退休
  里程碑编号重新进入 current source，同时保留 SVG path 与 M4A 格式等合法语法。
- Scene runtime proof 已移出生产 `src/remotion`，按 `proofs/scene-runtime/{source,fixtures,evidence}`
  隔离；Catalog asset ID、Story/Meaning/Composition identity 与所有生成 fingerprint 已重建。
- settings 已拆为共享 contracts、browser-only client 与 Node server。配置、诊断和进度轮询使用独立
  hooks；server 通过 production/delivery application query 读取状态，Project 删除继续复用同一
  preflighted 删除用例。
- 共享视觉能力位于 `visual-components/{backgrounds,charts,text,layouts,scene-patterns,...}`，
  可复制模板位于独立 `scene-templates/`；Catalog authority 路径和 capability identity 已同步。
- `scripts/production` 与 `scripts/delivery` 均按 cli/application/domain/adapters 分层；通用原子文本
  写入、进程 port、受限媒体进程 adapter 与 Remotion executable resolution 位于窄
  `scripts/shared/`。Project Scene template 实例化位于 `scripts/projects/application/`，repository-wide
  template authoring 投影位于 `scripts/scene-templates/`；架构测试阻止这些边界及 domain/application/
  adapter 方向回退。
- owner output 路径安全、manifest 收集与 receipt/result inbox 持久化已拆为独立 adapter；
  production status 是 application use case，CLI 只保留精确命令解析与输出边界。
- `public/`、`src/projects/`、Registry/Catalog 投影、`.narration-work/`、`out/`、`deliveries/` 和
  Run 均是 ignored 本地产物；bootstrap 从 zero Project 重建 core proof 与 zero-safe 聚合。
- ProjectRegistry 只注册显式 current StorySpec Project；非 current Project 仍可展示和删除，但不
  进入 runtime。根 typecheck 不枚举 ignored Project/output，current Project 通过 Registry 的真实
  import graph 与 render-ready 专用 compile gate 验证。
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

- 自动 ducking、响度自动混音或额外声音业务分类；音效与 BGM 都是独立音量的 `SoundContribution`。
- detached render 的后台状态机、轮询、重试、完成标记或媒体检查。
- 外部 video/audio 导入、provider 搜索实现、转码或除当前 Pexels image receipt 外的 adapter。
- 平台上传、账号、网络发布、密钥或权限管理。
- NarrativeCheck、主观审美 gate、自动修片和未批准的 capability promotion。
- 对旧 Run、旧作品、旧 release 或旧媒体的 runtime compatibility、迁移或回填。

下一阶段只从 [ROADMAP.md](ROADMAP.md) 进入；执行合同见
[PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。
