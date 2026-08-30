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
必须能创建相互隔离的 runtime-native children、限制并发并执行 wait-any admission。线程、聊天、普通后台 shell
或宿主无法确认的容量不算该能力。已保存设置选择 `subagents` 但宿主容量为零时，生产在 prepare 前阻塞；不自动
回退或伪造 child completion。

## Workspace capability gate

平台兼容不使用预设 OS allowlist，也不要求首次发布前完成固定三平台矩阵。macOS 15 ARM64 已提供原生
package/scaffold evidence，Ubuntu 24.04 x86_64 已提供 packed exact-Delivery E2E evidence；其他宿主由 Agent 按
package README 准备 Node.js/npm 与声明的宿主前置条件，再以生成 Workspace 中的 `npm run doctor` 判定当前环境
是否 ready。

Agent 可以使用普通 package manager/version manager 准备环境、用 npm 重装声明依赖、配置 provider 或选择可用
端口；不得修改 `node_modules`、package internals、精确依赖、lockfile authority、Chromium sandbox 或 validator
来制造 Green。doctor 失败且声明能力无法满足时，必须报告 external blocker。doctor Green 只证明当前 Workspace
的静态 readiness，不是 production completion、Delivery evidence 或对整个操作系统家族的认证。

## 通用视频入口

收到创建、生产、重建或交付视频的请求时：

1. 读取 Workspace `AGENTS.md`，运行 `npm run doctor` 并按上述边界准备环境；
2. 读取 `.agents/skills/axmorf-video/SKILL.md`；宿主是否支持自动 Skill discovery 不影响该路径；
3. 按 Skill 只加载当前阶段需要的 reference；
4. 运行 `project:execution:resolve`。没有持久化设置或提示词 override 时会解析为 `inline`；
5. 后续只消费 `project:produce:inspect`、`project:produce:prepare` 返回的 JSON、task workspace 和 exact commands。

仓库脚本不调用 Codex/Claude/Gemini/Cursor/Copilot SDK，也不创建 Agent。`prepare` 产生通用任务描述和 shell
commands；当前宿主负责 inline 执行或可选 child admission。

## 可选能力

- 原生子 Agent：只影响执行并发，不进入 Revision、TaskRevision、artifact 或 delivery identity。
- 外部图片 MCP：只有当前 Agent 实际暴露兼容 tools 时才启用；缺失时完整省略。
- OpenAI Skill metadata：只改善 OpenAI host 的展示与显式 `$skill-name` 调用，不是执行前提。

无论宿主如何，完成证据始终是 fixed validator、ArtifactAttestation，以及经过 checksum、media probe 和 EOF decode
复验的 exact four-file delivery。
