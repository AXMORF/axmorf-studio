# Remotion Story Producer

一个先把用户内容稳定转化为 Story、已封存旁白、字幕和绝对时间线，再按 StoryBeat 并行
制作内聚画面与局部声音的 ScenePackage，最后投影并装配全局增强轨的 Remotion 视频生产
工程。

M1 已完成 `VideoBrief + StorySpec + NarrationSpec + RenderSpec` 严格合同、canonical
fingerprint 和累计 PCM `SemanticTiming` 纯函数。M2 已用真实 `gps-relativity` Story 完成
StoryCheck、VoxCPM 逐 chunk 生成与续跑、PCM 实测、原子封存、完整旁白和作品级
`SemanticTiming`/`CaptionCue` 产物。M3 已继续实现透明 NarrativeCore、静态 ProjectRegistry、
lazy Story Composition，以及不依赖 Scene 的真实 Narrative Baseline preview/render 和 evidence。
M4 已把 M1–M3 聚合为固定、只读、fail-closed 的作品级机械 AutoCheck，并用隔离副本证明
16 类上游和产物失效传播。

M6 已落地 Scene 制作基础：每个 StoryBeat 对应一个可并行制作的 Scene；每个
ScenePackage 内聚画面、Scene 局部 ambience/SFX 和同步锚点，对 runtime 只暴露一个视觉
renderer 入口并产生一个固定音频贡献。制作时可以从冻结的 `video-shotcraft` 等上游镜头
配方选择参考，但必须把准确 demo 的最小依赖闭包本地化到 Scene，并用来源/适配证据和
保真 receipt 封存；上游仓库、全局 skill 和远程 preview 不进入 runtime。M7 已在真实
`gps-relativity` 上完成五个正式 ScenePackage、全 ready coverage、静态 renderer registry、
真实视觉/局部声音投影、批量 Scene 审核和正常速度 review evidence；五个 Scene 均显式使用
合法 `empty` recipe，没有伪造 Shotcraft fidelity pass。
M8 已在不修改五个 ScenePackage 或 NarrativeCore 的前提下完成 project-local
`GlobalSoundPlan`、原创全片 BGM、跨 Scene ambience、确定性 ducking、
`GlobalVisualLayers`、四槽位装配、完整正常速度最终预览、用户批准和
`final-mechanical-check-v2` 收口。
M9 已用 `product-comic-vertical` 完成第二个真实主题：high-fidelity clone 旁白、9:16 漫画
设计系统、十个独立 ScenePackage、Shotcraft 104/161/161 全量 coverage、一个 exact demo、
完整最终媒体、用户批准、42 类失效矩阵和 passing v2；泛化结论只提出三个 promotion
proposal，没有提升共享能力。
M9.5 已把完整制作要求冻结、Narrative Baseline runner、Story 级候选资源池、逐 Scene 结果
合同、中央 watcher 和无全局增强的机械 Preview 接成固定、fail-closed 的流程。只有
Agent-owned 创作产物允许返工；固定流程在 valid input 下失败表示通用系统缺陷，必须
Red/Green 完善后用新 Run 完整重验，不能 resume/retry 绕过。运行状态由 append-only events、
Scene result contracts 和 current fingerprints 复算；中央脚本是唯一 writer。首次真实
`rounded-airplane-windows` 两 Scene 试跑已在四个 common-flow hardening 后达到
`preview-ready / awaiting-user-preview`；该状态不代表用户批准或发布。

直接生产 skill 默认给每个 meaningId 创建一个独立 owning 子 Agent；子 Agent 先通过不写
immutable result 的 `production:scene:check`，主 Agent 再复检并串行 submit。子 Agent 能力
不可用时在 Scene authoring 前报告 blocker，不静默退回 inline 制作。

此后开始的所有 production 由 `ProductionRequirementsFreeze` v2 冻结同一份、与画幅无关的
`production-readability-v1`：根据 Composition width/height 确定性解析内容/字幕安全区与字号，
并在 provider 前拒绝超出 `caption-display-unit-v1` 预算的 authored `ttsChunks`。策略继续传播到
Scene assignment/package/result 和 watcher 复检；已有 v1 Run、正式视频及其 identity 不迁移、
不回填且仍按原合同读取。

## 当前状态

仓库当前完成基础框架、M1–M4 Narrative Baseline 机械闭环、M6 Scene Runtime foundation、
M7 第一套正式 Scene production、M8 最终装配闭环和 M9 第二主题泛化证明：

- Remotion、React、TypeScript、ESLint 与 Tailwind 基础工程；
- 已迁入 camera、effects、Lottie/媒体、motion、sound、styles、transitions 与
  Remotion primitives；
- `CapabilityGallery`：只用于验证项目可以启动、构建和列出 Composition；
- `VideoBrief`、`StorySpec`、`NarrationSpec`、`RenderSpec`、authored `ttsChunks` 与显式停顿合同；
- canonical serialization、分层 SHA-256 fingerprint、`SealedNarrationManifest` 元数据合同；
- 基于累计整数 sample-frame 和 `BigInt` 的 `SemanticTiming`、1:1 `CaptionCue` 与失效校验；
- Agent-authored、非用户阻塞的 `StoryCheck` 报告合同；
- Git-ignored `voxcpm/voxcpm.private.json` 默认私有配置、可选环境变量覆盖、一个
  `controllable-clone` profile adapter、逐 authored chunk 生成和 checksum/measurement 验证续跑；
- FFmpeg 规范化到 48 kHz/mono/s16le、Node sample-frame 测量、完整 WAV 拼接和
  content-addressed 原子封存；
- `gps-relativity` 的十个真实 chunk、完整旁白、active seal、SemanticTiming、CaptionCue
  与脱敏验收证据；
- `NarrationAudioTrack`、固定 40px 字号并按分辨率/比例解析最大宽度和安全区的顶层
  `CaptionLayer`、不绘制背景的 `NarrativeCore`，以及只含必需 `narrativeCore` 插槽的
  `CompositionAssembly`；
- `GpsRelativity` project-local default-export Composition、generated static ProjectRegistry、
  literal lazy import、`lazyComponent` Root 注册与 byte drift check；
- `CapabilityGallery` + `GpsRelativity` 真实 listing、透明 frame 0/字幕 frame 15 PNG、
  1731 帧 H.264/AAC 全长 render 和 M3 evidence receipt；
- strict `NarrativeAutoCheckReport`、固定七项聚合检查、pass-only 原子写入、默认只读 drift
  gate，以及缺失、malformed、identity/checksum/registry/media drift 的 fail-closed 行为；
- `gps-relativity` 的持久化 AutoCheck、16 类隔离失效矩阵和脱敏 M4 evidence；
- VisualStyleSpec、Scene/Shot/local-frame、SceneTaskInput/VisualPlan/ShotPlan/SyncAnchor/
  SoundPlan、ScenePackage 与 SceneCoverageMap 严格合同和分层 fingerprint；
- 22 条当前 descriptor 的 ResourceCatalog、allowed-use/license/checksum/blocked policy、
  稳定生成/查询/漂移检查；
- 一个冻结 `video-shotcraft` recipe 的 immutable snapshot、card/style-key/demo/preview resolver、
  两文件最小本地化闭包和 pass-only ReferenceFidelityReceipt；
- composition-local RendererRegistry、纯视觉 StoryVisualTrack、固定 Scene-local
  SoundDesignTrack 投影，以及只在真实输入存在时启用的 CompositionAssembly 插槽；
- `project:check --level final` 的十项机械基础和独立 `M6SceneRuntimeProof` 真实 still/render
  evidence；
- `gps-relativity` 的项目级 VisualStyleSpec、五个正式 ScenePackage、全 ready
  SceneCoverageMap、五入口 literal RendererRegistry、StoryVisualTrack 与五个 Scene-local cue；
- 15 张真实 Composition review still、5×3 contact sheet、1731 帧正常速度 H.264/AAC review、
  evidence-bound SceneVisualCheck/SceneSoundCheck/连续性记录和 passing final mechanical report；
- project-local 24-entry assembly Catalog、两条全长 48 kHz PCM 全局音频资产、
  `GlobalSoundPlan`/`FinalSoundProjection`、frame-driven `GlobalVisualLayers` 和固定
  scene/global/caption z-order、narration/scene ambience/BGM mix order；
- 26 张代表 still、7×4 contact sheet、完整 1731 帧最终 MP4、ffprobe/完整解码/响度/
  true-peak/ducking evidence、GlobalSound/GlobalVisual/连续性/正常速度批量 review；
- 与 exact preview checksum、evidence fingerprint 和 FinalAssembly fingerprint 绑定的真实
  `FinalPreviewApproval`，以及包含 15 个固定检查的 passing `final-mechanical-check-v2`；
- `ProductComicVertical` 的十 Beat/十 ScenePackage 9:16 漫画作品、high-fidelity clone 封存
  旁白、十个 Scene-local cue、两条全片 global PCM 和 project-local `GlobalVisualLayers`；
- 冻结 Shotcraft commit 的 104 card、161 style/demo、161 preview 全量 inventory/coverage，
  以及 `draw-svg-trace` exact localization、Renderer/frame binding 和正常速度 fidelity evidence；
- 完整 5116 帧 H.264/AAC 最终预览、45 张 review still、技术/批量 review evidence、真实
  用户批准、15 项 passing v2 final report 和 42-case fail-closed matrix；
- 四类 M9 泛化报告与三个 `proposal-only` promotion 候选；M9 漫画、Scene、GlobalVisual、
  audio 和 evidence orchestration 仍为 project-local；
- strict `ProductionRequirementsFreeze`、append-only `ProductionStageEvent`、派生
  `ProductionRunState`、Story 级资源池、逐 meaningId assignment/result 和中央 watcher；
- 面向所有未来画幅的 `production-readability-v1` 与 requirements v2、Unicode grapheme
  `caption-display-unit-v1`、provider 前 chunk budget gate、assignment identity 传播、完整
  Renderer source-graph 字号/安全区 guard、受控 Scene primitives 和 policy-aware CaptionLayer；
- 固定 `production:*` CLI、checkpoint-safe narrative runner、无全局 BGM/ambience/ducking/
  GlobalVisualLayers 的 PreviewAssembly，以及只表示 mechanically-ready 的 Preview evidence；
- fake provider/process/clock/scheduler 驱动的完整两 Scene 编排 proof、失败矩阵与幂等验证；
- 项目级 `$remotion-story-producer-video` Skill：在新对话接收完整内容后不先写计划，默认只加载
  薄入口与直接流程，按需读取故障/权威边界，再执行 authored contracts、默认 VoxCPM、
  Scene/watcher、Agent返工/common-flow hardening 和机械 Preview handoff；
- 规范目录、外部生产流程、合同参考和目标设计文档。

NarrativeCheck、用户预览后的 Scene 修改循环、已提案 capability 的实际 promotion、发布
流程仍未实现；Roadmap 下一项为 M10，但不会因 M9.5 closeout 自动启动。
M5–M7 已批准文档见
[M5 ScenePackage 视听制作规格](docs/superpowers/plans/2026-08-02-m5-scene-package-production-specification.md)、
[M6 Scene Runtime 实施计划](docs/superpowers/plans/2026-08-02-m6-scene-runtime-implementation-plan.md) 和
[M7 GPS Scene Production 实施计划](docs/superpowers/plans/2026-08-03-m7-gps-relativity-scene-production-plan.md)。
M8 已批准计划与实证见
[M8 Final Assembly 实施计划](docs/superpowers/plans/2026-08-03-m8-global-sound-visual-final-assembly-implementation-plan.md) 和
[GPS Relativity M8 Final Assembly Evidence](docs/evidence/m8-gps-relativity-final-assembly.md)。
M9 已批准计划与实证见
[M9 Product Comic Vertical Generalization Plan](docs/superpowers/plans/2026-08-03-m9-product-comic-vertical-generalization-plan.md) 和
[M9 Product Comic Vertical Generalization Evidence](docs/evidence/m9-product-comic-vertical-generalization.md)。
M9.5 实施计划与操作合同见
[M9.5 Contract-driven Production Orchestration Plan](docs/superpowers/plans/2026-08-04-m9-5-contract-driven-production-orchestration-plan.md) 和
[Production Orchestration](docs/PRODUCTION_ORCHESTRATION.md)；首次真实试跑见
[M9.5 Production Trial and Hardening Evidence](docs/evidence/2026-08-05-m9-5-production-trial-and-hardening.md)。
完成边界和后续里程碑见
[最终产品目标](docs/FINAL_PRODUCT_GOAL.md) 与
[当前实现状态](docs/ITERATION_STATUS.md)；完整实施顺序和阶段门槛见
[实施路线](docs/ROADMAP.md)。

## 直接制作新视频

在本仓库开启新对话，显式调用
[$remotion-story-producer-video](.agents/skills/remotion-story-producer-video/SKILL.md)，并粘贴完整
内容即可。Skill 默认不写计划，直接持续执行到等待用户观看的机械 Preview：

```text
使用 $remotion-story-producer-video，把下面的完整内容直接制作成视频，不先写计划：

<粘贴完整内容、脚本或资料>
```

Skill 会使用 Git-ignored `voxcpm/voxcpm.private.json`，不要求每次设置环境变量。正常制作只
加载 Skill 入口、直接流程和当前项目输入；仅在失败或合同/范围冲突时读取对应参考或权威文档
片段。它不会代签用户批准、自动开始 M10、发布或 push。

## 本地运行

要求 Node.js 20+ 与 npm。本项目不使用 Docker。

```bash
npm install
npm run dev
```

同一可信局域网内访问 Studio：

```bash
npm run dev -- --host=0.0.0.0 --port=3000
```

然后从其他设备打开 `http://<开发机局域网 IP>:3000`。开发配置关闭 Webpack
`lazyCompilation`，避免 lazy-loaded Composition 把浏览器连接错误地指向访问设备自身的
`localhost:<随机端口>`；ProjectRegistry 的字面量动态导入和 Remotion `lazyComponent`
注册保持不变。

常用验证：

```bash
npm test
npm run typecheck
npm run lint
npm run docs:check-links
npm run catalog:check
npm run registry:check
npm run build
npm run compositions
```

一次运行全部检查：

```bash
npm run check
```

M4/M7/M8/M9 作品级机械检查：

```bash
npm run project:check -- --project gps-relativity --level narrative
npm run project:check -- --project gps-relativity --level narrative --write-auto-check
npm run project:check -- --project gps-relativity --level final
npm run project:check -- --project gps-relativity --level final --write-final-check
npm run m7:gps:evidence
npm run m8:gps:audio -- check
npm run m8:gps:freeze -- check
npm run final:assembly -- --project gps-relativity --check
npm run m8:gps:evidence
npm run m8:gps:approval
npm run m9:product:scene-audio -- check
npm run m9:product:audio -- check
npm run m9:product:scene-evidence
npm run final:assembly -- --project product-comic-vertical --check
npm run m9:product:evidence
npm run m9:product:approval
npm run project:check -- --project product-comic-vertical --level final
```

默认命令只读重算并要求持久化 AutoCheck byte-equivalent；只有显式
`--write-auto-check` 且全部检查通过时才原子写入。失败不会覆盖最后一份有效报告。真实
验收见 [GPS Relativity M4 Narrative Validation Evidence](docs/evidence/2026-08-02-gps-relativity-m4.md)。
`final` 会先复验 narrative，再校验 Scene 与 global/final 分支；当前 GPS 五个 Scene 与 M9
十个 Scene 均全 ready，默认只读命令复验各自 passing persisted
`final-mechanical-check-v2`。只有显式
`--write-final-check` 且全部检查通过时才原子写入。M7 视觉/声音/连续性记录和媒体 receipt
由 `m7:gps:evidence` 独立复验；M8 evidence 也不能冒充用户批准，只有
`m8:gps:approval`/`m9:product:approval` 分别校验 current、checksum-bound 的用户
authoring/generated approval。证据见
[GPS Relativity M7 Scene Production Evidence](docs/evidence/2026-08-03-gps-relativity-m7-scene-production.md)。

M6 独立 proof：

```bash
npm run m6:proof:compositions
npm run m6:proof:evidence
```

proof 使用独立入口，只列出 `M6SceneRuntimeProof`，不会进入正常 ProjectRegistry 或改变
`npm run compositions` 的两个现有条目。证据见
[M6 Scene Runtime Foundation Evidence](docs/evidence/2026-08-02-m6-scene-runtime-foundation.md)。

M2 旁白命令：

```bash
npm run narration:generate -- --project gps-relativity
npm run narration:seal -- --project gps-relativity --attempt <provider-attempt-fingerprint>
npm run narration:check -- --project gps-relativity
```

只有 `generate` 读取 Git-ignored `voxcpm/voxcpm.private.json`（或可选的
`RSP_VOXCPM_PRIVATE_CONFIG` 覆盖）并调用 VoxCPM；续跑、封存、恢复、supersede 与隐私边界见
[旁白生成与恢复](docs/NARRATION_GENERATION.md)。真实 M2 验收见
[GPS Relativity M2 Narration Evidence](docs/evidence/2026-08-01-gps-relativity-m2.md)。

M3 registry、listing 与真实 Baseline：

```bash
npm run registry:generate
npm run registry:check
npm run compositions
npx remotion still src/index.ts GpsRelativity out/gps-relativity/m3-transparent-frame-0.png --frame=0 --image-format=png
npx remotion still src/index.ts GpsRelativity out/gps-relativity/m3-caption-frame-15.png --frame=15 --image-format=png
npx remotion render src/index.ts GpsRelativity out/gps-relativity/m3-narrative-baseline.mp4 --codec=h264 --audio-codec=aac
npm run baseline:evidence -- --project gps-relativity
```

透明边界由 PNG alpha 验收；H.264 不保存 alpha，播放器中的黑色是编码呈现，不是
NarrativeCore 背景。真实 M3 验收见
[GPS Relativity M3 Narrative Baseline Evidence](docs/evidence/2026-08-01-gps-relativity-m3.md)。

## 文档

从 [外部生产流程](docs/PRODUCTION_WORKFLOW.md) 和 [docs/README.md](docs/README.md)
开始。仓库内 Agent 执行规则见
[AGENTS.md](AGENTS.md)。

## 目录

```text
.agents/skills/remotion-story-producer-video/  直接制作到机械 Preview 的项目 Skill
docs/                           产品、架构、合同与状态
public/assets/library/          经准入的共享本地资产
public/projects/<story>/        单个作品的本地资产
scripts/narration/              M2 旁白生成、测量、续跑、封存与只读检查
scripts/registry/               M3 静态 ProjectRegistry 生成与漂移检查
scripts/baseline/               M3 PNG/MP4 evidence 检查与 receipt
scripts/catalog/                M6 ResourceCatalog 稳定生成、查询与漂移检查
scripts/external-references/    M6 snapshot、resolver/localizer 与 fidelity checker
scripts/renderer-registry/      M6 composition-local RendererRegistry 生成与检查
scripts/scene-package/          M6 ScenePackage/Coverage pass-only 生成与检查
scripts/m8-gps/                 M8 全局音频、冻结、最终媒体、evidence 与 approval
scripts/m9-product/             M9 漫画/音频/Shotcraft/evidence/approval 项目编排
scripts/final-assembly/         M8 FinalAssembly pass-only 生成与只读检查
scripts/project-check/          M4 narrative 与 M6–M9 final 作品级机械聚合
scripts/docs/                   tracked Markdown 本地链接只读检查
voxcpm/                        Git-ignored 默认 VoxCPM 私有配置与 voice profile；不进入提交
src/contracts/                  M1–M9 严格合同、fingerprint 与机械报告
src/remotion/capabilities/      已批准共享能力
src/remotion/catalog/           M6 tracked 统一只读 ResourceCatalog
src/remotion/runtime/           NarrativeCore、Scene/global sound、Scene/global visual 与显式装配
src/remotion/proofs/            与真实 ProjectRegistry 隔离的 M6 synthetic proof
src/remotion/compositions/      系统 Composition
src/projects/project-registry.generated.ts M3 tracked 静态元数据与字面量 lazy imports
src/projects/<story>/           Story source、M2 artifacts、M3 Baseline 与 M4 AutoCheck
```
