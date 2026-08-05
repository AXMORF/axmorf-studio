---
name: remotion-story-producer-video
description: Directly produce a contract-driven Remotion Story Producer video from complete user content through authored inputs, VoxCPM sealed narration, isolated ScenePackages, the central watcher, and a mechanical preview-ready handoff. Use in this repository when the user asks to make, create, or produce a new video, provides a topic, script, or source material, asks to continue Agent-owned authoring work, or explicitly invokes $remotion-story-producer-video; default to inline execution without writing a plan first, rework only Agent-authored outputs, and treat every fixed-workflow failure as a system-hardening defect rather than recovery.
---

# Remotion Story Producer Video

## Start directly

Use the repository and the user's current request as authority. Inspect branch, HEAD, and
`git status --short --branch`; preserve unrelated changes. Start inline from usable content without a
plan or routine confirmation. Infer safe production defaults unless a missing choice would materially
change the result.

Remain the lifecycle owner through provider calls, Scene work, watcher output, render, and checks until
`preview-ready / awaiting-user-preview`, a genuine external blocker, or user cancellation. Never
detach live work from the current task.

## Keep context bounded

Do not preload authority docs. Read
[references/direct-production-workflow.md](references/direct-production-workflow.md) completely for a
new production or active Agent authoring continuation. It contains the normal path.

Read
[references/agent-rework-and-system-hardening.md](references/agent-rework-and-system-hardening.md)
only after Agent output fails validation, a fixed command fails, implementation must change, or a
protected-artifact incident needs classification. Read only the relevant authority-doc section when a
contract conflict, fixed-flow defect, current-fact dispute, or scope expansion requires it. Use current
contracts, code, and tests as executable truth; use CodeGraph first for implementation boundaries when
`.codegraph/` exists.

## Preserve production invariants

- Preserve authored `ttsChunks`; sealed PCM with `pcm-cumulative-ceil-v1` owns timing.
- Keep one Story, one Composition, and one exclusive ScenePackage per meaningId/StoryBeat.
- Keep narration and captions top-level; Scene code is visual-only plus optional Scene-local sound.
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
