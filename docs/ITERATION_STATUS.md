# Iteration Status

> 文档类型：current implementation authority
>
> 最后复核：2026-08-27 Ubuntu x64 Desktop 重装、真实外部 Agent production 与 exact-four-file Delivery verified complete

## 当前结论

仓库当前 production authority 已收敛为 ProductionRevision、content-addressed Task DAG、task workspace、
ArtifactAttestation、reusable Artifact Store、fixed convergence、attested `source-current` 与独立 fixed
DeliveryBuild。`manual` 在 source-current 停止；`automatic` 或 later explicit action 才生成 exact four-file Delivery。
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

当前 checkout 为 zero Project：ProjectRegistry 是 0 entry，`deliveries/` 是 0 current delivery，ResourceCatalog
投影为 19 entries。readiness、cache reuse 与 dirty task estimate 都不是完成证据；zero-Project
bootstrap/Registry/Catalog/settings 合同保持有效。

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
- attempt/time/path/process/explanation identity exclusion、safe diagnostic input IDs（含 Scene
  `originality-baseline`）、typed artifact state、direct snapshot diff 与 DAG dependency propagation tests；

## 已实现 create、inspect 与 prepare

- `project:create` 从 strict repository-relative input 原子创建 configured authoring；相同 creation identity
  只读 current，existing/partial/conflicting/symlink/path escape/special file fail closed；
- create 保留 authored Story/`ttsChunks`，复制 boundary template 与 sound/catalog projection，但零 provider、
  零媒体生成，且不写 narration work、artifact、workspace、attempt 或 delivery；
- `project:produce:inspect` 通过 check-only ports 返回 sourceState、baseline、unknown-safe estimated cost、
  structured task explanations 与 nextAction；前后 snapshot drift fail closed，零 provider/零 repository mutation；
- `project:produce:prepare` 是唯一有成本入口，负责 provider/cache/seal/master/timing、timing-bound authoring、
  fixed artifacts、Revision/DAG、dirty Agent workspaces 与 ExecutionAttempt，并区分 estimated/actual cost；
- diagnostic snapshot allowlist 必须覆盖 current TaskSpec 的全部 `inputFingerprints[].id`；无法安全投影的 ID
  在 attempt 创建前 fail closed，不能把已完成的 provider/fixed preparation 误报成配置或创意错误；
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
- Scene、GlobalVisual、Cover workspace validators 与 commit flow；GlobalVisual validator v2 要求完整 Composition 的
  no-Props base layer 与 narrated-window-only decoration layer，窗口由 canonical timing 派生且以 local frame 0 开始；
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

## 已实现 convergence、source-current 与 explicit delivery

- converge 只读 replan，零 provider/workspace/new attempt；stale revision/incomplete artifact 在任何 live mutation
  前拒绝；
- task-owned staging、controlled replace、rollback 和 materialized bytes revalidation；
- ScenePackage、Coverage、RendererRegistry、GlobalVisualPackage 与生成式 Composition fixed refresh；Composition
  全程挂载 GlobalVisual base，并以 fixed `Sequence` 将 decoration 限制在首个至末个 narrated Scene；
- converge 从 live bytes 复验后写入 attested source-current；manual 在这里返回 source terminal，automatic 才继续，
  delivery policy 不进入 Revision/Task/Artifact/source identity；
- later explicit DeliveryBuild 不创建 provider call、Agent task、workspace 或 ExecutionAttempt；build-owned staging、
  validated media reuse、synchronous Remotion/FFmpeg、H.264/AAC/channels、dimensions、fps、
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

## Desktop Phase A repository adapter（历史 closeout）

基于 `4ad7e4e`，实施分支已完成 Task 0–6 的 repository-adapter 原型：

- exact Electron/Forge Vite pins、单 bundled BrowserWindow、sandboxed renderer、narrow typed preload 与 Engine
  `utilityProcess` lifecycle；
- 单一 managed Workspace 的原子初始化/修复、strict modes/checksums/symlink gates，以及只支持 `doctor` 的
  workspace-local `.rsp/bin/rsp`；
- token 只通过 owner-only file 和 MessagePort 进入 Engine，CLI 只连接 authenticated Unix-domain socket；Phase A
  App/Engine runtime 不启动 Settings、Remotion Studio 或 App-owned TCP listener；
- 只读 repository Preview Catalog；只接受 current Revision 匹配、exact-four-file validation Green 的 Delivery，
  timing 从同 revision canonical source 投影；每个 Project 只做一次完整 Delivery validation，timing 前后用轻量
  current Revision 读取复验，Catalog refresh 使用独立有界长超时；
- bundled native `<video>` Player、Project selector、Scene/narration chunk-pause/caption tracks，以及不暴露 path、
  checksum/size 的 allowlisted `axmorf-media` stream protocol；
- media ticket 在准入时做一次完整 SHA-256，后续 Range/HEAD 通过含 ctime 的 pinned descriptor/path identity 做 O(1)
  drift gate，不随 seek 重复哈希整段视频；
- 实际临时 Workspace/真实 socket/安装后 CLI 的 Agent integration smoke；显式 package inventory 只允许固定 bundles、
  brand/integration resources 与 `package.json`，拒绝整个 `node_modules`、Remotion dependency tree 和 repository data；
- window load/IPC setup 的启动失败 transaction 会停止 Engine/UDS、销毁 partial window 并撤销 media handler，正常
  lifecycle dispose 保持幂等。
- manual-only GitHub Actions native gate 已验证完成：目标为 hosted `macos-15` arm64，使用 exact commit 的独立
  临时 repository fixture 和 current Delivery builder 生成真实 four-file Delivery，再运行 packaged App playback、Range、
  security、doctor、process/TCP、cleanup、Agent discovery 与 reopen evidence；普通 package 不启用 probe，artifact allowlist
  不包含 fixture、Delivery、完整 App 或 private data。evidence commit
  `e5b9b6bd81bbe229177a64ed326ab3e46eaf2220` 的 Actions run
  [`32591197950`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32591197950) conclusion 为 success；
  artifact ID `9480398272` 已复核 default/custom/reopen 三组无错误截图和报告、arm64 package identity、exact-four-file
  fixture、真实播放/seek、协议拒绝矩阵、doctor failures/redaction、第二实例、zero owned TCP 与退出 cleanup。

Phase A 不修改 current production/delivery contracts，不提供 production/delivery `rsp` 命令，不迁移 Project/media/
artifact/delivery，不实现 `source-current`、optional Delivery、完整 Runtime Pack、DMG/签名/发布或许可证变更。
Apple Silicon native gate 与 609/609 full repository tests Green 后，Phase A 状态为 `verified-complete`，实施计划已归档，
ROADMAP 当时的下一入口推进到 Phase B；该次 Phase A closeout 没有实施 Phase B。runner 没有 Hermes CLI，
Hermes-specific smoke 按合同准确保留 pending；unconditional Agent gate 的 managed discovery、Codex-compatible
discovery 和真实 `rsp doctor` 已 Green。

本轮 closeout 的完整 `npm run check` 已在上述 Apple Silicon run Green：609/609 tests、typecheck、lint、
`docs:check-links`、static build、真实 Remotion compositions 与 source verification 均完成。文档 closeout 后仍须在
最终精确提交重跑完整 gate；不得仅凭本文宣称通过。

## Desktop Phase B verified closeout

当前实现以 focused tests 覆盖 Phase B：显式 repository/Workspace
`ProductionLocations`、runtime-bound `source-current`/Delivery identity split、Workspace v2 upgrade 与 root migration
rollback、immutable arm64 Runtime Pack manifest/builder/verifier、自包含 Node SEA `rsp-local-v2`、Workspace-owned
Project/media/private config、完整 public command surface、exact-attempt terminal/one-shot continuation、Engine active-work、
Preview Catalog refresh、exact-four-file-only Player、Desktop Settings 与 managed Skill。Desktop runtime 的 control plane
只有 authenticated Unix-domain socket；无配置时 doctor 仍可启动并结构化报告 provider not configured，Delivery
capability 仍独立报告为 available。

Phase B implementation 已完成。经 primary-source 与 exact 4.0.489 本地源码复核、并由用户确认安全边界，Runtime Pack
现在携带 checksum-bound 的 bundler/renderer 及其 exact Studio/Studio Shared 内部依赖，但继续拒绝 Remotion CLI、
Studio Server、`.bin/remotion` 与 launch surface；App 不启动 Studio UI/Server。Workspace Delivery adapter 只从显式
Workspace/Runtime Pack roots 构建 disposable bundle，并在单次 DeliveryBuild 内将 Remotion listener 强制绑定
`127.0.0.1` 的 OS-ephemeral 端口；success/failure/cancel/shutdown 都恢复私有 adapter、关闭 listener 并清理 staging。
Desktop doctor 返回 `deliveryAvailable: true`、`deliveryBlocker: null` 与结构化 UDS-only-control/loopback-render policy。

Phase B 已在 exact evidence commit `04ca57ed5b6469eb9bc4acd8c86829ca0222576a` 上取得 hosted Apple Silicon
packaged production Green。GitHub Actions run
[`32648089941`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32648089941) 在 `macos-15`
arm64 / macOS 15.7.7 完整成功；evidence artifact ID `9495509231`，digest
`sha256:fe61c7de405a0e860a3669178cefeb462c2798d55879260fc92995fe863fdf55`。人工复核确认：

- ordinary package 与 gate-only package inventory 分离，ordinary package 不携带 native fixture/probe；Runtime Pack、
  Electron/Node SEA、browser 与 FFmpeg/FFprobe 均为 arm64/manifest-bound identity；
- public `rsp-local-v2` manual 流程先到真实 `source-current` 且 deliveries 为空，later explicit Delivery 与 automatic
  流程均真实生成并复验 exact `video.mp4`、两张 Cover 和 `publish.json`；视频为 H.264/AAC、1080x1920、30fps、
  90 frames，封面为 1600x1200 与 1200x1600 PNG，全部 EOF decode Green；
- packaged Preview Player 在 manual/automatic/reopen 三组均完成播放、seek 与 timeline 检查；DeliveryBuild 只使用
  `127.0.0.1` OS-ephemeral listeners，失败、显式 Quit、automatic terminal 与 reopen 后 listener/process/session/
  operation lock/staging 均归零；第二实例复用同一 lock scope 并有界退出；
- artifact 只含脱敏 JSON/log 与三张 Preview Player 截图，不含 MP4、Cover、token、Bearer credential、private key 或
  protected voice data；workflow 在 package 后再次完成 747/747 repository tests、typecheck、lint、docs、static、
  compositions 与 host checks。

因此 Phase B 状态为 `verified-complete`，计划已归档；其 closeout 后 Roadmap 进入 Phase C。Phase B native gate 使用
test-only deterministic task executor 完成 dirty Agent task outputs，并未安装或调用外部创作 Agent；Hermes Workspace
production、真实外部 Agent creative E2E、Intel x64、DMG、签名、公证、distribution 与公开发布不在该次证据范围。

## Desktop Phase C 双架构 enablement（verified-complete）

当前实现已把 Desktop Runtime Pack、compatibility manifest、doctor/shell DTO、package target、repository compositor
resolution 与 native smoke 从 arm64 literal 收敛为唯一 darwin architecture configuration，只允许 `arm64`/`x64`。两种
target 分别绑定原生 `@remotion/compositor-darwin-arm64` 或 `@remotion/compositor-darwin-x64`；package-lock 的 Remotion、
Rspack 与 esbuild optional dependency closure 对两种目标都有 executable focused coverage，且拒绝 foreign-architecture
compositor。architecture 继续只进入 RuntimePackId/rendererRuntimeFingerprint/DeliveryBuild，不进入 ProductionRevision、
TaskRevision、TTS 或 Agent Artifact identity。

`desktop:native:gate` 和 manual-only Phase C workflow 共用一个架构参数化入口。gate 会分别复验 host
`process.arch`/`uname -m`、ordinary/gate package isolation、Runtime Pack/package inventory，以及 Electron、Chromium、
FFmpeg/FFprobe、Node、SEA `rsp` 和 compositor 的单一 Mach-O identity；随后执行 public `rsp-local-v2` manual
source-current + explicit Delivery、automatic Delivery、exact four-file media probes、Preview playback/seek/timeline、
failure/Quit/reopen cleanup、空 host-tools `PATH`、无 external TCP connection、evidence redaction 和 package 后完整 repository
gate。精确本地命令与 evidence contract 见
[Desktop Phase C native gate](guides/DESKTOP_PHASE_C_NATIVE_GATE.md)。

exact evidence commit `54a6c12699eb56b02051f0b47eb2568e9bf3f716` 的 manual-only Actions run
[`32656883032`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32656883032) 已在 hosted
`macos-15-intel` x64 job `97236894640` 与 `macos-15` arm64 job `97236894857` 同时 Green。x64 evidence artifact ID
`9497965091`、digest `sha256:0f0c089a5de5299d98b034abee68a37cf3eb803b855e78efcde3547866945a28`；arm64 artifact ID
`9497817568`、digest `sha256:e3622d812958ac9f2ffc69e0e72aeef23bcede153dc9fd34c6e6ccc1ad8c191d`。

人工复核确认 x64 `process.arch=x64`、`uname=x86_64`、`@remotion/compositor-darwin-x64` 与全部 packaged runtime
binary 都是单一 x86_64 Mach-O；arm64 job 对应复验单一 arm64 identity。两种架构均完成 ordinary/gate package inventory
隔离、SEA injection、manual source-current + explicit Delivery、automatic Delivery、exact four-file H.264/AAC/PNG/EOF
probes、Preview playback/五位置 seek/timeline、failure/Quit/reopen 后 process/TCP/session/operation lock/staging cleanup、
offline/no-host-tools 与 evidence redaction。package 后 repository gates 全部 Green，完整测试为 754/754。

因此 Phase C 状态为 `verified-complete`，Roadmap 进入 Phase D。native gate 仍使用 test-only deterministic
provider/task executor，`runner-summary.json` 明确记录 `deterministicFixture: true`、
`externalCreativeAgentTested: false`；安装外部 Codex/Hermes 的 creative E2E 是独立待补产品证据，不由本次 native
evidence 推断。

## Desktop Phase D internal unsigned DMG（verified-complete）

当前 implementation 已加入 Electron Forge 7.11.2 官方 DMG maker、严格 version/architecture/unsigned 文件名、
ordinary package-only installer builder、mounted DMG/isolated Applications/first-run/doctor/Preview/cleanup verifier、
checksum-bound release manifest、runtime SBOM input、Gatekeeper UI 安装说明与 dual-architecture set validator。
`AXMORF_DESKTOP_NATIVE_GATE_BUILD=1` 仍只属于 Phase C gate；installer 在 gate 后重新构建 ordinary package，并拒绝
gate-only provider、diagnostic 与 lifecycle marker。

manual-only Phase D workflow 在 hosted `macos-15` arm64 与 `macos-15-intel` x64 上分别重跑现有 native production gate，
再构建和挂载对应 DMG。每架构 upload exact six-file release root；只有 exact commit 与 appVersion 一致且两边均 Green，
final job 才上传带 `dual-release-manifest.json` 的完整双架构 artifact。workflow 没有 push/release/publisher 权限或 trigger，
不创建 GitHub Release。

exact evidence commit `e82dd2b90d291ba87a26a1a2d1cc4d327dbaea9c` 的 manual-only Actions run
[`32671348209`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32671348209) 已整体 success。arm64 job
`97272565221` 与真实 x64 job `97272565147` 均完成 Phase C native production gate 和 ordinary installer gate；release-set job
`97275379558` 仅在同一 `0.1.0` appVersion、同一 exact commit 与两个 native manifest 均 Green 后完成。

arm64 artifact ID `9501625959`、digest
`sha256:f90b80b2818052c3edcde3b8a774121f3144dd15c75ef6f06f4c060a6cd2b2a1`；x64 artifact ID `9501750841`、digest
`sha256:40d34620a08ea91a432a09b57c2dbc03c26253eef9476d0b1aea1cb966ae172b`；complete dual artifact ID
`9501762840`、digest `sha256:f2abedc9a37481009f11b9848c91937eddb6853b484956d055e5eafe8edf0d9c`。下载后的 dual artifact 已人工复跑
两架构 strict release verifier、fresh dual-set generation/byte comparison、checksum、13-file regular-only inventory 与 workflow
redaction 规则。DMG evidence 为：

- arm64：`AXMORF-Studio-0.1.0-mac-arm64-full-unsigned.dmg`，`356232619` bytes，SHA-256
  `00a8a62909c1ab3df978ff4dd1a63b01f3a65d487321597a462b655958b1abf3`；
- x64：`AXMORF-Studio-0.1.0-mac-x64-full-unsigned.dmg`，`370199416` bytes，SHA-256
  `ef334455bbf6bba6a7075fb48c6b0e1d0723b424775e5df3facdde07b6ec7f16`。

因此 Phase D internal installer artifact 状态为 `verified-complete`。Remotion runtime binary redistribution permission 仍为
`not-satisfied`；用户对本轮 internal/manual-only 构建的授权不等于许可已满足，也不授权公开发布。精确入口与 artifact contract 见
[Desktop Phase D internal unsigned DMG](guides/DESKTOP_PHASE_D_UNSIGNED_DMG.md)。

## Desktop Ubuntu x64 package 与 production UX（verified-complete）

当前 implementation 保留 macOS arm64/x64 Forge DMG maker、native Runtime Pack 和双架构 release-set 流程，同时新增
Ubuntu 24.04 x64/glibc 原生目标。`desktop:package:mac` 显式进入 Mac package-only 路径，原 `desktop:package` 保持
兼容；`desktop:package:ubuntu` 使用固定 Node `22.23.1` 构建 Linux-only Runtime Pack、strict package inventory 和
完整离线 `amd64` Debian package。Linux 包只携带对应 compositor、Chromium、FFmpeg/FFprobe 与 `.so` closure，Mac
逻辑和 `.dylib` closure 未删除或降级。

Preview Catalog terminal refresh 已改为先原子刷新 verified Delivery identity，再发布 idle state；普通 Catalog refresh
在投影未变化时复用 media ticket。播放器 `onError` 后的“恢复播放”是独立 Main/IPC use case：不刷新 Engine/Catalog，
而是为当前 Story 撤销并重签 MediaTicket/FileHandle，生成独立 request nonce，同时保持
`storyId + deliveryBuildId` 不变。旧 URL 立即拒绝新请求，轮换前已取得租约的并发 Range response 可安全读完再关闭旧
handle；Renderer 以新 URL 重新挂载 `<video>`。真实 Electron harness 覆盖同一 App/Renderer 进程内实际媒体失败、点击
恢复、`loadedmetadata`/`canplay`、播放推进与旧并发 Range 完成。Desktop 同步投影 latest ExecutionAttempt 的
dirty/reused/committed/current/failed task 数、attempt state、terminal、diagnostic、DeliveryBuildId 与 exact-four-file
completeness；界面加入进度条、最终摘要和带 exact Project ID 二次确认的完整 `project:delete` 操作。

两个 built-in boundary Scene template 不再维护 Desktop-only synthetic chime。Workspace integration 和 Remotion preview
共同消费 checksum-bound `DefaultIntroPreview` / `DefaultOutroPreview` 音频 authority；固定 template import 会把相同 bytes
与 cue/volume 投影到 Project-owned Catalog，private override 不能改变产品默认音效。

Ubuntu 本机已通过完整 Workspace lifecycle gate，覆盖两个 boundary Scene templates、真实 Runtime Pack production 与
exact-four-file Delivery；`.deb` 已完成本机安装、隔离 first-run、Preview/Settings renderer 和 preload surface 验收。
2026-08-27 对包含 current diagnostic-input contract 的 `.deb` 做同版本覆盖重装后，installed Workspace 的 doctor/provider
恢复 ready；真实外部 Agent 仅凭一句自由创作提示新建 Project，prepare 创建 attempt、三个 dirty owner artifacts 全部通过
fixed validator，automatic continuation 返回 `project-production-complete`，并生成全新 H.264/AAC MP4、两张 PNG Cover 与
`publish.json`。这项人工 E2E 证据独立于 deterministic native gate，不改变公开发行许可状态。
平台默认 Workspace 改由 Electron 系统视频目录决定，macOS 仍为 Movies、Ubuntu 为 Videos；首次选择只在 Engine
初始化成功后持久化。Linux 旧包错误保存且不存在的 Movies 默认路径会在不覆盖任何现有目录的前提下原子修复。
Workspace integration package tree 的目录/文件权限分别固定为 `0755`/`0644` 并纳入 package inventory，系统安装后
Debian `postinst` 会一并修复旧版 root-only 目录。Engine 只能从 App Resources 的内置 Runtime Pack 和集成资源初始化
Workspace，不允许源码或宿主 toolchain fallback。
该 artifact 仍是 local/internal unsigned package，不等于公开发行或 Remotion redistribution Gate 已满足。平台命令、安装
步骤和验证矩阵见 [Desktop App Ubuntu 维护与打包](DESKTOP_APP_UBUNTU_MAINTENANCE.md)。

## Desktop Settings / Project create / playback recovery repair（implemented，Ubuntu reverified；Mac artifacts pending）

当前 implementation 已把 Desktop rail 中的 raw ProducerConfig JSON 主路径替换为独立“Preview / 配置”导航，并复用
Web Settings 的纯 General、SafeArea、SceneDefaults、Collections、Execution 与 TTS form/model。Desktop 不启动或嵌入
Settings Vite/HTTP 服务；Provider/voice/render/readability/Scene/collection、execution 与 Delivery default 只进入 macOS
Application Support 的单一 encrypted private-config envelope。旧 encrypted ProducerConfig 可按原值读入 envelope；secret
只以 configured bit 投影，留空保持、显式替换，optional VoxCPM token 可显式清除。Main/IPC 保存保持 strict schema 与
active-work gate，并对 validation、safeStorage/private-file authority 与 saved-but-Engine-restart-failed 返回不同的脱敏
code/message/action/issues，不再统一显示“操作未完成”。

Workspace `rsp-local-v2` 现提供无需 App session 的 `help --json`、project-create/project-revision/asset-import structural schemas；active
`project create-context` 投影 exact style/collection/template/resource choices，`project validate` 在 create 前合并 strict
static 与 config/Runtime Pack operational checks。`rsp project create` 明确拒绝
`command/input/protocolVersion/requestId/workspaceId` wrapper；公开创建与 task 失败返回不带字段值的
`issues[].path/code/message/ownerAction`。managed Skill 已收缩为 discovery/router，dirty Agent workspace 增加 immutable
`inputs/task-contract.json`，逐 output 提供 JSON Schema/example/component signature/derived ownership；fixed
`task finalize` 统一计算 fingerprint/receipt。native gate 的 deterministic executor 不再调用私有 output builder，只消费
task contract 后走 finalize/check/commit，再验证 source-current、manual/automatic Delivery 与 exact-four-file Preview。

现有 Project 修改使用 same-Project candidate Revision：`revise-context/validate/revise` 创建隔离候选，后续
`context/inspect/prepare/continue/delivery build` 以 `--candidate` 绑定；候选强制 automatic Delivery，exact-four-file
验证成功后才原子晋升，旧 current source/Delivery 在此之前不变，晋升失败回滚。Scene owner policy 已升级为 v3：
Project 创建/修订记录其他 Project Renderer 的不可逆 normalized fingerprint baseline，task check 拒绝历史复制，
converge 再拒绝一个 Revision 内 narrated Scenes 的 exact bytes 或 normalized fingerprint 重复。
Desktop 每次启动还会校验 Workspace managed ledger；没有 active work 时以 same-parent staging/verify/rollback
原子同步 root instructions、managed production Skill、Hermes prompt 与 `.rsp/bin/rsp`，不会改写 Project、media、
Delivery 或 Application Support private config。

deterministic packaged native gate 仍准确标记 `externalCreativeAgentTested: false`：它只证明 host-neutral contract
consumer、fixed controller、task self-description/finalization、Runtime Pack、Delivery 与 Preview，不把人工结果伪装成
自动 gate。独立的 Ubuntu installed-Workspace 人工 E2E 已由真实外部 Agent 完成；Hermes 以及 macOS 外部 Agent 仍未验证。
上述 settings、create contract 与 playback recovery repair 尚需在 exact implementation commit 上通过双架构 native
Phase D workflow 并重新生成 internal unsigned DMG；前一 Phase D DMG 不包含本修复，不能作为本轮 Mac 验证 artifact。

## 当前非目标

远程 scheduler/database/artifact store、平台发布、账号、上传、child identity persistence、subjective quality
gate、automatic capability promotion、Docker 和新的 TTS Gateway 均未实现。

公开 DMG 发行、签名/公证、Hermes 与 macOS 外部 Agent creative E2E 和 public release 仍未验证；Phase C 的内部
darwin arm64/x64 native evidence 与 Phase D internal installer artifact 都不等于许可满足、公开 distribution 或
公开支持政策。这些目标记录在
[Desktop App 产品架构](DESKTOP_APP_PRODUCT.md) 与
[macOS 维护与发行目标](DESKTOP_APP_MACOS_MAINTENANCE.md)。Phase A 的受限 Workspace/Skill/doctor/Preview surface
不进入或改变 current production authority。
