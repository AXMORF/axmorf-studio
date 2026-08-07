# Direct production workflow

This file owns the normal path. Do not load the failure/hardening reference unless a failure occurs.

## 1. Preflight and inputs

Inspect branch, HEAD, `git status --short --branch`, and current project inputs. Preserve unrelated
tracked and untracked changes. Do not enumerate protected untracked directories or open private
configuration. Do not preload the authority set: Read only the relevant authority section when a
contract ambiguity, scope boundary, current-fact conflict, or implementation defect makes it
necessary. Prefer the current contract, source, and focused test for exact shapes.

Create a normalized `<storyId>` and Remotion-safe Composition ID, then author only:

```text
src/projects/<storyId>/brief.json
src/projects/<storyId>/story.json
src/projects/<storyId>/publishing-intent.json
src/projects/<storyId>/narration.json
src/projects/<storyId>/render.json
src/projects/<storyId>/reviews/story-check.json
src/projects/<storyId>/production/requirements.json
```

Preserve every user claim in a causal Story. Create one current `PublishingIntent` in the same Story
stage: bind the Story fingerprint, reuse `StorySpec.title` rather than duplicating it, and author the
description, 6–7 unique topics, free-text collection, plus one ordered Chinese chapter name per
meaningId. Do not author chapter frames or timecodes. Give each ordered StoryBeat one stable
`meaningId` and Agent-authored `ttsChunks` based on meaning, tone, and reading rhythm; never split by punctuation or
character count and never let a script rewrite `ttsText`. Future production freezes the universal
readability policy from the Composition dimensions. Treat its assignment-provided display budget as
the authority; an over-budget chunk is Agent-owned authoring failure and must be rewritten before any
provider call. Existing videos and v1 runs are not migrated.
Infer safe format defaults and record them in the handoff. Use a safe profile ID through the default
VoxCPM command without reading private values. Bind current input identities in
`ProductionRequirementsFreeze`. For current v4 production, also author
`production/global-visual-brief.json` and select the required GlobalVisual enhancement. Existing
v1-v3 inputs and runs remain read-only compatibility artifacts.

Before Run writes, execute on the first attempt with host permissions:

```bash
npm run production:preflight -- --project <storyId>
```

A restricted-sandbox failure cannot prove that VoxCPM is unavailable. Do not warm or test TTS,
weaken Chromium sandboxing, or fallback. Run `production:start` with the same host permissions; it
repeats the gate. Run the production regression suite and typecheck before the first real Run whenever
shared production code has changed since its last verified commit. All provider, Chromium, Remotion,
watcher-render, and final media commands use host permissions on their first attempt; never use a
restricted-sandbox attempt as the normal production path.
This explicitly includes `npm run check` and `npm run compositions`: both use host permissions on
their first attempt because the full check transitively launches Remotion Chromium. Use
`npm run check:static` only when a browser-free restricted-sandbox verification is intentionally
required; it is not the complete repository gate.

## 2. Narrative Baseline

Run:

```bash
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
```

Parse `runId` from stdout. Keep the current task alive during VoxCPM. The fixed narrative command owns
candidate handling, sealing, measurement, timing, registry, Baseline media/evidence, and AutoCheck;
do not reproduce its stages manually. Require `baseline-ready`, sealed narration identity,
SemanticTiming, CaptionCues, Baseline evidence, AutoCheck, and any applicable no-op recheck.

## 3. Freeze parallel visual work

Author current-project `visual-style.json`, `production/story-resource-pool.json`,
`production/scene-production-brief.json`, and the GlobalVisual brief. Use only current
ResourceCatalog entries and explicitly selected immutable references; an empty resource pool is
valid. Then freeze the production assignments and the independent Cover assignment:

```bash
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
```

Require one immutable assignment per meaningId plus one immutable whole-film GlobalVisual assignment,
each with exclusive source/public paths and exact frozen identities. Separately require one current
CoverAssignment whose only creative inputs are current StorySpec, current VisualStyleSpec, and fixed
CoverSpec. Cover freeze must not read publishing, timing, Scene, GlobalVisual, preview, evidence,
approval, or FinalAssembly inputs.

## 4. Own watcher, N+1 production lifecycle, and independent Cover lifecycle

After freeze, read [scene-agent-orchestration.md](scene-agent-orchestration.md),
[global-visual-agent-orchestration.md](global-visual-agent-orchestration.md), and
[cover-agent-orchestration.md](cover-agent-orchestration.md) completely. Start the live watcher with
host permissions:

```bash
npm run production:watch -- --run <runId>
```

Dispatch N Scene owners, one GlobalVisual owner, and one Cover owner concurrently. Poll watcher output
for the N+1 production join while following the Cover protocol separately. The repository and watcher
read production result contracts only; the delivery Cover CLI reads its own immutable result contract.
Neither persists Agent, task, thread, progress, or heartbeat state. Do not detach, inline authoring,
or manually write events, state, coverage, registry, projection, Composition, or Cover result files.
For any fixed-command failure, stop and load the hardening reference; do not retry it.

## 5. Verify Preview

Let the watcher own the post-Scene pipeline and real render. Require `preview-ready`, then run:

```bash
npm run production:status -- --run <runId>
npm run production:preview:check -- --run <runId>
ffmpeg -v error -xerror -i out/<storyId>/production/<runId>/preview.mp4 -f null -
npm run compositions
```

Require Preview recheck `noOp: true`, unchanged event sequence, all N+1 result contracts accepted,
current GlobalVisual projection/assembly/evidence/mechanical fingerprints, exact dimensions/fps/frame
count/streams, and complete decode. Run focused checks for
changed workflow code and `npm run check` when source, contracts, registry, runtime, or authority docs
changed. Independently require `delivery:cover:check` and the immutable `cover-ready` result to be
current before normal handoff; a missing or failed Cover does not change production state or block
Preview, but it must remain an explicit later-delivery blocker. Sync only docs whose facts changed.

## 6. Commit and hand off

Stage exact paths only. Never stage private config, protected voice profiles, ignored run state,
diagnostic media, unrelated changes, or old formal artifacts; never push. Report run/status, absolute
Preview/contact-sheet/still paths, Preview checksum, evidence/mechanical fingerprints, media facts,
one meaningId-to-child-task mapping with each final check result, the GlobalVisual and Cover owner
results, Agent rework or common-flow hardening, local commits, protection results, remaining worktree
changes, known issues, and
`awaiting explicit user preview decision`.
