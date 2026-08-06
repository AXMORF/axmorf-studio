# Remotion Story Producer

一个以旁白时间线为权威、按 StoryBeat 独立制作 Scene，并通过静态 Remotion runtime 装配成片的
合同驱动视频生产仓库。

## 当前结论

- M1–M9.5 已完成：叙事合同、真实旁白封存、Narrative Baseline、ScenePackage、全局装配、
  第二主题泛化与稳定生产编排均已有代码和验证证据。
- 新 production 使用 v3 requirements、Run-before-write preflight、Composition-owned
  `SceneSafeArea`、透明 Scene Renderer 和机械 Preview 门禁。
- 自动化终点是 `preview-ready / awaiting-user-preview`；它不代表用户批准、发布或 promotion。
- NarrativeCheck、用户预览后的定点 Scene 修改循环、能力 promotion 和 M10 发布收口尚未实现。

完整当前事实见 [当前实现状态](docs/ITERATION_STATUS.md)，下一阶段只看
[Roadmap](docs/ROADMAP.md)。

## 生产主链

```text
VideoBrief + StorySpec + authored ttsChunks + RenderSpec
  → StoryCheck
  → VoxCPM candidates → measured and sealed narration
  → SemanticTiming + CaptionCue
  → NarrativeCore
  → SceneAssignment → ScenePackage
  → StoryVisualTrack + SoundDesignTrack
  → mechanical Preview
  → explicit user preview decision
```

时间、所有权和兼容边界见 [外部生产流程](docs/PRODUCTION_WORKFLOW.md)。

## 快速开始

要求 Node.js 20+、npm、FFmpeg 和宿主机可用的 Remotion Chromium。本项目不使用 Docker。

```bash
npm install
npm run dev
```

在新对话直接制作视频时，使用仓库 Skill：

```text
使用 $remotion-story-producer-video，把下面的完整内容直接制作成视频，不先写计划：

<内容、脚本或资料>
```

入口见
[$remotion-story-producer-video](.agents/skills/remotion-story-producer-video/SKILL.md)。

## 常用命令

静态开发门禁：

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

正式作品复验使用静态白名单 profile，不扫描项目目录，也不从 JSON 加载脚本路径：

```bash
npm run project:verify -- --all
npm run project:verify -- --project gps-relativity --scope full
npm run project:evidence:check -- --project product-comic-vertical
npm run project:approval:check -- --project product-comic-vertical
```

生产编排：

```bash
npm run production:preflight -- --project <story-id>
npm run production:start -- --project <story-id>
npm run production:status -- --run <run-id>
npm run production:narrative -- --run <run-id>
npm run production:scene:freeze -- --run <run-id>
npm run production:scene:check -- --run <run-id> --scene <meaning-id>
npm run production:scene:submit -- --run <run-id> --scene <meaning-id>
npm run production:watch -- --run <run-id>
npm run production:preview:check -- --run <run-id>
```

详细输入、输出和失败语义见
[生产编排指南](docs/guides/PRODUCTION_ORCHESTRATION.md)。

## 目录

```text
.agents/skills/              仓库生产 Skill
docs/                        当前权威文档与导航
  guides/                    操作和维护指南
  contracts/                 合同说明
  evidence/                  历史验收证据
  archive/                   不再代表当前事实的历史快照
scripts/                     构建期、检查和生产工具
  production/                cli / application / domain / adapters
  project-validation/        正式作品静态验证 profile 与受控 adapter
  project-tools/<story>/     作品专属构建期工具，不是通用生产 API
  proofs/                    独立 synthetic regression proof
src/contracts/               可执行 Zod 合同与确定性纯函数
src/remotion/runtime/        固定、离线、frame-driven runtime
src/remotion/capabilities/   已批准共享能力
src/projects/<story>/        一个 Story 的 Composition、数据和 Scene
public/projects/<story>/     已登记的 render-critical 媒体
tests/                       与模块/用例对应的自动化测试
```

## 文档入口

从 [文档导航](docs/README.md) 开始。文档职责、归档和去重规则见
[文档管理规则](docs/DOCUMENTATION_POLICY.md)。
