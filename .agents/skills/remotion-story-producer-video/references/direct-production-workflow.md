# Direct production workflow

Agents choose creative direction. Fixed scripts snapshot inputs, validate outputs, commit artifacts,
materialize current Project source, and synchronously build delivery.

## 1. Create or edit Project inputs

Author one strict repository-relative input. Unless explicitly requested otherwise, omit `sceneTemplates`
to inherit ProducerConfig; user silence must never become `null`. Report inherited, explicit, or disabled:

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

Creation atomically writes configured authoring and immutable boundary templates. Silent StoryBeats have no
TTS/captions; narrated beats preserve `ttsChunks`.

## 2. Inspect read-only, then prepare explicitly

```bash
npm run project:produce:inspect -- --project <storyId>
```

Inspect is read-only. Report readiness, cost/reuse, and structured invalidation explanations before running:

```bash
npm run project:produce:prepare -- --project <storyId>
```

Prepare may call providers, seal narration, derive ProductionRevision/Task DAG, create workspaces, and return
cost/explanations/`dirtyAgentTasks`. Diagnostics never own identity; attempt IDs never enter TaskRevision.

Repeated preparation reuses valid artifacts. Dispatch only dirty `scene-owner`, `global-visual-owner`, and
`cover-owner`; never delegate fixed `scene-template` tasks.

## 3. Delegate dirty Agent tasks

Use runtime-native children in the shared checkout, one per TaskRevision. Each writes only:

```text
.producer-work/<storyId>/<taskRevision>/
```

The child reads `task.json` and `inputs/context.json`, corrects only its output, then checks and executes the
exact attempt-bound terminal command returned by prepare:

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>
npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task|host
```

Commit revalidates and atomically promotes an exact-file-set ArtifactAttestation. Chat is not authority.

## 4. Suspend Root in the fixed continuation

Immediately after all dispatch calls, Root launches the exact `continuationCommand` returned by prepare:

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

This bounded process atomically claims the exact attempt once and owns the barrier while Root is suspended
without token-consuming supervision. It watches immutable terminal events rather than the generated progress
projection; duplicate continuation startup fails closed. One child failure exits without convergence; all
successes invoke internal convergence once. A missing terminal at the six-hour total deadline becomes one
timeout failure. Fixed failure exits without repair, retry, or Root re-entry.

Internal convergence read-only replans, materializes attested bytes with rollback, and synchronously builds
`video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`. Promotion requires checksum/media/EOF-decode
validation. A matching delivery returns `project-production-current` without rewrite.

Run `npm run compositions` and `npm run check` with host permissions on the first attempt. Sandbox failures
cannot prove VoxCPM unavailable and never justify weakening the Chromium sandbox.
