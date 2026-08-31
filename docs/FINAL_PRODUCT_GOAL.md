# 最终产品目标

> 文档类型：产品目标 authority
>
> 当前实现事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 1. 产品结论

AXMORF Studio 通过 npm creator 建立一个用户自有 Workspace，再把其中可审计的 Project authoring
source 生产为一个 Composition 和一个本地 current delivery。runtime/CLI、contracts、Remotion exports 与
预构建 Web 来自 npm package；用户 Project、配置、媒体、artifacts 和 Delivery 只属于 Workspace。产品不含
Desktop、Electron、Runtime Pack 或 `rsp` control plane。唯一主链是：

在确定性主链之前，Root 可从“当前 Agent 实际 callable 的 tools”投影外部图片 MCP 插槽。该能力存在时才
在本地 Catalog 缺少合适素材后 acquire，并经 `project:asset:import` 准入；不存在时整个阶段无错误、无占位
地省略。这个可选 authoring 输入通道不属于 ProductionRevision/Task DAG，也不向 child/runtime 暴露 MCP。

1. 冻结 ProductionRevision；
2. 建立 content-addressed Task DAG；
3. 为 dirty Agent tasks 冻结 immutable TaskExecutionContract，并复用有效 ArtifactAttestation；
4. 每个 executor 经 attempt-bound zero-write bind 后，只通过 verified capability 执行 exact contract；
5. Root 完成 inline execution 或 bounded child admission 后挂起，由 attempt-bound fixed continuation 处理全部 task terminal；
6. 全部成功后 fixed convergence 原子物化 live 或 isolated candidate production scope；
7. 同步生成并机械复验 exact four-file delivery；candidate scope 随后才尝试受控 current promotion。

ExecutionAttempt 只记录一次执行诊断。它的失败或丢失不拥有产物、不改变 content identity，也不阻止
后续 attempt 复用已经验证的 artifact。

修改现有 Project 不是 live in-place edit：strict revision input 必须绑定 exact current Revision 与已复验
four-file Delivery，先在隔离 candidate 中走同一 production 主链。candidate Delivery 完整后才受控提升 current
source/public/narration/delivery 四个 Project-owned roots；失败完整 rollback，且 promotion 可独立幂等重试。

## 2. 必须长期保持的产品不变量

- 一 Story 一个 Composition；一 StoryBeat 一个 meaningId、Scene 和完成后的 ScenePackage。
- narrated 与 silent Scene 是 discriminated contract；silent Scene 只在时间线首尾且没有 TTS、CaptionCue
  或 sealed narration segment。
- Agent-authored `ttsChunks` 不被工具改写；sealed PCM sample measurement 和累计 sample frame 是时间
  authority。
- Scene root 透明；Composition 顶层 exactly once owns safe-area-local SceneViewport、captions、narration 和
  GlobalVisual。GlobalVisual base 覆盖完整 Composition；decoration 仅覆盖首个至末个 narrated Scene 的连续
  窗口，不进入 silent boundary。Scene 只在本地 viewport 内布局，不感知 full-frame inset。
- template-copy Scene 是 Project-local immutable instance，由 fixed task 产出，不派发 Agent。
- `project:create` 同事务冻结创建前其他 Project 的完整 Scene TS/TSX source graph；旧 Project 缺失 baseline
  时只能由用户显式运行零 provider、持 repository lock 的 originality freeze，production 不静默补空。
- originality baseline fingerprint/context 只进入 `scene-owner` TaskRevision；template-copy 豁免。Scene validator
  拒绝 frozen historical graph，converge 在物化前拒绝同 Revision exact 或 token-normalized duplicate。
- `project:create` 与 revision validate/create 在任何 staging/lock mutation 前执行同一 structured authoring
  validation；每个 authored `ttsChunk` 最多 72 caption display half-units，超限由 Agent 改写或按语义拆分，
  不能降低合同。
- Scene、GlobalVisual、Cover authoring 相互隔离。每个 Agent 只写自己的 task workspace。
- TaskExecutionContract 是 attempt-neutral immutable input，描述 purpose/workflow/constraints、component
  signatures、exact outputs 与 Agent/fixed ownership；不嵌入 transport、binding、failure 或 command。
- subagents 只在当前宿主为本次 production 验证 `shared-workspace` 或 `controller-io` 时启用；transport 不持久化、
  不进入任何 content identity。controller-io 只通过 strict bound file-read/file-write 接触允许文件。
- Scene authoring 使用 repository-local `remotion-best-practices`，但 TaskSpec/contracts/validators 始终
  拥有更高 authority。
- render runtime 使用静态 registry 和 repository-local media，不调用网络、Agent、Skill、MCP 或目录扫描。
- private config 和 voice profile 不进入 identity、artifact、日志、UI 或 Git。
- candidateId、隔离路径和 promotion 状态只属于 routing/diagnostic plane，不进入 ProductionRevision、
  TaskRevision、ArtifactAttestation 或 DeliveryBuildId。

## 3. 内容寻址生产目标

ProductionRevision 绑定 Story/Narration/Render/VisualStyle/PublishingIntent、sound、authoring requirements、
readability、Scene/GlobalVisual briefs、template instances、selected resource bytes、narration generation
identity 与相关 policy fingerprints。它不含 Agent output 或执行过程。

每个 ProducerTaskSpec 具有最小 complete input、dependency artifacts、declared read/output set 与 task-kind
validator version。TaskRevision 只随真正输入变化；单 Scene、Cover、TTS chunk 或 validator 变化应精确
失效目标 task 与必要 downstream，而不是让无关工作重做。

Agent TaskRevision 还绑定 canonical TaskExecutionContract fingerprint。采用新 contract 会让既有 Agent task
artifact 一次失效以获得新执行语义，但不改变 ProductionRevision，也绝不改写已有 current delivery。

ArtifactAttestation 绑定 TaskRevision、dependencies、validator policy 和 exact sorted output manifest。
Artifact Store 命中必须重新验证路径、文件类型、size 和 checksum。相同 identity/bytes 是 no-op；相同
identity/different bytes 是确定性冲突。

## 4. 交付目标

converge 仅在全部 required artifacts 有效时物化 Project，并在物化后按 attestation 复验 live bytes。
随后同步生成：

```text
deliveries/<storyId>/video.mp4
deliveries/<storyId>/cover-4x3.png
deliveries/<storyId>/cover-3x4.png
deliveries/<storyId>/publish.json
```

DeliveryBuildId 绑定 revisionId、artifact set、Composition metadata 与 build policy，不绑定 attempt。
current delivery 只有在 exact 文件集合、checksums、H.264/AAC/channels、尺寸、fps/frame count、PNG 与 EOF
decode 全部通过后才替换。相同完整 identity 是只读 no-op。

## 5. 用户体验目标

- 用户只需复制 public README 的一句 Agent prompt：打开项目 URL，按照最新 README 在指定本地路径完成 Workspace 搭建
  与可用性验收，并停止在视频生产之前。环境、安装和验证细节只由 README 及其当前引用拥有，不在 prompt 中复制。
  Workspace ready 后，用户才通过 generated README 的视频 prompt 提交具体创作需求。
- settings 列出 current source Projects，展示 Revision、task reused/dirty/blocked、latest attempt diagnostic
  和 current four-file delivery，不把 output-only 目录伪装成 Project。
- 局部修改只重做真正 dirty 的创作或媒体。terminal failed attempt 永不重开；显式 read-only/zero-provider
  recover inspection 后，same-Revision reissue 复用有效 TTS/Agent artifacts 与合法 drafts、创建 fresh bindings，
  且不要求 current delivery。
- 用户修改现有作品时先获得机器可读 current context，再提交 strict patch；上一 current video/Covers 在 candidate
  生产或 promotion 失败时持续可用。production 成功但 promotion 失败只重试 promotion，不重开生产 attempt。
- Project 删除使用完整 storyId 确认并清理该 Project 的全部 ownership roots，同时保护其他 Project、
  core、shared media、private config 与 voice profiles。
- 每个完成状态都有机械证据；聊天成功、Agent 自评、文件存在或进程启动都不代表交付完成。
- Agent 执行模式按用户提示词明确字段、配置页、内置 `inline` 默认逐级解析；全新 scaffolded Workspace 单 Agent 可用，
  具备 bounded runtime-native children 和 verified transport 的宿主可显式选择最多四个 subagents；
  策略不进入 production identity。continuation 启动后 Root 不监督；failure 直接终止，all-success 只由持有
  exact-attempt one-shot claim 的 fixed continuation 触发一次 converge；缺失终态受 attempt 创建起一小时总
  deadline 约束。

## 6. 非目标

不实现平台上传、账号、远程队列/Artifact Store、常驻 Agent scheduler、child identity 持久化、主观审美
gate、自动 capability promotion、Docker 或新的 TTS Gateway。
