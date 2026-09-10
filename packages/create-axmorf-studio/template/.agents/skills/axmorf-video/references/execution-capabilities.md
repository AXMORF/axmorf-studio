# Verify native child execution

Read before resolving `subagents` execution. The default is `subagents` with `maxConcurrency: 4`; explicit user fields override
`private/execution-preferences.json`, then built-in defaults. A maximum is a ceiling, not a request for exactly four workers.
Explicit `inline` remains supported and needs no child probe.

## Verify this host before inspect

1. Read the requested mode/maximum from explicit user fields, then `private/execution-preferences.json`, then
   built-in `subagents`/4. Inspect actual callable native child creation/completion/slot-release tools and their
   documented available slots, excluding Root and occupied slots. A CLI, plugin, new chat, or shell job is not a child.
   Missing runtime capacity now blocks resolution; it never silently becomes one. A read-only blocked resolver result
   may expose the requested settings; resolve successfully once after gathering the missing host evidence.
2. Choose a bounded probe count up to the requested maximum and repository ceiling four, respecting a known lower
   native host limit. When the host maximum is unknown, exercise the requested batch through the real native child API;
   do not test one and label it the maximum. Generate the temporary challenge files and complete assignments with the
   shipped helper from the Workspace root:

```bash
node .agents/skills/axmorf-video/scripts/native-probe.mjs create --count <bounded-probe-count>
```

3. Forward each returned `workerPrompt` in full to one fresh native child. Both the input and output paths are absolute;
   never shorten a response path, reconstruct a prompt, or put challenge bytes in it. Dispatch the whole bounded batch
   before waiting on one. No Project/task/artifact path or provider is involved. Respect a native capacity rejection;
   do not fake capacity or substitute shell jobs.
4. Wait for every native completion, preserving still-pending handles. Then run the returned exact `verifyCommand`.
   Only its successful comparison proves the shared-file round trip; native admission and completion establish the
   tested available capacity. A missing response is an unverified probe, not proof of filesystem isolation: inspect the
   assigned absolute paths and reported child command before classifying the cause. Root never writes or moves responses.
5. Explicitly close/release every completed probe child through the native host API before production dispatch. A completed
   child can still occupy a host slot; a completion message alone does not release it. Then run the returned `cleanupCommand`,
   which removes only this verified batch. Preserve failed probe evidence. Pass verified host facts to the resolver,
   inheriting the requested mode/maximum rather than overriding them:

```bash
npm run project:execution:resolve -- --runtime-max-concurrency <verified-available-child-capacity> --worker-transport shared-workspace
```

Use only the flags for facts actually verified. These flags describe current host evidence, not user preferences. Never persist transport, probe paths, or child IDs in production
inputs. If no child API or verified transport exists, report the actual blocker before prepare; never automatically select inline.
For a host without shared files, `controller-io` is valid only after its native child channel demonstrates a strict read/write
round trip through the Root's controller. During production it must exclusively use the exact bound file-read/file-write capability.
Do not label a shared-filesystem probe as `controller-io`, or select it merely to bypass a failed probe.

A single successful probe proves transport and at least one working child; it does **not** prove a maximum of one.
Use the current native tool's documented available slots for capacity. If that tool supports four available children,
pass four, even when one child was sufficient for the I/O challenge. Never invent a lower capacity for convenience.
For an exact concurrency request, the tested batch must satisfy that exact count before prepare. Keep this temporary evidence outside production identity. Compare
cross-process timing only with a shared wall-clock domain; use a process's monotonic clock only for its own duration.

## Preserve process and child waits

Use the host's current callable tool schema. A yielded tool response is still running when it contains a process or
cell handle, including when output is empty. Preserve the complete result, not just its output string. In Codex
code mode, this pattern keeps the original shell process alive through repeated wait windows:

```javascript
// axmorf-original-process-wait
let result = await tools.exec_command({cmd: "<exact returned command>", yield_time_ms: 1000});
text(result);
while (result.session_id !== undefined) {
  result = await tools.write_stdin({session_id: result.session_id, chars: "", yield_time_ms: 60000});
  text(result);
}
if (result.exit_code !== 0) throw new Error("Command failed; inspect the structured result above.");
```

If code mode itself yields a cell ID, wait on that same cell until completion. Never start the command again.
Root and probe/production workers use this rule. A wait-any child result covers only the children reported complete:
keep the other native handles pending, refill free slots, and wait again. A CLI Root must not send its final answer
while probe/production children or the original continuation process remain pending; ending that Root can cancel them.

For Hermes, start continuation with native `terminal` arguments `background: true, notify: true`. Preserve its
`session_id`; use the current native `process`/`process_manage` tool with `action: "wait"`, that same ID, and a long
wait within the host deadline. Raising a foreground `timeout` does not extend the outer tool executor deadline.
Do not use shell `&`, change host timeouts, or restart a timed-out foreground continuation. A wait-window timeout
is pending; a missing/killed process is an error requiring diagnosis. The event-only yield rule below applies only
when the host keeps the session and work alive and resumes it through native notifications.

## Event-only hosts

A host may deliver background child completion only after the current assistant turn ends (for example, an interactive Hermes session). A background dispatch acknowledgement is not that completion. If no native blocking child wait exists, finish independent preparation, then end the current turn with a brief pending-work update. Leave the same session open: the native completion starts its next turn automatically. Do not occupy that turn with shell sleeps, list/status calls, transcript reads, or a loop waiting for response.txt. After the probe completion arrives, compare the two exact files and resolve execution.

Apply the same yield/resume behavior when a bounded batch must finish before another can be admitted. Once every dirty task is admitted, start the exact continuation once using the original persistent process handle. If batch completions still need delivery, yield so the host can deliver them; then wait on that original continuation handle. Report final delivery only after its fixed success and the already-dispatched native batch completions have arrived. Completion messages carry no new user request and do not authorize another production run.

This is session resumption, not a new task, mode fallback, or a user approval request. Do not change host settings or call undocumented background overrides to obtain synchronous execution.

## Give each worker a complete assignment

A child may receive only its own goal/context. Do not rely on inherited conversation, working directory, or a parent's successful
doctor message. Supply the Workspace root, task kind, exact bind command from prepare, and these public instruction paths in each
native child assignment. Prefer prepare's complete `workerPrompts` entry for the verified transport: forward the whole
string without rewriting its command. Short `--assignment` is a 1-based index into this exact attempt's immutable dirty
task snapshots, never a global/current/latest task selector. Preserve the project, attempt and candidate flags.
Do not copy or reconstruct TaskRevision/binding hashes. A compact handoff is:

```text
Role: assigned task worker for <task kind>, not production Root.
Own only the bound TaskRevision; do not accept a different TaskRevision in this child/session.
Workspace root: <absolute Workspace root>
Read <Workspace root>/AGENTS.md and its assigned-worker route.
Run this exact bind command from that root before any task content access:
<exact attempt-bound bind command returned by prepare>
Continue only after task-worker-bound; read the three immutable inputs using its transport.
Implement only this task's declared outputs and use its exact finalize/check/commit commands.
Scene workers read the Workspace-local remotion-best-practices Skill before implementing.
Global doctor/preflight and production orchestration belong to the Root; do not rerun them or call providers.
Return structured host/fixed errors; no retry of a terminal failed attempt and no continuation from a worker.
```

For controller-io, deliver the public instruction text through the native child context; give no filesystem access beyond its bound
controller capability. The handoff is a routing aid, never authority to override AGENTS.md, the task contract or validators.

## Admit production tasks

Each different TaskRevision requires a fresh native child/session. A finished child must not receive another TaskRevision through
follow-up, resume, or reuse of its session, even after its capacity slot is released. The capability-probe child is also not a
production worker. Same-task corrections by the original owning executor remain allowed before that task's terminal event;
this does not authorize reopening a terminal task or assigning another task to that child.

In subagents mode the Root never authors task outputs. Assign one dirty task to one bounded native child. Pass its exact bind
command and task prompt; the child binds before reading any task content, writes only declared outputs, and uses the returned
finalize/check/commit commands. Reuse valid artifacts; fixed template tasks never get a child.
Keep at most `effectiveMaxConcurrency` children active (at most four and no more than verified host capacity). Use the native
scheduling shape this host actually supports:

- With wait-any, use the longest blocking timeout allowed by the outer host deadline (normally at least 30–60 seconds); completion wakes it early. Release each completed slot and immediately admit the next queued task. Do not renew short waits on unchanged state.
- With a synchronous native batch, submit at most `effectiveMaxConcurrency` tasks together, let the native call return, then
  submit the next bounded batch. Children still execute natively in parallel within each batch; a synchronous return is valid.
- With native asynchronous batch completion, keep that batch's slots occupied until its native completion notification arrives,
  then admit the next bounded batch. Do not require per-child wait-any or change host settings to obtain it.

Do not wrap shell jobs as children or change host settings to emulate another scheduling shape. Child chat is not a task-terminal receipt. Once all dirty tasks have been admitted, launch prepare's exact continuation once and suspend the
Root between native events; the fixed continuation alone verifies task terminal events and delivers. No child/status polling. Root may diagnose reported errors and guide the original owner before terminal; it never reads/writes another worker's workspace or repairs the running continuation. Terminal recovery requires the Skill recovery gate and fresh workers after all previous workers have exited.
