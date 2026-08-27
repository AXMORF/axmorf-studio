---
name: remotion-story-producer-video
description: Resolve inline or bounded-Agent execution, produce, and hand off to fixed continuation.
---

# Remotion Story Producer Video

## Create or revise Project authoring

Read [policy](policy.json), [workflow](references/direct-production-workflow.md), and
[Producer config](references/producer-config.md). Report boundary Scenes as inherited/selected/disabled.
User silence means inheritance: omit `sceneTemplates`, never infer `null`. Use `project:create` for new authoring. Installed Workspace revision:
packaged `schema project-revision`, `project revise-context/revise-validate/revise`, then bind `candidateId` to production.
Never clone an MP4, Project, or historical Scene; current stays until verified candidate promotion.
`ttsChunk`: max 72 display half-units; split in order.

## Load optional Agent capabilities

Only the current Agent's actually callable tools count. Activate the external-asset MCP slot when one MCP exposes
`get_provider_status`, `search_images`, `preview_images`, and `acquire_image` with an import-compatible receipt.
Config, shell discovery, and another Agent's tools do not count. If absent, omit without error or DAG node. If active, query
local Catalog first and use `project:asset:import`. MCP data never enters tasks or runtime.

## Resolve Agent execution

Resolve once with `project:execution:resolve`. Explicit prompt fields override settings; omissions inherit settings,
then built-in `inline`. Overrides are one-production unless explicitly saved. Inline needs no child runtime and is
sequential. Select subagents only through prompt/settings with runtime-native children; pass known capacity, maximum
four. If exact capacity or known zero resolves `blocked`, stop before prepare. Do not persist prompts or put policy in
revision IDs.

## Inspect before cost

Run read-only, zero-provider `project:produce:inspect`; report readiness, cost/reuse, and invalidation. Unknown stays
unknown.

## Prepare content-addressed tasks

Only after reporting run `project:produce:prepare`; it may call providers and open an ExecutionAttempt. Identities
exclude its diagnostics. Reuse artifacts and execute only `dirtyAgentTasks`.

## Execute dirty Agent tasks

Use the resolved mode with [Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), or [Cover](references/cover-agent-orchestration.md)
prompt; never Agent-author `scene-template`. Each Root or child executor reads immutable inputs, writes only
`.producer-work/<storyId>/<taskRevision>/`, loops check, then runs prepare's attempt-bound terminal command. The
validated ArtifactAttestation and task-terminal event are durable authority.

Inline Root executes one workspace at a time. Subagent mode admits at most `effectiveMaxConcurrency` native
children; when tasks exceed it, wait-any only for admission. Never poll all children or treat chat as completion. A
hard spawn failure runs exact `hostFailureCommand`, without switching modes. Continue after every task is executed
or admitted.

## Hand off to fixed continuation

Root's final production action is the exact `continuationCommand`; then it suspends without polling or
token-consuming supervision. Code claims once, watches immutable events, and rejects duplicates.
Any failure exits nonzero without converge; all-success converges exactly once; the one-hour total deadline starts
at ExecutionAttempt creation. No retry, Root re-entry, direct converge, or workspace edit.

## Preserve production invariants

- Sealed PCM samples own timing; Composition owns captions, narration, and background.
- Scene/GlobalVisual/Cover are isolated; templates are fixed-produced; Scene roots stay transparent and
  meaning-local. Historical normalized and same-Revision exact/normalized Renderer duplicates fail fixed validation.
- Diagnostics do not change authority; protect private/voice/other-Project/history.
- Delivery is exact `video.mp4`, two PNG Covers, and `publish.json`, validated through EOF.

## Classify failure by task owner

Only its executor corrects a workspace before terminal; failure ends the attempt. Separate engineering uses
[system hardening](references/agent-rework-and-system-hardening.md). Never retry, fallback, weaken validators, or
fabricate attestations inside it.

## Finish with verified delivery

Report mode/capacity, IDs, inspection, cost, summary, and TaskRevisions before execution. After continuation starts,
Root gives no terminal report. `project-production-source-current` is a valid manual source-only terminal, not
playable. Only `project-production-complete` or `project-production-current` proves revalidated exact-four-file
Delivery.
Do not publish, push, or use `git add .`.
