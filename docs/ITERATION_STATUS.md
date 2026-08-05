# 当前实现状态

> 更新日期：2026-08-05

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
- `StoryCheck` 严格报告合同、一个 `controllable-clone` voice profile adapter，以及默认
  Git-ignored `voxcpm/voxcpm.private.json`、可选环境变量覆盖的私有 VoxCPM 配置边界；
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
  checksum/license/attribution/allowed-use/blocked policy，以及 22 条当前条目的稳定生成、查询和
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
  M1–M9.5 已完成；
- `gps-relativity` 项目级 VisualStyleSpec、五个 project-authored PCM Scene cue、五份 current
  SceneTaskInput 与五个正式 composition-local Scene renderer；
- 五个正式 ScenePackage、全 ready SceneCoverageMap、五入口 literal RendererRegistry、两类
  runtime projection，以及 GPS Composition 中视觉、局部声音、旁白和顶层字幕的真实叠加；
- 15 张真实 Story still、5×3 contact sheet、完整 1731 帧正常速度 H.264/AAC review、批量
  SceneVisualCheck/SceneSoundCheck/连续性记录、M7 evidence receipt 与 passing final report。
- M8 strict GlobalSound/GlobalVisual/FinalAssembly/FinalPreview contracts、保留 M7
  SoundDesignProjection identity 的 FinalSoundProjection、两条全长 project-authored PCM 全局
  音频、固定 frame-driven ducking 和 project-local GlobalVisualLayers；
- 24-entry project assembly Catalog、四槽位 CompositionAssembly、固定 z-order/mix-order、
  26 张代表 still、7×4 contact sheet、完整 1731 帧最终 MP4、ffprobe/完整解码/响度/
  true-peak/声道/ducking evidence 与四组批量 Agent review；
- 真实用户 FinalPreviewApproval 已绑定 exact preview checksum
  `sha256:d0473bc9ff74b46898c5988b99ff4690b5412a4dbd1508508d3c4a73c63d7036`、evidence
  `sha256:2141ce8b0f15622437d27c2921cde8d32236e5bf17de5da2e815a8344ded8667`
  和 FinalAssembly
  `sha256:917f1601b9403316f42f58f95a3033720162883d5e77e542390ca8803388655b`；
- passing `final-mechanical-check-v2` 15 项固定报告，report fingerprint
  `sha256:d944a88c2a4038447ba0d28b68d93c822d6ededf84e106427786b64525e42533`，以及完整
  fail-closed matrix、顶层 `npm run check` M7/M8 read-only gates。
- `product-comic-vertical` 第二主题：9:16 十 Beat/十 ScenePackage 漫画作品、high-fidelity
  clone 封存旁白、104/161/161 Shotcraft inventory/coverage、一个 exact localized demo、十个
  Scene-local cue、全片 global sound 与 project-local GlobalVisualLayers；
- 完整 5116 帧 MP4、45 张 review still、正常速度/移动端/技术 evidence，以及绑定 preview
  `sha256:c70a25a898abe828e90664b061e2e18840420099bb82bbe33b49357642f05b30`、evidence
  `sha256:d0e5a1ed1d78e166f9938881c577ad75247d64874b20be72ad17c5223786c514` 和 FinalAssembly
  `sha256:47401e3499122f89e4eeb69b16b333101e793de223a19e4214540d69e599acb2` 的真实用户批准；
- M9 passing 15 项 final-v2 report
  `sha256:8a52e146c2edeb422a77136707a35c54fa9e5e787b0bcdd35e95b0650b8d41b2`、42-case
  fail-closed matrix、四类泛化报告和三个 `proposal-only` promotion candidates；GPS 受保护
  路径保持零差异，未执行 promotion。
- M9.5 strict `ProductionRequirementsFreeze`、append-only run event ledger、generated state
  projection、结构化脱敏 ProductionError、固定 `production:start/status/narrative` CLI；
- StoryResourcePool、SceneProductionBrief、逐 meaningId SceneAssignment、独占路径、deadline、
  Scene success/failure result contracts 与固定 submit/fail writer；
- single-writer central watcher 对 waiting/success/expected/unexpected failure、timeout、malformed、
  stale、unknown result 和共享输入漂移的 fail-closed 处理；
- 无 BGM、跨 Scene ambience、ducking、GlobalVisualLayers 或 Agent Scene 审美 gate 的
  PreviewAssembly、MP4/still/contact sheet 机械 evidence、preview checker 与
  `preview-ready / awaiting-user-preview` 终点；
- fake provider/process/clock/scheduler 的两 Scene orchestration proof、失败矩阵、bytes/mtime
  幂等验证，以及 GPS/ProductComicVertical current final artifacts checksum 保护断言。
- `rounded-airplane-windows` 首次真实生产试跑：真实 VoxCPM 封存旁白、两个 project-local Scene、
  append-only watcher、1080×1920/30 fps/1102-frame H.264/AAC Preview、8/8 mechanical checks，
  最终到达 `preview-ready / awaiting-user-preview`；四个真实编排缺陷均经 Red/Green、独立修复
  commit 和 immutable replacement 收口，正式 GPS/ProductComicVertical 十个保护产物零差异。

## 尚未完成

- NarrativeCheck 和主观 Story、旁白、字幕、整体叙事节奏审核；
- 已提案 capability 的明确授权与实际 promotion；
- 资源目录的预览图、适用限制、画幅和 render cost 元数据；
- 双 Scene overlap transition handles 模型；
- 封面与发布工具；
- 新的 Agent skills。

以上未完成项仍是目标设计，不能表述为已有产物。M9.5 只实现到机械
`preview-ready / awaiting-user-preview`；没有实现用户预览后的 Scene 修改循环，也没有创建
新作品 approval。NarrativeCheck、任何 promotion、发布或 M10 都没有实现。

## 下一里程碑

M1–M9.5 已完成；GPS 与产品漫画两条正式证据链保持 passing v2：

```text
VisualStyleSpec + 22-entry ResourceCatalog + five frozen SceneTaskInputs
→ ScenePackage + SceneCoverageMap + RendererRegistry
→ StoryVisualTrack + Scene-local SoundDesignTrack
→ GPS Composition + batch Scene review + normal-speed evidence
→ GlobalSoundPlan + FinalSoundProjection + GlobalVisualLayers
→ FinalAssembly + full-speed final preview + technical/review evidence
→ exact user FinalPreviewApproval
→ passing final-mechanical-check-v2
```

M9 产品漫画链在同一主合同/runtime 上完成十个 Scene、FinalAssembly、current preview
evidence、用户批准和 final-v2；current approval fingerprint 为
`sha256:836a7f16ddba659a69a6c28a4a9d591c31b64b0d8cdf4e35708226006661a66b`。M9.5 随后完成固定
生产编排合同、CLI、Scene watcher 和机械 Preview，但没有修改两条正式证据链。Roadmap 下一
项为 M10 发布收口；M10 不会由本次 closeout 自动开始。

批准规格、实施计划和实证分别见
[M5 ScenePackage 视听制作规格](superpowers/plans/2026-08-02-m5-scene-package-production-specification.md)、
[M6 Scene Runtime 实施计划](superpowers/plans/2026-08-02-m6-scene-runtime-implementation-plan.md) 和
[M6 Scene Runtime Foundation Evidence](evidence/2026-08-02-m6-scene-runtime-foundation.md)，以及
[M7 GPS Scene Production Evidence](evidence/2026-08-03-gps-relativity-m7-scene-production.md)。
M8 计划与实证见
[M8 Final Assembly 实施计划](superpowers/plans/2026-08-03-m8-global-sound-visual-final-assembly-implementation-plan.md) 和
[GPS Relativity M8 Final Assembly Evidence](evidence/m8-gps-relativity-final-assembly.md)。
M9 计划与实证见
[M9 Product Comic Vertical Generalization Plan](superpowers/plans/2026-08-03-m9-product-comic-vertical-generalization-plan.md) 和
[M9 Product Comic Vertical Generalization Evidence](evidence/m9-product-comic-vertical-generalization.md)。
M9.5 实施计划和操作说明见
[M9.5 Contract-driven Production Orchestration Plan](superpowers/plans/2026-08-04-m9-5-contract-driven-production-orchestration-plan.md) 与
[Production Orchestration](PRODUCTION_ORCHESTRATION.md)；首次真实试跑见
[M9.5 Production Trial and Hardening Evidence](evidence/2026-08-05-m9-5-production-trial-and-hardening.md)。
三个 promotion candidates 仍只存在于 proposal；明确批准前不提取共享能力。
后续里程碑顺序、阶段排除项和完成门槛见 [ROADMAP.md](ROADMAP.md)。

## 已知基础依赖问题

`npm audit --omit=dev` 当前报告 Remotion CLI 的 webpack 依赖链中
`fast-uri@3.1.2` 有一项 high advisory；当前 registry 尚无 advisory 要求的修复版本。
它不影响本次 typecheck、lint、bundle 与 Composition listing，后续升级依赖时复查。
