# 最终产品目标

> 文档类型：产品目标 authority
>
> 当前实现事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 1. 产品结论

Remotion Story Producer 把一份可审计的 Project authoring source 生产为一个可复验的 Composition，
并按 resolved Delivery policy 可选生成本地 current delivery。唯一主链是：

在确定性主链之前，Root 可从“当前 Agent 实际 callable 的 tools”投影外部图片 MCP 插槽。该能力存在时才
在本地 Catalog 缺少合适素材后 acquire，并经 `project:asset:import` 准入；不存在时整个阶段无错误、无占位
地省略。这个可选 authoring 输入通道不属于 ProductionRevision/Task DAG，也不向 child/runtime 暴露 MCP。

1. 冻结 ProductionRevision；
2. 建立 content-addressed Task DAG；
3. 复用有效 ArtifactAttestation，只委派 dirty Agent tasks；
4. Root 完成 inline execution 或 bounded child admission 后挂起，由 attempt-bound fixed continuation 处理全部 task terminal；
5. 全部成功后 fixed convergence 原子物化并复验 current Project，形成 `source-current`；
6. `manual` 停在 source-ready，`automatic` 或用户显式点击再进入 fixed DeliveryBuild，机械复验并提升 exact
   four-file delivery。

ExecutionAttempt 只记录一次执行诊断。它的失败或丢失不拥有产物、不改变 content identity，也不阻止
后续 attempt 复用已经验证的 artifact。

## 2. 必须长期保持的产品不变量

- 一 Story 一个 Composition；一 StoryBeat 一个 meaningId、Scene 和完成后的 ScenePackage。
- narrated 与 silent Scene 是 discriminated contract；silent Scene 只在时间线首尾且没有 TTS、CaptionCue
  或 sealed narration segment。
- Agent-authored `ttsChunks` 不被工具改写；sealed PCM sample measurement 和累计 sample frame 是时间
  authority。
- Scene root 透明；Composition 顶层 exactly once owns safe-area-local SceneViewport、captions、narration 和
  GlobalVisual。Scene 只在本地 viewport 内布局，不感知 full-frame inset。
- template-copy Scene 是 Project-local immutable instance，由 fixed task 产出，不派发 Agent。
- Scene、GlobalVisual、Cover authoring 相互隔离。每个 Agent 只写自己的 task workspace。
- Scene authoring 使用 repository-local `remotion-best-practices`，但 TaskSpec/contracts/validators 始终
  拥有更高 authority。
- render runtime 使用静态 registry 和 repository-local media，不调用网络、Agent、Skill、MCP 或目录扫描。
- private config 和 voice profile 不进入 identity、artifact、日志、UI 或 Git。

## 3. 内容寻址生产目标

ProductionRevision 绑定 Story/Narration/Render/VisualStyle/PublishingIntent、sound、authoring requirements、
readability、Scene/GlobalVisual briefs、template instances、selected resource bytes、narration generation
identity 与相关 policy fingerprints。它不含 Agent output 或执行过程。

每个 ProducerTaskSpec 具有最小 complete input、dependency artifacts、declared read/output set 与 task-kind
validator version。TaskRevision 只随真正输入变化；单 Scene、Cover、TTS chunk 或 validator 变化应精确
失效目标 task 与必要 downstream，而不是让无关工作重做。

ArtifactAttestation 绑定 TaskRevision、dependencies、validator policy 和 exact sorted output manifest。
Artifact Store 命中必须重新验证路径、文件类型、size 和 checksum。相同 identity/bytes 是 no-op；相同
identity/different bytes 是确定性冲突。

## 4. Source 与交付目标

converge 仅在全部 required artifacts 有效时物化 Project，并在物化后按 attestation 复验 live bytes。
复验通过即形成 `source-current`；它证明 Remotion source/media 可渲染，不代表 MP4 已完成或可在 Preview Player
播放。默认 `manual` 不继续
render，`automatic` 或用户显式触发后才由同一 fixed DeliveryBuild 生成：

```text
deliveries/<storyId>/video.mp4
deliveries/<storyId>/cover-4x3.png
deliveries/<storyId>/cover-3x4.png
deliveries/<storyId>/publish.json
```

DeliveryBuildId 绑定 revisionId、artifact set、Composition metadata 与 build policy，不绑定 attempt。
current delivery 只有在 exact 文件集合、checksums、H.264/AAC/channels、尺寸、fps/frame count、PNG 与 EOF
decode 全部通过后才替换。相同完整 identity 是只读 no-op。当前 repository 仍把 converge 与同步 Delivery
绑定；切换到上述目标必须是显式 contract clean-break。

## 5. 用户体验目标

- App Settings 列出 current source Projects，展示 Revision、task reused/dirty/blocked、latest attempt diagnostic、
  `source-current` 和 current/stale Delivery，不把 output-only 目录伪装成 Project。只有 verified current Delivery
  进入 Preview Catalog；manual/source-current 没有视频时明确显示不可播放。
- 局部修改只重做真正 dirty 的创作或媒体；失败后继续不重新消耗已经验证的 TTS/Agent/Render 工作。
- Project 删除使用完整 storyId 确认并清理该 Project 的全部 ownership roots，同时保护其他 Project、
  core、shared media、private config 与 voice profiles。
- 每个完成状态都有机械证据；聊天成功、Agent 自评、文件存在或进程启动都不代表交付完成。
- Agent 执行模式按用户提示词明确字段、配置页、内置 `inline` 默认逐级解析；全新 checkout 单 Agent 可用，
  具备 runtime-native children 的宿主可显式选择最多四个 subagents；
  策略不进入 production identity。continuation 启动后 Root 不监督；failure 直接终止，all-success 只由持有
  exact-attempt one-shot claim 的 fixed continuation 触发一次 converge；缺失终态受 attempt 创建起一小时总
  deadline 约束。

## 6. Desktop App 产品形态

面向终端用户的目标分发形态是本地 Desktop App：bundled Preview Player、Project selector 与只读时间轴是主界面，
现有 settings 演进为 App Settings，用户自己的 Agent 通过 workspace-local Skill 和稳定 CLI/IPC 完成创作。App
不启动 Remotion Studio/Settings Web service，不内置、不托管也不调度
Agent；安装目录与用户选择的单一 Workspace Root 分离，Workspace 内部使用固定目录，源码仓库不是普通用户的运行入口。详细目标见
[Desktop App 产品架构](DESKTOP_APP_PRODUCT.md)，macOS v1 的维护基线与公开发行门槛见
[Desktop App macOS 维护与发行](DESKTOP_APP_MACOS_MAINTENANCE.md)。

这属于目标设计而非当前实现；当前事实仍只由 [ITERATION_STATUS.md](ITERATION_STATUS.md) 定义。

## 7. 非目标

不实现平台上传、账号、远程队列/Artifact Store、常驻 Agent scheduler、child identity 持久化、主观审美
gate、自动 capability promotion、Docker 或新的 TTS Gateway。
