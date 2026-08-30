---
name: axmorf-video
description: Resolve inline or bounded-Agent execution, produce, and hand off to fixed continuation.
---

# AXMORF Studio Video

## Create the Project when needed

Read [policy](policy.json), [workflow](references/direct-production-workflow.md), and
[Producer config](references/producer-config.md). Report boundary Scenes as inherited, selected, or disabled.
User silence means inheritance: omit `sceneTemplates`, never infer `null`. Use `project:create` for new authoring;
edit existing inputs and preserve unrelated changes.

## Load optional Agent capabilities

Before inspect, use only the current Agent's actually callable tools. Activate the external-asset MCP slot when one
MCP exposes `get_provider_status`, `search_images`, `preview_images`, and `acquire_image` with an import-compatible
receipt; config, shell discovery, and another Agent's tools do not count. If absent, omit it without error,
placeholder, or DAG node. If active, query local Catalog first and use `project:asset:import`. MCP data never enters
task executors, artifacts, delivery, or runtime.

## Resolve Agent execution

Before inspect, resolve execution once with `project:execution:resolve`. Explicit user prompt fields override the
settings page; omitted fields inherit it, then the host-neutral built-in `inline` default. Prompt overrides apply only
to this production unless the user explicitly asks to save them. Inline needs no child runtime and executes dirty
tasks sequentially. Select subagents only through prompt/settings when the host supplies runtime-native children;
pass known capacity and respect the repository ceiling of four. If exact requested capacity or known zero runtime
capacity resolves `blocked`, stop before prepare. Do not persist raw prompt text or put this policy in revision IDs.

## Inspect before cost

Run read-only, zero-provider `project:produce:inspect`; report readiness, cost/reuse, and invalidation. Unknown stays
unknown.

## Prepare content-addressed tasks

Only after reporting run `project:produce:prepare`; it may call providers and open an ExecutionAttempt. Identities
exclude its diagnostics. Reuse artifacts and execute only `dirtyAgentTasks`.

## Execute dirty Agent tasks

Use the resolved mode with the task's [Scene](references/scene-agent-orchestration.md),
[GlobalVisual](references/global-visual-agent-orchestration.md), or [Cover](references/cover-agent-orchestration.md)
prompt; never Agent-author `scene-template`. Each Root or child executor reads immutable inputs, writes only
`.producer-work/<storyId>/<taskRevision>/`, loops check, then runs prepare's attempt-bound terminal command. The
validated ArtifactAttestation and task-terminal event are durable authority.

Inline Root executes exactly one workspace at a time. Subagent mode admits at most `effectiveMaxConcurrency`
runtime-native children; when dirty tasks exceed it, wait-any only to release an admission slot. Never poll all
children or treat chat as completion. A hard spawn failure runs that task's exact `hostFailureCommand`; it does not
switch modes. Once every dirty task has been executed or admitted, continue immediately.

## Hand off to fixed continuation

Root's final production action is the exact `continuationCommand`; then it suspends without polling or
token-consuming supervision. Code claims once, watches immutable events, and rejects duplicates.
Any failure exits nonzero without converge; all-success converges exactly once; the one-hour total deadline starts
at ExecutionAttempt creation. No retry, Root re-entry, direct converge, or workspace edit.

## Preserve production invariants

- Sealed PCM samples own timing; Composition owns captions, narration, and background.
- Scene/GlobalVisual/Cover are isolated; templates are fixed-produced; Scene roots stay transparent.
- Diagnostics do not change authority; protect private/voice/other-Project/history.
- Delivery is exact `video.mp4`, two PNG Covers, and `publish.json`, validated through EOF.

## Classify failure by task owner

Only its assigned executor corrects a workspace before terminal; failure ends the attempt. Separate engineering uses
[system hardening](references/agent-rework-and-system-hardening.md). Never retry, fallback, weaken validators, or
fabricate attestations inside it.

## Finish with verified delivery

Before execution report the resolved mode/capacity, IDs, inspection, cost, summary, and TaskRevisions. After the
continuation starts, no Root terminal report.
Only `project-production-complete` or `project-production-current` proves delivery. Do not publish, push, or use
`git add .`.
