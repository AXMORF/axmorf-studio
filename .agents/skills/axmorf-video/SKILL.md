---
name: axmorf-video
description: Produce videos with bounded workers, event-driven supervision, and task recovery.
---

# AXMORF Studio Video

exact attempt-bound worker 走 [task protocol](references/task-execution-protocol.md)；其余由 Root 执行。

## Create the Project when needed

已授权制作的汇报用进度消息，同轮继续工具；仅交付、blocker、用户暂停或已派发 native work 的等待可结束轮次。

先按 context API guides 选语义能力或说明自绘。

新建先用 `npm run project:create:context -- --project <storyId>`；按 `fieldExamples` 写附加要求对象，按 `durationBudget` 预算旁白并报告实测偏差。
尺寸/横竖屏、fps、locale 要求写入 `render.width/height/fps/locale`，其余继承；创建后核对 `render`，不改长期设置。

读 [policy](policy.json)、[workflow](references/direct-production-workflow.md)、
[Producer config](references/producer-config.md). 报告首尾 Scene 的继承、选择或禁用。
User silence means inheritance：省略 `sceneTemplates`，never infer `null`；新建用 `project:create`，修改走隔离 revision。
新建 `visualStyle.theme` 默认 dark，可选 light/四角色 hex；全片按主题取色，palette 文案不能覆盖主题。

`project:create` 冻结 originality baseline；legacy 缺失时必须显式 zero-provider `project:originality:freeze`，不伪造。
修复 `authoring-validation-failed`：`caption-display-budget-exceeded` 时缩短或拆分 `ttsChunk`，每段最多 72 `caption-display-unit-v1` half-units；不降低 validator。

修改用 [revision workflow](references/project-revision.md); never edit live authoring.

## Load optional Agent capabilities

Inspect 前仅看 current Agent's actually callable tools。同一 MCP 暴露 `get_provider_status`、`search_images`、
`preview_images`、`acquire_image` 且 receipt 兼容 import 才启用；config, shell, another Agent's tools do not count。
缺失时完整省略，不报错、不造 placeholder/DAG node。启用后先查 Catalog，再 `project:asset:import`；MCP 数据不进入 child、artifact、delivery 或 runtime。

## Resolve Agent execution

每次 live/candidate production（含同一请求自主 revision）重验 [host probe](references/execution-capabilities.md)、释放槽位，再于 inspect 前成功执行一次 `project:execution:resolve`；不沿用上轮 probe/resolver。prompt → settings → `subagents`/4；override 仅本次，除非要求保存。
inline 串行无需 child；subagents 要 bounded native children、本次 verified `shared-workspace`/`controller-io`。容量取原生槽位，上限 4；单 probe 不代表容量 1。未知/0、transport 未验或 exact mismatch 在 prepare 前阻塞。transport 不持久化、不入 identity。
仅用户明确批准制作前串行 fallback 才用 `--allow-inline-fallback`，报告真实 inline 与原能力缺口；精确并发仍阻塞，已派发 attempt 不切换，发布并行验收不豁免。

## Inspect before cost

只读 `project:produce:inspect` 后报告 `agentHandoff` 的 `sourceState`、cost/reuse、结构化失效；CLI 输出不算报告，未知保持未知。局部修订若无关任务 dirty，prepare 前缩小 patch、validate/create 新 candidate；全重做不证明局部 reuse。

## Prepare content-addressed tasks

报告后运行 `project:produce:prepare`，它可能调用 provider 并创建 ExecutionAttempt。Diagnostics 不进入 identity；复用 artifacts，仅执行 `dirtyAgentTasks`。

## Execute dirty Agent tasks

按已解析模式执行 [Scene](references/scene-agent-orchestration.md)、[GlobalVisual](references/global-visual-agent-orchestration.md) 或 [Cover](references/cover-agent-orchestration.md)；整段转发 prepare `workerPrompts`，不手抄 hash；never Agent-author `scene-template`。任何 task read/write 前按 [task protocol](references/task-execution-protocol.md) exact attempt-bound bind；仅 `task-worker-bound` 授予返回 transport 的三个 immutable inputs、declared outputs 与 bound commands。TaskExecutionContract attempt-neutral；validated ArtifactAttestation/task-terminal events 才是 durable authority。

Prepare 前确认宿主进程可跨工具超时存活；按 host probe 保留原句柄。Hermes continuation 用原生 background/notify；Codex 不丢 session/cell ID，也不把 wait-any 的部分完成当整批完成。

Inline Root 一次只执行一个 workspace。Subagents 不超过 `effectiveMaxConcurrency`；wait-any 补位，原生批量返回或整批完成通知后再发；不轮询 child、不信任 chat。Root 用 `spawnFailureCommand` 记录真实 spawn/transport failure，`fixedFailureCommand` 记录 immutable/controller fault；二者不授予 content access 或切换模式。全部 dirty task 执行/admit 后立即 continue.

## Hand off to fixed continuation

Root starts the exact `continuationCommand` once per attempt. 原进程阻塞等待/完成通知低 token 监督；普通超时只续等，不查日志/推理进度。fixed claim 一次，监听 immutable events。
Task failure exits nonzero without converge; all-success converges exactly once; deadline 从 attempt 创建起一小时。
错误通知才唤醒 Root 诊断并指导原 executor；不接管 workspace、不 direct converge、不重启当前 continuation。修复与恢复按下方 hardening。

## Preserve production invariants

- Sealed PCM samples 定义 timing；Composition 拥有 captions、narration、background。
- Scene/GlobalVisual/Cover 隔离；template 固定生产；Scene root 透明。
- TS/TSX 不可重复 frozen baseline 或同 revision source graph；template-copy 豁免。
- Diagnostics 不改变 authority；保护 private/voice/其他 Project/history。
- Delivery：`video.mp4`、两张 PNG Cover、`publish.json`，全部通过 EOF。

## Classify failure by task owner

中断无终态先报告；用户明确恢复后，`project:attempt:interrupt-inspect` 证明 owner/子进程死亡才执行返回的
`project:attempt:interrupt`，再走 recovery。禁止手删 lock/claim；legacy ownership 阻塞。细节见下方 hardening。

按 [hardening](references/agent-rework-and-system-hardening.md) 诊断并指导原 executor 修正 `agent-output`。terminal failure 后旧 workers 全退出，read-only `project:attempt:recover-inspect` ready 才 zero-provider same-Revision `project:attempt:reissue`，无需 current delivery。每个请求最多恢复一次；未知、无进展、系统/外部故障只诊断报告。

## Finish with verified delivery

执行前报告 mode/capacity、IDs、inspect、cost 与 TaskRevisions；Root 只按 fixed 结果报告一次交付或阻塞，忽略迟到的重复成功通知。
Only `project-production-complete` or `project-production-current` proves delivery. Do not publish, push, or use
`git add .`.
