---
name: remotion-story-producer-video
description: Produce a contract-driven Remotion Story Producer video through authored inputs, sealed narration, isolated Scene Agents, the central watcher, and mechanical preview-ready handoff. Use for new or continued video authoring or explicit $remotion-story-producer-video invocation; start directly, isolate each Scene in one child Agent, keep shared state single-writer, and harden fixed-flow failures.
---

# Remotion Story Producer Video

## Start directly

Use the repository and request as authority. Inspect branch, HEAD, and status; preserve unrelated
changes. Start without a plan or routine confirmation. Infer defaults unless a missing choice changes
the result. Never ask the user to restate Skill rules.

Own production until
`preview-ready / awaiting-user-preview`, a genuine external blocker, or user cancellation. Never
detach live work from the current task.

## Require isolated Scene Agents

After Scene freeze, read
[references/scene-agent-orchestration.md](references/scene-agent-orchestration.md) completely and
follow it. Create one distinct child Agent per meaningId; never author Scenes in the root task or
silently fall back to inline work. Stop before authoring when child-Agent execution is unavailable or
forbidden.

## Keep context bounded

Do not preload authority docs. Read
[references/direct-production-workflow.md](references/direct-production-workflow.md) completely for
new production or active authoring.

Read
[references/agent-rework-and-system-hardening.md](references/agent-rework-and-system-hardening.md)
only after Agent output fails, a fixed command fails, implementation changes, or a protected-artifact
incident needs classification. Read only the relevant authority section for a contract conflict,
fixed-flow defect, fact dispute, or scope expansion. Use current code and tests as executable truth;
use CodeGraph first when `.codegraph/` exists.

## Preserve production invariants

- Freeze the [universal readability policy](policy.json) for every future production; old videos stay
  untouched.
- Read chunk budgets, safe areas, and font minima from the frozen assignment, never Skill constants.
- Author `ttsChunks` by meaning, tone, and reading rhythm; never auto-split by punctuation or characters.
  Return an over-budget chunk for Agent rework; sealed PCM with `pcm-cumulative-ceil-v1` owns timing.
- Keep one Story, one Composition, and one exclusive ScenePackage per meaningId/StoryBeat.
- Keep captions/narration top-level; every Scene root transparent; render only Beat-semantic content
  plus local sound, never Scene-local backgrounds.
- Bind renderers through the composition-local static registry; keep JSON non-executable.
- Use manifest-verified repository-local assets and Remotion frame APIs only.
- Keep runtime free of Agent, Skill, MCP, Git, provider, network, and directory scanning.
- Never edit central events or derived state.

Use ignored `voxcpm/voxcpm.private.json` by default. `RSP_VOXCPM_PRIVATE_CONFIG` is optional. Never
open, print, summarize, stage, or commit private configuration or protected voice-profile contents;
let the fixed narration command consume them.

## Classify failure by owner

Recover only Agent-owned authoring work by correcting the owned artifact and rerunning the same fixed
validator. Never recover a failed fixed workflow: stop, preserve a sanitized incident, prove Red, make
the smallest common fix, prove Green, commit exact paths locally, and begin a fresh run. Provider,
host-tool, sandbox, permission, or authorization failures are external blockers.

## Stop at mechanical Preview

Verify current status, idempotent Preview check, checksums/fingerprints, media facts, and full FFmpeg
decode. Report absolute Preview/contact-sheet/still paths, commits, failure classification, protection
result, and known issues; end awaiting explicit user preview decision.

Do not create approval, run NarrativeCheck or aesthetic gates, promote capabilities, start M10,
publish, or push. Never use `git add .`; preserve unrelated worktree changes.
