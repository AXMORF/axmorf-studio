---
name: remotion-story-producer-video
description: Plan and dispatch a content-addressed Remotion Story production, then hand its terminal lifecycle to a fixed continuation.
---

# Remotion Story Producer Video

## Create the Project when needed

For a new Project read [policy](policy.json), [workflow](references/direct-production-workflow.md), and
[Producer config](references/producer-config.md). Report boundary Scenes as inherited, selected, or disabled.
User silence means inheritance: omit `sceneTemplates`, never infer `null`. Use `project:create` for new authoring;
edit inputs for an existing Project. Preserve unrelated changes.

## Inspect before cost

Run read-only, zero-provider `project:produce:inspect`. Before preparation, report readiness, estimated cost,
artifact reuse, and structured invalidation explanations. Unknown estimates remain unknown.

## Prepare content-addressed tasks

Only after reporting, run `project:produce:prepare`. It may call the selected provider, prepare fixed
artifacts/workspaces, and open an ExecutionAttempt. Identities exclude attempt, clock, path, explanation, and
Agent identity. Reuse valid artifacts; dispatch only `dirtyAgentTasks`.

## Delegate dirty Agent tasks

Use one runtime-native child per task. Read its [Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), or [Cover](references/cover-agent-orchestration.md)
prompt. Never delegate `scene-template`.

Each child reads immutable task/context, writes only `.producer-work/<storyId>/<taskRevision>/`, loops check,
then runs prepare's attempt-bound terminal command. Its validated ArtifactAttestation and task-terminal event
are durable authority.

## Hand off to fixed continuation

After dispatch, Root's final production action is the exact `continuationCommand`, then it suspends
without polling, status reads, reasoning, or token-consuming supervision. Fixed code claims once, watches
immutable events, and rejects duplicates. Any failure exits nonzero without converge; all-success converges exactly once; a
missing terminal at six hours times out. No retry, Root re-entry, direct converge, or workspace edit.

## Preserve production invariants

- Sealed PCM samples own timing; Composition owns captions, narration, and background.
- Scene/GlobalVisual/Cover are isolated; templates are fixed-produced; Scene roots stay transparent.
- Diagnostics do not change authority; preserve private/voice/other-Project/history data.
- Delivery is exact `video.mp4`, two PNG Covers, and `publish.json`, mechanically validated through EOF.

## Classify failure by task owner

Only the assigned child corrects its workspace before terminal. Any failure ends the attempt.
For a separate user-started task, read [system hardening](references/agent-rework-and-system-hardening.md).
Never retry, fall back, weaken validators, or fabricate attestations inside the failed lifecycle.

## Finish with verified delivery

Before dispatch, report IDs, inspection, cost, summary, and TaskRevisions. After dispatch Root writes no terminal
report. Only `project-production-complete` or `project-production-current` proves delivery. Do not publish, push,
or use `git add .`.
