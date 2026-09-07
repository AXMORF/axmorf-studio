# Verify native child execution

Read before resolving `subagents` execution. The default is `subagents` with `maxConcurrency: 4`; explicit user fields override
`private/execution-preferences.json`, then built-in defaults. A maximum is a ceiling, not a request for exactly four workers.
Explicit `inline` remains supported and needs no child probe.

## Verify this host before inspect

1. Inspect the current callable native child tools and their documented limits: child creation, completion (wait-any, synchronous batch return, or native asynchronous batch notification), and slot release. Use discoverable host tool search when available. A CLI on PATH, an installed plugin, a new chat, or a shell subprocess
   is not a native child executor. Determine available child capacity, excluding the Root and occupied slots; never copy the saved
   maximum into runtime capacity. If capacity is unknown, omit its flag; with verified transport the resolver conservatively uses one. An exact request
   that cannot be met still blocks.
2. For a shared filesystem host, create one unique temporary directory within this Workspace using `mktemp -d .axmorf-worker-probe.XXXXXX`. Write random challenge bytes to `challenge.txt` and leave `response.txt` absent.
   Start one bounded native child with only this task: read that exact challenge path and write its bytes unchanged to that exact
   response path; access no other files and return. Do not include the challenge bytes in the child prompt. This probe precedes
   production, uses no Project/task/artifact path, and calls no media provider.
3. Wait for the native child to finish. The Root reads both files and compares their bytes. Only a successful native child plus
   matching bytes proves `shared-workspace`. Release its host slot and remove only the two probe files and the unique empty probe
   directory. The Root must not write the response or replace a failing native probe with a shell job.
4. Pass verified host facts to the resolver, inheriting the requested mode/maximum rather than overriding them:

```bash
npm run project:execution:resolve -- --runtime-max-concurrency <verified-available-child-capacity> --worker-transport shared-workspace
```

Use only the flags for facts actually verified. These flags describe current host evidence, not user preferences. Never persist transport, probe paths, or child IDs in production
inputs. If no child API or verified transport exists, report the actual blocker before prepare; never automatically select inline.
For a host without shared files, `controller-io` is valid only after its native child channel demonstrates a strict read/write
round trip through the Root's controller. During production it must exclusively use the exact bound file-read/file-write capability.
Do not label a shared-filesystem probe as `controller-io`, or select it merely to bypass a failed probe.

## Give each worker a complete assignment

A child may receive only its own goal/context. Do not rely on inherited conversation, working directory, or a parent's successful
doctor message. Supply the Workspace root, task kind, exact bind command from prepare, and these public instruction paths in each
native child assignment. Preserve every returned identity and candidate flag; do not reconstruct them. A compact handoff is:

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

- With wait-any, release each completed child slot and immediately admit the next queued task.
- With a synchronous native batch, submit at most `effectiveMaxConcurrency` tasks together, let the native call return, then
  submit the next bounded batch. Children still execute natively in parallel within each batch; a synchronous return is valid.
- With native asynchronous batch completion, keep that batch's slots occupied until its native completion notification arrives,
  then admit the next bounded batch. Do not require per-child wait-any or change host settings to obtain it.

Do not wrap shell jobs as children or change host settings to emulate another scheduling shape. Child chat is not a task-terminal receipt. Once all dirty tasks have been admitted, launch prepare's exact continuation once and suspend the
Root; the fixed continuation alone verifies task terminal events and delivers. No polling or Root repairs after that handoff.
