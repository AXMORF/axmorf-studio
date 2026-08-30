# Iteration Status

> 文档类型：current implementation authority
>
> 最后复核：2026-08-30 Ubuntu 24.04 x86_64 packed production E2E 与 macOS 15 ARM64 native gate

## 当前结论

当前分支已在 Foundation 主链上实现 npm Workspace 本地 vertical slice：

- 根 package 是 `private` npm workspaces owner；`@axmorf/studio` 提供 compiled ESM public
  exports、单一 CLI、package-owned RuntimeResources、Remotion entry 和预构建 Web；
- `create-axmorf-studio` 以 same-parent staging 原子创建普通独立应用，写入精确 dependencies、marker、
  配置、宿主无关 `AGENTS.md`/Skill，并默认完成 install、lockfile、bootstrap 和 doctor；
- contracts 与 Remotion runtime 的 canonical source 已迁入 runtime package；Workspace 只拥有可写 Project、
  media、config、work/artifact/attempt/out/delivery，以及 catalog/registry 的薄静态 facade；
- Web 只监听 `127.0.0.1`，复用 Foundation 配置/诊断/进度 UI，新增 verified current Delivery player/covers；
  Remotion Studio 继续作为独立实时预览，Web/Studio 都不拥有创作或生产 authority；
- runtime 通过已验证的 package policy manifest 与 package resources 工作，Remotion/FFmpeg/FFprobe/Studio 均解析
  Workspace-local npm CLI JavaScript entry，不依赖 shell、PATH 或 `.bin` 路径。

当前平台策略是 Agent-first capability gate，不是固定 OS matrix：Agent 按 README 创建 Workspace、读取本地
`AGENTS.md`/Skill、准备 package 声明的 Node.js/npm 与宿主前置条件，再以 `npm run doctor` 判定当前环境 readiness。
macOS 15 ARM64 的 package/scaffold native gate 与 Ubuntu 24.04 x86_64 的 packed exact-Delivery E2E 都是
reference environment evidence，不是 runtime allowlist；其他宿主可以尝试通过同一 gate，但未经原生证据不描述为
已认证。Agent 不得修改 package internals、精确依赖、sandbox 或 validators 来强行适配。

仓库和两个 child packages 已采用 Apache-2.0；child packages 已移除 `private`、声明 public publish access，并
补齐 package README/LICENSE/third-party notices。`@axmorf/studio` 与 `create-axmorf-studio` 的公开 registry
查询当前均为 E404，且用户已确认 `axmorf` npm organization。GitHub 仓库已更名为
`agenticnoob/axmorf-studio`。production 与完整 repository `npm audit` 已通过 `fast-uri@3.1.6`、
`nanoid@3.3.18` 精确 overrides 以及 Vite/esbuild/ESLint 兼容更新归零。公开发布尚未执行：macOS 15 ARM64
package/scaffold evidence 与 Ubuntu 24.04 x86_64 exact-Delivery evidence 已完成，固定 OS matrix 已从首次发布 gate
移除；provenance/2FA/token、push/tag 与首次 npm publish 仍需单独授权。

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

当前 checkout 没有 source Project 或 current Delivery，ProjectRegistry 为 0 entry；这验证了 zero-Project
bootstrap/Registry/Catalog/settings 合同。readiness、cache reuse 与 dirty task estimate 始终都不是完成证据。

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
- Scene executor 继续受 Workspace-local `remotion-best-practices`、Scene-only requirements、本地
  SceneViewport、resource/license 与 Remotion runtime gates 约束；它不感知 full-frame 安全区 inset。
- execution resolver 已按用户提示词明确字段、独立 settings、内置 `inline` 默认逐级解析；全新 scaffolded Workspace
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

2026-08-30 的 package 验收在仓库外使用真实 `.tgz` 完成：creator 默认流程创建 Workspace，删除并通过
`npm ci` 重装后 doctor 五项检查通过；public `/contracts` 与 `/remotion` imports、三个 Remotion compositions、
Web static/API/CSP、浏览器交互、zero-provider `project:create` 和只读 inspect 均通过。packed runtime 只含
allowlisted `package.json`/`dist/**`，CLI 保持 executable；host-neutral Skill 扫描未发现特定 Agent host、会话或
child tool 假设。

生成的 Workspace scripts 现在机械包含 inspect 前必需的 `project:execution:resolve`，并由 scaffold contract
regression 锁定。

脚手架实现提交 `2bac738d4b24745b6bd10be386257dff7c60c4d1` 已通过
[macOS npm Workspace gate #33291456702](https://github.com/agenticnoob/axmorf-studio/actions/runs/33291456702)：
`Darwin arm64`、Node `v24.16.0`、npm `11.13.0` 上完成 repository/public package gates、两个真实 tarball
pack、全新外部 Workspace 安装、doctor 五项检查、三个 Remotion compositions 与双侧 audit；下载后的两个 tarball
SHA-256 与 CI receipt 一致。artifact `9726110695` 的 digest 为
`sha256:2d0a74df869a1ec43ee294640f0bb8e0c7d8dbf7eea426d6ad80b01ab2c16b46`。

Ubuntu 24.04 x86_64 随后从新 pack 的 runtime/creator tarballs 创建 clean Workspace，完成 doctor、官方 registry
零漏洞 audit、strict Project create、execution resolve、inspect/report、provider narration、四个 bounded Agent
tasks、one-shot continuation、convergence、Remotion render 与 exact four-file Delivery。terminal 为
`project-production-complete`；H.264/AAC 1080×1920/30fps video、两张固定尺寸 PNG、checksums 与 bundled FFmpeg
EOF decode 全部通过。完整 receipt 见
[Ubuntu npm Workspace production acceptance](evidence/2026-08-30-ubuntu-npm-workspace-production-acceptance.md)。

本轮同时修复了 packed boundary 暴露的四个问题：scaffold execution resolver 缺失、bundled FFmpeg 不提供 raw
`s16le` muxer、scaffolded `remotion.config.mjs` 未进入 Workspace configuration snapshot，以及 EOF decode 默认选择
缺失的 `wrapped_avframe` encoder。音频现在经 PCM WAV 解码后由 Node 重建 canonical WAV；video/Cover decode
显式选择 bundled `rawvideo`/`pcm_s16le` encoders；Workspace 必须恰有一个受支持的 `.mjs` 或 `.ts` Remotion config。

未认证宿主仍按 capability gate best-effort 接入，不预先阻塞，也不描述为已验证支持。consumer production 与完整
repository audit 均为 0 finding。Remotion 继续精确锁定 4.0.489；安全处置没有运行不受控 `audit fix`，而是固定
传递版本并单独升级兼容的开发工具。ESLint 保持 9.39.5，因为 Remotion 当前内置的 TypeScript ESLint 8.21 peer
range 不支持 ESLint 10。真实 npm publish、tag 与 push 尚未执行。

focused create/contracts/explanation/inspect/prepare/converge/settings/E2E tests 已验证原子 create、inspect
零写入/零 provider、dirty-only dispatch、精确 direct/dependency/artifact explanation、诊断隔离、安全边界、
历史隔离、current no-op 与 delivery failure reuse。

本轮 closeout 的完整验收仍必须按顺序运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run docs:check-links`、
`npm run check:static`、`npm run compositions`、`npm run check`。如果本次工作尚未取得某项 Green，交付报告必须
明确列出，不得仅凭本文宣称通过。

## 当前非目标

远程 scheduler/database/artifact store、平台发布、账号、上传、child identity persistence、subjective quality
gate、automatic capability promotion、Docker 和新的 TTS Gateway 均未实现。
