# 直接生产工作流

## 1. Preflight

1. Read `AGENTS.md`, `docs/FINAL_PRODUCT_GOAL.md`, `docs/PRODUCTION_WORKFLOW.md`,
   `docs/ITERATION_STATUS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`,
   `docs/DETERMINISTIC_EXECUTION.md`, `docs/TERMINOLOGY.md`, and
   `docs/PRODUCTION_ORCHESTRATION.md`.
2. Inspect the current branch, HEAD, `git status --short --branch`, package scripts, current tests,
   and toolchain. Preserve every unrelated tracked or untracked change.
3. Do not use `git status --untracked-files=all` when a protected untracked directory exists. Do not
   read or glob protected private directories.
4. Record explicit checksums for existing formal media, assembly, approval, evidence, and final
   reports that the new production must not change. Use explicit paths rather than broad globs.
5. Confirm only the safe VoxCPM facts needed for production: the default private config is ignored,
   the selected safe profile ID is resolvable by the fixed command, and no secret is emitted.

Do not write a plan. Proceed directly after preflight unless a genuine blocker exists.

## 2. Author current project inputs

Create a new normalized slug and a Remotion-safe Composition ID. Author only the current project:

```text
src/projects/<storyId>/brief.json
src/projects/<storyId>/story.json
src/projects/<storyId>/narration.json
src/projects/<storyId>/render.json
src/projects/<storyId>/reviews/story-check.json
src/projects/<storyId>/production/requirements.json
```

Use current contracts and tests as shape authority. Do not copy old production Story content, Scene
layout, Composition, stills, contact sheets, or media.

Convert the user's complete material into a causal Story without dropping claims. Author StoryBeats
in presentation order. Give every Beat one stable `meaningId` and one or more `ttsChunks` selected by
meaning, tone, and reading rhythm. Do not split by punctuation. Keep pauses explicit.

Make `RenderSpec` reflect the requested format. If unspecified, choose a reasonable delivery format
from the content and state the assumption in the handoff; do not ask merely to choose between common
defaults. Keep captions inside the declared safe area.

Use a safe profile ID from the default VoxCPM configuration. Never copy private values into authored
JSON. Bind every source checksum/fingerprint through `ProductionRequirementsFreeze`. Select no M9.5
global enhancements. Make the StoryCheck current before provider work.

Run focused contract validation, inspect the exact diff, stage only current-project inputs, and make
a clear local commit when repository policy calls for a checkpoint.

## 3. Start and seal Narrative Baseline

Run the exact CLI:

```bash
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
```

Parse `runId` from stdout; do not construct it. Keep the current task alive while VoxCPM runs. The
narrative command owns generation, resume, seal, measurement, timing, registry, Baseline media,
evidence, and AutoCheck. Do not reproduce those steps manually.

Require `baseline-ready`. Verify narration identity, complete WAV checksum, SemanticTiming,
CaptionCues, Baseline media/evidence, AutoCheck, and a no-op repeat where appropriate. Do not accept
partial candidates as timing authority.

## 4. Freeze Scene production

After `baseline-ready`, author current project files:

```text
src/projects/<storyId>/visual-style.json
src/projects/<storyId>/production/story-resource-pool.json
src/projects/<storyId>/production/scene-production-brief.json
```

Query only the current ResourceCatalog and approved immutable authoring references. An empty resource
pool is valid when project-local visuals are sufficient. Do not put a resource into the pool unless
its current descriptor, checksum, allowed use, and license are valid.

Run:

```bash
npm run production:scene:freeze -- --run <runId>
```

Require exactly one immutable assignment for every meaningId. Confirm exclusive source/public output
paths and deadlines before authoring Scenes.

## 5. Own watcher and Scene lifecycle

Start the central watcher in a live execution session:

```bash
npm run production:watch -- --run <runId>
```

Keep polling its real output. Do not detach it from the current task. If Agent delegation is available
and allowed, assign exactly one meaningId and its exclusive paths per Scene task. Otherwise author
Scenes inline while the watcher remains alive.

For each Scene, read only:

- the current Story/Beat and sealed timing;
- current VisualStyleSpec, SceneProductionBrief, assignment, and adjacent continuity summary;
- current ResourceCatalog entries and explicitly selected immutable references.

Never inspect or imitate historical production Scenes or media. Keep implementation under
`src/projects/<storyId>/scenes/<meaningId>/`. Produce the current plans, selections, renderer source,
optional Scene-local sound declarations, and ScenePackage inputs required by the assignment. Use zero
selected resources when appropriate; the selected-resources envelope must remain strict and current.

Submit or fail only through the exact CLI:

```bash
npm run production:scene:submit -- --run <runId> --scene <meaningId>
npm run production:scene:fail -- --run <runId> --scene <meaningId> --code <CODE> --description "<safe description>"
```

Never write events, state, coverage, registry, projection, or Composition manually. Continue watching
until all Scene results are accepted or the run reaches a terminal failure.

## 6. Reach and verify Preview

On all-success, let the watcher run the fixed post-Scene pipeline and real Remotion/FFmpeg render.
Require `preview-ready`; do not synthesize evidence or repair generated state.

Run:

```bash
npm run production:status -- --run <runId>
npm run production:preview:check -- --run <runId>
ffmpeg -v error -xerror -i out/<storyId>/production/<runId>/preview.mp4 -f null -
npm run compositions
```

Require `noOp: true` on repeated Preview checks, unchanged event sequence, current assembly/evidence/
mechanical fingerprints, exact dimensions/fps/frame count/stream counts, and complete decode.

Run focused production tests after workflow changes. Run `npm run check` before completion when source,
contracts, registry, runtime, or authority docs changed. Recompute every protected artifact checksum.

## 7. Commit and hand off

Use exact-path staging and small local commits. Never stage private configuration, protected voice
profiles, ignored run state, diagnostic media, unrelated changes, or old formal project artifacts.
Never use `git add .`; never push unless explicitly requested.

Sync only docs whose current facts changed. Hand off:

- final run ID and exact status;
- absolute Preview/contact-sheet/still paths;
- Preview checksum and evidence/mechanical fingerprints;
- technical media facts and full-decode result;
- problems, classifications, fixes, replacements, and local commits;
- protected before/after results and remaining worktree changes;
- known issues and `awaiting explicit user preview decision`.
