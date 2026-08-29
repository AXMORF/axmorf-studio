# Portable task worker protocol

A delegate label, thread, chat, or background process alone is not proof of a runtime-native child. A host-native
delegate tool qualifies when it provides bounded child execution and one declared transport:

- `shared-workspace`: the child can enter the exact bound workspace path returned by `task bind`.
- `controller-io`: the child reads and writes declared task files through the returned `task file-read/file-write`
  commands and needs no filesystem mount.

Pass that transport to execution resolution. The transport is runtime capability evidence, not an App setting or
Project preference. Never ask the user to configure it in AXMORF Studio. An unverified transport blocks subagent
production before prepare; inline remains the host-neutral default.

For every dirty task, use its prepare-returned `bindingId` and exact bind command before any task read or write. A
successful bind returns `task-worker-bound`, Task/attempt identity, the executable workspace capability, immutable
inputs, declared outputs, and all subsequent bound commands. Never guess or reconstruct a path.

Binding is a hard zero-write gate. If bind, `task.json`, `inputs/context.json`, `inputs/task-contract.json`, identity,
checksum, mount, or controller-IO access fails, stop with zero task writes and return the structured issue to Root.
The controller classifies immutable authority faults as `fixed-controller`; a genuine missing worker transport,
mount, sandbox, permission, or host runtime is `worker-host`.

After binding:

1. Read both immutable inputs through the bound transport.
2. Write only `declaredOutputs` in that binding.
3. Run exact bound finalize/check commands.
4. Treat every structured check/finalize issue with owner `agent-output` as repairable: edit only declared outputs and
   repeat. Never run a host-failure command for fixed validation issues.
5. Commit with the exact bound command. Use `taskFailureCommand` only for an unrecoverable authored-output failure.
   `spawnFailureCommand` is Root-only and only for a real child spawn/transport failure. `fixedFailureCommand` records
   an immutable/controller fault without misclassifying it as host failure.

If an attempt is already terminal failed, never reopen or mutate it. On a new explicit recovery action, run
`project:attempt:recover-inspect`, then `project:attempt:reissue`. Reissue requires the same current Revision, no active
attempt, and current fixed dependencies; it makes zero provider requests, needs no current Delivery, preserves valid
workspace drafts, creates a fresh attempt/binding, and reuses valid artifacts. Revision candidates still require an
existing current Delivery and are not this recovery mechanism.
