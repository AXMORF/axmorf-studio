---
name: remotion-story-producer-video
description: Plan, delegate, converge, and synchronously deliver a content-addressed Remotion Story production.
---

# Remotion Story Producer Video

## Create the Project when needed

Preserve unrelated changes. Read [policy](policy.json),
[the direct workflow](references/direct-production-workflow.md), and
[Producer config](references/producer-config.md) for a new Project. After the target Project and authored
inputs are decided, `project:create` atomically creates configured authoring without provider, media,
workspace, artifact, attempt, or delivery work. Do not encode a natural-language new-versus-existing
decision; edit current authoring inputs for an existing Project.

## Inspect before cost

Run `project:produce:inspect`. It is strictly read-only and makes zero provider calls. Before preparation,
report source readiness, estimated provider/Agent/delivery cost, artifact reuse, and available structured
invalidation explanations. Unknown estimates remain unknown.

## Prepare content-addressed tasks

Only after reporting inspection, run `project:produce:prepare`. This sole costly entrypoint may invoke the
selected provider, prepare fixed artifacts, create dirty workspaces, and open an ExecutionAttempt. Revision
and task identities contain no attempt, clock, path, explanation, or Agent identity. Reuse every valid
artifact and dispatch only returned `dirtyAgentTasks`.

## Delegate dirty Agent tasks

Use runtime-native children in this shared checkout, one child per task. Read only the matching prompt:
[Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), or
[Cover](references/cover-agent-orchestration.md). Never delegate `scene-template`.

Each child reads immutable `task.json` and `inputs/context.json`, writes only
`.producer-work/<storyId>/<taskRevision>/`, loops `project:task:check`, then calls `project:task:commit`.
Chat is coordination; the validated ArtifactAttestation is the durable authority.

## Wait and converge once

Wait in the current task until every child reaches artifact committed/current, explicit task failure, or
host failure. Then call `project:produce:converge` exactly once. It uses read-only current replan before live
writes. Do not create watchers/schedulers, infer artifacts from chat, recreate reused work, or author a dirty
child task inline.

## Preserve production invariants

- One Story/Composition and one meaningId/ScenePackage; sealed PCM cumulative samples own timing.
- Scene, GlobalVisual, and Cover stay isolated; template-copy Scenes are fixed-produced.
- Explanations, estimates, baselines, and attempts are diagnostic-only and never change Revision,
  TaskRevision, ArtifactAttestation, dispatch, materialization, or DeliveryBuild authority.
- Captions, narration, and full-frame background remain Composition-owned; Scene roots stay transparent.
- Private config, voice material, other Projects, shared assets, and history stay unread and uncommitted.
- Current delivery requires exact `video.mp4`, both PNG Covers, and `publish.json` with checksum, media, and
  EOF-decode validation.

## Classify failure by task owner

Only the assigned child corrects an invalid Agent workspace. For validator, store, materialization, or
delivery defects with valid inputs, read
[system hardening](references/agent-rework-and-system-hardening.md). Provider, host, sandbox, permission,
and authorization failures are external blockers. Never auto-retry, fall back providers, reuse across
Projects, weaken validators, or fabricate attestations.

## Finish with verified delivery

Report storyId, revisionId, inspected cost/explanations, prepared actual cost and task summary, dispatched
TaskRevisions, child terminals, and the single converge result. Only `project-production-complete` or
`project-production-current` proves a verified current four-file delivery. Do not publish, push, or use
`git add .`.
