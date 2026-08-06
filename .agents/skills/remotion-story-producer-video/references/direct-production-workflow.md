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
src/projects/<storyId>/narration.json
src/projects/<storyId>/render.json
src/projects/<storyId>/reviews/story-check.json
src/projects/<storyId>/production/requirements.json
```

Preserve every user claim in a causal Story. Give each ordered StoryBeat one stable `meaningId` and
Agent-authored `ttsChunks` based on meaning, tone, and reading rhythm; never split by punctuation or
character count and never let a script rewrite `ttsText`. Future production freezes the universal
readability policy from the Composition dimensions. Treat its assignment-provided display budget as
the authority; an over-budget chunk is Agent-owned authoring failure and must be rewritten before any
provider call. Existing videos and v1 runs are not migrated.
Infer safe format defaults and record them in the handoff. Use a safe profile ID through the default
VoxCPM command without reading private values. Bind current input identities in
`ProductionRequirementsFreeze`; select no M9.5 global enhancements.

Before Run writes, execute on the first attempt with host permissions:

```bash
npm run production:preflight -- --project <storyId>
```

A restricted-sandbox failure cannot prove that VoxCPM is unavailable. Do not warm or test TTS,
weaken Chromium sandboxing, or fallback. Run `production:start` with the same host permissions; it
repeats the gate.

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

## 3. Freeze Scene work

Author current-project `visual-style.json`, `production/story-resource-pool.json`, and
`production/scene-production-brief.json`. Use only current ResourceCatalog entries and explicitly
selected immutable references; an empty resource pool is valid. Then run:

```bash
npm run production:scene:freeze -- --run <runId>
```

Require one immutable assignment per meaningId with exclusive source/public paths and the exact
frozen readability policy.

## 4. Own watcher and Scene lifecycle

Start a live session:

```bash
npm run production:watch -- --run <runId>
```

Keep polling its real output. Do not detach it from the current task. Author Scenes inline, or delegate
only when explicitly allowed, while the watcher remains live. Each Scene owner receives one meaningId,
its exclusive paths, current Beat/sealed timing, style/brief/assignment, adjacent continuity, and only
approved current resources. Use only the assignment-provided content/caption safe areas and font
minimum; never duplicate their numeric values in authoring guidance. Keep semantic content inside the
guarded content frame, reserve full bleed for non-semantic backgrounds, and keep captions top-level.
Do not inspect historical Scene source or media.

Keep work under `src/projects/<storyId>/scenes/<meaningId>/`. Produce assignment-required plans,
selections, renderer, optional local-sound declarations, and ScenePackage inputs. Submit or record an
Agent failure only through:

```bash
npm run production:scene:submit -- --run <runId> --scene <meaningId>
npm run production:scene:fail -- --run <runId> --scene <meaningId> --code <CODE> --description "<safe description>"
```

Correct rejected Agent-owned output, including over-budget chunks or readability-invalid Scene
source, through the same validator. Validator, propagation, fingerprint, watcher, or checker failure
is a common-flow defect. Never write events, state, coverage,
registry, projection, or Composition manually. Continue until all results are accepted or the run is
terminal. For any fixed-command failure, stop and load the hardening reference; do not retry it.

## 5. Verify Preview

Let the watcher own the post-Scene pipeline and real render. Require `preview-ready`, then run:

```bash
npm run production:status -- --run <runId>
npm run production:preview:check -- --run <runId>
ffmpeg -v error -xerror -i out/<storyId>/production/<runId>/preview.mp4 -f null -
npm run compositions
```

Require Preview recheck `noOp: true`, unchanged event sequence, current assembly/evidence/mechanical
fingerprints, exact dimensions/fps/frame count/streams, and complete decode. Run focused checks for
changed workflow code and `npm run check` when source, contracts, registry, runtime, or authority docs
changed. Sync only docs whose facts changed.

## 6. Commit and hand off

Stage exact paths only. Never stage private config, protected voice profiles, ignored run state,
diagnostic media, unrelated changes, or old formal artifacts; never push. Report run/status, absolute
Preview/contact-sheet/still paths, Preview checksum, evidence/mechanical fingerprints, media facts,
Agent rework or common-flow hardening, local commits, protection results, remaining worktree changes,
known issues, and `awaiting explicit user preview decision`.
