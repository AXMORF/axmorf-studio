# Remotion Story Producer

一个先把用户内容稳定转化为 Story、已封存旁白、字幕和绝对时间线，再按需接入视觉、
声音与全局增强轨的 Remotion 视频生产工程。

M1 已完成 `VideoBrief + StorySpec + NarrationSpec + RenderSpec` 严格合同、canonical
fingerprint 和累计 PCM `SemanticTiming` 纯函数。M2 已用真实 `gps-relativity` Story 完成
StoryCheck、VoxCPM 逐 chunk 生成与续跑、PCM 实测、原子封存、完整旁白和作品级
`SemanticTiming`/`CaptionCue` 产物。后续主链从 NarrativeCore 与 Narrative Baseline 继续，
并且不依赖 Scene。

视觉表达放在后续阶段：目标模型中，每个 StoryBeat 对应一个 Scene；每个 ScenePackage
对 runtime 只暴露一个 Scene 级 renderer 入口。该接口保留，但不属于当前里程碑。

## 当前状态

仓库当前完成基础框架、M1 合同内核与 M2 真实旁白封存：

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
- 规范目录、外部生产流程、合同参考和目标设计文档。

NarrativeCore、CaptionLayer、generated static ProjectRegistry、lazy-loaded Story Composition、
NarrativeCheck、ScenePackage、资源目录、完整生产链和新 skills 仍未实现。M3 尚未开始。
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

渲染系统 Composition：

```bash
npx remotion render src/index.ts CapabilityGallery out/capability-gallery.mp4
```

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
src/contracts/                  M1/M2 叙事合同、fingerprint 与纯时间算法
src/remotion/capabilities/      已批准共享能力
src/remotion/catalog/           预留：统一只读资源目录
src/remotion/runtime/           预留：NarrativeCore、视觉轨与装配运行时
src/remotion/compositions/      系统 Composition
src/projects/project-registry.generated.ts 预留：静态元数据与字面量 lazy imports
src/projects/<story>/           Story source、StoryCheck 与 M2 generated narration artifacts；Composition 仍预留
```
