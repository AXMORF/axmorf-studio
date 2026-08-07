# 当前实现状态

> 文档类型：当前事实权威
>
> 最后复核：2026-08-07
>
> 下一里程碑：M10（尚未开始）

## 当前基线

仓库已完成 M1–M9.5 以及后续 production preflight、Scene ownership 和 GlobalVisual contract
hardening。当前主链可以把
一个新 Story 推进到机械 `preview-ready / awaiting-user-preview`，但不会代签用户批准、执行
promotion、发布或自动进入 M10。

## 已实现

### 叙事与时间

- `VideoBrief`、`StorySpec`、`NarrationSpec`、`RenderSpec`、StoryBeat 和 authored
  `ttsChunks` 严格合同；工具不按标点重新拆分朗读单元。
- VoxCPM 候选生成、恢复、PCM 规范化、实测、checksum/fingerprint 封存。
- `pcm-cumulative-ceil-v1` 累计整数 sample-frame 时间算法、`SemanticTiming` 和
  1:1 `CaptionCue`。
- 透明 `NarrativeCore`、唯一顶层 `CaptionLayer`、静态 ProjectRegistry、lazy Composition
  和 Narrative Baseline 机械检查。

### Scene 与最终装配

- `VisualStyleSpec`、ResourceCatalog、SceneTask/Plan/Package/Coverage、静态 RendererRegistry。
- 一 StoryBeat 对应一个 `meaningId` 和一个 Scene；ScenePackage 内聚视觉与 Scene 局部声音。
- `StoryVisualTrack`、`SoundDesignTrack`、GlobalSound、project-local `GlobalVisualLayers` 和
  `FinalAssembly` 固定所有权与投影。
- GPS 横屏作品与 ProductComicVertical 竖屏作品均有真实预览、用户批准、evidence 和 passing
  `final-mechanical-check-v2`；它们继续作为兼容保护基线。

### 稳定生产编排

- versioned `ProductionRequirementsFreeze`、append-only events、派生 `ProductionRunState`、
  immutable Scene/GlobalVisual result 和中央 single-writer watcher。
- 固定 CLI 已覆盖 preflight/start/status/narrative/scene freeze、Scene check/submit/fail、
  GlobalVisual check/submit/fail、watch 和 preview check。
- Run-before-write VoxCPM/Chromium preflight；外部环境 blocker 不再先污染 immutable Run。
- future-only production 使用 v4 requirements 和 `production-readability-v1`；旧 v1-v3
  artifacts 只读兼容，不迁移、不回填。
- Composition exactly once 提供 `SceneSafeArea`；Scene Renderer 不接收 boundary ownership，
  根节点保持透明，只输出当前 Beat 的语义视觉。
- v4 freeze 原子生成 N 个 Scene assignment 和一个 whole-film GlobalVisual assignment；两类
  owner 并行创作，通过 package/result 数据合同汇合。repo 不监控或保存 Agent/task/thread/
  progress/heartbeat 状态。
- v4 Preview 必须绑定 current GlobalVisualProjection/Package/source identities；仍不自动增加
  BGM、跨 Scene ambience 或 ducking，终点只表示 mechanically ready。

### 工程与验证

- `scripts/production` 按 `cli / application / domain / adapters` 分层。
- milestone 命名的脚本目录已收口为稳定职责：通用 production、正式作品静态验证、
  Project-owned `src/projects/<story>/tools`、`proofs/` synthetic proof 和窄 compatibility 模块。
- 当前 GPS 与 Product Comic 的完整复验由各自 Project-owned `verification.profile.json` 编排；
  profile 不含脚本路径，通用 adapter 只解析当前 Project 的固定工具位置，未知或缺失绑定失败。
- production scaffold 使用显式版本模板；shared Scene boundary 用 TypeScript AST 验证所有权，
  不再依赖格式敏感的整段源码替换或 exact prose/source 匹配。
- `src/contracts`、`src/remotion/runtime`、`src/remotion/capabilities` 与
  `src/projects/<story>` 维持合同、runtime、共享能力和作品实现的明确边界。
- `npm run check:static` 提供无 Chromium 门禁；`npm run check:host` 负责真实 Composition 和
  正式作品门禁；`npm run check` 顺序执行两者。
- active 文档使用 authority / guide / evidence / archive 生命周期并受本地链接门禁约束。
- Project 可删除性与产物解耦已实现：Registry/Catalog 对当前集 zero-safe，具体 Project 自有
  profile、工具与测试，默认 source/check 不读取 `out/`；显式 media/evidence/approval 仍
  fail closed。隔离 A–F 矩阵已证明单 Project、全部 Project、对应 public、整个 `out/` 的删除，
  以及从零加入 synthetic Project，当前工作树真实作品未删除。

## 尚未实现

- NarrativeCheck 与主观 Story、旁白、字幕、整体叙事节奏审核。
- 用户预览后的定点 Scene 修改循环。
- 已提出 promotion proposal 的明确批准与共享能力迁移。
- 封面、交付包与 M10 发布收口。
- 平台上传、账号、网络发布、密钥或权限管理；这些也不属于当前 M10 默认范围。

以上内容不得写成已有能力。机械 Preview、Agent review 和 checker 都不能创建
`FinalPreviewApproval`。

## 当前维护边界

- render runtime 不调用 Agent、Skill、MCP、Git、目录扫描或网络服务。
- 所有 render-critical 资产位于 `public/` 并有可校验 identity。
- 所有 motion 使用 Remotion frame API；不使用 CSS animation/transition。
- 新共享能力仍需具体 promotion proposal 和用户明确批准。

下一阶段定义见 [ROADMAP.md](ROADMAP.md)，详细历史证明从 [文档导航](README.md) 进入。
