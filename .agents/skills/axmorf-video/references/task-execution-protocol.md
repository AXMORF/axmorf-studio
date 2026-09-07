# Portable task execution protocol

An exact attempt-bound bind assigns one task worker. Read AGENTS.md, then run that bind before task input access; do not
restart the Root production workflow. The Root owns global doctor/preflight, browser preparation, Project create/revise,
execution resolve, inspect/prepare, providers and continuation. Workers do not run those operations, even on environment errors.
Use only the granted task capability and declared outputs. Host/fixed errors go to the Root with their structured evidence;
no automatic retry or recovery. The TaskExecutionContract and validators retain authority.
In subagents mode, each different TaskRevision needs a fresh native child/session; do not accept another task through follow-up
or resume. The original executor may correct its own same-task output before terminal; a finished task cannot reopen.

`inputs/task-contract.json` is the immutable, attempt-neutral `TaskExecutionContract` for one dirty Agent task. It
describes purpose, workflow, constraints, component signatures, and exact outputs plus their Agent/fixed ownership;
it does not embed host transport, binding, failure state, or CLI command templates. Read it with `task.json` and
`inputs/context.json`. A new contract version changes Agent TaskRevisions and invalidates their artifacts once; it
does not change ProductionRevision or replace the verified current delivery.

A delegate label, thread, chat, or background process is not a runtime-native child. Subagents require bounded child
execution and one verified transport for this production:

- `shared-workspace`: after binding, the executor may directly read immutable inputs and write only declared outputs
  under the returned workspace path.
- `controller-io`: the executor has no filesystem capability and uses only the exact bound `file-read`/`file-write`
  commands. Read permits immutable inputs and existing declared outputs; write permits declared outputs only and
  accepts strict base64 JSON on stdin.

Transport is ephemeral host evidence, not a setting or production identity. Missing transport blocks subagent mode
before prepare. Inline needs no child transport; Root still binds each dirty task through `shared-workspace`.

Run prepare's exact attempt-bound bind command before any task read or write. Bind validates the binding ID,
TaskRevision, active attempt, immutable input checksums, and TaskExecutionContract without writing task files. Only
`task-worker-bound` grants a capability. Never guess a workspace or reconstruct commands.

After binding:

1. Use the returned transport to read all three immutable inputs.
2. Write only outputs whose contract ownership permits Agent or Agent-draft content.
3. Run the exact bound `describe`, `finalize`, and `check` commands. Finalize performs fixed derived projection and
   then the same task-kind validation; repair only `agent-output` issues and repeat.
4. Commit through the exact bound command. Use `taskFailureCommand` only for unrecoverable authored output.

Describe/finalize/check/commit/task failure require a full valid binding. `spawnFailureCommand` is Root-only for a
real child spawn, mount, controller-IO, sandbox, permission, or host-runtime failure; `fixedFailureCommand` is only
for immutable input/controller faults. Their authority is intentionally narrower: they may record terminal failure
when full task capability could not be established, but cannot read or write task content. Never classify a
structured `agent-output` issue as host/fixed failure.

A terminal failed attempt is immutable. On a new explicit recovery action, the Root runs
`project:attempt:recover-inspect`, report its read-only zero-provider result, then run `project:attempt:reissue`.
Reissue revalidates the same current Revision, requires no current delivery, preserves valid drafts, reuses valid
artifacts, and creates a fresh attempt/binding. It refuses active, stale, or fixed-flow recovery and is not an
automatic retry.
