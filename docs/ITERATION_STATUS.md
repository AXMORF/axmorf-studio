# 当前实现状态

> 更新日期：2026-08-01

## 已完成

- 独立 Git 与 Remotion/TypeScript 工程初始化；
- 宿主机 Node/npm 工作流；
- 从原项目已提交版本白名单迁入共享 Remotion 能力；
- `CapabilityGallery` 最小启动 Composition；
- 规范目录、最终目标、外部生产流程、带节点责任标注的结构图、Scene 级 renderer 边界、
  Composition 的“底层能力组合 + 四个强语义聚合 + 显式装配插槽”边界、确定性
  执行设计、名词、审核模型与迁移清单。
- `VideoBrief`、`StorySpec`、`NarrationSpec`、`RenderSpec`、`StoryBeat`、authored `ttsChunks`
  与显式停顿的严格 v1 数据合同；
- `sha256-canonical-json-v1`、Story/generation/sealed/timing 分层 fingerprint 与失效传播；
- `SealedNarrationManifest` 元数据合同和聚合 stale-artifact 校验；
- 基于累计 PCM sample-frame、`BigInt` 与 `pcm-cumulative-ceil-v1` 的 `SemanticTiming`、
  `CaptionCue` 和 StoryBeat 绝对帧范围；
- M1 合同、非法输入、权威时间示例与失效矩阵的 Node 单元测试；
- `StoryCheck` 严格报告合同、一个 `controllable-clone` voice profile adapter，以及仓库外
  私有 VoxCPM 配置边界；
- `gps-relativity` 十个 authored chunks 的真实 VoxCPM 逐 chunk 生成、checksum-verified
  candidate/measured resume 和 fail-closed 部分成功；
- host FFmpeg 48 kHz/mono/s16le 规范化、Node 整数 sample-frame 测量、300/400 ms 显式
  停顿、完整 WAV BigInt 拼接和 checksum；
- content-addressed immutable narration directory、active manifest/timing 原子写入、lock、
  identical-seal reuse 与精确 `--supersede` compare-and-swap；
- 真实 file-backed `narration:check`、十个 CaptionCues、恢复指南和脱敏 M2 验收证据；
- 已批准从 M1 合同内核、Narrative Baseline、视觉阶段到发布收口的分阶段 Roadmap，M1、
  M2 已完成。

## 尚未完成

- `NarrativeCore`、顶层 CaptionLayer 与透明视觉输出边界；
- generated static ProjectRegistry、`lazyComponent` 按需加载与不依赖 Scene 的 Story
  Composition 注册；
- `NarrativeCheck`、Narrative Baseline preview/render 与 M1 之后的主链 fingerprint；
- `ScenePackage`、资源目录和 promotion 合同；
- `StoryVisualTrack`、Scene 级静态 renderer registry、hard cut 与等时长 overlay；
- 统一资源目录生成与查询；
- SceneVisualPlan/ShotPlan 独立数据合同、选材查询 CLI 与 composition-local Scene
  renderer scaffold；
- VisualCoverageMap、fallback 状态与 release gate；
- Story 级 sound/global layers 完整装配；
- Scene/Story 分层 fingerprint 与失效传播；
- 真实新主题的端到端生产证明；
- 资源目录的预览图、适用限制、画幅和 render cost 元数据；
- 双 Scene overlap transition handles 模型；
- 封面与发布工具；
- 新的 Agent skills。

以上未完成项仍是目标设计，不能表述为已有 CLI 或 runtime 能力。M2 已为
`gps-relativity` 生成、测量并封存真实音频，但没有因此实现 NarrativeCore、Composition、
Scene 或任何预览/渲染能力。

## 下一里程碑

下一步只编写并审阅 M3 实施计划；M3 将在不依赖 Scene 的前提下消费 M2 已封存产物：

```text
M2 sealed narration + SemanticTiming
→ NarrativeCore + NarrationAudioTrack + CaptionLayer
→ generated static ProjectRegistry
→ lazy-loaded Story Composition
→ Narrative Baseline preview / render
```

M3 开始前必须另行审阅实施计划；当前没有开始 NarrativeCore、ProjectRegistry、
Composition、SceneVisualPlan、ShotPlan、ScenePackage、Scene renderer、StoryVisualTrack、
视觉资产查询、SoundDesignTrack 或 GlobalVisualLayers。
在第二个不同主题验证之前，不提取新的共享能力。
后续里程碑顺序、阶段排除项和完成门槛见 [ROADMAP.md](ROADMAP.md)。

## 已知基础依赖问题

`npm audit --omit=dev` 当前报告 Remotion CLI 的 webpack 依赖链中
`fast-uri@3.1.2` 有一项 high advisory；当前 registry 尚无 advisory 要求的修复版本。
它不影响本次 typecheck、lint、bundle 与 Composition listing，后续升级依赖时复查。
