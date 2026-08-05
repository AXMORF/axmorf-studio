---
name: remotion-story-producer-video
description: Directly produce or resume a contract-driven Remotion Story Producer video from complete user content through authored inputs, VoxCPM sealed narration, isolated ScenePackages, the central watcher, and a mechanical preview-ready handoff. Use in this repository when the user asks to make, create, or produce a new video, provides a topic, script, or source material for a video, asks to continue or recover a production run, or explicitly invokes $remotion-story-producer-video; default to inline execution without writing a plan first.
---

# Remotion Story Producer Video

## Preserve repository authority

Treat the current repository as authority. Read `AGENTS.md`, the current authority docs, branch,
HEAD, and `git status --short --branch` before editing. If `.codegraph/` exists, use CodeGraph before
searching for implementation boundaries.

Do not let this Skill override contracts, tests, sealed timing, Scene ownership, approval rules, or
the user's current request. Never infer current facts from an older production run.

## Execute directly

Start production inline when the user supplies usable content. Do not create a plan document or
stop for routine confirmations. Infer safe defaults for slug, Composition ID, locale, aspect ratio,
fps, caption safe area, and visual direction when the request leaves them open. Ask only when a
missing choice would materially change the requested result or an external blocker prevents work.

Remain the lifecycle owner until one of these terminal conditions:

- `preview-ready / awaiting-user-preview`;
- a genuine external blocker that cannot be resolved safely;
- the user replaces or cancels the request.

Never launch a watcher, provider call, render, or Scene task and then leave the current task.

## Load only needed details

Read [references/direct-production-workflow.md](references/direct-production-workflow.md) completely
before starting a new video or resuming an active run.

Read [references/recovery-and-boundaries.md](references/recovery-and-boundaries.md) completely when
a stage fails, a replacement run is needed, implementation code may need changing, or protected
artifacts must be audited.

## Keep the production model fixed

- Preserve authored `ttsChunks`; never split them mechanically by punctuation.
- Treat measured sealed PCM and `pcm-cumulative-ceil-v1` as absolute timing authority.
- Keep one Story, one Composition, one meaningId/StoryBeat, one exclusive Scene directory, and one
  ScenePackage per Scene.
- Keep narration and captions at the top level. Render Scene code as visual-only; let ScenePackage
  own only visual and optional Scene-local sound.
- Bind renderers through the composition-local static registry. Keep JSON free of executable code
  and dynamic module paths.
- Use only repository-local, manifest-verified assets under `public/`. Keep authoring references out
  of runtime.
- Use Remotion frame APIs for render-critical motion; reject CSS animation and transitions.
- Keep runtime free of Agent, Skill, MCP, Git, provider, network, and directory scanning.

## Use VoxCPM safely

Use the Git-ignored `voxcpm/voxcpm.private.json` by default. Treat
`RSP_VOXCPM_PRIVATE_CONFIG` as an optional explicit override, not a required setup step. Do not open,
print, summarize, stage, or commit private configuration, tokens, endpoints, prompt recordings, or
protected voice-profile contents. Let the fixed narration command consume the private configuration.

## Handle failures mechanically

Classify every failure before changing code:

1. authored input or private provider configuration;
2. expected production failure;
3. orchestration defect;
4. external environment blocker.

For an orchestration defect, preserve a sanitized incident, reproduce Red, make the smallest fix,
prove Green, stage exact paths, create a local commit, start an immutable replacement run, and
continue to Preview. Never edit central events or `state.generated.json`; never revive a terminal
failed run.

## Hand off only verified Preview

Require current production status, check-only idempotence, Preview checksum, evidence fingerprint,
mechanical-check fingerprint, ffprobe facts, and complete FFmpeg EOF decode. Run focused checks and
then the repository-wide gate in proportion to changes. Sync relevant operational/status docs.

Return the absolute Preview, contact-sheet, and still paths, all local commits, failure/recovery
summary, protection result, and known issues. End with `awaiting explicit user preview decision`.
Do not create `FinalPreviewApproval`, run NarrativeCheck or aesthetic gates, promote capabilities,
start M10, publish, or push unless the user explicitly requests that separate scope.

Never use `git add .`; preserve unrelated worktree changes.
