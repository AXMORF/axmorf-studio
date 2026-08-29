# Development Working Style

Act as an autonomous software engineering agent. Optimize for correctness, simplicity, maintainability,
and completing the task end-to-end.

## Working principles

- Before modifying code, inspect the relevant codebase, existing conventions, dependencies, tests, and
  `AGENTS.md` instructions. Do not guess about code you can inspect.
- Understand the root cause before fixing bugs. Prefer the smallest coherent change that fully solves it.
- Follow existing architecture, naming, formatting, and abstractions. Do not refactor unrelated code.
- Preserve existing behavior unless the requested change explicitly requires otherwise.

## Planning and execution

- Implement small, well-defined tasks directly. For multi-file or architectural work, form a concise plan
  and then execute it.
- Use skills, subagents, plugins, or specialized workflows when they materially improve correctness or
  efficiency. Make reasonable decisions autonomously; ask only when a missing choice materially changes
  the implementation or an action is destructive, irreversible, or high-risk.

## Verification

- Do not call work complete because the code looks correct. Run relevant tests, typecheck, lint, builds, and
  runtime checks. Add regression coverage for meaningful fixes and behavior changes when practical.
- If a check cannot run, state exactly what was not verified and why. Review the final diff for unintended
  changes, dead code, debug artifacts, and unnecessary complexity.

## Libraries, APIs, and code quality

- Verify current primary documentation when behavior depends on a changing library, framework, API, model,
  CLI, or tool. Prefer existing dependency versions; use `pnpm` only when the repository does not specify a
  package manager.
- Prefer clear, explicit, focused code. Comment non-obvious intent, handle errors deliberately, and consider
  relevant edge cases, security, concurrency, cleanup, and performance.

## Communication

- Default to concise Chinese explanations. Keep identifiers and technical terms consistent with the repo.
- During long work, report meaningful findings or blockers. Final responses summarize changes, decisions,
  verification, and remaining risks, and never claim success without evidence.

<!-- CODEGRAPH_START -->

## CodeGraph

When a `.codegraph/` directory exists, use CodeGraph before grep/find for code discovery:
`codegraph explore "<question>"` or `codegraph node <symbol-or-file>`. If it does not exist, skip it.

<!-- CODEGRAPH_END -->

--- project-doc ---

# Remotion Story Producer Agent Guide

本文件定义仓库内 Agent 的执行规则。默认中文交流，先给结论，再给最少必要依据。

## 通用 Agent 入口

- `AGENTS.md` 是唯一仓库级 Agent 指令 authority。`CLAUDE.md`、`GEMINI.md` 与任何宿主专用 metadata
  只能作为导入或发现 adapter，不复制、覆盖或扩展这里的规则。
- 处理视频创建、生产或交付时，即使宿主不会自动发现 Skill，也必须手动读取
  `.agents/skills/remotion-story-producer-video/SKILL.md`；Scene task 再按该 Skill 读取 repository-local
  `remotion-best-practices`。
- 全新 checkout 的内置执行默认是 `inline`，只要求当前 Agent 能读写文件并运行 shell。只有用户或已保存设置
  选择 `subagents` 且宿主确实提供 runtime-native child execution 时才使用子 Agent；不得把线程、聊天或普通
  后台进程伪装成 child runtime。
- `.agents/**/agents/openai.yaml` 只提供 OpenAI host 的可选 UI metadata，不属于 Skill、production contract、
  Task identity 或完成证据。其他 Agent 直接读取 `SKILL.md`、references、JSON contracts 与 CLI 输出。
- 宿主兼容性、最低能力与入口文件见 `docs/guides/AGENT_COMPATIBILITY.md`。

## 权威文档

- 产品目标：`docs/FINAL_PRODUCT_GOAL.md`
- Desktop App 产品边界：`docs/DESKTOP_APP_PRODUCT.md`
- macOS 维护与发行：`docs/DESKTOP_APP_MACOS_MAINTENANCE.md`
- Ubuntu 维护与打包：`docs/DESKTOP_APP_UBUNTU_MAINTENANCE.md`
- 生产流程：`docs/PRODUCTION_WORKFLOW.md`
- 当前事实：`docs/ITERATION_STATUS.md`
- 阶段门槛：`docs/ROADMAP.md`
- 架构：`docs/ARCHITECTURE.md`
- 确定性：`docs/DETERMINISTIC_EXECUTION.md`
- 名词：`docs/TERMINOLOGY.md`

文档冲突时先用 current 可执行代码和测试确认事实，再同步权威文档；Desktop App 平台文档定义已确认目标，
不表示当前仓库已存在 App、installer、`rsp` 或 optional Delivery，不能把目标写成实现。

## 产品不变量

- current repository 只使用宿主机 Node.js/npm 与 Remotion CLI，不新增 Docker；目标 Desktop App 改为内置
  exact Runtime Pack，使最终用户无需 Node/npm，但仍不引入 Docker。所有 `remotion` 与 `@remotion/*` 保持
  完全相同的精确版本。
- 一 Story 一个 Composition；一 StoryBeat 一个 meaningId 和 Scene，完成物化的 Scene 对应一个
  ScenePackage。StoryBeat 严格区分 narrated 与只允许位于首尾的 silent Scene。
- `project:create` 从 strict create input 原子创建 configured authoring，并将选定边界 Scene template
  源码与资源复制为 Project-local immutable instance；它不调用 provider、不生成媒体或生产 attempt。
  template-copy Scene 由 fixed task 验证和产出 artifact，不派发 Agent。
- installed Workspace 的现有作品修改使用 same-Project candidate Revision：old current source/Delivery 在候选
  exact-four-file 验证成功前保持不变，成功后受控晋升，失败回滚；不得用 MP4/Project/历史 Scene clone 形成第二 authority。
- `ttsChunks` 是 Agent 已确定的原子朗读单元，不由工具机械拆分或截断；每个 chunk 必须满足固定的
  `caption-display-unit-v1` 预算（最多 72 display half-units）。public create/revise validation 在任何写入前返回
  脱敏字段级 issue，Agent 应保持顺序拆成相邻 chunks 后重新验证。sealed PCM 实测 samples 是绝对时间
  authority；frame boundary 统一为 `ceilDiv(cumulativeSamples × fps, sampleRate)`。Scene/transition 不吞 spoken frames。
- 字幕只由顶层 CaptionLayer 渲染；Scene root 透明，只输出 Beat 语义视觉与音效。Composition exactly
  once owns safe-area-local SceneViewport、captions、narration 和 GlobalVisual background；GlobalVisual 的
  base layer 覆盖完整 Composition，decoration layers 只挂载于首个至末个 narrated Scene 的连续窗口，silent
  boundary Scenes 不接收项目装饰。Scene 的 `(0, 0)` 是 viewport 左上角，只接收 viewport width/height，
  不感知 full-frame inset。
- 旁白独占 narration track；非旁白声音都是独立 `SoundContribution`。Project BGM 只覆盖 narrated
  content window，不进入 silent boundary Scenes。
- JSON/数据文件不包含 executable expression；renderer 由 composition-local static registry 绑定。
  render runtime 不调用 Agent、Skill、MCP、Git、网络或目录扫描。
- 所有媒体都位于 repository `public/`、具有 manifest identity 并通过检查。render-critical motion
  只用 Remotion frame API，禁止 CSS animation/transition 和 Tailwind animation utilities。

## 唯一 production 与 delivery 主链

- `project:create`/authoring edit 之后、`project:produce:inspect` 之前只有一个可选 Agent capability slot：若
  当前 Root Agent 的实际 callable tool surface 暴露同一外部图片 MCP 的 `get_provider_status`、
  `search_images`、`preview_images`、`acquire_image`，且 receipt 兼容 `project:asset:import`，则先查本地
  Catalog，确有素材缺口时才 acquire/import；否则从本次流程完全省略该 slot，不报错、不生成占位 task、
  prompt、estimate 或 DAG node。已安装/已配置、shell 可发现、其他 Agent 可调用都不算当前可用。
  MCP/receipt/candidate path 不进入 child、Revision、Artifact Store、delivery 或 runtime；只有 import 后的
  Project-owned manifest identity 与 bytes fingerprint 能成为 production input。
- `npm run project:execution:resolve` 在 inspect 前解析一次 Agent 执行策略：用户提示词中的明确字段优先于
  `private/execution-preferences.json`，未明确字段继续继承配置，再继承内置 `inline` 默认。override 只作用于当前
  production，除非用户明确要求保存；解析结果不进入 Revision/Task/artifact/delivery identity。`inline` 由
  Root 一次只执行一个 dirty workspace；`subagents` 使用不超过四个且受 runtime capacity 限制的 bounded pool。
  runtime capacity 未知时按 1、明确为 0 时阻塞；用户要求 exact capacity 而无法满足时也必须在 prepare 前
  阻塞，不自动换模式。
- `subagents` 还必须声明宿主已验证的 `shared-workspace` 或 `controller-io` worker transport；普通 delegate、
  thread、chat 或后台进程不等于 runtime-native child。transport 未验证时在 prepare 前阻塞；inline 不要求该能力。
- `npm run project:produce:inspect -- --project <storyId>` 是严格只读、零 provider call 的诊断入口；Root
  必须先报告 source readiness、estimated cost、artifact reuse 与结构化失效解释，再运行有成本 preparation。
- `npm run project:produce:prepare -- --project <storyId>` 是唯一允许调用 provider、准备 fixed artifacts、
  计算 ProductionRevision/content-addressed Task DAG、创建 dirty workspace 与 ExecutionAttempt 的生产入口。
- RevisionId、TaskRevision、ArtifactAttestation identity 不包含 attemptId、历史执行 ID、时间戳、PID、
  absolute path 或 Agent identity。ExecutionAttempt 只保存诊断，不拥有 artifact 或 delivery。
- prepare 只为未命中有效 artifact 的 Agent 任务创建 `.producer-work/<storyId>/<taskRevision>/`。Root 按已解析
  模式串行执行或受限派发 dirty `scene-owner`、`global-visual-owner`、`cover-owner`；valid artifacts 必须复用。
- 每个 Root/child task executor 在任何 task 读写前必须运行 prepare 返回的 exact attempt-bound `task bind`；
  只有 `task-worker-bound` 返回的 shared workspace capability 或 controller-IO commands 可用，不得猜路径。
  bind 会验证 immutable `task.json`、`inputs/context.json`、`inputs/task-contract.json`、Task/attempt identity 与
  checksum；任一失败零写入退出并上报 structured fixed issue。之后只写 declared outputs，循环运行 bound
  finalize/check，最后调用 bound commit 或 typed fail。
  commit 必须重跑 validator；只有 fixed validator 能把 workspace 原子提升为 ArtifactAttestation。聊天、
  child status 与 Agent 自评都不是 authority。
- Artifact hit 每次重新验证 contract、task identity、dependencies、validator version、exact sorted file
  set、path containment、regular-file/no-symlink、size 与 checksum；目录存在不代表命中。
- Root 在串行执行完或把全部 dirty tasks 纳入 bounded pool 后的最后一个生产动作，是启动 prepare 返回的
  attempt-bound `project:produce:continue`。此后 Root 挂起，不轮询 child、不读取终态、不推理或修复。fixed continuation
  必须先获得 one-shot atomic attempt claim，再等待 immutable task-terminal event log；重复 continuation
  fail closed。任一失败直接终止且不 converge；全部成功才内部恰好调用一次 converge；从 ExecutionAttempt
  创建时刻起一小时总 deadline 内缺少终态时写 timeout failure 并退出；converge 失败也直接终止。
- converge 使用只读 current replan，拒绝 stale revision；不调用 provider、不创建 workspace/attempt；全部
  required artifacts 齐全前不得修改 live
  owner roots。物化使用受控 staging/replace/rollback，随后刷新 ScenePackage、Coverage、RendererRegistry、
  GlobalVisualPackage 与生成式 Composition，并从 live paths 复验 bytes 与 attestations 一致。
- converge 在物化与 derived refresh 复验成功后写入 `source-current`。`manual` 在这里返回
  `project-production-source-current`，不创建 Delivery staging/render/publish；`automatic` 才在同一 fixed
  continuation 内调用 Delivery builder。用户也可稍后从 current source 显式构建 Delivery；该动作不创建
  provider call、Agent task、workspace 或 ExecutionAttempt。
- Delivery builder 使用 build-owned staging，可跨捕获失败复用同 identity 已验证媒体，等待 Remotion/FFmpeg
  完成，验证 H.264/AAC、声道、尺寸、fps、frame count、PNG、checksum 与 EOF decode，最后写
  `publish.json`。exact 四文件全部通过后才受控替换 `deliveries/<storyId>/`。
- current delivery exactly 是 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`。相同
  DeliveryBuildId 且完整时只读 no-op；完成终点是 `project-production-complete` 或
  `project-production-current`，两者都表示实际四文件已复验。
- delivery policy 只控制 source-current 后是否继续，不进入 ProductionRevision、TaskRevision、
  ArtifactAttestation 或 SourceCurrent identity；renderer/runtime fingerprint 只影响 DeliveryBuild。Desktop
  Preview Player 只播放 exact current four-file Delivery，不执行 Project TSX，也不启动 Remotion Studio、Studio
  Server 或 Settings Web service。Desktop control plane 只有 authenticated Unix-domain socket；真实
  DeliveryBuild 可在当前 build 范围内临时监听 `127.0.0.1` OS-ephemeral HTTP 端口，终态与退出后必须清理。

## Project 与本地产物

- 具体 Project 只依赖 core；ProjectRegistry/ResourceCatalog 支持 zero Project。Registry 在 bundle 前
  生成静态字面量 imports，composition-local RendererRegistry 与全局 ProjectRegistry 分离。
- `public/`、`src/projects/`、generated Registry/Catalog、`.narration-work/`、`.producer-work/`、
  `.producer-artifacts/`、`.producer-attempts/`、`.producer-runs/`、`out/` 与 `deliveries/` 都是 ignored
  本地产物，不进入 Git。
- settings 只从 current source Projects、新 attempts/artifacts 与 current four-file delivery 投影；结构化
  explanation、baseline、estimate 与 attempt 只属于 diagnostic plane，不得改变 Revision、TaskRevision、
  ArtifactAttestation、dispatch、materialization 或 DeliveryBuild identity/authority；不得
  扫描 `.producer-runs/` 来规划、构建、收敛或判定 current 状态。历史 Run 只是 deletion-only 数据。
- 用户明确删除 Project 时，使用
  `npm run project:delete -- --project <storyId> --confirm-delete` 的完整 storyId-owned 清理语义；禁止 broad
  `rm`。删除范围含 Project/public/narration/work/artifact/attempt/legacy Run/out/delivery，不含 core、其他
  Project、private config、共享素材或 `public/voice_profile/`。
- 删除器只为历史 `.producer-runs` 保留内部严格 `runId/storyId` ownership parser，不导出或解释旧合同。
  删除矩阵只能在明确的 `mktemp` 隔离副本中运行。

## Scene 制作来源与任务所有权

每个 Scene task executor 必须完整读取 repository-local
`.agents/skills/remotion-best-practices/SKILL.md`，再按 Renderer 需要读取路由 reference。`AGENTS.md`、
TaskSpec、contracts 与 validators 拥有更高 authority，不能扩大 workspace 写入范围。

新 Scene 只参考 current Story/StoryBeat/timing/VisualStyle/brief、ResourceCatalog 当前登记能力和当前方案
显式本地化的 immutable upstream source。不得搜索、比较、模仿或复制历史 Scene、Composition、still、
contact sheet 或布局。第三方 source/media 分别校验 license/attribution；未确认音频不得进入 artifact。

- Scene、GlobalVisual、Cover 是互相隔离的 task workspace。GlobalVisual 不读 Scene 输出；Cover 只读
  StorySpec、VisualStyleSpec 与 fixed CoverSpec。
- exact-reference Scene 的 lineage/license/phase/checksum 由机械 validator 检查，不使用主观自评 gate。
- `scene-owner-validator-v3` 拒绝 Project 创建/修订时冻结的历史 Renderer normalized fingerprint；converge 拒绝
  一个 Revision 内 narrated Scenes 的 exact bytes 或 normalized fingerprint 重复。改 plan JSON 不能替代
  meaning-local Renderer 创作。
- 新实现默认留在 Project-local artifact。只有 fingerprint-bound promotion proposal 且用户明确授权
  scope/API/files/target 后，才移入 `src/remotion/capabilities/`。
- Root 只有在解析为 `inline` 时才能按 task prompt 串行创作；不得读其他 executor workspace、跨 task 代
  commit 或持久化 child identity/chat/heartbeat/token。subagents 模式的 spawn failure 记录 exact
  `spawnFailureCommand`，不得自动回退 inline。

## 故障语义

- Agent-owned workspace 校验失败时，仅原 task executor 修正 owning paths 并重跑同一 validator；不得降低合同。
- finalize/check 返回的 `agent-output` structured issue 默认都是可修复任务问题，禁止调用 host failure；
  host failure 只限 child spawn、workspace mount、controller-IO、sandbox、permission/authorization 等基础设施。
  immutable input/identity fault 属于 `fixed-controller` 且必须零写入。
- terminal failed attempt 永不 reopen。用户显式恢复时先 `attempt recover-inspect`，再 `attempt reissue`；仅在同一
  current Revision、无 active attempt、fixed dependencies current 时创建 fresh attempt，零 provider call、无需
  current Delivery、保留有效 draft 并复用 valid artifacts。candidate revision 的 current Delivery 门不变。
- fixed workflow 在 valid inputs 下失败是系统缺陷：当前 production lifecycle 立即终止。只有用户另行启动的
  engineering task 才能保存脱敏 incident，Red → minimal shared Green → focused/full verification；之后再从
  current inputs 新建 ExecutionAttempt。不得在失败 attempt 内修复或重试。
- provider、host tool、sandbox、permission 或 authorization failure 是 external blocker；不添加 fallback、
  自动 retry、TTS warm-up 或降低 Chromium sandbox。
- artifact checksum drift、unknown file、symlink、path escape、identity conflict、stale revision 与
  materialized drift 都 fail closed。不得手改 artifact manifest 或 current delivery 来继续。

## 修改与验证

- 保护用户未提交修改；不 reset、覆盖或整理无关内容。删除、覆盖、强推、生产发布、密钥或权限变更
  必须有明确授权。精确 staging，不用 `git add .`，不 push，除非用户明确要求。
- `scripts/project-production/` 采用 `domain/`、`application/`、`adapters/`、根 CLI 分层。domain 不依赖
  filesystem/application/adapters；application 编排 ports；adapters 不反向承载业务规则。
- 修改后先 focused checks，再按风险运行 `npm run check`。`npm run check:static` 是无 Chromium 子集；
  `npm run check:host` 是宿主浏览器/Project gate。
- `npm run check`、`npm run compositions`、所有 Remotion render/still/compositions 与真实 production
  preflight 首次直接使用宿主权限。沙箱诊断失败不能判定 VoxCPM 不可用，不得降低 Chromium sandbox。
- 新 Composition 至少通过 `npm run compositions`；高风险视觉改动补真实 still/短片。完成后检查
  README、status、architecture、contracts、Skill、active old-authority grep 与完整 diff。
