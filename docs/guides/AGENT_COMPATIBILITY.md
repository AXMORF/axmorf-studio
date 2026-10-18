# Agent compatibility

> 文档类型：操作指南

生成的 Workspace 不绑定特定 Agent。制作方法来自 Workspace-local 的 `axmorf-film` Skill，完成证据来自
`film:deliver` 复验过的四个交付文件，不来自宿主名称、聊天状态或 Agent API。

## 入口与单一 authority

| 宿主                     | 开箱入口                                   | 说明                                                     |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| Codex                    | `AGENTS.md`                                | 原生读取                                                 |
| Cursor                   | `AGENTS.md`                                | 原生读取；不需要 `.cursor/rules` 副本                    |
| GitHub Copilot           | `AGENTS.md`                                | 支持 Agent instructions                                  |
| Claude Code              | `CLAUDE.md`、`.claude/skills/axmorf-film/` | `CLAUDE.md` 只导入 `AGENTS.md`；Skill 入口指向共享 Skill |
| Gemini CLI               | `GEMINI.md`                                | 只导入 `AGENTS.md`                                       |
| 其他 shell-capable Agent | 手动读取 `AGENTS.md`                       | 再读取其中指向的 `.agents/skills/axmorf-film/SKILL.md`   |

`AGENTS.md` 是唯一 Agent 指令 authority。宿主入口文件不复制规则；`.claude/skills/axmorf-film/SKILL.md` 只有相同的
frontmatter 和一句指向共享 Skill 的说明，因为 Claude Code 只在 `.claude/skills/` 下发现 Skill。

## 最低能力

制作一部片要求 Agent 能：

1. 读取和编辑 Workspace 内的普通文件；
2. 运行 npm 脚本并读取结构化 JSON 输出；
3. 查看图片（审片联系表与单帧），以便看图修改。

不需要子 Agent、浏览器自动化或宿主专用 API。长片可以由主 Agent 规划后把各段分给子 Agent 编写，最终由主 Agent
统一审片与交付；这是可选做法。

## Workspace capability gate

平台兼容不使用预设 OS allowlist。Agent 按 package README 准备 Node.js/npm 与宿主前置条件，再以生成 Workspace 中的
`npm run doctor` 判定当前环境是否 ready；doctor 会做一次真实的小尺寸浏览器渲染。

Agent 可以使用普通 package manager/version manager 准备环境、用 npm 重装声明依赖、配置 provider 或选择可用
端口；不得修改 `node_modules`、package internals、精确依赖、lockfile authority、Chromium sandbox 或检查器来制造
通过。doctor 失败且声明能力无法满足时，报告 external blocker。doctor 通过只说明环境 ready，不是作品完成证据。

## README Agent 入口分层

root README 与两个 package README 只提供一句 Agent prompt：根据公开项目的最新 README 在指定本地路径完成
Workspace 搭建与可用性验收，并停止在视频制作之前。环境要求、安装命令和验证步骤由 README 拥有，prompt 不复制。

creator template 生成的 Workspace README 才提供“下一次视频”的 prompt。Agent 此时以本地的 `README.md`、
`AGENTS.md`、Skill 与 CLI 输出为执行 authority；public README 或 Agent 记忆中的命令不能覆盖当前本地文档。

## 通用视频入口

Agent 收到制作或修改视频的请求时：

1. 读取 Workspace `AGENTS.md`，首次制作前运行 `npm run doctor`；
2. 完整读取 `.agents/skills/axmorf-film/SKILL.md`，按其中指引读取 references；
3. 按 Skill 的流程使用 `film:*` 命令，直接编写 `src/films/<filmId>/` 下的源码，看审片帧后修改；
4. 以 `npm run film:deliver -- --film <filmId>` 报告 `film-delivered` 作为完成。

仓库脚本不调用 Codex/Claude/Gemini/Cursor/Copilot SDK，也不创建 Agent。原创图片可用当前宿主实际可调用的生图工具
生成，再经 `film:asset` 登记来源与许可；没有生图工具时用 SVG 或代码绘制。TTS 或其他 provider 失败是 external
blocker：报告后停止，用户同意后才可重试。
