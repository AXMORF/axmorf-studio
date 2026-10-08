---
name: axmorf-video
description: Create and revise expressive videos with whole-film direction, bounded production, and verified delivery.
---

# AXMORF Studio Video

exact attempt-bound worker 走 [task protocol](references/task-execution-protocol.md)；其余由 Root 执行。

## Create the Project when needed

已授权制作同轮继续工具，以进度消息汇报；仅交付/blocker/暂停/native work 等待才结束。

新片/改造/审片读 [film direction](references/film-direction.md)；按 context API guides 选能力或说明自绘。

新建用 `npm run project:create:context -- --project <storyId>` 的完整 `fieldExamples`；按 `durationBudget` 扣首尾/lead-tail 预算正文，报告旁白实测偏差。
尺寸/横竖屏、fps、locale 要求写入 `render.width/height/fps/locale`，其余继承；创建后核对 `render`，不改长期设置。

读 [policy](policy.json)、[workflow](references/direct-production-workflow.md)、
[Producer config](references/producer-config.md). 报告首尾 Scene 的继承、选择或禁用。
User silence means inheritance：省略 `sceneTemplates`，never infer `null`；新建用 `project:create`，修改走隔离 revision。
theme 默认 dark，可选 light/四角色 hex；全片按主题取色，palette 不覆盖主题。

`story.filmPlan` 定整片意图，`visualScenes` 合组连续正文、保留逐 Beat 语义；按 film direction 定边界，fixed 首尾独立。
核 installed schema，不自动重组。旁白用 sealed-narration；visual-scene 按帧/null 旁白，另可显式 authored-frames + silent scene-owner preset；无旁白均零 provider/字幕。

`project:create` 冻结 originality baseline；legacy 缺失时必须显式 zero-provider `project:originality:freeze`，不伪造。
修复 `authoring-validation-failed`：`caption-display-budget-exceeded` 时缩短或拆分 `ttsChunk`，每段最多 72 `caption-display-unit-v1` half-units；不降低 validator。

修改用 [revision workflow](references/project-revision.md); never edit live authoring.

## Load optional Agent capabilities

Inspect 前仅看 current Agent's actually callable tools。同一 MCP 暴露 `get_provider_status`、`search_images`、
`preview_images`、`acquire_image` 且 receipt 兼容 import 才启用；config, shell, another Agent's tools do not count。
缺失时完整省略，不报错、不造 placeholder/DAG node。启用后先查 Catalog，再 `project:asset:import`；MCP 数据不进下游。

## Resolve Agent execution

每次 live/candidate production 重验 [host probe](references/execution-capabilities.md)，释放槽位，inspect 前
成功 project:execution:resolve 一次。prompt → settings → subagents/4；override 不保存。inline 串行；subagents
需本次原生 capacity 与 verified shared-workspace/controller-io，上限4，transport 不持久化或入 identity。
unknown/0/未验/exact mismatch 在 prepare 前阻塞。不复用 resolver；只有用户明确批准制作前 fallback 才用
--allow-inline-fallback 并报告模式/缺口；不降 exact、已派发 attempt 或发布并行要求。

## Inspect before cost

只读 project:produce:inspect 后报告 agentHandoff 的 sourceState、cost/reuse/失效原因，未知保持未知。
局部修改若无关 tasks dirty，prepare 前收窄 patch、新 candidate、重走 resolver/inspect。报告后同轮继续。

## Prepare content-addressed tasks

报告后运行 `project:produce:prepare`，它可能调用 provider 并创建 ExecutionAttempt；复用 artifacts，仅执行 `dirtyAgentTasks`。

## Execute dirty Agent tasks

按模式执行 [Scene](references/scene-agent-orchestration.md)、[GlobalVisual](references/global-visual-agent-orchestration.md)、
[Cover](references/cover-agent-orchestration.md)，整段转发 workerPrompts，never Agent-author scene-template。
先按 [task protocol](references/task-execution-protocol.md) exact bind；task-worker-bound 前零读写，之后仅 declared outputs。
TaskExecutionContract attempt-neutral；validated ArtifactAttestation/task-terminal events 才是 durable authority。

Prepare 前按 host probe 保留跨超时句柄；Codex 保留 session/cell ID，部分 wait-any 不算整批完成。

Inline 一次一个 workspace；subagents 按 effectiveMaxConcurrency/native wait-any 或整批终态补位，不复用已完成 child。
spawn/transport fault 用 Root spawnFailureCommand；immutable/controller fault 用 fixedFailureCommand。
仅记录终态，不获 content access 或换模式；全部执行/admit 后 continue，提前审片见下方。

交付前审片按 [workflow](references/direct-production-workflow.md) 与 film direction：原生终态后、唯一 continuation 前用
`project:preview`（candidate 带 exact `--candidate`）。不覆盖 artifact、不重置期限；修改走 revision。
另记媒体哈希/观察范围/未观察项，receipt 不等于创作通过。

## Hand off to fixed continuation

Root starts the exact `continuationCommand` once per attempt. 原进程阻塞等待/完成通知；普通超时只续等，不查日志/推理进度。fixed claim 一次，监听 immutable events。
Task failure exits nonzero without converge; all-success converges exactly once; deadline 从 attempt 创建起一小时。
错误通知才唤醒 Root 诊断并指导原 executor；不接管 workspace、不 direct converge、不重启当前 continuation。修复与恢复按下方 hardening。

## Preserve production invariants

- Sealed PCM samples 定义旁白 timing；authored-frames 用累计 preset 帧数且旁白缺席；Composition 拥有 captions、narration、background。
- Scene/GlobalVisual/Cover 隔离；template 固定生产；Scene root 透明。
- TS/TSX 不可重复 frozen baseline 或同 revision source graph；template-copy 豁免。
- Diagnostics 不改变 authority；保护 private/voice/其他 Project/history。
- Delivery：`video.mp4`、两张 PNG Cover、`publish.json`，全部通过 EOF。

## Classify failure by task owner

中断无终态先报告；用户明确恢复后，`project:attempt:interrupt-inspect` 证明 owner/子进程死亡才执行返回的
`project:attempt:interrupt`，再走 recovery。禁止手删 lock/claim；legacy ownership 阻塞。细节见下方 hardening。

按 [hardening](references/agent-rework-and-system-hardening.md) 分类，只指导原 executor 修 agent-output。
每请求最多一次自动恢复已证创作错误；旧 continuation/workers 全退出，recover-inspect ready 才零 provider
same-Revision reissue（无需 current delivery），新 workers。未知/无进展/系统/外部故障只报告。

## Finish with verified delivery

按 fixed 结果一次报告交付/阻塞，忽略迟到通知。Only project-production-complete or project-production-current proves delivery.
Do not publish, push, or use git add .。
