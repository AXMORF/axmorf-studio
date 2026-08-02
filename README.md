# Remotion Story Producer

一个先把用户内容稳定转化为 Story、已封存旁白、字幕和绝对时间线，再按需接入视觉、
声音与全局增强轨的 Remotion 视频生产工程。

M1 已完成 `VideoBrief + StorySpec + NarrationSpec + RenderSpec` 严格合同、canonical
fingerprint 和累计 PCM `SemanticTiming` 纯函数。M2 已用真实 `gps-relativity` Story 完成
StoryCheck、VoxCPM 逐 chunk 生成与续跑、PCM 实测、原子封存、完整旁白和作品级
`SemanticTiming`/`CaptionCue` 产物。M3 已继续实现透明 NarrativeCore、静态 ProjectRegistry、
lazy Story Composition，以及不依赖 Scene 的真实 Narrative Baseline preview/render 和 evidence。
M4 已把 M1–M3 聚合为固定、只读、fail-closed 的作品级机械 AutoCheck，并用隔离副本证明
16 类上游和产物失效传播。

视觉表达放在后续阶段：目标模型中，每个 StoryBeat 对应一个 Scene；每个 ScenePackage
对 runtime 只暴露一个 Scene 级 renderer 入口。该接口保留，但不属于当前里程碑。

## 当前状态

仓库当前完成基础框架和 M1–M4 Narrative Baseline 机械闭环：

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
- 规范目录、外部生产流程、合同参考和目标设计文档。

NarrativeCheck、ScenePackage、资源目录、三个可选增强轨、完整生产链和新 skills 仍未实现。
M5 尚未开始。
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

常用验证：

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run compositions
```

一次运行全部检查：

```bash
npm run check
```

M4 作品级机械检查：

```bash
npm run project:check -- --project gps-relativity --level narrative
npm run project:check -- --project gps-relativity --level narrative --write-auto-check
```

默认命令只读重算并要求持久化 AutoCheck byte-equivalent；只有显式
`--write-auto-check` 且全部检查通过时才原子写入。失败不会覆盖最后一份有效报告。真实
验收见 [GPS Relativity M4 Narrative Validation Evidence](docs/evidence/2026-08-02-gps-relativity-m4.md)。

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
scripts/project-check/          M4 作品级机械聚合、只读 drift gate 与 AutoCheck 写入
src/contracts/                  M1–M4 叙事、fingerprint、evidence 与 AutoCheck 合同
src/remotion/capabilities/      已批准共享能力
src/remotion/catalog/           预留：统一只读资源目录
src/remotion/runtime/           M3 NarrativeCore/必需装配；视觉与增强轨仍预留
src/remotion/compositions/      系统 Composition
src/projects/project-registry.generated.ts M3 tracked 静态元数据与字面量 lazy imports
src/projects/<story>/           Story source、M2 artifacts、M3 Baseline 与 M4 AutoCheck
```
