# Production workflow

## Assigned task worker

An exact attempt-bound bind command identifies an assigned worker, not a new production Root. Read the Workspace AGENTS.md
and this worker section, run that exact bind, then proceed only after `task-worker-bound`. Read the returned `task.json`,
`inputs/context.json`, and `inputs/task-contract.json` through the granted transport. The TaskExecutionContract and validators
control purpose, signatures, ownership and outputs; this guide grants no additional file access.

Write only declared Agent-owned outputs; use exact bound describe/finalize/check/commit commands.
No intermediate or temporary file writes are allowed outside those declared paths, including for JSON formatting.
Transform data in memory and write the declared output directly; moving a temporary file back does not grant permission.
For Scene work, read
`.agents/skills/remotion-best-practices/SKILL.md` and its relevant references before implementation. Correct only your own
`agent-output` issues before terminal. On a host/fixed fault, stop and return the structured error to the Root for its exact
failure command. Never reopen or automatically retry a terminal failed attempt.
For Scene tasks, consume `scene.brief`, `scene.visualStyle`, and Scene-local `scene.narrationCues` in the bound context.
When `scene.priorSource` exists, it is this owning Scene's verified, frozen current base graph and declarations. Compare
its previous brief with `scene.brief`, copy its content into the declared outputs, and apply only the requested delta while
preserving unaffected source, layout, motion, sound and resources. Output paths are initially absent. Retain license and
lineage bytes exactly; finalize recomputes fresh derived fields. Never redraw the whole Scene for a local correction or
read base snapshot paths, other Scenes, history, or another executor workspace. If absent, create from the current brief
and do not claim preservation of existing source.
For a new Scene without prior source, design a visible opening, meaning-driven change, and result aligned with narration or authored visual events. The Renderer in the task contract is
an API scaffold and must be replaced; its unchanged source fails the Scene checker.
For new authoring, stage one clear focal subject per shot, keep it recognizable across changes in scale or viewpoint, and make the final state
show the Beat's consequence. Leave visual breathing room for Composition-owned captions.

Finalize computes derived identities and fingerprints. For `failureOwner: agent-output`, correct its reported
file/field and rerun finalize before check; do not calculate hashes manually or read package internals.
A finalizer command failure alone is not a fixed-system fault. Scene-local ranges use immutable endFrame minus
startFrame, with exclusive ends; never round that duration or use the global endFrame.

The Root owns global doctor and preflight. Workers do not run `doctor`, `browser:prepare`, Project create/revise, execution
resolve, inspect, prepare, provider calls, recovery or continuation. Missing task input or an environment error does not transfer
those responsibilities to the worker. Do not inspect another task or assume access to the parent's conversation.
In subagents mode, each different TaskRevision needs a fresh native child/session. Do not accept another task through follow-up
or resume; only same-task corrections by the original owning executor before terminal are allowed.

## Root production

For an authorized production request, every plan, create-context report and inspection report is an intermediate progress message, not a final answer. Continue with tools in the same turn; do not wait for another user reply. On Hermes, include user-visible assistant text with the next tool call; a text-only final reply ends the turn. Stop for an actual blocker or an explicit user pause. Yield only to already-pending native work as described in the host execution reference; a report alone creates no resumable work.

Before the first command, briefly tell the user the plan. Report inherited boundary duration before create and the inspect result before prepare; CLI output is not a user-facing explanation. Keep all production commands scoped to this Workspace. A newly created npm Workspace may have no Git repository, so a Git check must not gate doctor.

1. Run `npm run doctor`. Prepare only declared host prerequisites when needed;
   never patch package internals, dependencies, or validators to force Green.
2. Preserve unrelated Workspace changes and inspect existing Project source.
3. For new authoring, read [authoring](authoring.md) and run `project:create:context` to get a complete example and current public choices. Evaluate its capability API guides before selecting self-authored alternatives; workers receive only selected immutable resource records.
   Create or revise strict authoring input without calling providers.
   Project create freezes the Scene originality baseline. A legacy Project
   requires explicit `project:originality:freeze`; never infer an empty baseline.
   For an existing Project, follow [revision authoring](authoring.md#existing-project-revision):
   `npm run project:revise:context -- --project <storyId>`,
   `npm run project:revise:validate -- --input <repository-relative-json>`, then
   `npm run project:revise -- --project <storyId> --input <repository-relative-json>`. Bind the exact current
   Revision and verified Delivery; keep live authoring unchanged and carry the
   returned `--candidate` through every production, task, and recovery command.
4. Repeat this step for every live or candidate production, including an autonomous revision in the same request;
   do not reuse a previous production's probe or resolver result. The built-in default is `subagents` with maximum four;
   explicit user choices override saved settings and defaults. Read [native child verification](execution-capabilities.md),
   verify current capabilities, release probe slots, then run `project:execution:resolve` successfully once with
   verified capacity and transport before inspect. Explicit inline needs no child probe. Never persist transport or silently change mode.
5. Run `npm run project:produce:inspect -- --project <storyId>` and report its
   `sourceState`, estimated cost, artifact reuse, and structured invalidation result in an intermediate progress message after the command returns.
   A plan stated before inspection does not report its result. For a local correction, examine `tasks[].directChanges`,
   `dependencyChanges`, and artifact state against the intended patch. If unrelated tasks are dirty, narrow the raw patch and
   validate/create a new candidate before prepare, then return to step 4. A complete visual rebuild is not local reuse success.
   Continue in the same turn after that message; do not combine inspect and prepare in one tool call.
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
8. The shared-workspace Scene executor uses its exact bound `commands.preview` before commit: render the same validated outputs, inspect causal actions and reading holds, and repair only the owning declared outputs. Controller-IO previews are explicitly unavailable. Preview is diagnostic and does not replace final boundary/music review.
   The assigned executor writes only contract-declared Agent/Agent-draft outputs and uses its exact returned
   describe/finalize/check/commit/failure commands; the Root is that executor only in inline mode.
   With `controller-io`, the executor uses only returned strict file-read/file-write commands.
9. Start the exact continuation command once per attempt. Root supervises with native notifications or blocking waits on its original
   handle. Normal wait timeouts only renew that wait; no child/status polling, repeated log reads or a second continuation. On an error
   notification, diagnose and guide the original executor before terminal without accessing its workspace. Report fixed completion once.
   Candidate continuation verifies an isolated exact-four Delivery before
   controlled source/public/narration/delivery promotion. If promotion rolls
   back, retry only
   `project:revision:promote`; do not reissue the completed production attempt.
10. Never reopen a terminal failed attempt. Follow [host recovery](host-execution-and-recovery.md): at most one automatic recovery per
    user production request for proven Agent-authored output faults, only after all previous workers have exited. Run read-only
    `npm run project:attempt:recover-inspect -- --project <storyId> --attempt <failedAttemptId>`, report the diagnosis/reuse, then zero-provider
    same-Revision `npm run project:attempt:reissue -- --project <storyId> --attempt <failedAttemptId>` only if ready; no current Delivery is
    required. Use fresh workers and bindings. Unknown, fixed-system and external faults stop with diagnosis; no automatic program-source repair.

After `project-production-complete` or `project-production-current`, the exact four files are technically verified. Generate the low-cost `project:scene:review --motion` previews described below, inspect actions/boundaries against intent and readability, then report paths and actual review scope once. Retain needs-temporal-review when perception is unavailable; never claim automatic visual approval. If a separate recheck is needed, use exactly `npm run project:check -- --project <storyId> --level final`; do not omit `--level`. `project:revise:context` starts a revision within the authorized brief and is not a delivery inspection command.

Narrated timing comes from sealed PCM samples; visual timing comes from authored frames, with explicit null narration and no fake PCM. Scenes do not own captions or narration.
Agent-owned Scene TS/TSX graphs must be unique against the frozen baseline and
within the current revision; fixed template-copy Scenes are exempt.
All visual workers read context.visualStyle and use its semantic theme roles. Composition paints theme.background and composites decoration behind Scenes in an isolated group capped at 8% opacity; GlobalVisualBaseLayer must directly return null and is not mounted. Legacy Projects without a theme retain their base layer. Its decoration export is limited
to the continuous first-to-last content Scene window and receives local frame
zero at that window's start; neither layer may read Scene output or carry Beat
copy.
Runtime code does not call Agents, providers, Git, or the network. Delivery is
exactly `video.mp4`, `cover-4x3.png`, `cover-3x4.png`, and `publish.json`, and is
current only after fixed media and checksum validation.
After a verified current delivery, `npm run project:scene:review -- --project <storyId>` writes a local three-frame-per-Scene
review page under ignored `out/<storyId>/scene-review/`. Review the delivered video for motion and sound; this diagnostic
does not alter production identity or automatically grade visual quality.
Compare each Scene's opening, change, and result with its `narrativePurpose`, Scene brief, and narration cues. If the visible
result misses the user's meaning or the focal subject is unclear, describe the specific mismatch and use the isolated
revision flow for corrections within the authorized brief. Mechanical delivery success alone does not prove visual quality.

`npm run project:scene:review -- --project <storyId> --motion` exports whole Scenes, boundary clips and available action windows, including cause/result/reading-hold samples. `revision-feedback.json` scopes observed defects to meaningId/actionId/frame ranges; it is diagnostic feedback, not accepted revision input or approval. Read `project:revise:context`, then use the strict isolated revision workflow; preserve sealed narration and unaffected assets. Source-plan annotations are explicitly current-source references, not attested statements about the delivered animation. Watch actual clips and compare their visible causal actions; numeric motion, static stills and generated evidence never certify aesthetics or listening. Formal release checks remain unchanged.
