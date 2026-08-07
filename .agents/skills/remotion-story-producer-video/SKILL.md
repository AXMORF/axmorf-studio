---
name: remotion-story-producer-video
description: Produce a contract-driven Remotion Story Producer video. Use for new or continued authoring or explicit $remotion-story-producer-video invocation; isolate N Scene owners, one GlobalVisual owner, and one independent Cover owner, keep production state single-writer, and stop at mechanical preview-ready.
---

# Remotion Story Producer Video

## Start directly

Use the repository and request as authority. Inspect branch, HEAD, and status; preserve unrelated
changes. Start without a plan or routine confirmation. Infer defaults unless a missing choice changes
the result. Never ask the user to restate Skill rules.

Own production until
`preview-ready / awaiting-user-preview`, a genuine external blocker, or user cancellation. Never
detach live work from the current task.

## Require N plus one production owners and one Cover owner

After freeze, read [references/scene-agent-orchestration.md](references/scene-agent-orchestration.md),
[references/global-visual-agent-orchestration.md](references/global-visual-agent-orchestration.md), and
[references/cover-agent-orchestration.md](references/cover-agent-orchestration.md) completely. Dispatch
one child per meaningId, one GlobalVisual owner, and one independent Cover owner concurrently. Root
authors none of their deliverables; no inline fallback. The production watcher joins only the N Scene
results plus GlobalVisual. Cover reaches `cover-ready` through delivery Cover contracts and never
enters production state. Stop if child-Agent execution is unavailable or forbidden.

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
- Keep one project-local GlobalVisualPackage per Story, independent from every ScenePackage.
- Create and freeze one current `PublishingIntent` during Story authoring; keep title solely in
  `StorySpec`, and keep chapter frames/timecodes out of the authored intent.
- Keep one fixed code-only CoverAssignment/CoverPackage/CoverResult chain per future production. Its
  creative inputs are only current StorySpec, VisualStyleSpec, and fixed CoverSpec.
- Keep captions/narration top-level; every Scene root transparent; render only Beat-semantic content
  plus local sound, never Scene-local backgrounds.
- Bind renderers through the composition-local static registry; keep JSON non-executable.
- Use manifest-verified repository-local assets and Remotion frame APIs only.
- Keep runtime free of Agent, Skill, MCP, Git, provider, network, and directory scanning.
- Never edit central events or derived state. The repository records result contracts, never Agent,
  task, thread, progress, or heartbeat state.

Use ignored `voxcpm/voxcpm.private.json` by default. `RSP_VOXCPM_PRIVATE_CONFIG` is optional. Never
open, print, summarize, stage, or commit private configuration or protected voice-profile contents;
let the fixed narration command consume them.

## Classify failure by owner

Recover only Agent-owned authoring work by correcting the owned artifact and rerunning the same fixed
validator. Never recover a failed fixed workflow: stop, preserve a sanitized incident, prove Red, make
the smallest common fix, prove Green, commit exact paths locally, and begin a fresh run. Provider,
host-tool, sandbox, permission, or authorization failures are external blockers.

## Stop at mechanical Preview

Verify current status, idempotent Preview check, checksums/fingerprints, media facts, full FFmpeg
decode, and the independent current Cover result. Cover failure never blocks `preview-ready`, but must
be reported because it will block later delivery. Report absolute Preview/contact-sheet/still and
Cover paths, commits, failure classification, protection result, and known issues; end awaiting
explicit user preview decision.

Do not create approval, run NarrativeCheck or aesthetic gates, promote capabilities, run
`delivery:build` before explicit approval, publish, or push. Never use `git add .`; preserve unrelated
worktree changes.
