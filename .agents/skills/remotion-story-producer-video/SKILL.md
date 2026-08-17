---
name: remotion-story-producer-video
description: Design, freeze, delegate, and foreground-finalize a contract-driven Remotion Story production with runtime-native child Agents.
---

# Remotion Story Producer Video

## Start directly

Use the request and repository as authority. Preserve unrelated changes. The Agent authors; scripts
freeze, validate, and execute without Agent self-review. Read [policy](policy.json).

## Freeze inputs before delegation

Read [the direct workflow](references/direct-production-workflow.md) completely. It alternates Agent-owned
design with fixed commands. Read [Producer config](references/producer-config.md) when authoring a new
Project; use `project:configure` instead of copying defaults. Freeze Story, timing, requirements, Scene,
GlobalVisual, and Cover assignments before delegation.

## Delegate owners to runtime-native subagents

Use the running environment's native child-Agent mechanism in the same checkout. Read only the prompt
reference needed for each owner: [Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), and
[Cover](references/cover-agent-orchestration.md). Create one child per `ownerMeaningIds` Scene and one each
for GlobalVisual and Cover. Never delegate `templateMeaningIds`. Prompts must be self-contained with the
immutable assignment, exclusive paths, required local Skill/reference, focused check, and exact
`production:owner:ready` / `production:owner:failed` command.

Batch for capacity while preserving one owner per child. If child Agents cannot share the checkout, fail
closed; root must not author an owner inline or use a worktree.

## Wait and finalize once

Wait until every dispatched child reaches success, explicit failure, or host failure. Child chat status is
transient and is never persisted; assignment-bound receipts remain authority. Do not read owner output,
submit individual results, inspect Run progress, or publish a receipt for a child.

After all children are terminal, call exactly once:

`npm run production:finalize -- --run <runId>`

Do this even after child failure or apparent missing receipt. Never poll or repeat finalize in this attempt.

## Keep context bounded

Do not preload authority docs. Use current code/tests and [policy.json](policy.json). Read
[system hardening](references/agent-rework-and-system-hardening.md) only for a fixed-flow defect. Use
CodeGraph first when indexed.

## Preserve production invariants

- Keep one Story/Composition, one meaningId/ScenePackage, one GlobalVisualPackage, and one Cover owner.
- Template-copy Scenes are script-verified/direct-resulted without owner child or receipt.
- Owners write only assignment-exclusive paths and publish one immutable receipt; foreground finalize alone
  writes central results/events/state and drives delivery.
- Required Scene and GlobalVisual receipts gate render-ready. Cover missing/failed preserves render-ready and
  blocks only automatic delivery.
- Keep private config and protected voice material unread, unreported, unstaged, and uncommitted.
- Delivery launch intent without receipt remains permanently ambiguous; never retry it.

## Classify failure by owner

Before delegation, revise only Agent-authored inputs and rerun the validator. For a fixed-flow defect,
follow the hardening reference. Provider, host, sandbox, permission, and authorization failures are external
blockers. After delegation, root does no owner rework.

## Finish after finalize

Report runId, dispatched owner identities, child terminal summary, and the one finalize JSON outcome.
`delivery-render-started` is only detached Remotion spawn acknowledgement, not MP4 completion. Do not
monitor, publish, push, or use `git add .`.
