# 当前实现状态

> 更新日期：2026-07-31

## 已完成

- 独立 Git 与 Remotion/TypeScript 工程初始化；
- 宿主机 Node/npm 工作流；
- 从原项目已提交版本白名单迁入共享 Remotion 能力；
- `CapabilityGallery` 最小启动 Composition；
- 规范目录、最终目标、结构、名词、审核模型与迁移清单。

## 尚未完成

- `StorySpec`、`ScenePackage`、资源目录和 promotion 合同；
- `NarrativeCore`、顶层 CaptionLayer、BaseCanvas；
- `StoryVisualTrack`、静态 renderer registry、hard cut 与等时长 overlay；
- 统一资源目录生成与查询；
- 真实 VoxCPM `ttsChunks → measured audio → CaptionCue → complete audio` 工具链；
- SceneVisualPlan 独立数据合同、选材查询 CLI 与 composition-local scaffold；
- VisualCoverageMap、fallback 状态与 release gate；
- Story 级 sound/global layers 完整装配；
- Scene/Story 分层 fingerprint 与失效传播；
- 真实新主题的端到端生产证明；
- 资源目录的预览图、适用限制、画幅和 render cost 元数据；
- 双 Scene overlap transition handles 模型；
- 封面与发布工具。
- 新的 Agent skills。

## 下一里程碑

先用一个全新真实主题完成：

```text
StoryBeat/ttsChunks
→ 实测 NarrativeCore
→ Narrative Baseline
→ composition-local ScenePackage
→ StoryVisualTrack
→ 简化审核
→ 完整 Preview / Render
```

在第二个不同主题验证之前，不提取新的共享能力。

## 已知基础依赖问题

`npm audit --omit=dev` 当前报告 Remotion CLI 的 webpack 依赖链中
`fast-uri@3.1.2` 有一项 high advisory；当前 registry 尚无 advisory 要求的修复版本。
它不影响本次 typecheck、lint、bundle 与 Composition listing，后续升级依赖时复查。
