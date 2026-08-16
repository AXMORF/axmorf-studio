# 最终产品目标

> 文档类型：产品目标权威
>
> 最后复核：2026-08-16

## 一句话目标

给 Agent 一份完整内容，仓库把它转成合同驱动、可复算、可隔离生产的 Remotion Story，并在
无需第二次人工决定的情况下准备 immutable 本地交付包、发起 detached 最终渲染，最终返回
`delivery-render-started`。

## 成功定义

一次正常生产必须完成：

1. 从统一 ProducerConfig 选择渲染默认值、Scene 边缘留白、一个发布合集与通用 TTS 策略，使用
   fixed `project:configure` 将其冻结进新 Project，再把内容结构化为 Story、StoryBeat、
   Agent-authored ttsChunks、RenderSpec 与 PublishingIntent；
2. 用 sealed PCM 实测生成 SemanticTiming 与 CaptionCue，并生成保持 PCM 格式与 sample count
   不变的响度母带；
3. 先查本地 ResourceCatalog；确需外部图片时经 MCP acquire 后，由仓库严格准入并本地化，再冻结
   全部 owner assignments，exactly once 启动 detached watcher；
4. 主 Agent 用 `create_thread` 派发每个 meaningId 的 Scene、一个 GlobalVisual 与一个 Cover 独立
   用户任务，全部创建成功后立即结束；
5. owner 只发布 assignment-bound immutable receipt，watcher 串行 check/submit 并汇合
   current FinalAssembly；
6. 用普通 ScenePackage 组装片头、正文与片尾，冻结
   `production-render-plan-v5` 和 `production-render-ready-v5`，到达
   `render-ready / awaiting-automatic-delivery`；
7. Cover ready 后准备 non-MP4 delivery package，在 spawn 前 exactly once 写 launch intent；
8. detached spawn Remotion，收到 OS `spawn` 后写 receipt 并到达
   `delivery-render-started`。

最后一步仅证明启动确认。产品目标不包括等待 child exit、判断 render completion、检查 MP4 或
自动发布平台。

## 不可破坏的质量边界

- 一 Story 一个 Composition；一 StoryBeat 一个 meaningId 和 Scene。
- ttsChunks 是创作决定，工具不按标点或字符自动拆分。
- sealed PCM 的累计整数 sample-frame 边界是绝对时间 authority。
- 每个 Scene owner 使用 repository-local `remotion-best-practices` authoring guidance；仓库
  assignment、contracts 与 validators 拥有更高 authority。
- Scene root 透明，只拥有 Beat 语义视觉与音效 contributions；Composition owns safe area、
  narration、captions 与 GlobalVisual background。
- captions 只由顶层 CaptionLayer 渲染。
- SemanticTiming 一次性解析片头、正文与片尾的连续权威窗口；片头片尾默认无旁白和字幕，但可拥有自己的音效 contribution。内容 BGM 只覆盖 narrated Scene 窗口。
- 配置页为首尾业务位置选择普通 reusable Scene template；新 Project 复制其源码和资源并冻结
  Project-local instance。production 只确定性投影，验证冻结绑定后直写结果，不进入通用 Scene
  check/审查，不派发 Agent，也不依赖共享模板。
- JSON 不包含 JSX、代码、动态模块路径或 executable expression。
- render runtime 不调用 Agent、Skill、MCP、Git、网络或目录扫描。
- 所有 render-critical 资产 repository-local、manifest-verified；motion 使用 Remotion frame API。
- 外部 provider receipt 只能在准入 adapter 边界存在；MCP、网络、SDK、API Key 与远程 asset URL
  不进入 owner、watcher、delivery 或 Remotion runtime。
- production state 只由 append-only events、immutable results 与 current fingerprints 投影。
- Cover 独立于 production state，只消费 StorySpec、VisualStyleSpec 与 fixed CoverSpec。
- Codex task/thread/progress/heartbeat 不进入 repository state；缺失 receipt 不触发 timeout/retry。
- 全局配置只提供新 Project 默认值；Scene template 在 `project:configure` 时复制，实际合集、可读性、语速与响度策略进入 immutable
  contracts/fingerprints。Run 开始时再冻结 private-safe narration execution identity；修改配置不能
  静默改写已封存作品或切换已开始 Run 的 provider、声线、参数、语速和 LUFS。

## 自动交付边界

交付 identity 必须绑定 current PublishingIntent、CoverResult、ProductionRenderReady、
ProductionRenderPlan、Composition、实际使用资源的 attribution、fixed argv 和 launch policy。
immutable package 包含 exact Covers、publishing、`asset-attributions.json`、handoff、manifest、
intent、receipt 与 checksum ledger；计划 MP4 写入同一
delivery directory，但不属于 immutable ledger。每个 Project 只有 `deliveries/<storyId>/` 一个
current slot；重新生成以新 identity 从 staging 替换旧 package，不保留多个 delivery。自动
delivery 只向 `out/<storyId>/delivery-render/` 写 detached render log；Project baseline 与 core
proof 使用各自独立的 `out/` 子树。

intent-before-spawn 与 receipt-after-spawn 是不可交换协议。receipt 已存在时重复 build 只读 no-op；
intent 存在而 receipt 缺失时状态 launch-ambiguous，仓库永久拒绝自动重试。current delivery check
不读取或解释 MP4。

## 工程目标

- fresh clone 从 zero Project bootstrap；具体 Project、媒体、narration work、Run、out 和
  deliveries 均为 ignored production artifacts。
- core 不依赖具体 storyId，Registry/Catalog 对零 Project 有效。
- 本地配置控制台列出每个 current Project，并且每个 Project 只投影其最新一条 current Run 的关键
  production/delivery 状态；它不保存历史任务、PID、heartbeat，也不把 spawn receipt 当作 MP4 完成。
- 删除矩阵只在隔离副本验证，不删除真实作品。
- 用户明确授权后，`project:delete` 可按一个、多个或全部 storyId 删除完整本地生产数据并重建
  Registry/Catalog；配置页只在完整 Project ID 二次确认后复用同一删除器。删除与 Project 配置、
  production start、delivery build 共享 repository operation lock，并在源码消失前先发布安全 Registry；
  core、其他 Project、private config 与 `public/voice_profile/` 不进入删除集合。
- 新能力先留 project-local；只有 fingerprint-bound proposal 与用户明确批准后才 promotion。
- 平台发布、账号、网络、密钥、主观审美 gate 和 detached render monitoring 是独立未来范围。
