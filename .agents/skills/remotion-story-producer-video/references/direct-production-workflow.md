# Direct production workflow

This file owns the root task's current normal path. It ends after detached watcher acknowledgement and
successful independent task creation.

## 1. Freeze shared inputs

Inspect branch/HEAD/status without enumerating protected ignored paths. Read the Producer config
reference. Author current brief, Story and project-local `producer-input.json`; select exactly one
configured publishing collection and never invent free text. Then run:

```bash
npm run project:configure -- --project <storyId> --input src/projects/<storyId>/producer-input.json
```

This fixed entrypoint freezes PublishingIntent v2, NarrationSpec, RenderSpec, StoryCheck and current
requirements from one ProducerConfig read. Do not manually copy defaults. Preserve causal StoryBeat
structure and Agent-authored ttsChunks; never auto-split or rewrite narration text.

Run host preflight, then create and seal one Run:

```bash
npm run production:preflight -- --project <storyId>
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
```

Use host permissions on first attempt for provider/Chromium commands. Never warm TTS, use fallback,
open private config, or weaken Chromium sandboxing.
Repository implementation verification runs `npm run check` with host permissions; this is separate
from the root production task's post-dispatch prohibition. New Composition verification likewise runs
`npm run compositions` with host permissions before dispatch.

## 2. Freeze every owner assignment

Author current VisualStyleSpec, resource pool, Scene brief, and the simplest style-aligned GlobalVisual
brief. Then run:

```bash
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
```

Require N immutable Scene assignments, one GlobalVisual assignment, and one CoverAssignment. Record
their fingerprints, assignment paths, and exclusive paths for thread prompts. Do not mutate shared
inputs after this point.

## 3. Start the detached watcher

Run with host permissions:

```bash
npm run production:watch:start -- --run <runId>
```

Require `watcher-started`, a current `production-watcher-launch-intent-v1`, and
`production-watcher-launch-receipt-v1`. The receipt proves only OS spawn acknowledgement. Intent
without receipt is watcher-launch-ambiguous and must never be retried.

The watcher independently scans assignment-keyed receipts, verifies manifests and current inputs,
serially checks/submits all owners, writes formal results/events, converges registry/Composition,
reaches render-ready without Cover, waits for Cover before delivery, and stops only after
`delivery-render-started`. It never stores Codex task identity or monitors detached MP4.

## 4. Create independent tasks and exit

Read the three orchestration references. Call Codex `create_thread` once per Scene, once for
GlobalVisual, and once for Cover. Use their self-contained prompt templates with concrete paths and
receipt commands. Do not use subagents, worktrees, branches, or merge.

After all calls return successfully, immediately finish the root task. Never call `wait_threads`,
`read_thread`, `production:status`, check/submit commands, render-ready check, compositions, or
delivery commands after dispatch. If a creation call fails, report that assignment as un-dispatched;
do not cancel the watcher or tasks already created.

Report runId, watcher intent/receipt, created task references, and missing dispatches. Clarify that
neither watcher spawn nor later delivery spawn is MP4 completion.
