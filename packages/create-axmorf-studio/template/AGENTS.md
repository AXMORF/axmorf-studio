# AXMORF Studio Workspace

This Workspace is the authority for its user-owned Projects, media, production
artifacts, and Deliveries. Before creating, revising, producing, or delivering a
video, read `.agents/skills/axmorf-video/SKILL.md` completely.

Route by assignment first: an Agent given an exact attempt-bound task bind is a worker. Follow
[Assigned task worker](.agents/skills/axmorf-video/references/production-workflow.md#assigned-task-worker),
not the Root production flow. The TaskExecutionContract and validators retain task authority. Global doctor/preflight,
browser preparation, Project creation and production orchestration belong to the Root; a worker does not repeat them.

Use only the npm scripts declared in this Workspace. Do not import package
internals, mutate `node_modules`, install global tools, or depend on a source
checkout. Treat structured CLI output, task inputs, fixed validators,
ArtifactAttestations, and the verified current Delivery as authority; chat or
self-assessment is not completion evidence.

Before Project work, the Root runs `npm run doctor`. It verifies a real tiny browser render;
if the pinned browser is missing, use `npm run browser:prepare` once and rerun doctor. If it fails, prepare the declared
Node.js/npm environment and host prerequisites, then rerun the same command.
Environment preparation may use ordinary package-manager or version-manager
operations, but do not modify `node_modules`, package internals, exact dependency
versions, lockfile authority, or validators to force readiness. If the declared
capabilities cannot be satisfied, report the blocker instead of changing the
product.

For new authoring, read the Skill authoring reference and use `project:create:context`
to obtain a complete example and current public choices. Inherit boundary templates
and execution settings unless the user explicitly changes them.

Run `npm run project:produce:inspect` before any costly preparation. Only
`npm run project:produce:prepare` may call configured providers. An Agent task
must run prepare's exact attempt-bound bind command before reading or writing
task content. Only `task-worker-bound` grants access to immutable `task.json`,
`inputs/context.json`, and `inputs/task-contract.json` plus declared outputs.
Use the returned transport and bound describe/finalize/check/commit/failure
commands. The Root Agent's last production action is prepare's exact continuation
command. Wait only on the original host process handle for its terminal output;
do not issue new production/status commands or infer completion from a background acknowledgement.

`project:create` freezes the Project's Scene originality baseline. A legacy
Project without it requires the user's explicit migration request and
`npm run project:originality:freeze -- --project <storyId>` before inspect;
production must not infer an empty baseline. Agent-owned Scenes must not duplicate
a frozen historical or same-revision TS/TSX source graph; fixed template-copy
Scenes are exempt, and convergence checks again before live materialization.

Create and revision validation may return structured
`authoring-validation-failed` issues. For
`caption-display-budget-exceeded`, shorten or semantically split the authored
`ttsChunk` to stay within 72 `caption-display-unit-v1` half-units; never weaken
the validator.

Never edit a current Project in place. For an existing Project, obtain the
exact current Revision and verified four-file Delivery with
`project:revise:context`, validate strict raw input, and create an isolated
candidate with `project:revise`. Carry its candidate ID through production.
Candidate promotion changes the current Project and Delivery only after its own
exact four files pass validation; it replaces only source/public/narration/delivery
as one transaction, and any promotion failure must roll all four back.
Retry only `project:revision:promote`, not the completed production attempt.

Execution defaults to `subagents` with maximum four, subject to available native child capacity. Explicit user choices override
saved execution settings and the built-in default; explicit inline remains supported. Before inspect, follow the Skill
[host probe](.agents/skills/axmorf-video/references/execution-capabilities.md), then pass verified capacity and transport to
`project:execution:resolve`. The Root assigns each different TaskRevision to a fresh native child/session and never authors task outputs in subagents mode.
Never reuse a finished child through follow-up or resume for a different task; same-task corrections remain with its original
executor before terminal. Releasing a capacity slot does not authorize reusing that child session.
Subagents require bounded runtime-native children and verified
`shared-workspace` or `controller-io` transport for this production. Transport is
host capability evidence, not saved Workspace configuration. A failed attempt is
immutable; explicit recovery uses read-only `project:attempt:recover-inspect`
before zero-provider same-Revision `project:attempt:reissue`.

A continuation interrupted without a terminal event uses explicit
`project:attempt:interrupt-inspect`, then its returned `project:attempt:interrupt`
only when owner and subprocess death are proven. Follow recover-inspect/reissue.
Never manually delete a lock or claim; old claims without ownership evidence fail closed.

Load `.agents/skills/remotion-best-practices/SKILL.md` before implementing a
Scene. Render-critical motion uses Remotion frame APIs, Scene roots stay
transparent, and the Composition alone owns narration and captions.

GlobalVisual exports a full-Composition base layer and a decoration layer that
is sequenced from the first through last narrated Scene with local frame zero at
that window's start. It must not read Scene output or carry Beat-specific copy.

Never publish, push, delete a Project, or expose private configuration unless
the user explicitly requests that action. Project deletion must use
`npm run project:delete -- --project <storyId> --confirm-delete`.
