# Direct production workflow

Agents choose creative direction; fixed scripts snapshot, validate, commit, materialize, and build.

## 1. Create or edit Project inputs

Author one strict repository-relative input. Omit `sceneTemplates` to inherit ProducerConfig; user silence must
never become `null`. Report inherited, explicit, or disabled:

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

Creation is atomic. Silent beats have no TTS/captions; narrated beats keep `ttsChunks`.

## 2. Load the optional external-asset MCP slot

Before inspect, activate this Root-owned slot only when the current Agent can call one MCP's
`get_provider_status`, `search_images`, `preview_images`, and `acquire_image`, with an import-compatible receipt.

When active, query local Catalog first; if imagery is missing, search, preview, acquire, then admit it:

```bash
npm run project:asset:import -- --project <storyId> --receipt <absolute-receipt-path> --asset <assetId>
```

If the MCP is absent, omit this entire stage without error, placeholder task, prompt, estimate, or DAG node.
Task executors never receive it. Receipts/candidates stay at the adapter; only Project-owned manifest IDs and
fingerprints proceed.

## 3. Resolve execution once

Interpret only explicit execution fields in the current user prompt. Omitted fields inherit the settings page;
without saved settings the host-neutral built-in default is `inline`. Do not save a prompt override unless the user
explicitly requests it.

```bash
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>]
```

Inline requires only the current shell-capable Agent. When prompt/settings select subagents, pass current runtime
capacity when known; without it, subagent capacity safely resolves to one. The repository ceiling is four. A
non-exact request is clamped and reported; an exact request that cannot be satisfied returns `blocked`; known runtime
capacity zero also blocks. Production stops before prepare. Freeze the resolved result. It is diagnostic orchestration
state and never enters ProductionRevision, TaskRevision, artifacts, or delivery.

## 4. Inspect read-only, then prepare explicitly

```bash
npm run project:produce:inspect -- --project <storyId>
```

Inspect is read-only. Report readiness, cost/reuse, and invalidation before running:

```bash
npm run project:produce:prepare -- --project <storyId>
```

Prepare derives ProductionRevision/Task DAG and returns cost/explanations/`dirtyAgentTasks`. Diagnostics never own
identity; attempt IDs never enter TaskRevision.

Reuse valid artifacts. Execute only dirty `scene-owner`, `global-visual-owner`, and `cover-owner`, not
`scene-template`.

## 5. Execute dirty Agent tasks

Each TaskRevision is assigned to exactly one executor and writes only:

```text
.producer-work/<storyId>/<taskRevision>/
```

It reads `task.json` and `inputs/context.json`, corrects its output, then runs:

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>
npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task|host
```

Commit revalidates and atomically promotes ArtifactAttestation; chat is not authority.

- `inline`: Root processes one dirty task at a time using its task-kind prompt. It completes check plus the exact
  attempt-bound commit/fail command before opening the next workspace.
- `subagents`: maintain a bounded pool of at most `effectiveMaxConcurrency` runtime-native children. Admit one task
  per child. If tasks remain queued, wait-any only until one child releases a slot, then admit the next. Do not poll
  all child statuses and do not use chat as a terminal receipt.

A hard spawn failure executes that task's exact `hostFailureCommand` and preserves the selected mode; there is no
automatic inline fallback. Capacity backpressure delays admission but is not a task retry. Start the continuation
as soon as every dirty task is either executed inline or admitted to a child.

## 6. Suspend Root in the fixed continuation

After dispatch, Root launches prepare's exact `continuationCommand`:

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

It claims once while Root suspends, watches immutable events, and rejects duplicates. Failure exits without
convergence; all success converges once. The one-hour task-terminal deadline starts at ExecutionAttempt creation,
so admission and execution consume the same budget. No repair, retry, or Root re-entry.

Convergence read-only replans, materializes attested bytes with rollback, and builds
`video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`. Promotion requires checksum/media/EOF-decode; a
matching delivery returns `project-production-current` without rewrite.

Run `npm run compositions` and `npm run check` with host permissions first. Sandbox failures cannot prove VoxCPM
unavailable or justify weakening Chromium sandbox.
