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

# AXMORF Studio Agent Guide

本文件定义仓库内 Agent 的执行规则。默认中文交流，先给结论，再给最少必要依据。

## 通用 Agent 入口

- 先按 assignment 路由：已有 exact attempt-bound task bind 的 worker 直接按 Skill task protocol 绑定并执行该任务，
  不重跑全局 doctor/preflight；规则见 [旧主链规则](docs/guides/LEGACY_PROJECT_PRODUCTION_RULES.md)。
- `AGENTS.md` 是唯一仓库级 Agent 指令 authority。`CLAUDE.md`、`GEMINI.md` 与任何宿主专用 metadata
  只能作为导入或发现 adapter，不复制、覆盖或扩展这里的规则。
- 新视频使用 direct film：必须完整读取 `.agents/skills/axmorf-film/SKILL.md`，片源在 `src/films/<filmId>/`。
- 旧作品与旧主链（`src/projects/`、`scripts/project-production/`、`scripts/projects/`、`.agents/skills/axmorf-video/SKILL.md`）
  在 0.2.x 冻结、0.3.0 删除。修改或使用它们之前，必须完整读取
  [旧 Project production 主链规则](docs/guides/LEGACY_PROJECT_PRODUCTION_RULES.md)（含 TaskExecutionContract、
  `project:task:bind`、内置执行默认是 `subagents` 等全部约束），并且只修阻塞性缺陷。
- 宿主兼容性、最低能力与入口文件见 `docs/guides/AGENT_COMPATIBILITY.md`。

## 权威文档

- 产品目标：`docs/FINAL_PRODUCT_GOAL.md`；迁移计划：`docs/promotions/2026-10-14-direct-film-production.md`
- 当前事实：`docs/ITERATION_STATUS.md`；阶段门槛：`docs/ROADMAP.md`
- 架构：`docs/ARCHITECTURE.md`；旧主链流程：`docs/PRODUCTION_WORKFLOW.md`、`docs/DETERMINISTIC_EXECUTION.md`
- 名词：`docs/TERMINOLOGY.md`

文档冲突时先用 current 可执行代码和测试确认事实，再同步权威文档；不能把目标写成实现。

## 产品不变量

- 最终用户通过 `create-axmorf-studio` 创建普通 npm Workspace；运行时、CLI、contracts、Remotion exports 与预构建 Web
  由 `@axmorf/studio` 提供，Workspace-local Skill 与用户配置由 creator 生成。不存在 Desktop、Electron、Runtime Pack 或 `rsp`。
- 生成 Workspace 的 `npm run doctor` 决定环境是否 ready；Agent 不得修改 `node_modules`、package internals、精确依赖或
  检查器来制造兼容，无法通过时报告 blocker。
- 只使用宿主 Node.js/npm 与 Workspace-local Remotion CLI，不新增 Docker；所有 `remotion` 与 `@remotion/*` 保持同一精确版本。
- 渲染期间不调用网络、Agent、Skill、MCP、Git 或目录扫描；Remotion Root 只用生成的静态注册表。运动只用 Remotion frame API，
  禁止 CSS animation/transition、Tailwind 动画类与非确定的随机数/时间。
- 媒体位于 Workspace `public/` 并登记来源与许可；未确认许可的音频不得进入作品。
- 旁白时长以实测 PCM samples 为准，帧边界为 `ceilDiv(cumulativeSamples × fps, sampleRate)`；每句最多 72 caption
  display half-units，超限由 Agent 改写或拆分，不得放宽检查。配乐由配方确定性生成，旁白与字幕不为踩拍改时。
- 用户明确的尺寸/横竖屏、fps 写入该片，不为单次需求改长期默认值。
- 交付恰好是 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`，全部复验后才替换当前交付。
- `public/`、`src/films/`、`src/projects/`、生成的 Registry/Catalog、`.axmorf/`、`.producer-*`、`out/` 与 `deliveries/`
  都是 ignored 本地产物，不进入 Git。删除作品只用 `film:delete` / `project:delete` 的 owned-path 清理，禁止 broad `rm`。
- provider、host tool、sandbox、permission 或 authorization failure 是 external blocker；不添加 fallback、自动 retry、
  TTS warm-up 或降低 Chromium sandbox。用户同意后才可重试。

## 修改与验证

- runtime/creator 升级或发布前，核对当前 checkout、远端默认分支与最新已发布 tag 的祖先关系。
  最新发布位于独立分支时，先整合该分支的已发布改进，再继续升级；保护现有未提交修改与历史 tag。
  新发布 tag 应指向已合入默认分支的 release commit，不能把独立分支发布当作默认分支已同步。
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
