---
name: axmorf-video
description: Create and revise expressive videos with whole-film direction, bounded production, and verified delivery.
---

# AXMORF Studio Video

With an exact attempt-bound task bind, follow only
[Assigned task worker](references/production-workflow.md#assigned-task-worker) and the task contract.
Do not restart global doctor/preflight or the Root flow below. Otherwise act as the Root.

Read [the production workflow](references/production-workflow.md#root-production) before acting.
For a new film, substantial creative revision or media review read [film direction](references/film-direction.md).
For a new Project read [authoring](references/authoring.md); before preparation read
[host execution and recovery](references/host-execution-and-recovery.md).
Use the Workspace's npm scripts and their structured output. Do not use package
internals or assume a particular Agent host or global installation.

For an authorized video request, a plan or report is an intermediate progress message, not a final answer. Continue tool execution in the same turn after reporting; do not wait for another user reply. Follow the workflow for actual blockers and yielding to already-pending native work. Only verified delivery completes production.

The Root runs `npm run doctor` before Project work. If it is not ready, prepare only the
declared host environment and rerun it; never patch package internals,
`node_modules`, exact dependencies, or validators. Report unmet host capabilities as blockers.

For a new video, first run `npm run project:create:context -- --project <storyId>`.
Adapt its complete example using current public choices. Build a strict Project create input from the user brief and run
`npm run project:create`. This command creates authoring source only; it must not
call a provider or start production.
Explicit user dimensions/orientation, fps and locale override settings through create input
`render.width/height/fps/locale`; omit unspecified fields to inherit defaults. Convert orientation to concrete
dimensions, not just a textual constraint. Do not change saved settings for one video. Check the returned
`render` against the request before inspect or provider preparation.
For no-narration requests use the complete `visualFirst` context example: visual-scene authored frames, causal object changes, short text and reading holds. Preparation creates no TTS. Keep ordinary narration available; do not remove a narrated clip audio track to claim visual-first.
For each content Scene, author a visible subject, initial state, narration-timed change, and readable result. Use
composition and shot relationships to express cause and consequence instead of generic diagrams or decorative motion.

Plan the complete film in `story.filmPlan`; group consecutive content Beats with `story.visualScenes` when they share
one continuous world. A group has one Scene owner and uninterrupted sceneFrame while timing and coverage remain per Beat.
Explicit `timingSource: "authored-frames"` uses silent scene-owner preset frame durations, without TTS, narration or captions.
Read the installed public contracts and [authoring](references/authoring.md); fixed boundary templates stay separate.

Project creation also freezes the Scene originality baseline. For a legacy
Project that predates it, require explicit user approval and run
`npm run project:originality:freeze -- --project <storyId>` before inspect;
production never substitutes a silent empty baseline.

Create and revision validation may return structured `authoring-validation-failed` issues.
For `caption-display-budget-exceeded`, shorten or semantically split the authored `ttsChunk`
to stay within 72 `caption-display-unit-v1` half-units; never weaken the validator.

To modify an existing Project, follow [revision authoring](references/authoring.md#existing-project-revision):
`project:revise:context` with `--project`, raw `project:revise:validate` with only `--input`, then
`project:revise` with `--project` and `--input`.
Revision commands have no `--schema`; read the installed public contract before choosing patch fields.
Bind the input to the exact current Revision and verified four-file Delivery.
Never edit live authoring in place; use the returned candidate flag throughout production.
Candidates use only Project-owned media frozen in their base context; do not import new assets.

For each live or candidate production, including an autonomous revision within the same request, repeat current capability
verification and one successful `project:execution:resolve` before inspect. Never reuse an earlier production's probe or resolver result.
Read [native child verification](references/execution-capabilities.md), use its helper-generated complete probe prompts, and release every completed probe slot for the default
`subagents` mode (maximum four). Unknown runtime capacity blocks; verify a native probe batch up to the requested maximum. One I/O probe cannot establish maximum capacity one. Resolve once with verified host flags on `npm run project:execution:resolve`. Only explicit user choices
may override settings; do not claim an Agent-selected mode came from the user. A blocked
subagents configuration is a blocker, not permission to switch to inline.
An explicit user authorization before prepare may use `--allow-inline-fallback`;
report actual inline mode and the original capability blockers. Exact concurrency
still blocks. Do not switch dispatched attempts or waive parallel release validation.
For Hermes TUI probe batches, wait for native completion notifications; `delegate_task` with `{"action":"list"}` is forbidden status polling, including a single post-dispatch check.

Before cost, run read-only `npm run project:produce:inspect` and report source
readiness (`sourceState`), estimate, artifact reuse, and structured invalidation in a user-visible message. Follow the returned `agentHandoff`: send its summary before the next production command. Tool output alone is not this report.
For a local correction, compare inspect's dirty tasks with the intended scope; if unrelated tasks are dirty, narrow the raw patch
and validate/create a new candidate before prepare, then repeat capability verification/resolve/inspect.
A complete visual rebuild does not prove local artifact reuse. Only then run
`npm run project:produce:prepare`, which may call configured providers and
returns content-addressed dirty tasks plus exact terminal commands. Use its `durationBudget` to report measured total duration and deviation; sealed audio remains authoritative.

For inspect, prepare, and every later command, emit the complete native tool result, including its original process handle
and eventual exit code. In code mode use `text(result)`, never just `text(result.output)`, and drain the original shell handle
as shown in the execution reference. A completed outer code cell does not prove that its shell command exited.
Dispatch only after the original prepare has exited successfully and its complete structured result is retained;
if that result is lost, report the blocker instead of rebuilding assignments or continuation commands from files.

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

Before writing Scene code, read repository-local `.agents/skills/remotion-best-practices/SKILL.md`
and only the references routed for that Scene. The complete declared TS/TSX graph must be original
against the immutable baseline; template-copy Scenes are fixed-produced and exempt.
Convergence rejects exact or token-normalized duplicates before any live materialization.

GlobalVisual owns two no-Props exports: `GlobalVisualBaseLayer` covers the full
Composition, while `GlobalVisualDecorationLayers` receives frame zero at the
first content Scene and is bounded through the last content Scene, for narrated or authored timing. It must not
read Scene output or place Beat-specific copy in either layer.

Before the unique continuation, workers may finish and the Root may run `project:preview` with the exact candidate flag.
The frozen draft does not change live source/current Delivery or reset the attempt deadline. Record media checksums,
observed frame ranges and unobserved listening/quality separately; a receipt is not creative approval.
`reference:analyze` produces bounded cut candidates, image-motion fits and timestamped PNG evidence for local video.
Review those frames before interpreting camera or continuity; the report neither approves quality nor admits assets.
