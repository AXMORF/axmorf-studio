# Direct production workflow

This file owns the current normal path. Do not load the failure/hardening reference unless a failure
occurs.

## 1. Preflight and inputs

Inspect branch, HEAD, `git status --short --branch`, and current project inputs. Preserve unrelated
tracked and untracked changes. Do not enumerate protected untracked directories or open private
configuration. Read only the authority section needed to resolve a real contract ambiguity. Prefer
current contracts, source, and focused tests for exact shapes.

Create a normalized `<storyId>` and Remotion-safe Composition ID, then author:

```text
src/projects/<storyId>/brief.json
src/projects/<storyId>/story.json
src/projects/<storyId>/publishing-intent.json
src/projects/<storyId>/narration.json
src/projects/<storyId>/render.json
src/projects/<storyId>/reviews/story-check.json
src/projects/<storyId>/production/requirements.json
```

Preserve every user claim in a causal Story. Bind one `PublishingIntent` to the Story fingerprint,
reuse `StorySpec.title`, and author description, 6–7 unique topics, collection, and one ordered Chinese
chapter name per meaningId. Do not author chapter frames or timecodes. Give each StoryBeat one stable
meaningId and Agent-authored `ttsChunks` based on meaning, tone, and reading rhythm. Never split by
punctuation or character count, and never let a script rewrite `ttsText`.

Use a safe voice profile ID through the fixed VoxCPM command without reading private values. Bind all
current inputs in `ProductionRequirementsFreeze`, including the required GlobalVisual enhancement and
universal readability policy.

Before Run writes, execute with host permissions on the first attempt:

```bash
npm run production:preflight -- --project <storyId>
```

Do not warm or test TTS, weaken Chromium sandboxing, or use fallback output. All provider, Chromium,
Remotion, watcher, and browser-backed verification commands use host permissions on their first
attempt. This includes `npm run check` and `npm run compositions`; `npm run check:static` is only the
browser-free subset.

## 2. Narrative baseline

Run:

```bash
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
```

Keep the current task alive during VoxCPM. The fixed narrative command owns generation, sealing,
measurement, timing, registry, baseline media/evidence, and AutoCheck. Require `baseline-ready`,
sealed narration identity, SemanticTiming, CaptionCues, baseline evidence, and AutoCheck.

## 3. Freeze parallel visual work

Author `visual-style.json`, `production/story-resource-pool.json`,
`production/scene-production-brief.json`, and `production/global-visual-brief.json`. Use current
ResourceCatalog entries and explicitly selected immutable references; an empty resource pool is
valid. Keep the GlobalVisual brief to the simplest full-frame background board that still follows the
current VisualStyleSpec. Use only restrained color, gradient, or subtle texture by default; do not add
standalone decoration, continuity motifs, or Beat-specific changes unless the user explicitly asks
for them. Then freeze production and Cover assignments:

```bash
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
```

Require one immutable assignment per meaningId, one whole-film GlobalVisual assignment, and one
independent CoverAssignment. Cover creative inputs are exactly current StorySpec, VisualStyleSpec,
and fixed CoverSpec.

## 4. Own watcher, N+1 production owners, and Cover owner

Read [scene-agent-orchestration.md](scene-agent-orchestration.md),
[global-visual-agent-orchestration.md](global-visual-agent-orchestration.md), and
[cover-agent-orchestration.md](cover-agent-orchestration.md) completely. Start the live watcher with
host permissions:

```bash
npm run production:watch -- --run <runId>
```

Dispatch N Scene owners, one GlobalVisual owner, and one Cover owner concurrently. Poll the watcher
for its N+1 join while following the Cover protocol separately. Repository commands consume immutable
result contracts only; they never persist Agent, task, thread, progress, or heartbeat state. Do not
detach Agent work, inline authoring, or manually write events, state, registry, projection,
Composition, or Cover result files. For fixed-command failure, stop and load the hardening reference.

## 5. Require render-ready and launch automatic delivery

Let the watcher create the final Composition, render plan, and render-ready artifact. Require:

```bash
npm run production:status -- --run <runId>
npm run production:render-ready:check -- --run <runId>
npm run delivery:cover:check -- --project <storyId>
npm run compositions
```

Require `render-ready / awaiting-automatic-delivery`, a no-op render-ready recheck, unchanged event
sequence, accepted N+1 result contracts, and current render-plan, assembly, layer, sound, Composition,
fps, dimensions, and frame-count identities. Cover missing or stale does not change production state,
but it blocks the next command.

Launch delivery without another user decision:

```bash
npm run delivery:build -- --project <storyId>
```

Require `delivery-render-started` and a current `render-launch-receipt-v1`. The package contains
immutable Covers, publishing metadata, handoff, launch manifest, intent, and checksum ledger, but no
completed MP4. Intent is written exactly once before spawn; receipt is written only after the OS
emits `spawn`. Intent without receipt is launch-ambiguous and must not be retried. Do not wait for,
monitor, stat, read, checksum, probe, or decode the planned MP4.

Do not run another normal-flow command after build returns: detached MP4 launch is the final
production action. `delivery:check` remains a separate manual diagnostic command, not a Skill step.

## 6. Commit and hand off

Run focused checks and `npm run check` when source, contracts, registry, runtime, Skill, or authority
docs changed. Stage exact paths only. Never stage private config, protected voice profiles, ignored
run state, delivery media, unrelated changes, or historical artifacts; never push.

Report the run, `delivery-render-started`, absolute delivery directory, planned MP4 and render log
paths, delivery ID, intent/receipt identities, owner results, local commits, protection results,
remaining worktree changes, and known issues. Explicitly state that spawn acknowledgement is not
render completion and that the detached render was not monitored.
