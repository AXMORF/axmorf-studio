# 最终产品目标

> 文档类型：产品目标权威
>
> 最后复核：2026-08-18

## 一句话目标

给 Agent 一份完整内容，仓库把它转成可继续编辑的 Remotion Project；此后用一个确定性同步命令
把同一 authoring source snapshot 原子构建为最终成片、两个比例 Cover 与 `publish.json`。

## 成功定义

一次默认交付必须完成：

1. 从统一 ProducerConfig 选择渲染默认值、Scene 边缘留白、一个发布合集与通用 TTS 策略，使用
   fixed `project:configure` 将其冻结进新 Project，再把内容结构化为 Story、StoryBeat、
   Agent-authored ttsChunks、RenderSpec 与 PublishingIntent；
2. 用 sealed PCM 实测生成 SemanticTiming 与 CaptionCue，并生成保持 PCM 格式与 sample count
   不变的响度母带；
3. 先查本地 ResourceCatalog；缺少内容时才派发 Scene/GlobalVisual/Cover owner，已有 source 的
   普通 rebuild 不创建或重放 ProductionRun；
4. template-copy Scene 继续由配置时复制的 Project-local source 与确定性投影负责，不进入 owner；
5. `project:build` 机械刷新 ScenePackage/coverage/registry 和生成式 Composition，编译目标 import
   graph，并冻结不含 runId 的 authoring source snapshot/buildId；
6. 在同一可续用 staging 内同步渲染 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`，验证资源、路径、
   TypeScript、codec、声道、尺寸、fps、帧数、checksum 与完整 EOF decode；
7. 三类媒体都通过后最后生成 `publish.json`，再原子替换 `deliveries/<storyId>/`。失败时上一版不动，
   同 buildId 重试复用已验证的 staged artifacts。

默认成功终点是四个实际文件已校验并完成原子提升。平台自动发布仍不在目标内。

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
  不进入 owner、finalize、delivery 或 Remotion runtime。
- production state 只由 append-only events、immutable results 与 current fingerprints 投影。
- Cover 独立于 production state，只消费 StorySpec、VisualStyleSpec 与 fixed CoverSpec。
- 子 Agent identity/chat/progress/heartbeat 不进入 repository state；assignment-bound receipt 是唯一
  持久 authority，缺失 receipt 不触发 timeout/retry。
- Agent direct edits 受两段 frozen boundary 约束：Root authoring 只落 current Project，owner
  authoring 只落 assignment-exclusive paths；fixed script 的确定性生成不混入 Agent 写入判定。边界以
  阶段 checkpoint 检测并在推进前 fail closed，不要求 OS 级 sandbox。
- 全局配置只提供新 Project 默认值；Scene template 在 `project:configure` 时复制，实际合集、可读性、语速与响度策略进入 immutable
  contracts/fingerprints。Run 开始时再冻结 private-safe narration execution identity；修改配置不能
  静默改写已封存作品或切换已开始 Run 的 provider、声线、参数、语速和 LUFS。

## 默认原子 build 边界

buildId 只绑定 current authoring source snapshot、Composition/render metadata 与同步 build policy，
不绑定 runId、assignment 或 receipt。current delivery exactly 包含四个文件；`publish.json` 是最后写入
的 commit metadata，并绑定三类实际媒体的 repository path、checksum、size 与 media facts。相同
snapshot 且 current delivery 完整时只读 no-op；源码或 Project-owned 资源任何 byte 变化产生新
buildId。新 build 只在 staging 全部通过后替换 current slot，失败不破坏上一版。

ProductionRun、owner receipt、一次 foreground `production:finalize` 与 `delivery:build` 是显式 audited production 能力，
用于缺少内容或需要严格过程证据的场景；它们不是普通 rebuild 前置条件，也不是默认成功定义。

## 工程目标

- fresh clone 从 zero Project bootstrap；具体 Project、媒体、narration work、Run、out 和
  deliveries 均为 ignored production artifacts。
- core 不依赖具体 storyId，Registry/Catalog 对零 Project 有效。
- 本地配置控制台列出每个 current Project，以 `project:build` 六阶段和严格四文件 current delivery
  为主状态；源码与 publish snapshot 不一致时显示待重建，失败时保留上一版有效交付。最新 current
  audited Run 只作为折叠的可选信息，不迁移旧 Run，也不把 spawn receipt 当作 MP4 完成。
- 删除矩阵只在隔离副本验证，不删除真实作品。
- 用户明确授权后，`project:delete` 可按一个、多个或全部 storyId 删除完整本地生产数据并重建
  Registry/Catalog；配置页只在完整 Project ID 二次确认后复用同一删除器。删除与 Project 配置、
  production start、project build、audited delivery build 共享 repository operation lock，并在源码消失前先发布安全 Registry；
  core、其他 Project、private config 与 `public/voice_profile/` 不进入删除集合。
- 新能力先留 project-local；只有 fingerprint-bound proposal 与用户明确批准后才 promotion。
- 平台发布、账号、网络、密钥、主观审美 gate 和 detached render monitoring 是独立未来范围。
