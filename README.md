# Remotion Story Producer

一个以旁白实测时间线为权威、按 StoryBeat 隔离制作 Scene，并由静态 Remotion runtime 装配与
同步构建本地最终交付的合同驱动视频生产仓库。

## 当前结论

- 默认入口是 `npm run project:build -- --project <storyId>`。它从 current 可变 Project authoring
  source 生成同一 snapshot 的 `video.mp4`、两张 Cover 与最后写入的 `publish.json`，同步等待
  Remotion 和 FFmpeg 完成后才从 staging 受控替换 current delivery。
- 普通 rebuild 不创建 ProductionRun，不读取 owner receipt，不启动 watcher，不重做旁白；Agent 只在
  内容缺失或用户明确要求重新设计时参与。
- ProductionRun/owner/watcher/`delivery:build` 保留为显式 audited production 能力，不再阻塞默认
  Project build。其 `delivery-render-started` 仍只表示旧审计流的 detached spawn acknowledgement。
- 显式 audited production 中，主 Agent 冻结全部 assignment 后启动 detached watcher，再用
  `create_thread` 只派发需要创作的
  Scene、GlobalVisual 与 Cover 独立任务；template-copy Scene 由脚本提交。全部创建成功后立即结束，
  watcher 独立 check/submit、汇合
  render-ready 并自动执行 `delivery:build`。
- audited `delivery-render-started` 只证明进程启动确认，不证明渲染完成或 MP4 有效；该旧路径不等待、监控、
  读取、hash、probe 或 decode detached 输出。
- PublishingIntent 与独立 Cover 生命周期保留；Cover 不阻止 render-ready，但会阻止自动交付。
- ignored `private/producer.config.json` 统一管理新作品的常用画面规格、Scene 留白、首尾 Scene
  template 选择、合集数组、通用 TTS 与可选本地 BGM 预设；声线/BGM 文件只接受仓库相对路径。
  `project:configure` 把选择冻结进新 Project，并复制所选 template 的源码、资源和 BGM。BGM 作为
  一个独立音量、可循环的 `SoundContribution`，只覆盖 narrated 内容，不进入片头片尾。
- production start 将已确认的 provider-attempt 与 mastering policy 合成为 private-safe Run 执行快照；
  preflight 后配置漂移会要求 fresh Run，不会切换当前 Run 的 provider、声线、语速或 LUFS。
- `GlobalVisualLayers` 是唯一的无 Props 组件接口；render-ready 在封存 ready artifact 前只编译目标
  Project 的 Composition 与真实 import graph，跨模块类型漂移会 fail closed。
- 片头片尾只存在于配置和界面业务语义；代码合同使用普通 reusable Scene template。新 Project
  复制所选 template 到自己的 Scene 目录并重算 identity，之后不引用共享模板。Scene freeze 由脚本
  确定性校验、生成普通 ScenePackage 并直接 submit，不创建 Agent owner。
- core 与 fresh clone 是 zero-Project-safe；ignored 本地 Project 集由 bootstrap 动态发现，不写入
  README 或 current capability 状态。
- 外部素材服务只负责 search/preview/acquire。当前 `project:asset:import` 严格接收
  stock-assets-mcp 的 Pexels image receipt v1，把候选图片校验并本地化到 Project-owned 路径后才
  进入 ResourceCatalog；MCP、网络、provider SDK 与 API Key 不进入 owner、watcher、delivery 或
  Remotion runtime。
- 每个 Project 只有一个 `deliveries/<storyId>/` current delivery，exactly 包含 `video.mp4`、
  `cover-4x3.png`、`cover-3x4.png` 与 `publish.json`。publish 绑定 buildId、source snapshot、实际路径、
  checksum、尺寸、fps、帧数、音视频 codec 与 EOF decode 结果。
- 平台上传、发布账号、网络发布、NarrativeCheck 和其他未批准 capability promotion 尚未实现。

完整事实见 [当前实现状态](docs/ITERATION_STATUS.md)，执行方式见
[生产编排指南](docs/guides/PRODUCTION_ORCHESTRATION.md) 与
[自动交付指南](docs/guides/LOCAL_DELIVERY.md)，本地设置见
[制作配置指南](docs/guides/PRODUCER_CONFIG.md)。

## 主链

```text
VideoBrief(sourceReferences) + Story + authored ttsChunks + RenderSpec + PublishingIntent
  → narrated content chunks measured and sealed once
  → full SemanticTiming (intro → content Scenes → outro) + narrated-only CaptionCue
  → local ResourceCatalog lookup + optional external image import
  → configured Scene templates copied + authored source when content is missing
  → ScenePackage Registry + StoryVisualTrack/SoundDesignTrack + FinalAssembly
  → authoring source snapshot + buildId
  → synchronous video/Cover render in reusable staging
  → media/checksum/path verification + publish.json written last
  → controlled staged current delivery replacement
```

## 快速开始

要求 Node.js 20+、npm、FFmpeg 和宿主机可用的 Remotion Chromium，不使用 Docker。

```bash
npm install
npm run dev
```

该命令同时启动 `http://127.0.0.1:3100` 制作配置页和 `http://127.0.0.1:3101` Remotion Studio。
配置页的“制作进度”列出所有 current Project；每个 Project 只展示最新一条 current Run 的六个关键
production/delivery 步骤，并每 3 秒刷新。它不跟踪进程或 MP4 完成状态。Project 详情也可在输入完整
Project ID 二次确认后执行与 `project:delete` 相同的完整清理。
从旧私有 VoxCPM JSON 首次迁移时运行 `npm run config:migrate`；新配置和完整 token 始终保持
ignored，不得 stage。可信局域网内需要其他设备直接访问时运行 `npm run dev:lan`，再使用终端
输出的 Network 地址访问 `:3100` 和 `:3101`；不要把端口暴露到公网。
将 `.env.example` 复制为 `.env` 后即可使用仓库内相对配置路径；`RSP_PRODUCER_CONFIG` 的相对
路径以仓库根目录解析，也支持绝对路径，Shell 同名变量优先。

`npm install` 自动执行 `npm run bootstrap`，重建 core synthetic proof 资产、zero-safe
ResourceCatalog 和 ProjectRegistry。fresh clone 默认没有具体 Project，仍可测试、构建并列出
`CapabilityGallery`、`DefaultIntroPreview` 与 `DefaultOutroPreview`。后两个是 Scene template 的业务位
预览，位于 Studio 的 `System` folder，使用固定帧数与本地 chime，不进入任何 Project identity。

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

外部图片必须在 Scene freeze 前由中央 CLI 准入；receipt 使用绝对路径，候选文件保持原样：

```bash
npm run project:asset:import -- \
  --project <story-id> \
  --receipt <absolute-receipt-path> \
  --role scene-visual
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
删除器只读取 Run 的严格 `runId/storyId` 所有权，所以旧合同数据仍可清理；这不会让其他 current
production/delivery 命令兼容或解释旧 Run。configure/start/delivery/delete 共享 repository operation
lock；删除在持锁后重检目标，并在源码消失前先发布排除目标的 Registry。后续删除失败会按磁盘真实
状态恢复 Registry/Catalog；浏览器 `Failed to fetch` 只会提示结果需确认，不再误报“删除未完成”。

生产编排：

```bash
npm run project:configure -- --project <story-id> --input src/projects/<story-id>/producer-input.json
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

上面是新内容需要 Agent 创作时的显式 audited production。已有 Project 的默认重建只需：

```bash
npm run project:build -- --project <story-id>
```

独立 Cover 与自动交付：

```bash
npm run delivery:cover:check -- --project <story-id>
npm run delivery:build -- --project <story-id>
npm run delivery:check -- --project <story-id>
```

## 目录

```text
.agents/skills/              仓库生产 Skill 与 repository-local Remotion authoring guidance
docs/                        当前权威、指南、证据和历史归档
scripts/production/          production cli / application / domain / adapters
scripts/project-build/       默认 Project build cli / application / adapters
scripts/project-assets/      外部 receipt adapter、Project-local 准入与 Catalog 同步
scripts/delivery/            Cover 与自动交付 cli / application / domain / adapters
scripts/shared/              跨流程的原子文件、窄技术端口与宿主媒体 adapter
scripts/config/              private ProducerConfig 读写与迁移
scripts/projects/configure.ts 新 Project 通用默认值冻结入口
scripts/projects/application/ Project-local Scene template 实例化用例
scripts/scene-templates/     repository-wide Scene template authoring 投影
settings/contracts/          配置页 API DTO 与运行时校验的单一权威
settings/client/             browser-only React UI、feature components 与稳定 hooks
settings/server/             本地同源 API、诊断与只读 Project 进度投影
src/contracts/               strict、versioned、可执行 Zod 合同
src/remotion/runtime/        固定、离线、frame-driven runtime
src/remotion/capabilities/visual-components/ 已批准视觉组件，按背景、图表、文字、布局和 Scene pattern 分组
src/remotion/capabilities/scene-templates/    新 Project 可复制的 Scene template 权威
proofs/scene-runtime/        与生产 src 隔离的 source、fixtures 与 evidence
src/projects/<story>/        ignored 本地作品
public/projects/<story>/     ignored Project 媒体；public/voice_profile 永远受保护
.narration-work/<story>/     ignored 旁白候选与 provider progress
.producer-runs/<runId>/      ignored immutable Run ledger 与 derived state
public/assets/               bootstrap 可重建的 core proof 与 Scene template 资产
deliveries/<story>/          ignored 单一 current video、两个 Cover 与 publish.json
out/<story>/                 ignored baseline 媒体、诊断输出与 detached render 日志
tests/                       单元、集成与架构回归
```

从 [文档导航](docs/README.md) 开始；文档职责见
[文档管理规则](docs/DOCUMENTATION_POLICY.md)。
