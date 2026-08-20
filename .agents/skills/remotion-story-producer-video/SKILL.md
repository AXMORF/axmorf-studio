---
name: remotion-story-producer-video
description: Plan, delegate, converge, and synchronously deliver a content-addressed Remotion Story production.
---

# Remotion Story Producer Video

## Start directly

Preserve unrelated changes and read [policy](policy.json). Author only current Project inputs before
planning. Once planned, Agent children write only their fixed task workspace; repository CLIs validate,
commit, materialize, and deliver derived output.

## Plan content-addressed tasks

Read [the direct workflow](references/direct-production-workflow.md). Run `project:produce:plan` for the
current Project. The returned ProductionRevision and TaskRevision values contain no attempt, clock, or
absolute-path identity. Reuse every valid ArtifactAttestation and dispatch only dirty Agent tasks.

## Delegate dirty Agent tasks

Use runtime-native child Agents in this shared checkout. Read only the prompt needed for each dirty task:
[Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), or
[Cover](references/cover-agent-orchestration.md). One task belongs to one child. Never delegate a
`scene-template` task; fixed preparation owns it. Capacity-limited batches are allowed.

Each child reads the immutable `task.json` and `inputs/context.json`, writes only the matching
`.producer-work/<storyId>/<taskRevision>/` workspace, loops `project:task:check` until valid, then calls
`project:task:commit`. A child terminal message is coordination only; the validated ArtifactAttestation is
the durable authority.

## Wait and converge once

Wait until every dispatched child reaches artifact committed/current, explicit task failure, or host
failure. Then call `project:produce:converge` exactly once for this orchestration attempt. Do not infer
artifact presence from chat, recreate reused work, or have root author a dirty child task inline.

## Keep context bounded

Do not preload all authority docs. Use current code/tests, [policy.json](policy.json), and the one task
prompt in scope. Read [Producer config](references/producer-config.md) only for a new Project. Read
[system hardening](references/agent-rework-and-system-hardening.md) only after a fixed-flow defect. Use
CodeGraph first when indexed.

## Preserve production invariants

- Keep one Story/Composition and one meaningId/ScenePackage.
- Keep sealed PCM plus cumulative samples as timing authority; do not rewrite authored `ttsChunks`.
- Keep Scene, GlobalVisual, and Cover tasks isolated; GlobalVisual never reads Scene output.
- Keep template-copy Scenes fixed-produced without an Agent task owner.
- Keep captions, narration, and full-frame background at Composition level; Scene roots remain transparent.
- Keep private config, protected voice material, other Projects, shared assets, and historical data unread,
  unreported, unstaged, and uncommitted.
- Delivery is synchronous and current only after exact `video.mp4`, both PNG Covers, and `publish.json`
  pass checksum, media probe, frame/dimension, and EOF-decode validation.

## Classify failure by task owner

An Agent-authored workspace may be corrected by its assigned child and rechecked. A validator,
materialization, artifact-store, or delivery failure with valid inputs is a fixed-flow defect; follow the
hardening reference. Provider, host, sandbox, permission, and authorization failures are external blockers.
Never weaken a validator or fabricate an ArtifactAttestation.

## Finish with verified delivery

Report storyId, revisionId, reused/dirty/blocked summary, dispatched TaskRevisions, child terminal summary,
and the single converge result. Only `project-production-complete` or `project-production-current` proves a
mechanically verified current four-file delivery. Do not publish, push, or use `git add .`.
