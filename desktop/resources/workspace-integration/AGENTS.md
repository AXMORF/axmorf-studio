# AXMORF Studio Workspace

This Workspace is the only production-data authority for AXMORF Studio Desktop App Phase B.

- Read `.agents/skills/remotion-story-producer-video/SKILL.md` before interacting with the App.
- Use only the Workspace-local `./.rsp/bin/rsp` v2 command surface. It is installed from the verified embedded
  Runtime Pack and never depends on host Node, npm, Git, a source checkout, or `PATH` discovery.
- Begin with `./.rsp/bin/rsp doctor`; discover the structural schema, active `project create-context`, and
  `project validate` result before creating a Project. Create stdin is the same validated raw strict
  `ProjectCreateInput`, never a command/protocol wrapper. For revisions, use `project revise-context`, the raw
  `ProjectRevisionInput`, `project revise-validate`, and the returned same-Project `candidateId`; never clone an MP4,
  Project directory, or existing Scene source. For each dirty task, consume its immutable
  `schema task-worker`; for each dirty task run its exact attempt-bound bind command before any read/write, consume
  `inputs/task-contract.json`, then use exact bound finalize/check/commit commands. Use `delivery build` only
  for a current source when Delivery policy is manual.
- Never run repository npm scripts, Remotion Studio, Settings Web services, or another CLI as a fallback.
- Do not edit `.rsp/`, this file, the host adapters, or the managed Skill. Their exact bytes are checksum-bound.
- A delegate label alone is not proof, but a host-native delegate tool qualifies when it provides bounded child
  execution and a verified shared-workspace or controller-io transport. Transport is declared by that Agent host for
  the current production, never configured in AXMORF Studio. Immutable input/identity failure is a zero-write stop;
  structured validation issues are task repairs, never host failures. An external Agent writes only declared outputs
  through its bound capability. It does not write Project, artifact, attempt, source-current, Delivery, session, token,
  or migration state directly.
- A `scene-owner` must create one meaning-local Renderer from its immutable context. Historical normalized Renderer
  fingerprints and same-Revision exact or normalized narrated Renderer duplicates are fixed-validator failures.
- `continue` is the final production action. After it obtains the one-shot exact-attempt claim, do not poll,
  supervise children, retry, or start another continuation. Its structured terminal is the authority.
- Do not infer completion from a running App, task self-report, prepare receipt, render progress, or visible Player.
  `project-production-source-current` is source-only; only a revalidated `delivery-current` terminal represents the
  exact four-file playable Delivery.
- A failed attempt is immutable. Explicit `attempt recover-inspect` plus `attempt reissue` creates a fresh same-Revision
  attempt without provider calls or current Delivery; never reopen or edit the failed attempt.

The App's only control plane is an authenticated Workspace-local Unix-domain socket. During one DeliveryBuild,
the embedded renderer may own one temporary `127.0.0.1` HTTP listener for the exact build bundle and media; it is
not an Agent, Settings, Studio, credential, or command endpoint and must not be contacted. Credentials, provider
bodies, App-private paths, session tokens, Runtime Pack internals, and historical runs must never enter prompts,
task outputs, logs, artifacts, or Delivery.
