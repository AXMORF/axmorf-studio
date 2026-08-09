---
name: remotion-story-producer-video
description: Freeze and dispatch a contract-driven Remotion Story production to independent Codex threads and a detached single-writer watcher. Use for new video production or explicit $remotion-story-producer-video invocation.
---

# Remotion Story Producer Video

## Start directly

Use the repository and request as authority. Inspect branch, HEAD, and status; preserve unrelated
changes. Start without routine confirmation. Infer safe defaults and never ask the user to restate
Skill rules.

The root Agent owns only preflight, authored shared inputs, narration/timing freeze, all owner
assignments, detached watcher launch, and independent thread creation. It does not remain attached to
authoring or delivery.

## Freeze inputs before dispatch

Read [references/direct-production-workflow.md](references/direct-production-workflow.md) completely.
Finish preflight, Story/narration/timing/requirements, Scene freeze, and independent Cover freeze
before starting the watcher or creating any owner thread. Treat all assignments and shared inputs as
immutable after dispatch.

After freeze, read [references/scene-agent-orchestration.md](references/scene-agent-orchestration.md),
[references/global-visual-agent-orchestration.md](references/global-visual-agent-orchestration.md), and
[references/cover-agent-orchestration.md](references/cover-agent-orchestration.md) completely.

## Launch watcher and dispatch threads

Run `production:watch:start` and require its OS spawn acknowledgement receipt. Then use Codex
`create_thread` once per meaningId, once for GlobalVisual, and once for Cover. These are independent,
user-visible threads sharing the current checkout, not subagents or worktrees. Give each thread a
complete self-contained prompt with runId, assignment path, exclusive paths, required Skill/reference,
and exact `production:owner:ready` / `production:owner:failed` commands.

After every `create_thread` call succeeds, end the root task immediately. Do not call `wait_threads`,
`read_thread`, poll status, inspect owner files, run checks/submits, aggregate results, invoke
`delivery:build`, or monitor the detached watcher. If some thread creation calls fail, report the exact
un-dispatched assignment identities; leave the acknowledged watcher and successful threads running.

## Keep context bounded

Do not preload authority docs. Read
[references/agent-rework-and-system-hardening.md](references/agent-rework-and-system-hardening.md)
only when a fixed command fails before dispatch or implementation changes are required. Use current
code and tests as executable truth; use CodeGraph first when `.codegraph/` exists.

## Preserve production invariants

- Freeze the [universal readability policy](policy.json); read numeric policy from assignments.
- Keep one Story/Composition, one meaningId/ScenePackage, one whole-film GlobalVisualPackage, and one
  independent Cover owner.
- Keep Scene roots transparent; captions/narration/safe area/GlobalVisual stay Composition-owned.
- Keep `GlobalVisualLayers` no-Props and visually subordinate.
- Keep PublishingIntent in Story authoring and Cover creative inputs limited to StorySpec,
  VisualStyleSpec, and fixed CoverSpec.
- Keep owner paths disjoint. Owners do not bootstrap, generate global registry/catalog, submit formal
  results, build delivery, stage, commit, or create nested Agents.
- Owners publish only assignment-bound immutable receipts. Repository state never stores threadId,
  taskId, conversation, progress, or heartbeat.
- Missing receipts remain `waiting-for-owner-results` without timeout, retry, or replacement thread.
- The detached watcher is the sole state/event/formal-result/registry/delivery writer and stops at
  `delivery-render-started`.

Use ignored `voxcpm/voxcpm.private.json` by default. Never open, print, summarize, stage, or commit
private configuration or protected voice-profile contents.

## Classify failure by owner

Before dispatch, correct only Agent-owned authored input and rerun the same validator. A valid-input
fixed-flow defect requires Red, the smallest shared Green, verification, an exact local commit, and a
fresh Run. Provider, host-tool, sandbox, permission, or authorization failures are external blockers.

After dispatch, root does not coordinate rework. An owner may publish one immutable failed receipt.
No receipt means wait forever; an external actor may create another independent thread for the same
immutable assignment. The watcher binds only assignment identity, never thread identity.

## Finish after dispatch

Report watcher launch acknowledgement, runId, assignment paths, created tasks, and any un-dispatched
assignments. State that watcher acknowledgement is not production success, and later
`delivery-render-started` is only detached Remotion spawn acknowledgement, not MP4 completion. Do not
monitor, publish, push, or use `git add .`.
