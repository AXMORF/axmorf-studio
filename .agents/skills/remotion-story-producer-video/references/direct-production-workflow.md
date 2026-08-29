# Direct production workflow

Agents choose creative direction; fixed scripts snapshot, validate, commit, materialize, and build.

## 1. Create repository Project inputs

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
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>] [--worker-transport <shared-workspace|controller-io>]
```

Inline requires only the current shell-capable Agent. When prompt/settings select subagents, pass current runtime
capacity and a verified worker transport; without capacity it safely resolves to one, but without a transport it
blocks. Transport is host evidence, not an App setting; native delegates qualify only with bounded children. The
repository ceiling is four. A
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

First run prepare's exact `task:bind` command with `shared-workspace` or `controller-io`. Do not read or write until it
returns `task-worker-bound`; use only its returned capability and exact bound commands. It validates `task.json`,
`inputs/context.json`, `inputs/task-contract.json`, identity, attempt authority, and checksums. Any failure is a
zero-write stop, never a guessed path. Then read immutable inputs, author declared outputs, and run:

```bash
npm run project:task:bind -- --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport shared-workspace|controller-io
npm run project:task:describe -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --binding <bindingId> --kind task|host|fixed
```

Commit revalidates and atomically promotes ArtifactAttestation; chat is not authority.

- `inline`: Root processes one dirty task at a time using its task-kind prompt. It completes check plus the exact
  attempt-bound commit/fail command before opening the next workspace.
- `subagents`: maintain a bounded pool of at most `effectiveMaxConcurrency` runtime-native children. Admit one task
  per child. If tasks remain queued, wait-any only until one child releases a slot, then admit the next. Do not poll
  all child statuses and do not use chat as a terminal receipt.

A hard spawn/transport failure executes that task's exact Root-only `spawnFailureCommand` and preserves the selected
mode. Structured finalize/check issues owned by `agent-output` are corrected in the task workspace; they never invoke
host failure. There is no automatic inline fallback. Capacity backpressure delays admission but is not a task retry. Start the continuation
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

A terminal failed attempt is immutable. On explicit recovery, run `project:attempt:recover-inspect`, then
`project:attempt:reissue`. Reissue creates a fresh same-Revision attempt, makes zero provider requests, needs no current
Delivery, preserves valid drafts, and reuses valid artifacts. It refuses active/stale/fixed-flow recovery.

```bash
npm run project:attempt:recover-inspect -- --project <storyId> --attempt <failedAttemptId>
npm run project:attempt:reissue -- --project <storyId> --attempt <failedAttemptId>
```

Run `npm run compositions` and `npm run check` with host permissions first. Sandbox failures cannot prove VoxCPM
unavailable or justify weakening Chromium sandbox.
