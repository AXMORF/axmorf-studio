# axmorf-studio 项目资料索引

> 路径均相对项目根目录。AGENTS.md / CLAUDE.md 由 agent 原生加载，这里只列位置，不复述内容。

AXMORF Studio 是基于 Remotion 的 Agent-first 本地视频工作室，Agent 直接编写每部片的 Remotion 源码。
仓库包含 Workspace 创建器和运行时两个 npm 包，提供旁白时序、配乐、素材登记、审片、交付校验及本地 Web 控制中心。

## 入口与规则

- `README.md` — 产品定位、Workspace 创建与升级、常用命令和开发入口。
- `AGENTS.md` — 仓库级 agent 规则位置。
- `CLAUDE.md` — Claude Code 规则入口位置。
- `GEMINI.md` — Gemini CLI 规则入口位置。
- `docs/README.md` — 按问题选择权威文档、指南和历史资料的导航入口。
- `docs/ITERATION_STATUS.md` — 查询当前已实现能力、验收事实与发布记录时阅读。
- `docs/DOCUMENTATION_POLICY.md` — 新增或维护文档时查阅职责、生命周期与单一事实来源。
- `THIRD_PARTY_NOTICES.md` — 查询项目使用的第三方材料与许可证说明时阅读。

## 架构与设计

- `docs/FINAL_PRODUCT_GOAL.md` — 产品目标、边界与交付目标，需区分目标和当前实现时阅读。
- `docs/ARCHITECTURE.md` — 包与模块分层、一部片的数据流、写入所有权及升级机制。
- `docs/TERMINOLOGY.md` — Workspace、film、时序、审片和交付等核心名词的精确定义。
- `docs/ROADMAP.md` — 阶段基线、下一步候选与发布门槛。
- `docs/promotions/` — 采用“日期-主题”命名的能力提案与实施方案，状态以各篇声明及当前状态文档为准。

## 模块 / 子包

- `packages/create-axmorf-studio/README.md` — Workspace 创建器的使用、选项、升级和宿主准备说明。
- `packages/studio/README.md` — 运行时包的 CLI、contracts、Remotion 公共入口与运行要求。
- `packages/create-axmorf-studio/template/README.md` — 生成 Workspace 的用户说明、常用操作与交付入口。
- `packages/create-axmorf-studio/template/AGENTS.md` — 生成 Workspace 的 agent 规则模板位置。
- `packages/create-axmorf-studio/template/CLAUDE.md` — 生成 Workspace 的 Claude Code 规则入口模板位置。
- `packages/create-axmorf-studio/template/GEMINI.md` — 生成 Workspace 的 Gemini CLI 规则入口模板位置。

## 流程与运行手册

- `docs/guides/AGENT_COMPATIBILITY.md` — Agent 宿主入口、最低能力与 Workspace 可用性检查说明。
- `docs/guides/PRODUCER_CONFIG.md` — 制作默认值、片头片尾和 TTS provider 的配置指南。
- `docs/guides/RELEASE.md` — 技术发布门、真实 Agent 晋级门及版本发布操作顺序。

## 技能（.agents/skills 等）

- `.agents/skills/axmorf-film/SKILL.md` — 制作与修改影片的主技能，串起脚本、画面、配音、审片和交付。
- `.agents/skills/axmorf-film/references/` — 画面手艺、配乐卡点、素材、API、示例与风格配方的按需参考目录。
- `.agents/skills/remotion-best-practices/SKILL.md` — Remotion 创作、渲染、字幕、媒体和地图等专题参考的路由入口。
- `.claude/skills/axmorf-film/SKILL.md` — Claude Code 发现共享影片技能的适配入口。
- `packages/create-axmorf-studio/template/.agents/skills/axmorf-film/SKILL.md` — 创建器向用户 Workspace 分发的影片技能模板。
- `packages/create-axmorf-studio/template/.agents/skills/axmorf-film/references/` — 与 Workspace 技能模板一起分发的创作参考目录。
- `packages/create-axmorf-studio/template/.claude/skills/axmorf-film/SKILL.md` — 创建器分发的 Claude Code 技能发现适配入口。

## 历史与归档

- `docs/evidence/` — 按“日期-主题”保存的诊断与验收证据，不替代当前实现状态。
- `docs/archive/README.md` — 历史资料分类与使用边界的入口。
- `docs/archive/implementation-plans/` — M1–M9.5 及后续改进的历史实施计划，多数采用“日期-主题”命名。
- `docs/archive/project-production/` — 已删除的旧 Project production 主链的流程、合同、指南与验收证据，仅供追溯。
- `docs/archive/iteration-status-0.1.21-and-earlier.md` — 0.1.21 及更早版本的实现、验收与发布历史。
- `docs/archive/iteration-status-0.1.23-and-earlier.md` — 0.1.22–0.1.23 与旧 Project production 主链末期状态记录。
