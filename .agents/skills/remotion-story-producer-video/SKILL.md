---
name: remotion-story-producer-video
description: Design, freeze, and dispatch a contract-driven Remotion Story production to independent Codex threads and a detached watcher. Use for new video production or explicit $remotion-story-producer-video invocation.
---

# Remotion Story Producer Video

## Start directly

Use the request and repository as authority. Preserve unrelated changes. The Agent authors;
scripts mechanically freeze, validate, and execute without Agent self-review.

## Freeze inputs before dispatch

Read [the direct workflow](references/direct-production-workflow.md) completely. It alternates the
Agent-owned design work with the fixed commands. Read [Producer config](references/producer-config.md)
when authoring the new Project input; use `project:configure` instead of copying defaults.

Freeze Story, timing, requirements, and assignments before dispatch.

## Launch watcher and dispatch threads

After a successful `production:watch:start`, read only the prompt reference needed for each owner:
[Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), and
[Cover](references/cover-agent-orchestration.md). Use `create_thread` once per `ownerMeaningIds` entry and
once for each whole-film owner. Never create a thread for `templateMeaningIds`. Every prompt must contain concrete assignment and exclusive paths plus exact
`production:owner:ready` / `production:owner:failed` commands.

Owners are independent user-visible tasks in the shared checkout, never subagents or worktrees. After
creation calls return, end the root task without inspecting or waiting.

## Keep context bounded

Do not preload authority docs. Use current code/tests and [policy.json](policy.json). Read
[system hardening](references/agent-rework-and-system-hardening.md) only for a fixed-flow defect. Use
CodeGraph first when indexed.

## Preserve production invariants

- Keep one Story/Composition, one meaningId/ScenePackage, one GlobalVisualPackage, and one Cover owner.
- Scripts directly result `templateMeaningIds` after binding checks; no generic check/review, owner task, or receipt.
- Keep owner paths disjoint. Owners author only their assignment and publish one assignment-bound
  immutable receipt; the watcher alone writes central results/state and drives delivery.
- Keep private config and protected voice material unread, unreported, unstaged, and uncommitted.
- Leave a missing receipt waiting without timeout, retry, heartbeat, or replacement task.
- Treat launch intent without receipt as permanently ambiguous; never retry it.

## Classify failure by owner

Before dispatch, revise only Agent-authored inputs and rerun the validator. For a fixed-flow defect,
follow the hardening reference. Provider, host, sandbox, permission, and authorization failures are
external blockers. After dispatch, root does no rework.

## Finish after dispatch

Report runId, watcher acknowledgement, assignment paths, created tasks, and exact missing dispatches.
`watcher-started` is only watcher spawn acknowledgement; `delivery-render-started` is only detached
Remotion spawn acknowledgement, not MP4 completion. Do not monitor, publish, push, or use `git add .`.
