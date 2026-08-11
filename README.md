# Remotion Story Producer

一个以旁白实测时间线为权威、按 StoryBeat 隔离制作 Scene，并由静态 Remotion runtime 装配与
自动发起本地交付渲染的合同驱动视频生产仓库。

## 当前结论

- 当前只有一套 production 合同与运行路径，不读取或解释旧 Run、旧作品和旧交付目录。
- production 终点是 `render-ready / awaiting-automatic-delivery`：Composition、render plan 和
  所有输入 identity 已冻结，但尚未生成最终 MP4。
- 主 Agent 冻结全部 assignment 后启动 detached watcher，再用 `create_thread` 派发 N 个 Scene、
  GlobalVisual 与 Cover 独立任务，全部创建成功后立即结束。watcher 独立 check/submit、汇合
  render-ready 并自动执行 `delivery:build`。
- `delivery-render-started` 只证明进程启动确认，不证明渲染完成或 MP4 有效。仓库不等待、监控、
  读取、hash、probe 或 decode detached 输出。
- PublishingIntent 与独立 Cover 生命周期保留；Cover 不阻止 render-ready，但会阻止自动交付。
- ignored `private/producer.config.json` 统一管理新作品的渲染默认值、Scene 留白、合集数组与通用
  TTS；实际选择会冻结进 contracts/fingerprints。
- `GlobalVisualLayers` 是唯一的无 Props 组件接口；render-ready 在封存 ready artifact 前只编译目标
  Project 的 Composition 与真实 import graph，跨模块类型漂移会 fail closed。
- core 与 fresh clone 是 zero-Project-safe；ignored 本地 Project 集由 bootstrap 动态发现，不写入
  README 或 current capability 状态。
- `deliveries/` 不是 checksum-bound verified release；ledger 只覆盖 immutable 非 MP4 文件。
- 平台上传、发布账号、网络发布、NarrativeCheck 和 capability promotion 尚未实现。

完整事实见 [当前实现状态](docs/ITERATION_STATUS.md)，执行方式见
[生产编排指南](docs/guides/PRODUCTION_ORCHESTRATION.md) 与
[自动交付指南](docs/guides/LOCAL_DELIVERY.md)，本地设置见
[制作配置指南](docs/guides/PRODUCER_CONFIG.md)。

## 主链

```text
Story + authored ttsChunks + RenderSpec + PublishingIntent
  → measured and sealed narration
  → SemanticTiming + CaptionCue + NarrativeCore
  → N Scene owners + one GlobalVisual owner + independent Cover owner
  → assignment-bound owner receipts + detached single-writer watcher
  → FinalAssembly + ProductionRenderPlan
  → render-ready / awaiting-automatic-delivery
  → immutable non-MP4 delivery package + launch intent
  → detached Remotion spawn acknowledgement + launch receipt
  → delivery-render-started
```

## 快速开始

要求 Node.js 20+、npm、FFmpeg 和宿主机可用的 Remotion Chromium，不使用 Docker。

```bash
npm install
npm run dev
```

该命令同时启动 `http://127.0.0.1:3100` 制作配置页和 `http://127.0.0.1:3101` Remotion Studio。
从旧私有 VoxCPM JSON 首次迁移时运行 `npm run config:migrate`；新配置和完整 token 始终保持
ignored，不得 stage。可信局域网内需要其他设备直接访问时运行 `npm run dev:lan`，再使用终端
输出的 Network 地址访问 `:3100` 和 `:3101`；不要把端口暴露到公网。

`npm install` 自动执行 `npm run bootstrap`，重建 core synthetic proof 资产、zero-safe
ResourceCatalog 和 ProjectRegistry。fresh clone 默认没有具体 Project，仍可测试、构建并列出
`CapabilityGallery`。

制作新视频时使用仓库 Skill：

```text
使用 $remotion-story-producer-video，把下面的完整内容直接制作成视频，不先写计划：

<内容、脚本或资料>
```

入口见
[$remotion-story-producer-video](.agents/skills/remotion-story-producer-video/SKILL.md)。
生产 Skill 会要求每个 Scene owner 使用仓库内
[$remotion-best-practices](.agents/skills/remotion-best-practices/SKILL.md) 及其按需路由的 reference；
仓库合同、assignment 和 validators 仍是更高 authority。

## 常用命令

```bash
npm test
npm run typecheck
npm run lint
npm run docs:check-links
npm run check:static
```

会启动 Chromium 的门禁必须直接在宿主权限下运行：

```bash
npm run compositions
npm run check:host
npm run check
```

正式作品复验使用 Project-owned profile；zero Project 时 `--all` 集合为空：

```bash
npm run project:verify -- --all
npm run project:verify -- --project <story-id> --scope full
npm run project:evidence:check -- --project <story-id>
```

删除已完成作品时使用固定清理入口。命令会删除选中 storyId 的 Project 源码、项目媒体、旁白工作区、
ProductionRun、`out/` 与 delivery 全部数据，再重建 Registry/Catalog；不会删除 core、
`public/voice_profile/` 或其他作品。`--confirm-delete` 只在用户已明确授权删除后使用：

```bash
# 一个
npm run project:delete -- --project <story-id> --confirm-delete

# 多个
npm run project:delete -- --project <story-a> --project <story-b> --confirm-delete

# 全部具体作品
npm run project:delete -- --all --confirm-delete
```

非空 `deliveries/.staging/`、目标 Run writer lock、symlink 或异常路径会使整个命令在删除前
fail closed。命令不终止正在运行的 provider 或 detached render，必须只对已停止生产/渲染的作品执行。

生产编排：

```bash
npm run production:preflight -- --project <story-id>
npm run production:start -- --project <story-id>
npm run production:narrative -- --run <run-id>
npm run production:scene:freeze -- --run <run-id>
npm run delivery:cover:freeze -- --project <story-id>
npm run production:watch:start -- --run <run-id>
npm run production:owner:ready -- --run <run-id> --owner scene --scene <meaning-id>
npm run production:owner:ready -- --run <run-id> --owner global-visual
npm run production:owner:ready -- --run <run-id> --owner cover
npm run production:render-ready:check -- --run <run-id>
```

独立 Cover 与自动交付：

```bash
npm run delivery:cover:check -- --project <story-id>
npm run delivery:build -- --project <story-id>
npm run delivery:check -- --project <story-id> --delivery <delivery-id>
```

## 目录

```text
.agents/skills/              仓库生产 Skill 与 repository-local Remotion authoring guidance
docs/                        当前权威、指南、证据和历史归档
scripts/production/          production cli / application / domain / adapters
scripts/delivery/            Cover 与自动交付 cli / application / domain / adapters
scripts/config/              private ProducerConfig 读写与迁移
settings/                    local / trusted-LAN React 配置控制台
src/contracts/               strict、versioned、可执行 Zod 合同
src/remotion/runtime/        固定、离线、frame-driven runtime
src/remotion/capabilities/   已批准共享能力
src/projects/<story>/        ignored 本地作品
public/projects/<story>/     ignored Project 媒体；public/voice_profile 永远受保护
.narration-work/<story>/     ignored 旁白候选与 provider progress
.producer-runs/<runId>/      ignored immutable Run ledger 与 derived state
public/assets/               bootstrap 可重建的 core proof 资产
deliveries/<story>/<id>/     ignored 非 MP4 包、intent、receipt 与异步 MP4 输出
out/<story>/                 ignored baseline 媒体、诊断输出与 detached render 日志
tests/                       单元、集成与架构回归
```

从 [文档导航](docs/README.md) 开始；文档职责见
[文档管理规则](docs/DOCUMENTATION_POLICY.md)。
