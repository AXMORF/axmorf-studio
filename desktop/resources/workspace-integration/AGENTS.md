# AXMORF Studio Workspace

This Workspace is the only production-data authority for AXMORF Studio Desktop App Phase B.

- Read `.agents/skills/remotion-story-producer-video/SKILL.md` before interacting with the App.
- Use only the Workspace-local `./.rsp/bin/rsp` v2 command surface. It is installed from the verified embedded
  Runtime Pack and never depends on host Node, npm, Git, a source checkout, or `PATH` discovery.
- Begin with `./.rsp/bin/rsp doctor`; discover the structural schema, active `project create-context`, and
  `project validate` result before creating a Project. Create stdin is the same validated raw strict
  `ProjectCreateInput`, never a command/protocol wrapper. For each dirty task, consume its immutable
  `inputs/task-contract.json`, then use exact finalize/check/attempt-bound commit commands. Use `delivery build` only
  for a current source when Delivery policy is manual.
- Never run repository npm scripts, Remotion Studio, Settings Web services, or another CLI as a fallback.
- Do not edit `.rsp/`, this file, the host adapters, or the managed Skill. Their exact bytes are checksum-bound.
- An external Agent writes only the exact dirty task workspace returned by `prepare`. It does not write Project,
  artifact, attempt, source-current, Delivery, session, token, or migration state directly.
- `continue` is the final production action. After it obtains the one-shot exact-attempt claim, do not poll,
  supervise children, retry, or start another continuation. Its structured terminal is the authority.
- Do not infer completion from a running App, task self-report, prepare receipt, render progress, or visible Player.
  `project-production-source-current` is source-only; only a revalidated `delivery-current` terminal represents the
  exact four-file playable Delivery.

The App's only control plane is an authenticated Workspace-local Unix-domain socket. During one DeliveryBuild,
the embedded renderer may own one temporary `127.0.0.1` HTTP listener for the exact build bundle and media; it is
not an Agent, Settings, Studio, credential, or command endpoint and must not be contacted. Credentials, provider
bodies, App-private paths, session tokens, Runtime Pack internals, and historical runs must never enter prompts,
task outputs, logs, artifacts, or Delivery.
