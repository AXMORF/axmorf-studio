---
name: axmorf-video
description: Produce videos with bounded workers, event-driven supervision, and task recovery.
---

# AXMORF Studio Video

已有 exact attempt-bound bind 的 worker 直接走 [task protocol](references/task-execution-protocol.md)，不重跑 Root 流程；其余由 Root 执行。

## Create the Project when needed

新建先用 `npm run project:create:context -- --project <storyId>`；按 `fieldExamples` 写附加要求对象，按 `durationBudget` 预算旁白并报告实测偏差。

Read [policy](policy.json), [workflow](references/direct-production-workflow.md), and
[Producer config](references/producer-config.md). 报告首尾 Scene 的继承、选择或禁用。
User silence means inheritance：省略 `sceneTemplates`，never infer `null`；新建用 `project:create`，修改走隔离 revision。

`project:create` 冻结 originality baseline；legacy 缺失时必须显式 zero-provider `project:originality:freeze`，不伪造。
Fix `authoring-validation-failed` issues. For `caption-display-budget-exceeded`, shorten or split `ttsChunk`
within 72 `caption-display-unit-v1` half-units; never weaken validators.

修改用 [revision workflow](references/project-revision.md); never edit live authoring.

## Load optional Agent capabilities

Before inspect, use only the current Agent's actually callable tools. Activate the external-asset MCP slot when one
MCP exposes `get_provider_status`, `search_images`, `preview_images`, and `acquire_image` with an import-compatible
receipt; config, shell discovery, and another Agent's tools do not count. If absent, omit it without error,
placeholder, or DAG node. If active, query local Catalog first and use `project:asset:import`. MCP data never enters
task executors, artifacts, delivery, or runtime.

## Resolve Agent execution

按 [host probe](references/execution-capabilities.md) 验证原生 child 与 I/O，再在 inspect 前执行 `project:execution:resolve`：prompt → settings → `subagents`/4。override
只作用本次 production，除非用户要求保存。inline 串行且无需 child；subagents 要求 bounded runtime-native children、
本次 verified `shared-workspace`/`controller-io`，capacity 未知按 1，ceiling 4。unverified transport、
exact mismatch 或 zero capacity 在 prepare 前阻塞。transport 不持久化、不进入 identity。

## Inspect before cost

Run read-only, zero-provider `project:produce:inspect`; report readiness, cost/reuse, and invalidation. Unknown stays
unknown.

## Prepare content-addressed tasks

After reporting run `project:produce:prepare`; it may call providers and open an ExecutionAttempt. Diagnostics 不进入 identity；复用 artifacts，只执行 `dirtyAgentTasks`。

## Execute dirty Agent tasks

Use the resolved mode with the task's [Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), or [Cover](references/cover-agent-orchestration.md)
prompt; never Agent-author `scene-template`. 按 [task protocol](references/task-execution-protocol.md) 在任何 task
read/write 前运行 exact attempt-bound bind；只有 `task-worker-bound` 才能通过返回的 transport 访问三个 immutable
inputs 与 declared outputs，并运行 bound commands。TaskExecutionContract attempt-neutral；the validated ArtifactAttestation
与 task-terminal events 才是 durable authority。

Prepare 前确认宿主进程能跨工具超时存活；只能等待原 handle 的 fixed 终态，后台启动回执不是完成。

Inline Root executes exactly one workspace at a time. Subagent mode admits at most `effectiveMaxConcurrency`
runtime-native children；原生 wait-any 即时补位，原生批量返回或整批完成通知后发下一批；不轮询 child 或信任 chat。真实 spawn/
transport failure 由 Root 运行 `spawnFailureCommand`；immutable/controller fault 用 `fixedFailureCommand`；两者都不
授予 task content access 或切换模式。全部 dirty task 执行/admit 后立即 continue。

## Hand off to fixed continuation

Root starts the exact `continuationCommand` once per attempt. 用原进程阻塞等待或完成通知做低 token 监督；普通超时只继续等待，不查日志、不推理进度。Code claims once and watches immutable events.
Task failure exits nonzero without converge; all-success converges exactly once; deadline 从 attempt 创建起一小时。
错误通知才唤醒 Root 诊断并指导原 executor；不接管 workspace、不 direct converge、不重启当前 continuation。修复与恢复按下方 hardening。

## Preserve production invariants

- Sealed PCM samples own timing; Composition owns captions, narration, and background.
- Scene/GlobalVisual/Cover are isolated; templates are fixed-produced; Scene roots stay transparent.
- Scene owners must not duplicate a frozen historical or same-revision TS/TSX source graph; template-copy is exempt.
- Diagnostics do not change authority; protect private/voice/other-Project/history.
- Delivery is exact `video.mp4`, two PNG Covers, and `publish.json`, validated through EOF.

## Classify failure by task owner

中断无终态先报告；用户明确恢复后，`project:attempt:interrupt-inspect` 证明 owner/子进程死亡才执行返回的
`project:attempt:interrupt`，再走 recovery。禁止手删 lock/claim；legacy ownership 阻塞。细节见下方 hardening。

按 [hardening](references/agent-rework-and-system-hardening.md) 诊断并指导原 executor 修正 `agent-output`。terminal failure 后旧 workers 全退出，read-only `project:attempt:recover-inspect` ready 才 zero-provider same-Revision `project:attempt:reissue`，无需 current delivery。每个请求最多恢复一次；未知、无进展、系统/外部故障只诊断报告。

## Finish with verified delivery

执行前报告 mode/capacity、IDs、inspect、cost 与 TaskRevisions；Root 只按 fixed 结果报告一次交付或阻塞，忽略迟到的重复成功通知。
Only `project-production-complete` or `project-production-current` proves delivery. Do not publish, push, or use
`git add .`.
