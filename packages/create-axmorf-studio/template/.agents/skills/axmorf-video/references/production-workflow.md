# Production workflow

1. Run `npm run doctor`. Prepare only declared host prerequisites when needed;
   never patch package internals, dependencies, or validators to force Green.
2. Preserve unrelated Workspace changes and inspect existing Project source.
3. Create or revise strict authoring input without calling providers.
   Project create freezes the Scene originality baseline. A legacy Project
   requires explicit `project:originality:freeze`; never infer an empty baseline.
   For an existing Project, run `project:revise:context`,
   `project:revise:validate`, then `project:revise`. Bind the exact current
   Revision and verified Delivery; keep live authoring unchanged and carry the
   returned `--candidate` through every production, task, and recovery command.
4. Resolve execution according to the current host's real capabilities. Inline
   execution is always valid; use bounded runtime-native children only when the
   user/config selects them and the host verifies `shared-workspace` or
   `controller-io` transport for this production. Never persist transport.
5. Run `npm run project:produce:inspect -- --project <storyId>` and report its
   structured readiness, cost, reuse, and invalidation result.
6. Run `npm run project:produce:prepare -- --project <storyId>` only after the
   inspection is understood and cost is authorized.
7. For every dirty Scene, GlobalVisual, or Cover task, run its exact
   attempt-bound bind command before any task read/write. Continue only after
   `task-worker-bound`; consume immutable `task.json`, `inputs/context.json`, and
   `inputs/task-contract.json` through the returned capability.
8. Write only contract-declared Agent/Agent-draft outputs. Use the exact returned
   describe/finalize/check/commit/failure commands; `controller-io` uses only the
   returned strict file-read/file-write commands.
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
