# Direct production workflow

Agents choose creative direction. Fixed scripts snapshot inputs, validate outputs, commit artifacts,
materialize current Project source, and synchronously build delivery.

## 1. Author Project inputs

For a new Project, choose ProducerConfig defaults and optional boundary Scene templates, then run:

```bash
npm run project:configure -- --project <storyId> --input src/projects/<storyId>/producer-input.json
```

ProducerConfig copies boundary Scene templates into Project-local immutable instances. Silent StoryBeats
have no TTS, CaptionCue, or sealed segment. Narrated StoryBeats preserve Agent-authored `ttsChunks` as
atomic generation units. Author Story, VisualStyleSpec, StoryResourcePool, Scene briefs, and the minimal
GlobalVisual brief. Import approved resources before planning.

Real project-production preflight, `npm run check`, and `npm run compositions` use host permissions first.
Sandbox diagnostics cannot establish that VoxCPM is unavailable; do not weaken Chromium sandboxing,
warm TTS, or add fallback output.

## 2. Plan the current Revision and DAG

```bash
npm run project:produce:plan -- --project <storyId>
```

The command loads explicit Project contracts and selected bytes, derives a ProductionRevision, validates
the Task DAG, rechecks Artifact Store entries, creates workspaces for non-reused tasks, records a diagnostic
ExecutionAttempt, and returns `dirtyAgentTasks`. An attempt ID, clock, process, and absolute path never enter
RevisionId, TaskRevision, or ArtifactAttestation identity.

Repeated planning with identical inputs must classify valid artifacts as `reused`. Dispatch only dirty
`scene-owner`, `global-visual-owner`, and `cover-owner` tasks. `scene-template` is a fixed task and is never
delegated. `templateMeaningIds` and `ownerMeaningIds` remain distinct authoring sources.

## 3. Delegate dirty Agent tasks

Use runtime-native child Agents in the shared checkout, one child per TaskRevision. Each child writes only:

```text
.producer-work/<storyId>/<taskRevision>/
```

The child reads `task.json` plus `inputs/context.json`, loops the focused read-only check while correcting
its own output, and commits exactly that artifact:

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision>
```

The commit repeats validation and atomically promotes an exact-file-set ArtifactAttestation. Chat success
is not authority. A new attempt after failure reuses every valid earlier artifact and dispatches only tasks
still dirty.

## 4. Wait and converge once

Wait for all dispatched children to reach committed/current, explicit task failure, or host failure. Then
invoke exactly once for this orchestration attempt:

```bash
npm run project:produce:converge -- --project <storyId> --revision <revisionId>
```

Converge recomputes the current Revision, rejects stale input, requires all artifacts, materializes exact
attested bytes with rollback, refreshes generated Project packages/registry/Composition, and synchronously
builds `video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`. Current delivery is replaced only
after checksum, codec/channel, dimensions, fps/frame count, PNG, and EOF-decode validation. A matching
complete delivery returns `project-production-current` without rewriting media.
