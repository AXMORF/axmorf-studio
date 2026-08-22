# Iteration Status

> 文档类型：current implementation authority
>
> 最后复核：2026-08-22 Desktop Phase A repository-adapter implementation

## 当前结论

仓库当前 production authority 已收敛为 ProductionRevision、content-addressed Task DAG、task workspace、
ArtifactAttestation、reusable Artifact Store、fixed convergence 与 synchronous exact four-file delivery。
当前 authoring/production 主链公开 scripts 为：

```text
project:create
project:asset:import
project:execution:resolve
project:produce:inspect
project:produce:prepare
project:task:check
project:task:commit
project:task:fail
project:produce:continue
```

旧 production/delivery/build command surface 与对应 active contracts/implementation/tests 已移除，不提供转发
shim。历史 `.producer-runs` 数据保持原位，但 current prepare/convergence/build/settings 不读取；删除器内部只
保留 strict ownership parser。

当前 checkout 有一个 source Project `remotion-story-producer-handdrawn-intro`；只读 inspect 返回
`production-inputs-ready` / `prepare-production`，但它没有 materialized Composition 或 current delivery，
因此 ProjectRegistry 为 0 entry、`deliveries/` 为 0 current delivery。当前 ResourceCatalog 投影为 26
entries。readiness、cache reuse 与 dirty task estimate 都不是完成证据；该本地 Project 也不改变 zero-Project
支持合同。

当前 repository video Skill policy schema v16 / policy v18 还定义了一个 pre-inspect external-asset Agent capability slot：只按
当前 Root Agent 的实际 callable MCP tools 激活，缺失时完全省略；激活后也必须先查本地 Catalog，再通过
`project:asset:import` 把选择准入为 Project-owned 输入。该 slot 不创建 DAG node，也不进入 child/runtime。

## 已实现 contracts 与 domain

- `ProjectCreateInput`、`ProductionInspection`、`TaskDecisionExplanation`、`ProductionRevision`、
  `ProducerTaskSpec/TaskRevision`、`ArtifactAttestation`、`ProducerPlan`、`ExecutionAttempt`、
  `DeliveryBuild/DeliveryPublish`；
- Revision/DAG/invalidation/plan pure domain；DAG cycle/duplicate/unknown dependency/stable ordering gates；
- renamed Project authoring contracts `authoring-requirements` 与 `scene-readability`，不导出旧 runtime authority；
- `production-requirements-current-v4` / `scene-composition-boundary-v2` clean-break：Composition 拥有
  raw readability policy 与 inset，SceneTask v7 只接收 Scene-only requirements 和派生的
  safe-area-local SceneViewport，ScenePackage v6 绑定 `scene-visual-runtime-v3`；
- attempt/time/path/process/explanation identity exclusion、safe diagnostic input IDs、typed artifact state、direct
  snapshot diff 与 DAG dependency propagation tests。

## 已实现 create、inspect 与 prepare

- `project:create` 从 strict repository-relative input 原子创建 configured authoring；相同 creation identity
  只读 current，existing/partial/conflicting/symlink/path escape/special file fail closed；
- create 保留 authored Story/`ttsChunks`，复制 boundary template 与 sound/catalog projection，但零 provider、
  零媒体生成，且不写 narration work、artifact、workspace、attempt 或 delivery；
- `project:produce:inspect` 通过 check-only ports 返回 sourceState、baseline、unknown-safe estimated cost、
  structured task explanations 与 nextAction；前后 snapshot drift fail closed，零 provider/零 repository mutation；
- `project:produce:prepare` 是唯一有成本入口，负责 provider/cache/seal/master/timing、timing-bound authoring、
  fixed artifacts、Revision/DAG、dirty Agent workspaces 与 ExecutionAttempt，并区分 estimated/actual cost；
- explanation/baseline/attempt 只属于 diagnostic plane，不改变 Revision、TaskRevision、ArtifactAttestation、
  dispatch、materialization 或 DeliveryBuild identity/authority。

## 已实现 workspace 与 Artifact Store

- `.producer-work/<storyId>/<taskRevision>` strict resolution、immutable task/input seeds 和 exact cleanup；
- workspace/output path containment、regular/no-symlink、unknown/special file rejection；
- fixed check、commit-time recheck、attestation generation、same-parent staging、atomic promotion、identity conflict
  与 rollback；
- `.producer-attempts` append-only diagnostics；task/delivery terminal 使用 deterministic event key 原子
  compare-and-create，冲突不可被 projection 顺序覆盖，写入失败不污染 artifacts；
- commit/fail terminal events 与 continuation/converge 都绑定 exact attemptId，不按 latest attempt 串线；
  continuation 具有 one-shot atomic claim。

## 已实现 planning 与 task owners

- read-only current-plan builder 从 current Project contracts、template instances、asset manifest/selected bytes、narration identity 和
  runtime policies 计算 Revision/Task DAG；
- Scene、GlobalVisual、Cover workspace validators 与 commit flow；
- template-copy Scene 固定任务，不进入 Agent dispatch；共享 canonical builder/output contract 同时物化 copied
  source/assets 与完整 derived Scene bundle，并保证 create-only/fixed-prepared/materialized replan 的
  TaskRevision 稳定；
- configured template 的 Project-local `Renderer.tsx` 实现当前 `SceneRendererComponent` viewport props，并把
  `viewportWidth`/`viewportHeight` 适配为冻结模板内部的 `width`/`height`；模板源码不拥有 SceneViewport 或
  full-frame policy，既有 Project copy 也不会被共享模板修复静默改写；
- `DefaultOutroPreview` 的 AXMORF mark/wordmark 使用同一个 responsive lockup box 居中，图标初始展开位置与
  最终组合中心在 portrait/landscape 都有确定性回归；
- Root-facing prepare 输出 stable reuse/dirty/blocked summary、逐任务 direct/dependency/artifact 解释和 dirty Agent
  TaskRevisions；
- Scene executor 继续受 repository-local `remotion-best-practices`、Scene-only requirements、本地
  SceneViewport、resource/license 与 Remotion runtime gates 约束；它不感知 full-frame 安全区 inset。
- execution resolver 已按用户提示词明确字段、独立 settings、内置 `inline` 默认逐级解析；全新 checkout
  只需一个 shell-capable Agent，具备 runtime-native children 的宿主可显式选择最多四个 subagents；策略
  不进入 Revision/Task/artifact/delivery identity。
- `AGENTS.md` 是唯一 repository Agent authority；`CLAUDE.md`/`GEMINI.md` 只导入该文件，OpenAI Skill metadata
  只提供可选 UI 展示。生产脚本不调用任何厂商 Agent SDK。
- continuation 启动后 Root 不参与 barrier；event-driven fixed continuation 读取 immutable event log，在 task
  failure 或 attempt 创建起一小时 terminal deadline 到期时直接退出，在全部成功后只调用一次 converge，fixed failure 不重试或
  唤回 Root。

## 已实现 convergence 与 delivery

- converge 只读 replan，零 provider/workspace/new attempt；stale revision/incomplete artifact 在任何 live mutation
  前拒绝；
- task-owned staging、controlled replace、rollback 和 materialized bytes revalidation；
- ScenePackage、Coverage、RendererRegistry、GlobalVisualPackage 与生成式 Composition fixed refresh；
- build-owned staging、validated media reuse、synchronous Remotion/FFmpeg、H.264/AAC/channels、dimensions、fps、
  frame count、PNG、checksums 与 EOF decode；
- `publish.json` 最后写、exact four files、controlled current replacement 与 same identity no-op。

## Settings、删除与 zero Project

- settings schema v5 展示 sourceState、current Revision、estimated/actual cost、逐任务 structured explanation、
  latest attempt diagnostic 和 four-file delivery；不输出 raw fingerprints/private authoring/provider data；
- 独立 `private/execution-preferences.json` 以 strict contract/`0600` 原子保存 Root inline 或 subagents 最大并发
  偏好，文件缺失时使用内置 `inline`；它不改变 ProducerConfig fingerprint，当前用户提示词 override 不自动持久化；
- source Project enumeration 不读取 historical data，也不把 output-only roots 伪装成 Project；
- deletion scope 增加 `.producer-work`、`.producer-artifacts`、`.producer-attempts`，继续保护 private、voice、
  shared/core 与 other Projects；
- bootstrap、Registry、Catalog 和 settings 支持 zero Project。

## 验证边界

focused create/contracts/explanation/inspect/prepare/converge/settings/E2E tests 已验证原子 create、inspect
零写入/零 provider、dirty-only dispatch、精确 direct/dependency/artifact explanation、诊断隔离、安全边界、
历史隔离、current no-op 与 delivery failure reuse。

## Desktop Phase A repository adapter

基于 `4ad7e4e`，实施分支已完成 Task 0–6 的 repository-adapter 原型：

- exact Electron/Forge Vite pins、单 bundled BrowserWindow、sandboxed renderer、narrow typed preload 与 Engine
  `utilityProcess` lifecycle；
- 单一 managed Workspace 的原子初始化/修复、strict modes/checksums/symlink gates，以及只支持 `doctor` 的
  workspace-local `.rsp/bin/rsp`；
- token 只通过 owner-only file 和 MessagePort 进入 Engine，CLI 只连接 authenticated Unix-domain socket；App/Engine
  runtime 不启动 Settings、Remotion Studio 或其他 owned TCP listener；
- 只读 repository Preview Catalog；只接受 current Revision 匹配、exact-four-file validation Green 的 Delivery，
  timing 从同 revision canonical source 投影；
- bundled native `<video>` Player、Project selector、Scene/narration chunk-pause/caption tracks，以及不暴露 path、
  checksum/size 的 allowlisted `axmorf-media` stream protocol；
- 实际临时 Workspace/真实 socket/安装后 CLI 的 Agent integration smoke，及显式 package inventory allowlist。

Phase A 不修改 current production/delivery contracts，不提供 production/delivery `rsp` 命令，不迁移 Project/media/
artifact/delivery，不实现 `source-current`、optional Delivery、完整 Runtime Pack、DMG/签名/发布或许可证变更。当前
宿主不是 macOS，无法取得 Apple Silicon package、真实 App playback、custom protocol/process cleanup、zero App-owned
TCP 与 Hermes native evidence；状态严格保留 `implementation-complete-native-evidence-pending`。实施计划继续 active，
不推进 Phase B。

本轮 closeout 的完整验收仍必须按顺序运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run docs:check-links`、
`npm run check:static`、`npm run compositions`、`npm run check`。如果本次工作尚未取得某项 Green，交付报告必须
明确列出，不得仅凭本文宣称通过。

## 当前非目标

远程 scheduler/database/artifact store、平台发布、账号、上传、child identity persistence、subjective quality
gate、automatic capability promotion、Docker 和新的 TTS Gateway 均未实现。

binary installer、production-capable `rsp`、正式跨宿主 Skill lifecycle、Workspace production migration、
`source-current`/optional Delivery contracts、完整 offline Runtime Pack 和 public release 仍未实现；这些目标记录在
[Desktop App 产品架构](DESKTOP_APP_PRODUCT.md) 与
[macOS 维护与发行目标](DESKTOP_APP_MACOS_MAINTENANCE.md)。Phase A 的受限 Workspace/Skill/doctor/Preview surface
不进入或改变 current production authority。
