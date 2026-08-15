---
name: remotion-story-producer-video
description: Design, freeze, and dispatch a contract-driven Remotion Story production to independent Codex threads and a detached watcher. Use for new video production or explicit $remotion-story-producer-video invocation.
---

# Remotion Story Producer Video

## Start directly

Use the request and current repository as authority. Inspect branch, HEAD, and status; preserve
unrelated changes. The Agent makes the narrative and visual decisions. Repository scripts only freeze,
validate, and execute the fixed production flow; they do not choose creative direction.

## Freeze inputs before dispatch

Read [the direct workflow](references/direct-production-workflow.md) completely. It alternates the
Agent-owned design work with the fixed commands. Read [Producer config](references/producer-config.md)
when authoring the new Project input; use `project:configure` instead of copying defaults.

Freeze Story, timing, requirements, and all owner assignments before dispatch. Frozen inputs are immutable.

## Launch watcher and dispatch threads

After a successful `production:watch:start`, read only the prompt reference needed for each owner:
[Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), and
[Cover](references/cover-agent-orchestration.md). Use `create_thread` once per meaningId and once for
each whole-film owner. Every prompt must contain concrete assignment and exclusive paths plus exact
`production:owner:ready` / `production:owner:failed` commands.

Owners are independent user-visible tasks in the shared checkout, never subagents or worktrees.
After all creation calls return, end the root task; do not inspect, wait for, or coordinate them.

## Keep context bounded

Do not preload authority docs or implementation detail. Use current code/tests and [policy.json](policy.json)
for executable constraints. Read [system hardening](references/agent-rework-and-system-hardening.md)
only when a fixed command fails before dispatch or the implementation must change. Use CodeGraph first
when indexed.

## Preserve production invariants

- Keep one Story/Composition, one meaningId/ScenePackage, one GlobalVisualPackage, and one Cover owner.
- For `preauthoredMeaningIds`, only check and publish receipts; never recreate their Renderer or sound.
- Keep owner paths disjoint. Owners author only their assignment and publish one assignment-bound
  immutable receipt; the watcher alone writes central results/state and drives delivery.
- Keep private config and protected voice material unread, unreported, unstaged, and uncommitted.
- Leave a missing receipt waiting without timeout, retry, heartbeat, or replacement task.
- Treat launch intent without receipt as permanently ambiguous; never retry it.

## Classify failure by owner

Before dispatch, revise only Agent-authored inputs and rerun the same validator. For a valid-input
fixed-flow defect, stop and follow the JIT hardening reference. Treat provider, host, sandbox,
permission, and authorization failures as external blockers. After dispatch, root does no rework.

## Finish after dispatch

Report runId, watcher acknowledgement, assignment paths, created tasks, and exact missing dispatches.
`watcher-started` is only watcher spawn acknowledgement; `delivery-render-started` is only detached
Remotion spawn acknowledgement, not MP4 completion. Do not monitor, publish, push, or use `git add .`.
