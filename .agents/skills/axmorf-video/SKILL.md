---
name: axmorf-video
description: Resolve inline or bounded-Agent execution, produce, and hand off to fixed continuation.
---

# AXMORF Studio Video

## Create the Project when needed

Read [policy](policy.json), [workflow](references/direct-production-workflow.md), and
[Producer config](references/producer-config.md). Report boundary Scenes as inherited, selected, or disabled.
User silence means inheritance: omit `sceneTemplates`, never infer `null`. Use `project:create` for new authoring;
existing authoring changes use the isolated revision flow below and preserve unrelated sections.

`project:create` freezes the Scene originality baseline. If an older Project has no baseline, stop before inspect and
ask for explicit migration, then run zero-provider `project:originality:freeze`; never synthesize an empty baseline.
Create and revision validation can return structured `authoring-validation-failed` issues. For
`caption-display-budget-exceeded`, shorten or semantically split the authored `ttsChunk` to stay within 72
`caption-display-unit-v1` half-units; never weaken the validator.

Existing Project changes use the [revision workflow](references/project-revision.md); never edit live authoring.

## Load optional Agent capabilities

Before inspect, use only the current Agent's actually callable tools. Activate the external-asset MCP slot when one
MCP exposes `get_provider_status`, `search_images`, `preview_images`, and `acquire_image` with an import-compatible
receipt; config, shell discovery, and another Agent's tools do not count. If absent, omit it without error,
placeholder, or DAG node. If active, query local Catalog first and use `project:asset:import`. MCP data never enters
task executors, artifacts, delivery, or runtime.

## Resolve Agent execution

Inspect 前执行一次 `project:execution:resolve`：explicit prompt fields → settings → host-neutral `inline`。override
只作用本次 production，除非用户要求保存。inline 串行且无需 child；subagents 要求 bounded runtime-native children、
本次 verified `shared-workspace`/`controller-io`、已知 capacity，并受 ceiling 4 限制。unverified transport、
exact mismatch 或 zero capacity 在 prepare 前阻塞。transport 不持久化、不进入 identity。

## Inspect before cost

Run read-only, zero-provider `project:produce:inspect`; report readiness, cost/reuse, and invalidation. Unknown stays
unknown.

## Prepare content-addressed tasks

Only after reporting run `project:produce:prepare`; it may call providers and open an ExecutionAttempt. Identities
exclude its diagnostics. Reuse artifacts and execute only `dirtyAgentTasks`.

## Execute dirty Agent tasks

Use the resolved mode with the task's [Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), or [Cover](references/cover-agent-orchestration.md)
prompt; never Agent-author `scene-template`. 按 [task protocol](references/task-execution-protocol.md) 在任何 task
read/write 前运行 exact attempt-bound bind；只有 `task-worker-bound` 才能通过返回的 transport 访问三个 immutable
inputs 与 declared outputs，并运行 bound commands。TaskExecutionContract attempt-neutral；the validated ArtifactAttestation
与 task-terminal events 才是 durable authority。

Inline Root executes exactly one workspace at a time. Subagent mode admits at most `effectiveMaxConcurrency`
runtime-native children；超量时只 wait-any 释放 admission slot，不轮询全部 child 或信任 chat。真实 spawn/
transport failure 由 Root 运行 `spawnFailureCommand`；immutable/controller fault 用 `fixedFailureCommand`；两者都不
授予 task content access 或切换模式。全部 dirty task 执行/admit 后立即 continue。

## Hand off to fixed continuation

Root's final production action is the exact `continuationCommand`; then it suspends without polling or
token-consuming supervision. Code claims once, watches immutable events, and rejects duplicates.
Any failure exits nonzero without converge; all-success converges exactly once; the one-hour total deadline starts
at ExecutionAttempt creation. No retry, Root re-entry, direct converge, or workspace edit.

## Preserve production invariants

- Sealed PCM samples own timing; Composition owns captions, narration, and background.
- Scene/GlobalVisual/Cover are isolated; templates are fixed-produced; Scene roots stay transparent.
- Scene owners must not duplicate a frozen historical or same-revision TS/TSX source graph; template-copy is exempt.
- Diagnostics do not change authority; protect private/voice/other-Project/history.
- Delivery is exact `video.mp4`, two PNG Covers, and `publish.json`, validated through EOF.

## Classify failure by task owner

仅 assigned executor 在 terminal 前修正 `agent-output`；failure 冻结 attempt。明确后续 recovery 先 read-only
`project:attempt:recover-inspect`，再 zero-provider same-Revision `project:attempt:reissue`，且不要求 current
delivery。系统问题用 [hardening](references/agent-rework-and-system-hardening.md)。不 auto-retry/fallback、弱化
validator 或伪造 attestation。

## Finish with verified delivery

Before execution report the resolved mode/capacity, IDs, inspection, cost, summary, and TaskRevisions. After the
continuation starts, no Root terminal report.
Only `project-production-complete` or `project-production-current` proves delivery. Do not publish, push, or use
`git add .`.
