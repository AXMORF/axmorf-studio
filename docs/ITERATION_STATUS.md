# 当前实现状态

> 更新日期：2026-08-02

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
- 单一 complete WAV、`playbackRate=1` 的 `NarrationAudioTrack`，只消费绝对 CaptionCue、固定
  40px 字号并响应式解析最大宽度/安全区的顶层 `CaptionLayer`，以及不绘制背景的
  `NarrativeCore`；
- 只含必需 `narrativeCore` 插槽的 `CompositionAssembly` 和 project-local default-export
  `GpsRelativity` Composition；
- 固定一级目录发现、default-export AST 检查、稳定排序、原子生成和 byte drift check 的
  tracked ProjectRegistry；Root 通过字面量 loader 和 `lazyComponent` 注册 Story；
- `CapabilityGallery` 与 `GpsRelativity` 的真实 Composition listing；frame 0 全透明、frame 15
  字幕可见且外部透明的真实 PNG；1731 帧 H.264/AAC 全长 render；
- registry-entry、Narrative Baseline 与 evidence fingerprint 合同、receipt、检查命令和脱敏
  M3 验收证据；
- strict `NarrativeAutoCheckReport` 合同，固定七项作品级聚合检查，默认只读 persisted-report
  drift gate，以及 pass-only、原子、byte-stable 的 `--write-auto-check`；
- 缺失、malformed、unknown field、identity/checksum/registry/media drift 和未知参数的
  fail-closed 行为，失败不覆盖最后一份有效 AutoCheck；
- `gps-relativity` 的真实 AutoCheck 与脱敏 M4 evidence，以及 16 类独立临时副本失效矩阵；
- VisualStyleSpec 与 Scene/Shot/local-frame、SceneTaskInput、SceneVisualPlan、ShotPlan、
  SceneSyncAnchor、SceneSoundPlan 严格合同；
- asset/style/capability/authoring-reference 四类 ResourceCatalog descriptor，逐资产
  checksum/license/attribution/allowed-use/blocked policy，以及 17 条当前条目的稳定生成、查询和
  read-only drift check；
- ExternalReferenceSnapshot immutable commit/index/fingerprint、`video-shotcraft`
  cardId/style-key/card/demo/preview resolver、最小依赖闭包 localizer 与上游/runtime/remote
  import guard；
- `exact-demo-localized`、`inspiration-only`、`empty` 三态 ShotRecipeSelection，以及绑定 lineage、
  准确 demo、本地源码 hash、真实 Renderer/JSX/frame-state、配对证据和 Agent 正常速度 review
  record 的 pass-only ReferenceFidelityReceipt；
- ScenePackage、SceneCoverageMap、完整隔离失效矩阵、composition-local RendererRegistry、
  StoryVisualTrack、固定 Scene-local SoundDesignTrack 投影和显式 CompositionAssembly 插槽；
- `final-mechanical-check-v1` 十项固定机械检查、pass-only 原子 final report writer，以及
  narrative 独立通过、缺少 M7 coverage 时 final fail-closed 的真实 GPS 行为；
- 与正常 ProjectRegistry 隔离的 `M6SceneRuntimeProof`，冻结一个 Shotcraft recipe 的两文件
  本地化闭包，真实 1920x1080/30 fps/120-frame H.264 + 单 AAC Scene-local audio evidence；
- 已批准从 M1 合同内核、Narrative Baseline、Scene foundation 到发布收口的分阶段 Roadmap，
  M1–M6 已完成。

## 尚未完成

- NarrativeCheck 和主观 Story、旁白、字幕、整体叙事节奏审核；
- `gps-relativity` 的 VisualStyleSpec、五个正式 ScenePackage、SceneCoverageMap 与
  composition-local RendererRegistry；
- M7 的正式 Scene authoring、SceneVisualCheck、SceneSoundCheck、连续性批量审核和 Story
  contact sheet/motion evidence；
- promotion 合同与任何新的共享 capability 提取；
- M8 的 GlobalSoundPlan、全局 BGM、跨 Scene ambience、ducking、mastering、
  GlobalVisualLayers 和完整 assembly/approval fingerprint；
- 真实新主题的端到端生产证明；
- 资源目录的预览图、适用限制、画幅和 render cost 元数据；
- 双 Scene overlap transition handles 模型；
- 封面与发布工具；
- 新的 Agent skills。

以上未完成项仍是目标设计，不能表述为已有产物。M6 已实现通用 Scene 合同、工具、runtime
与独立 synthetic proof，但没有因此为 `gps-relativity` 制作正式 Scene，也没有实现主观
NarrativeCheck、M7 Scene 审核或 M8 全局增强。

## 下一里程碑

M1–M6 已完成；M6 foundation 的可重复证据链是：

```text
ResourceCatalog + immutable Shotcraft snapshot/localization/fidelity
→ ScenePackage + SceneCoverageMap + RendererRegistry
→ StoryVisualTrack + Scene-local SoundDesignTrack
→ isolated M6SceneRuntimeProof + final-mechanical-check-v1
```

当前唯一下一步是 M7：只为 `gps-relativity` 的五个 StoryBeat 制作正式 ScenePackage，并按
M6 合同完成 coverage、registry、投影与批量 Scene 审核。GPS 的 narrative level 继续独立
通过；final level 当前因 M7 Scene coverage 缺失而预期失败，不能用 synthetic/fallback
伪装通过。M8 全局声音/视觉、最终创意批准与发布不属于 M7。

批准规格、实施计划和实证分别见
[M5 ScenePackage 视听制作规格](superpowers/plans/2026-08-02-m5-scene-package-production-specification.md)、
[M6 Scene Runtime 实施计划](superpowers/plans/2026-08-02-m6-scene-runtime-implementation-plan.md) 和
[M6 Scene Runtime Foundation Evidence](evidence/2026-08-02-m6-scene-runtime-foundation.md)。
在第二个不同主题验证之前，不提取新的共享能力。
后续里程碑顺序、阶段排除项和完成门槛见 [ROADMAP.md](ROADMAP.md)。

## 已知基础依赖问题

`npm audit --omit=dev` 当前报告 Remotion CLI 的 webpack 依赖链中
`fast-uri@3.1.2` 有一项 high advisory；当前 registry 尚无 advisory 要求的修复版本。
它不影响本次 typecheck、lint、bundle 与 Composition listing，后续升级依赖时复查。
