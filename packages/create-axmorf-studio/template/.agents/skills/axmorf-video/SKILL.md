---
name: axmorf-video
description: Create, produce, validate, and deliver a video in this Workspace.
---

# AXMORF Studio Video

First route by assignment: with an exact attempt-bound task bind, follow only
[Assigned task worker](references/production-workflow.md#assigned-task-worker) and the task contract.
Do not restart global doctor/preflight or the Root flow below. Otherwise act as the Root.

Read [the production workflow](references/production-workflow.md#root-production) before acting.
For a new Project read [authoring](references/authoring.md); before preparation read
[host execution and recovery](references/host-execution-and-recovery.md).
Use the Workspace's npm scripts and their structured output. Do not use package
internals or assume a particular Agent host or global installation.

For an authorized video request, a plan or report is an intermediate progress message, not a final answer. Continue tool execution in the same turn after reporting; do not wait for another user reply. Follow the workflow for actual blockers and yielding to already-pending native work. Only verified delivery completes production.

The Root runs `npm run doctor` before Project work. If it is not ready, prepare only the
declared host environment and rerun it; never patch package internals,
`node_modules`, exact dependencies, or validators. Report an unsatisfied host
capability as a blocker.

For a new video, first run `npm run project:create:context -- --project <storyId>`.
Adapt its complete example using current public choices. Build a strict Project create input from the user brief and run
`npm run project:create`. This command creates authoring source only; it must not
call a provider or start production.
Explicit user dimensions/orientation, fps and locale override settings through create input
`render.width/height/fps/locale`; omit unspecified fields to inherit defaults. Convert orientation to concrete
dimensions, not just a textual constraint. Do not change saved settings for one video. Check the returned
`render` against the request before inspect or provider preparation.

Project creation also freezes the Scene originality baseline. For a legacy
Project that predates it, require explicit user approval and run
`npm run project:originality:freeze -- --project <storyId>` before inspect;
production never substitutes a silent empty baseline.

Create and revision validation may return structured
`authoring-validation-failed` issues. For
`caption-display-budget-exceeded`, shorten or semantically split the authored
`ttsChunk` to stay within 72 `caption-display-unit-v1` half-units; never weaken
the validator.

To modify an existing Project, first run `npm run project:revise:context`,
validate a strict raw input with `npm run project:revise:validate`, then create
an isolated candidate with `npm run project:revise`. The input must bind the
exact current Revision and verified four-file Delivery. Never edit live
authoring in place; use the returned candidate flag throughout production.
Candidates only use Project-owned media already frozen in their base context;
they do not import new assets.

Before inspect, read [native child verification](references/execution-capabilities.md), use its helper-generated complete probe prompts, and release every completed probe slot for the default
`subagents` mode (maximum four). Unknown runtime capacity blocks; verify a native probe batch up to the requested maximum. One I/O probe cannot establish maximum capacity one. Resolve once with verified host flags on `npm run project:execution:resolve`. Only explicit user choices
may override settings; do not claim an Agent-selected mode came from the user. A blocked
subagents configuration is a blocker, not permission to switch to inline.

Before cost, run read-only `npm run project:produce:inspect` and report source
readiness, estimate, artifact reuse, and invalidation in a user-visible message. Follow the returned `agentHandoff`: send its summary before the next production command. Tool output alone is not this report. Only then run
`npm run project:produce:prepare`, which may call configured providers and
returns content-addressed dirty tasks plus exact terminal commands. Use its `durationBudget` to report measured total duration and deviation; sealed audio remains authoritative.

Execute only dirty Agent tasks. Forward the selected complete `workerPrompts` string from prepare/reissue without reconstructing task hashes. Each executor first runs prepare's exact
attempt-bound bind command and continues only after `task-worker-bound`. Only
then read `task.json`,
`inputs/context.json`, and the immutable, attempt-neutral
`inputs/task-contract.json`; then use only the returned transport and bound
describe/finalize/check/commit/failure commands. ArtifactAttestation and terminal
events are authority.

Short `--assignment` selects one dirty task from the exact immutable project/attempt snapshots and retains the same full binding checks. Preserve all returned flags.

Keep full process results and their original handles until exit; partial wait-any completion leaves the other children pending. Use native background/notify when a foreground wrapper cannot survive its outer deadline. Read the executable wait example in [native child verification](references/execution-capabilities.md#preserve-process-and-child-waits).

Start prepare's exact continuation once per attempt. Root stays responsible with blocking waits on the original handle or native
notifications; on event-only hosts follow the yield/resume instructions in [native child verification](references/execution-capabilities.md#event-only-hosts); no child/status polling, repeated log reads or unchanged progress reasoning. On errors, diagnose and guide the original
owner without accessing its workspace or repairing the running continuation. Report the fixed result once; ignore duplicate success
notifications. Only a terminal result that verifies the exact four-file current Delivery proves completion.

Candidate continuation verifies its isolated four files before controlled
promotion of source/public/narration/delivery as one transaction. A promotion
failure rolls all four back; retry only `npm run project:revision:promote`,
never reissue the successfully produced candidate attempt.

A disappeared continuation without a terminal event stops with diagnosis. A later explicit user recovery request uses the interruption
inspection and recovery route in [host execution and recovery](references/host-execution-and-recovery.md).
Never manually clear its lock or claim. A terminal failed attempt is immutable. The host recovery guide permits at most one automatic
recovery per user production request for a proven Agent-authored output fault, after all previous workers have exited. Run read-only,
zero-provider `npm run project:attempt:recover-inspect`, report the diagnosis/reuse, then use `npm run project:attempt:reissue` only when
ready for a fresh same-Revision attempt and fresh workers. It does not require current Delivery. Unknown, system or external faults
are diagnosed and reported, not automatically repaired or retried.

Before writing Scene code, read the repository-local
`.agents/skills/remotion-best-practices/SKILL.md` and only the references routed
for that Scene.
The complete declared TS/TSX graph must be original against the immutable
baseline; template-copy Scenes are fixed-produced and exempt. Convergence also
rejects exact or token-normalized duplicates before any live materialization.

GlobalVisual owns two no-Props exports: `GlobalVisualBaseLayer` covers the full
Composition, while `GlobalVisualDecorationLayers` receives frame zero at the
first narrated Scene and is bounded through the last narrated Scene. It must not
read Scene output or place Beat-specific copy in either layer.
