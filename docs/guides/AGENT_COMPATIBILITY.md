# Agent compatibility

> 文档类型：操作指南

本仓库把 Agent 当作可替换的创意任务 executor。生产 authority 来自 repository-local contracts、CLI、
task workspace、validator、ArtifactAttestation 和 current delivery，不来自宿主名称、聊天状态或 Agent API。

## 入口与单一 authority

| 宿主                     | 开箱入口             | 说明                                                          |
| ------------------------ | -------------------- | ------------------------------------------------------------- |
| Codex                    | `AGENTS.md`          | 原生读取                                                      |
| Cursor                   | `AGENTS.md`          | 原生读取；不需要 `.cursor/rules` 副本                         |
| GitHub Copilot           | `AGENTS.md`          | 支持 Agent instructions；不需要重复的 repository instructions |
| Claude Code              | `CLAUDE.md`          | 只导入 `AGENTS.md`                                            |
| Gemini CLI               | `GEMINI.md`          | 只导入 `AGENTS.md`                                            |
| 其他 shell-capable Agent | 手动读取 `AGENTS.md` | 视频任务再读取其中指向的 repository-local Skill               |

`AGENTS.md` 是唯一仓库级 Agent 指令 authority。宿主入口文件不得复制规则；否则更新时会形成双 authority。
`.agents/**/agents/openai.yaml` 是可选 OpenAI UI metadata，其他宿主可以忽略。

## Desktop App Phase A 历史与 Phase B current 边界

Phase A repository adapter 的历史范围是 checksum-bound managed Workspace、doctor-only `rsp-local-v1`、read-only
repository Preview Catalog 与 authenticated Unix-domain socket；它不暴露 production/delivery 命令。Phase A 的原型
自动化和已完成 native evidence 见 [Desktop Phase A Smoke](DESKTOP_PHASE_A_SMOKE.md)，不能把该历史 surface 当作
current Desktop runtime authority。

Phase B current implementation 已 clean-break 为 Workspace-owned `rsp-local-v2`：`.rsp/bin/rsp` 是 embedded Runtime
Pack 安装的 self-contained client，只连接 App-running authenticated Unix-domain socket，不依赖 host Node/npm/Git、
源码 checkout 或 repository npm fallback。public surface 覆盖 `doctor`、`help --json`、read-only schemas、
`project create-context/validate/create/list/delete`、`project revise-context/revise-validate/revise`、`asset import`、`context`、`inspect`、`prepare`、
`task bind/describe/finalize/check/commit/fail/file-read/file-write`、`attempt status/recover-inspect/reissue`、
one-shot `continue` 与 `delivery build`。`manual` 可在
`project-production-source-current` 终结且没有可播放视频；`automatic` 或 later explicit Delivery 才能产生复验后的
exact four-file current package。

现有作品修订不要求源码 checkout，也不复制 MP4 或 Project。Agent 读取 packaged `schema project-revision` 与 active
`revise-context`，提交 raw patch 后使用返回的 `candidateId` 调用带 `--candidate` 的生产命令；旧 current Delivery
保持不变，直到候选 exact-four-file Delivery 验证并原子晋升。Scene task 只能从自己的 immutable context 创作，
历史 normalized Renderer fingerprint 和同 Revision narrated Renderer exact/normalized duplicate 均由 fixed
validator 拒绝。

`schema project-create` 不需要 active App session，返回 structural/static-cross-field JSON Schema 与有效 raw example；
active `project create-context` 投影 exact style/collection/template/resource choices，`project validate` 在写入前执行完整
static + config/Runtime Pack operational validation。`project create` stdin 禁止 command/input/protocol wrapper；所有
公开失败可返回脱敏 `path/code/message/ownerAction`。dirty Agent task 自带 immutable `inputs/task-contract.json`，其中
包含 exact output schemas/examples/component signatures；`task finalize` 由 fixed controller 计算 fingerprint/receipt，
Agent 不需要源码 checkout、私有 builder 或 tests 推导输入与输出字段。

Runtime Pack 只携带 renderer/bundler 所需的 checksum-bound exact Studio/Studio Shared 内部依赖，不包含 Remotion
CLI、Studio Server、Studio UI 或 launch surface。App/Engine 不启动 Remotion Studio 或 Settings Web service；UDS 是
唯一 control plane，DeliveryBuild 期间 renderer 可临时绑定 `127.0.0.1` OS-ephemeral data listener，终态与退出后归零。
App 启动时校验 managed ledger；没有 active work 才通过 staging/verify/rollback 同步 root instructions、managed
Skill、Hermes prompt 与 `.rsp/bin/rsp`。外部 Agent 不应手改这些受管路径；Project/media/Delivery/private config
不属于该自动更新集合。

`npm run desktop:integration-smoke` 证明 host-neutral managed discovery、完整 CLI invocation 与真实 socket contract，
但不是 Codex 或 Hermes 完整生产认证。packaged native gate 的 deterministic executor 现只消费 task 随附合同/examples，
再调用 public `task finalize/check/commit`，因此可证明不依赖 hardcoded 私有 output builder 的机器合同闭环；它没有安装
或调用外部创作 Agent。Codex/Hermes 仍必须通过同一 `.rsp/bin/rsp` protocol、TaskSpec、validator 与 completion evidence
的真实 creative E2E，不能复制第二套规则；该外部 Agent 产品证据仍 pending。

App 不安装、升级、托管或调用 Codex/Hermes SDK。目标行为见
[Desktop App 产品架构](../DESKTOP_APP_PRODUCT.md)。

## 最低能力

开箱生产只要求当前 Agent 能：

1. 读取 Workspace/仓库文件和 JSON；
2. 运行 attempt-bound `task bind`，并通过返回的 exact shared workspace 或 controller-IO capability 编辑
   declared outputs；
3. 在 Desktop Workspace 运行 self-contained `.rsp/bin/rsp` 并读取结构化 stdout；源码 checkout 流程才使用 npm CLI；
4. 保持 fixed continuation 进程运行到 terminal output。

全新 checkout 的内置执行模式是 `inline`，不要求原生子 Agent API。`subagents` 只是一项可选加速能力：宿主
必须能创建相互隔离的 runtime-native children、限制并发、执行 wait-any admission，并验证
`shared-workspace` 或 `controller-io` transport。delegate 名称、线程、聊天或普通后台 shell 本身不证明该能力；
宿主原生 delegate tool 若确实提供上述 child execution 与 transport 可以满足合同。transport 是宿主按本次
production 提供的能力证据，不是 AXMORF App 设置。未验证 transport 或宿主无法确认容量时，生产在 prepare
前阻塞；不自动回退或伪造 child completion。

## 通用视频入口

收到创建、生产、重建或交付视频的请求时：

1. 读取 `.agents/skills/remotion-story-producer-video/SKILL.md`；宿主是否支持自动 Skill discovery 不影响该路径。
2. 按 Skill 只加载当前阶段需要的 reference。
3. 运行 `project:execution:resolve`。没有持久化设置或提示词 override 时会解析为 `inline`。
4. 后续只消费 `project:produce:inspect`、`project:produce:prepare` 返回的 JSON、task workspace 和 exact commands。

`task bind` 是零写入硬门：immutable input、Task/attempt identity、checksum 或 transport 失败时不得写任何 task
文件。finalize/check 的 `agent-output` issues 由同一 executor 修复；只有真实 spawn/mount/controller-IO/sandbox/
permission 故障才是 `worker-host`。terminal failed attempt 通过显式 recover-inspect/reissue 创建 fresh attempt；
旧 attempt 不变，reissue 零 provider call 且不要求 current Delivery。

仓库脚本不调用 Codex/Claude/Gemini/Cursor/Copilot SDK，也不创建 Agent。`prepare` 产生通用任务描述和 shell
commands；当前宿主负责 inline 执行或可选 child admission。

## 可选能力

- 原生子 Agent：只影响执行并发，不进入 Revision、TaskRevision、artifact 或 delivery identity。
- 外部图片 MCP：只有当前 Agent 实际暴露兼容 tools 时才启用；缺失时完整省略。
- OpenAI Skill metadata：只改善 OpenAI host 的展示与显式 `$skill-name` 调用，不是执行前提。

无论宿主如何，完成证据始终是 fixed validator、ArtifactAttestation，以及经过 checksum、media probe 和 EOF decode
复验的 exact four-file delivery。
