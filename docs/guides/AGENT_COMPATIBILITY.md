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
源码 checkout 或 repository npm fallback。public surface 覆盖 `doctor`、`project create`、`asset import`、`context`、
`inspect`、`prepare`、`task check/commit/fail`、one-shot `continue` 与 `delivery build`。`manual` 可在
`project-production-source-current` 终结且没有可播放视频；`automatic` 或 later explicit Delivery 才能产生复验后的
exact four-file current package。

Runtime Pack 只携带 renderer/bundler 所需的 checksum-bound exact Studio/Studio Shared 内部依赖，不包含 Remotion
CLI、Studio Server、Studio UI 或 launch surface。App/Engine 不启动 Remotion Studio 或 Settings Web service；UDS 是
唯一 control plane，DeliveryBuild 期间 renderer 可临时绑定 `127.0.0.1` OS-ephemeral data listener，终态与退出后归零。

`npm run desktop:integration-smoke` 证明 host-neutral managed discovery、完整 CLI invocation 与真实 socket contract，
但不是 Codex 或 Hermes 完整生产认证。Codex/Hermes 必须通过同一 `.rsp/bin/rsp` protocol、TaskSpec、validator 与
completion evidence 的真实 E2E，不能复制第二套规则。Phase B 的 hosted Apple Silicon packaged gate 已通过 public
surface 验证 deterministic task execution、manual/automatic Delivery、Preview 与 cleanup；它没有安装或调用外部创作
Agent。Phase B 因此 verified complete，但 Hermes Workspace production proof 与外部 Agent creative E2E 仍 pending。

App 不安装、升级、托管或调用 Codex/Hermes SDK。目标行为见
[Desktop App 产品架构](../DESKTOP_APP_PRODUCT.md)。

## 最低能力

开箱生产只要求当前 Agent 能：

1. 读取仓库文件和 JSON；
2. 在精确 workspace 内编辑普通文件；
3. 运行 npm CLI 并读取结构化 stdout；
4. 保持 fixed continuation 进程运行到 terminal output。

全新 checkout 的内置执行模式是 `inline`，不要求原生子 Agent API。`subagents` 只是一项可选加速能力：宿主
必须能创建相互隔离的 runtime-native children、限制并发并执行 wait-any admission。线程、聊天、普通后台 shell
或宿主无法确认的容量不算该能力。已保存设置选择 `subagents` 但宿主容量为零时，生产在 prepare 前阻塞；不自动
回退或伪造 child completion。

## 通用视频入口

收到创建、生产、重建或交付视频的请求时：

1. 读取 `.agents/skills/remotion-story-producer-video/SKILL.md`；宿主是否支持自动 Skill discovery 不影响该路径。
2. 按 Skill 只加载当前阶段需要的 reference。
3. 运行 `project:execution:resolve`。没有持久化设置或提示词 override 时会解析为 `inline`。
4. 后续只消费 `project:produce:inspect`、`project:produce:prepare` 返回的 JSON、task workspace 和 exact commands。

仓库脚本不调用 Codex/Claude/Gemini/Cursor/Copilot SDK，也不创建 Agent。`prepare` 产生通用任务描述和 shell
commands；当前宿主负责 inline 执行或可选 child admission。

## 可选能力

- 原生子 Agent：只影响执行并发，不进入 Revision、TaskRevision、artifact 或 delivery identity。
- 外部图片 MCP：只有当前 Agent 实际暴露兼容 tools 时才启用；缺失时完整省略。
- OpenAI Skill metadata：只改善 OpenAI host 的展示与显式 `$skill-name` 调用，不是执行前提。

无论宿主如何，完成证据始终是 fixed validator、ArtifactAttestation，以及经过 checksum、media probe 和 EOF decode
复验的 exact four-file delivery。
