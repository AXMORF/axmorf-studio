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
保真 receipt 封存；上游仓库、全局 skill 和远程 preview 不进入 runtime。当前真实
`gps-relativity` 仍没有正式 ScenePackage；M6 只用独立 synthetic proof 验证这条基础链。

## 当前状态

仓库当前完成基础框架、M1–M4 Narrative Baseline 机械闭环和 M6 Scene Runtime foundation：

- Remotion、React、TypeScript、ESLint 与 Tailwind 基础工程；
- 已迁入 camera、effects、Lottie/媒体、motion、sound、styles、transitions 与
  Remotion primitives；
- `CapabilityGallery`：只用于验证项目可以启动、构建和列出 Composition；
- `VideoBrief`、`StorySpec`、`NarrationSpec`、`RenderSpec`、authored `ttsChunks` 与显式停顿合同；
- canonical serialization、分层 SHA-256 fingerprint、`SealedNarrationManifest` 元数据合同；
- 基于累计整数 sample-frame 和 `BigInt` 的 `SemanticTiming`、1:1 `CaptionCue` 与失效校验；
- Agent-authored、非用户阻塞的 `StoryCheck` 报告合同；
- 仓库外私有 VoxCPM 配置、一个 `controllable-clone` profile adapter、逐 authored chunk
  生成和 checksum/measurement 验证续跑；
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
- 17 条当前 descriptor 的 ResourceCatalog、allowed-use/license/checksum/blocked policy、
  稳定生成/查询/漂移检查；
- 一个冻结 `video-shotcraft` recipe 的 immutable snapshot、card/style-key/demo/preview resolver、
  两文件最小本地化闭包和 pass-only ReferenceFidelityReceipt；
- composition-local RendererRegistry、纯视觉 StoryVisualTrack、固定 Scene-local
  SoundDesignTrack 投影，以及只在真实输入存在时启用的 CompositionAssembly 插槽；
- `project:check --level final` 的十项机械基础和独立 `M6SceneRuntimeProof` 真实 still/render
  evidence；
- 规范目录、外部生产流程、合同参考和目标设计文档。

NarrativeCheck、`gps-relativity` 的五个正式 ScenePackage、SceneVisualCheck/SceneSoundCheck、
M8 GlobalSoundPlan/全局 BGM/跨 Scene ambience/ducking/mastering/GlobalVisualLayers、最终创意
批准、发布流程和新 skills 仍未实现。当前唯一下一步是 M7。M5/M6 已批准文档见
[M5 ScenePackage 视听制作规格](docs/superpowers/plans/2026-08-02-m5-scene-package-production-specification.md)。
与 [M6 Scene Runtime 实施计划](docs/superpowers/plans/2026-08-02-m6-scene-runtime-implementation-plan.md)。
完成边界和后续里程碑见
[最终产品目标](docs/FINAL_PRODUCT_GOAL.md) 与
[当前实现状态](docs/ITERATION_STATUS.md)；完整实施顺序和阶段门槛见
[实施路线](docs/ROADMAP.md)。

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

M4/M6 作品级机械检查：

```bash
npm run project:check -- --project gps-relativity --level narrative
npm run project:check -- --project gps-relativity --level narrative --write-auto-check
npm run project:check -- --project gps-relativity --level final
```

默认命令只读重算并要求持久化 AutoCheck byte-equivalent；只有显式
`--write-auto-check` 且全部检查通过时才原子写入。失败不会覆盖最后一份有效报告。真实
验收见 [GPS Relativity M4 Narrative Validation Evidence](docs/evidence/2026-08-02-gps-relativity-m4.md)。
`final` 会先复验 narrative，再校验 M6 Scene 分支；当前 GPS 因 M7 coverage/ScenePackage 尚未
产生而按设计 fail closed，失败不会写入 final report。

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

只有 `generate` 读取仓库外 `RSP_VOXCPM_PRIVATE_CONFIG` 并调用 VoxCPM；续跑、封存、
恢复、supersede 与隐私边界见
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
.agents/skills/                 Agent 创作与维护入口
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
scripts/project-check/          M4 narrative 与 M6 final 作品级机械聚合
scripts/docs/                   tracked Markdown 本地链接只读检查
src/contracts/                  M1–M6 严格合同、fingerprint 与机械报告
src/remotion/capabilities/      已批准共享能力
src/remotion/catalog/           M6 tracked 统一只读 ResourceCatalog
src/remotion/runtime/           NarrativeCore、Scene visual/local-sound 与显式装配
src/remotion/proofs/            与真实 ProjectRegistry 隔离的 M6 synthetic proof
src/remotion/compositions/      系统 Composition
src/projects/project-registry.generated.ts M3 tracked 静态元数据与字面量 lazy imports
src/projects/<story>/           Story source、M2 artifacts、M3 Baseline 与 M4 AutoCheck
```
