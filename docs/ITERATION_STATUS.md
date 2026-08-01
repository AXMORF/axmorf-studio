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
- 已批准从 M1 合同内核、Narrative Baseline、视觉阶段到发布收口的分阶段 Roadmap；
  当前下一步是单独编写和审阅 M1 实施计划。

## 尚未完成

- `VideoBrief`、`StorySpec`、`NarrationSpec`、`RenderSpec`、封存旁白与 SemanticTiming
  合同；
- `NarrativeCore`、顶层 CaptionLayer 与透明视觉输出边界；
- generated static ProjectRegistry、`lazyComponent` 按需加载与不依赖 Scene 的 Story
  Composition 注册；
- `StoryCheck`、`NarrativeCheck`、Narrative Baseline preview/render 与主链 fingerprint
  失效传播；
- `ScenePackage`、资源目录和 promotion 合同；
- `StoryVisualTrack`、Scene 级静态 renderer registry、hard cut 与等时长 overlay；
- 统一资源目录生成与查询；
- 真实 VoxCPM `ttsChunks → measured audio → CaptionCue → complete audio` 工具链；
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

以上确定性执行相关内容当前均为目标设计，不能表述为已有 CLI 或 runtime 能力。

## 下一里程碑

先用一个全新真实主题只完成 Scene 外部的叙事主链：

```text
VideoBrief
→ StorySpec + NarrationSpec + RenderSpec
→ StoryBeat + authored ttsChunks
→ StoryCheck
→ 真实 VoxCPM 逐 chunk 生成
→ 实测、checksum、fingerprint 与封存
→ SemanticTiming + CaptionCue + complete narration audio
→ NarrativeCore
→ Generated Static ProjectRegistry + lazy-loaded Composition
→ Narrative Baseline
→ AutoCheck
→ NarrativeCheck
→ Baseline Preview / Render
```

当前里程碑不实现 SceneVisualPlan、ShotPlan、ScenePackage、Scene renderer、
StoryVisualTrack、视觉资产查询、SoundDesignTrack 或 GlobalVisualLayers。Narrative Baseline
闭环和失效规则通过真实主题验证后，才开始视觉表达设计；在第二个不同主题验证之前，
不提取新的共享能力。
后续里程碑顺序、阶段排除项和完成门槛见 [ROADMAP.md](ROADMAP.md)。

## 已知基础依赖问题

`npm audit --omit=dev` 当前报告 Remotion CLI 的 webpack 依赖链中
`fast-uri@3.1.2` 有一项 high advisory；当前 registry 尚无 advisory 要求的修复版本。
它不影响本次 typecheck、lint、bundle 与 Composition listing，后续升级依赖时复查。
