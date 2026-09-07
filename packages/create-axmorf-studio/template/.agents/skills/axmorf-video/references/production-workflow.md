# Production workflow

## Assigned task worker

An exact attempt-bound bind command identifies an assigned worker, not a new production Root. Read the Workspace AGENTS.md
and this worker section, run that exact bind, then proceed only after `task-worker-bound`. Read the returned `task.json`,
`inputs/context.json`, and `inputs/task-contract.json` through the granted transport. The TaskExecutionContract and validators
control purpose, signatures, ownership and outputs; this guide grants no additional file access.

Write only declared Agent-owned outputs; use exact bound describe/finalize/check/commit commands. A Scene worker also reads
`.agents/skills/remotion-best-practices/SKILL.md` and its relevant references before implementation. Correct only your own
`agent-output` issues before terminal. On a host/fixed fault, stop and return the structured error to the Root for its exact
failure command. Never reopen or automatically retry a terminal failed attempt.

The Root owns global doctor and preflight. Workers do not run `doctor`, `browser:prepare`, Project create/revise, execution
resolve, inspect, prepare, provider calls, recovery or continuation. Missing task input or an environment error does not transfer
those responsibilities to the worker. Do not inspect another task or assume access to the parent's conversation.
In subagents mode, each different TaskRevision needs a fresh native child/session. Do not accept another task through follow-up
or resume; only same-task corrections by the original owning executor before terminal are allowed.

## Root production

1. Run `npm run doctor`. Prepare only declared host prerequisites when needed;
   never patch package internals, dependencies, or validators to force Green.
2. Preserve unrelated Workspace changes and inspect existing Project source.
3. For new authoring, read [authoring](authoring.md) and run `project:create:context` to get a complete example and current public choices.
   Create or revise strict authoring input without calling providers.
   Project create freezes the Scene originality baseline. A legacy Project
   requires explicit `project:originality:freeze`; never infer an empty baseline.
   For an existing Project, run `project:revise:context`,
   `project:revise:validate`, then `project:revise`. Bind the exact current
   Revision and verified Delivery; keep live authoring unchanged and carry the
   returned `--candidate` through every production, task, and recovery command.
4. The built-in default is `subagents` with maximum four; explicit user choices override saved settings and defaults.
   Read [native child verification](execution-capabilities.md), probe this host, then run `project:execution:resolve` with
   verified capacity and transport before inspect. Explicit inline needs no child probe. Never persist transport or silently change mode.
5. Run `npm run project:produce:inspect -- --project <storyId>` and report its
   structured readiness, cost, reuse, and invalidation result.
6. Read [host execution and recovery](host-execution-and-recovery.md); establish a terminal handle that can survive the host tool deadline.
   Run `npm run project:produce:prepare -- --project <storyId>` only after the
   inspection is understood and cost is authorized.
7. In subagents mode assign each different TaskRevision to a fresh native child/session, never reuse a completed child,
   and never exceed `effectiveMaxConcurrency`. Refill on native wait-any;
   for native batches, wait for synchronous return or the native asynchronous completion notification before the next bounded batch;
   the Root does not author task outputs. For every dirty Scene, GlobalVisual, or Cover task, its executor runs the exact
   attempt-bound bind command before any task read/write. Continue only after
   `task-worker-bound`; consume immutable `task.json`, `inputs/context.json`, and
   `inputs/task-contract.json` through the returned capability.
8. The assigned executor writes only contract-declared Agent/Agent-draft outputs and uses its exact returned
   describe/finalize/check/commit/failure commands; the Root is that executor only in inline mode.
   With `controller-io`, the executor uses only returned strict file-read/file-write commands.
9. Start the exact continuation command as the Root Agent's final production
   action. Do not supervise it through polling or a second continuation.
   Candidate continuation verifies an isolated exact-four Delivery before
   controlled source/public/narration/delivery promotion. If promotion rolls
   back, retry only
   `project:revision:promote`; do not reissue the completed production attempt.
10. Never reopen a terminal failed attempt. On explicit recovery, run read-only
    `npm run project:attempt:recover-inspect -- --project <storyId> --attempt <failedAttemptId>`, then zero-provider
    same-Revision `npm run project:attempt:reissue -- --project <storyId> --attempt <failedAttemptId>`; no current
    Delivery is required.

Timing comes from sealed PCM samples. Scenes do not own captions or narration.
Agent-owned Scene TS/TSX graphs must be unique against the frozen baseline and
within the current revision; fixed template-copy Scenes are exempt.
GlobalVisual base covers the full Composition. Its decoration export is limited
to the continuous first-to-last narrated Scene window and receives local frame
zero at that window's start; neither layer may read Scene output or carry Beat
copy.
Runtime code does not call Agents, providers, Git, or the network. Delivery is
exactly `video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`, and is
current only after fixed media and checksum validation.
