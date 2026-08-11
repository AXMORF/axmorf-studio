# Remotion Story Producer Agent Guide

本文件定义仓库内 Agent 的执行规则。默认中文交流，先给结论，再给最少必要依据。

## 权威文档

- 产品目标：`docs/FINAL_PRODUCT_GOAL.md`
- 生产流程：`docs/PRODUCTION_WORKFLOW.md`
- 当前事实：`docs/ITERATION_STATUS.md`
- 阶段门槛：`docs/ROADMAP.md`
- 架构：`docs/ARCHITECTURE.md`
- 确定性：`docs/DETERMINISTIC_EXECUTION.md`
- 名词：`docs/TERMINOLOGY.md`

文档冲突时先以 current 可执行代码和测试确认事实，再同步权威文档；不能把目标写成实现。

## 工程边界

- 只使用宿主机 Node.js/npm 与 Remotion CLI；不新增 Docker 或容器验证。
- 所有 `remotion` 与 `@remotion/*` 包保持完全相同的精确版本。
- 一 Story 一个 Composition；一 StoryBeat 一个 meaningId 和 Scene；完成制作的 Scene 对应一个
  ScenePackage。
- ttsChunks 是 Agent 已确定的朗读单元；工具不按标点自动拆分或重写。
- sealed PCM 实测时间是绝对 authority；统一用
  `ceilDiv(cumulativeSamples × fps, sampleRate)` 计算 frame boundary。
- Scene/transition 不移动、缩短或吞掉 spoken frames。TTS 波形不假定 bit-for-bit 可重复，必须
  经实测、checksum 和 fingerprint 封存。
- 字幕只由顶层 CaptionLayer 渲染；Scene root 透明，只输出 Beat 语义视觉与 Scene-local sound。
- Composition exactly once owns SceneSafeArea、captions、narration 与 GlobalVisual background。
- JSON/数据文件不包含 JSX、代码、动态模块路径或 executable expression。
- Scene renderer 通过 composition-local 静态 registry 绑定；render runtime 不调用 Agent、Skill、
  MCP、Git、网络服务或目录扫描。
- 所有选中媒体位于 repository `public/`，有 manifest identity 并通过检查。
- 所有 render-critical motion 使用 Remotion frame API；禁止 CSS animation/transition 和
  Tailwind animation utilities。

## 当前 production 与 delivery 边界

- 仓库只有一套 current production/delivery contracts 和 CLI dispatch；不读取、迁移、回填或
  解释旧 Run、旧 Project、旧交付或旧媒体。
- ProductionRun 只由 append-only events、immutable Scene/GlobalVisual results 与 current
  fingerprints 投影；中央 repository CLI 是唯一 writer。
- current freeze 同时产生 N Scene assignments 与 one GlobalVisual assignment；独立 Cover freeze
  产生 CoverAssignment。三个 owner kind 都通过 assignment-bound receipt 进入 detached watcher，
  但 Cover 不阻塞 production render-ready，也不进入 production state projection。
- GlobalVisual 只 owns project-local 背景、纹理、装饰和连续性 motif，不读取 Scene 输出，不
  渲染字幕/音频，不扩张为 Track、Scene DSL、自动布局或自动导演。
- production 的唯一成功终点是 `render-ready / awaiting-automatic-delivery`。它绑定
  `production-render-plan-v2` 与 `production-render-ready-v2`，不生成或检查最终 MP4。
- Cover missing/stale 不阻止 render-ready，但阻止自动 delivery build。
- 主 Agent 在冻结全部 assignment 后先启动 detached watcher，再用 Codex `create_thread` 创建 N 个
  Scene、一个 GlobalVisual 和一个 Cover 独立用户任务；全部创建调用完成后立即结束，不等待
  render-ready 或 delivery。
- watcher 是 check、正式 result/event、registry convergence 与 `delivery:build` 的唯一中央 writer。
- 每个 Project 只有 `deliveries/<storyId>/` 一个 current delivery slot；identity 变化时通过 staging
  受控替换旧 package，同一 identity 重复 build 仍为只读 no-op。
- build 先准备 immutable non-MP4 package 并 exactly once 写 `render-launch-intent-v2`，再用 fixed
  cwd/argv/log、`shell:false`、`detached:true` spawn Remotion。
- OS 发出 `spawn` 后才写 `render-launch-receipt-v2` 并返回 `delivery-render-started`。receipt 只
  证明 spawn acknowledgement，不证明 render completion 或 MP4 有效。
- intent 存在而 receipt 缺失时 launch-ambiguous，current scripts 永不自动重试。
- repository 不等待、监控、read、hash、probe 或 decode detached MP4，不保存 PID/exit 状态。
- PublishingIntent 在 Story 阶段冻结；CoverAssignment 只消费 StorySpec、VisualStyleSpec 和
  fixed CoverSpec。

## Project 与产物

- 具体 Project 只依赖 core，core 不依赖 storyId；ProjectRegistry/ResourceCatalog 允许 zero
  Project。
- `public/`、`src/projects/`、Registry/Catalog generated projection、`.narration-work/`、
  `.producer-runs/`、`out/` 与 `deliveries/` 都是 ignored 本地产物，不进入 Git。
- 用户明确要求删除一个、多个或全部已制作视频/Project 时，默认含义是删除这些 storyId 的全部
  本地生产数据，而非只删 MP4；必须使用 `npm run project:delete -- ... --confirm-delete`，不得用
  broad `rm`。删除范围包含 Project、匹配 public media、narration work、Runs、out 与 deliveries，
  但不包含 core、其他 Project、private config 或 `public/voice_profile/`。
- fresh clone 由 `npm run bootstrap` 重建 core proof assets 与 zero-safe Catalog/Registry；不得把
  具体 Project 或媒体加入 core version control。
- 默认 source/check 不读取历史媒体；显式 media/evidence/delivery 命令 fail closed。
- Project 可删除性矩阵只能在明确的 `mktemp` 隔离副本中执行，不删除真实作品。
- ProjectRegistry 在 bundle 前按固定一级目录生成静态 TypeScript；Composition 用
  `lazyComponent` 与字面量 `import()`，`Composition.tsx` 必须 default export。
- 目录发现只允许发生在固定生成步骤；ProjectRegistry 与 composition-local RendererRegistry
  分离。

## Scene 制作来源

每个 Scene owner 制作前必须完整读取并使用 repository-local
`.agents/skills/remotion-best-practices/SKILL.md`，再按当前 Renderer 需要读取其路由 reference。
`AGENTS.md`、assignment、contracts 与 validators 始终拥有更高 authority；Skill 不能扩大 owner
写入范围或 render runtime 边界。

新 Scene 只参考：

1. current Story/StoryBeat/timing/VisualStyleSpec/Scene plans 与相邻连续性；
2. current ResourceCatalog 已登记能力与本地资产；
3. 当前方案显式选择并本地化的 immutable upstream source。

Shotcraft 等来源只能通过冻结 commit、准确 demo/recipe 和最小依赖闭包进入 Scene；不得按名字
近似重写，不直接 import upstream repository/package/remote URL/global Skill。第三方代码与媒体
分别校验 license/attribution，未确认音频不得进入 ScenePackage。

不得搜索、打开、比较、模仿或复制旧生产 Scene、Composition、still、contact sheet 或历史布局
来制作新 Scene。窄 runtime 诊断必须与 authoring 决策隔离。

## Owner 与审核

- StoryCheck：外部旁白调用前由 Agent 检查 StoryBeat、ttsChunks、叙事完整性和 voice profile。
- AutoCheck：机械聚合 source、sealed narration、SemanticTiming、Registry 与 Narrative Baseline。
- Scene/GlobalVisual/Cover owner 只写 assignment-exclusive 路径并用固定 CLI 发布 one immutable
  `owner-ready` 或 `owner-failed` receipt；owner/root 均不直接 submit 正式结果。
- current 自动流程没有 NarrativeCheck、Scene aesthetic gate 或人工创意 gate。
- 新实现默认留在 `src/projects/<story>/`。只有 fingerprint-bound promotion proposal 与用户对
  scope/API/files/target 的明确授权后，才移入 `src/remotion/capabilities/`。

主 Agent 只使用 Codex `create_thread` 创建共享 checkout 的独立用户任务，不使用 subagent 或
worktree。每个任务 prompt 必须自包含 runId、assignment、独占目录、必读 Skill/reference 和
ready/failed receipt 命令。确认 watcher spawn acknowledgement 与所有 thread creation 调用后立即
结束；不得调用 `wait_threads`、`read_thread`、轮询或参与 check/submit/delivery。部分派发失败时
准确报告未派发 assignment，已启动 watcher 和已创建任务保持运行。

repo 不创建、托管或监控 Codex task，不保存 task/thread/progress/heartbeat。owner receipt 只绑定
assignment identity；无 receipt 时 Run 永久保持 `waiting-for-owner-results`，不超时、不猜失败、
不自动重试或创建替代任务。用户或外部自动化可为同一 immutable assignment 再创建独立任务。

## 故障语义

- 只返工 Agent-owned authored artifact；修正 owning path 并重跑同一 validator，不放宽合同。
- fixed workflow 在 valid inputs 下失败是系统缺陷：停止、不 retry/resume/skip，保存脱敏 incident，
  Red → minimal shared Green → focused/full verification → exact local commit，再从 fresh Run 重放。
- failed Run/event/result 保持 immutable，不手改 state、不复制 identity、不移除 live writer lock。
- provider、host tool、sandbox、permission 或 authorization failure 是 external blocker，不增加
  fallback、warm-up、自动重试或弱化 Chromium sandbox。
- launch-ambiguous 是 fail-closed 终态，不归类为可恢复 workflow failure。
- watcher launch 同样 intent-before-spawn、receipt-after-spawn；intent 无 receipt 是 ambiguous，
  禁止自动重试。receipt 只证明 watcher 获得 OS spawn acknowledgement。

## 修改与验证

- 保护用户未提交修改；不 reset、覆盖或整理无关内容。
- 删除、覆盖、强推、生产发布、密钥或权限变更必须有明确授权。
- 修改后先跑 focused checks，再按风险运行 `npm run check`；无法验证要说明原因。
- `npm run check:static` 是无 Chromium 子集；`npm run check:host` 是宿主浏览器/Project gate。
- `npm run check`、`npm run compositions`、所有 Remotion render/still/compositions 与真实
  production preflight 首次直接使用宿主权限，不先在沙箱试跑。
- 沙箱诊断失败不能判定 VoxCPM 不可用。
- 不为了通过检查预热/测试 TTS、fallback 或降低 Chromium sandbox。
- `scripts/production/` 与 `scripts/delivery/` 都只在根保留 CLI；application/domain/adapters 分层。
- 新 Composition 至少通过 `npm run compositions`；高风险视觉改动补真实 still/短片。
- 完成后检查 README、status、architecture、contracts 与 Skill 是否同步，复核 final diff。
- 精确 staging，不用 `git add .`；不 push，除非用户明确要求。
