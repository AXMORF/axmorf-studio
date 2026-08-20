# Direct production workflow

Agents choose creative direction. Fixed scripts snapshot inputs, validate outputs, commit artifacts,
materialize current Project source, and synchronously build delivery.

## 1. Create or edit Project inputs

For a new Project, choose ProducerConfig defaults and optional boundary Scene templates, author one strict
repository-relative create input, then run:

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

The creator atomically writes configured authoring and immutable boundary template instances with zero
provider/media/workspace/artifact/attempt/delivery work. Silent StoryBeats have no TTS or captions;
narrated beats preserve authored `ttsChunks`. Import Project-local media only after creation. Edit current
authoring contracts for an existing Project.

## 2. Inspect read-only, then prepare explicitly

```bash
npm run project:produce:inspect -- --project <storyId>
```

Inspect is strictly read-only: no mutation lock, provider call, workspace, or attempt. Report its readiness,
cost/reuse estimate, and structured direct/dependency/artifact explanations before running:

```bash
npm run project:produce:prepare -- --project <storyId>
```

Prepare alone may call the provider, seal/master narration, project timing-bound authoring, commit fixed
artifacts, derive ProductionRevision and the Task DAG, create dirty workspaces, and record a diagnostic
attempt. It returns actual cost, explanations, and `dirtyAgentTasks`. Explanation, baseline, and attempt ID
never enter TaskRevision, ArtifactAttestation, dispatch, materialization, or DeliveryBuild authority.

Repeated preparation reuses valid artifacts. Dispatch only dirty `scene-owner`, `global-visual-owner`, and
`cover-owner`; never delegate fixed `scene-template` tasks.

## 3. Delegate dirty Agent tasks

Use runtime-native children in the shared checkout, one per TaskRevision. Each writes only:

```text
.producer-work/<storyId>/<taskRevision>/
```

The child reads `task.json` and `inputs/context.json`, corrects only its output, then checks and commits:

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision>
```

Commit revalidates and atomically promotes an exact-file-set ArtifactAttestation. Chat is not authority; a
new prepare reuses valid earlier artifacts and dispatches only remaining dirty tasks.

## 4. Wait and converge once

Wait for all dispatched children to reach committed/current, explicit task failure, or host failure. Then
invoke exactly once for this orchestration attempt:

```bash
npm run project:produce:converge -- --project <storyId> --revision <revisionId>
```

Converge read-only replans, rejects stale/incomplete input, materializes attested bytes with rollback, and
synchronously builds `video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`. Replacement requires
checksum, codec/channel, dimensions, fps/frame count, PNG, and EOF-decode validation. A matching complete
delivery returns `project-production-current` without rewriting media.

Run `npm run compositions` and `npm run check` with host permissions on the first attempt. Sandbox failures
cannot prove VoxCPM unavailable and never justify weakening the Chromium sandbox.
