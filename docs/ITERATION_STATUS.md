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
- 已批准从 M1 合同内核、Narrative Baseline、视觉阶段到发布收口的分阶段 Roadmap，M1–M4
  已完成。

## 尚未完成

- NarrativeCheck 和主观 Story、旁白、字幕、整体叙事节奏审核；
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

以上未完成项仍是目标设计，不能表述为已有 CLI 或 runtime 能力。M4 已为
`gps-relativity` 实现 Narrative Baseline 的纯脚本机械验证闭环，但没有因此实现
NarrativeCheck、Scene、资源目录或任何可选增强轨。

## 下一里程碑

M4 已完成并通过 Gate A 的机械条件：

```text
M3 Narrative Baseline + fingerprints + evidence
→ project:check --level narrative
→ strict persisted AutoCheck + read-only drift gate
→ isolated upstream/artifact invalidation proof
```

下一步只单独编写并审阅 M5 视觉阶段规格；当前没有开始 NarrativeCheck、SceneVisualPlan、
ShotPlan、ScenePackage、Scene renderer、StoryVisualTrack、视觉资产查询、SoundDesignTrack 或
GlobalVisualLayers，也没有实现 `final` level、FinalPreviewApproval 或发布流程。
在第二个不同主题验证之前，不提取新的共享能力。
后续里程碑顺序、阶段排除项和完成门槛见 [ROADMAP.md](ROADMAP.md)。

## 已知基础依赖问题

`npm audit --omit=dev` 当前报告 Remotion CLI 的 webpack 依赖链中
`fast-uri@3.1.2` 有一项 high advisory；当前 registry 尚无 advisory 要求的修复版本。
它不影响本次 typecheck、lint、bundle 与 Composition listing，后续升级依赖时复查。
