# Agent compatibility

> 文档类型：操作指南

生成的 Workspace 把 Agent 当作可替换的创意任务 executor。生产 authority 来自 package contracts、Workspace-local CLI、
task workspace、validator、ArtifactAttestation 和 current delivery，不来自宿主名称、聊天状态或 Agent API。

## 入口与单一 authority

| 宿主                     | 开箱入口             | 说明                                                          |
| ------------------------ | -------------------- | ------------------------------------------------------------- |
| Codex                    | `AGENTS.md`          | 原生读取                                                      |
| Cursor                   | `AGENTS.md`          | 原生读取；不需要 `.cursor/rules` 副本                         |
| GitHub Copilot           | `AGENTS.md`          | 支持 Agent instructions；不需要重复的 repository instructions |
| Claude Code              | `CLAUDE.md`          | 只导入 `AGENTS.md`                                            |
| Gemini CLI               | `GEMINI.md`          | 只导入 `AGENTS.md`                                            |
| 其他 shell-capable Agent | 手动读取 `AGENTS.md` | 视频任务再读取其中指向的 Workspace-local Skill                |

`AGENTS.md` 是唯一仓库级 Agent 指令 authority。宿主入口文件不得复制规则；否则更新时会形成双 authority。
`.agents/**/agents/openai.yaml` 是可选 OpenAI UI metadata，其他宿主可以忽略。

## 最低能力

开箱生产只要求当前 Agent 能：

1. 读取仓库文件和 JSON；
2. 在精确 workspace 内编辑普通文件；
3. 运行 npm CLI 并读取结构化 stdout；
4. 保持 fixed continuation 进程运行到 terminal output。

全新 scaffolded Workspace 的内置执行模式是 `inline`，不要求原生子 Agent API。`subagents` 只是一项可选加速能力：宿主
必须能创建 bounded runtime-native children、执行 wait-any admission，并为本次 production 验证一种 transport：

- `shared-workspace`：child 可进入 bind 返回的 exact relative workspace；
- `controller-io`：child 没有 filesystem access，只调用 bind 返回的 strict file-read/file-write commands。

线程、聊天、普通后台 shell、delegate 名称或未验证 transport 都不证明该能力。transport 是不持久化的 host
capability evidence，不是 execution preferences/Project 设置。未验证 transport、容量为零或无法满足 exact
capacity 时，生产在 prepare 前阻塞；不自动回退或伪造 child completion。

## Workspace capability gate

平台兼容不使用预设 OS allowlist，也不要求固定三平台矩阵。macOS 15 ARM64 已提供原生
package/scaffold evidence，Ubuntu 24.04 x86_64 已提供 packed exact-Delivery E2E evidence；其他宿主由 Agent 按
package README 准备 Node.js/npm 与声明的宿主前置条件，再以生成 Workspace 中的 `npm run doctor` 判定当前环境
是否 ready。

Agent 可以使用普通 package manager/version manager 准备环境、用 npm 重装声明依赖、配置 provider 或选择可用
端口；不得修改 `node_modules`、package internals、精确依赖、lockfile authority、Chromium sandbox 或 validator
来制造 Green。doctor 失败且声明能力无法满足时，必须报告 external blocker。doctor Green 只证明当前 Workspace
的静态 readiness，不是 production completion、Delivery evidence 或对整个操作系统家族的认证。

## README Agent 入口分层

root README 与两个 package README 只提供一句 Agent prompt：根据公开项目的最新 README 在指定本地路径完成
Workspace 搭建与可用性验收，并停止在视频生产之前。环境要求、安装命令和验证步骤由 README 及其当前引用拥有，
prompt 不复制这些内容。

creator template 生成的 Workspace README 才提供“下一次视频”的 prompt。Agent 此时以该版本本地的 `README.md`、
`AGENTS.md`、Workspace-local Skill、按阶段 references 与结构化 CLI 输出为执行 authority；public README 或 Agent
记忆中的命令不能覆盖当前本地文档。安装 prompt 与视频 prompt 分层，二者都不复制完整 production contract。

## 通用视频入口

收到创建、生产、重建或交付视频的请求时：

1. 读取 Workspace `AGENTS.md`，运行 `npm run doctor` 并按上述边界准备环境；
2. 读取 `.agents/skills/axmorf-video/SKILL.md`；宿主是否支持自动 Skill discovery 不影响该路径；
3. 按 Skill 只加载当前阶段需要的 reference；
4. 修改现有 Project 时，先按 [`PROJECT_REVISION.md`](PROJECT_REVISION.md) 读取 exact current context、校验 strict
   input 并创建隔离 candidate；它不要求额外宿主 API，后续只消费 candidate-routed npm commands；
5. 运行 `npm run project:execution:resolve`。没有持久化设置或提示词 override 时会解析为 `inline`；选择 subagents
   时把 verified transport 作为当前 resolver input；
6. 后续只消费 `npm run project:produce:inspect`、`npm run project:produce:prepare` 返回的 JSON、task workspace 和 exact
   commands；每个 dirty task 在任何 content read/write 前先通过 attempt-bound zero-write bind；
7. `task-worker-bound` 后读取 immutable `task.json`、`inputs/context.json`、`inputs/task-contract.json`，再按返回的
   capability 与 bound describe/finalize/check/commit/failure commands 执行。

仓库脚本不调用 Codex/Claude/Gemini/Cursor/Copilot SDK，也不创建 Agent。`prepare` 产生通用任务描述和 shell
commands；当前宿主负责 inline 执行或可选 child admission。

## 可选能力

- 原生子 Agent/transport：只影响本次执行并发与 I/O capability，不持久化 child identity，不进入
  Revision、TaskRevision、artifact 或 delivery identity。
- 外部图片 MCP：只有当前 Agent 实际暴露兼容 tools 时才启用；缺失时完整省略。
- OpenAI Skill metadata：只改善 OpenAI host 的展示与显式 `$skill-name` 调用，不是执行前提。
- revision candidate：只是同一 npm CLI/production 主链的隔离 routing scope，不是 child transport、第二 Workspace
  或第二 production authority。

无论宿主如何，完成证据始终是 fixed validator、ArtifactAttestation，以及经过 checksum、media probe 和 EOF decode
复验的 exact four-file delivery。

terminal failed attempt 不由宿主重开。显式 recovery 依次使用 read-only/zero-provider
`npm run project:attempt:recover-inspect` 与 same-Revision `npm run project:attempt:reissue`；fresh attempt 可复用 valid
artifacts/drafts，不要求 current delivery。active、stale、fixed-flow failure 均不能 reissue。
