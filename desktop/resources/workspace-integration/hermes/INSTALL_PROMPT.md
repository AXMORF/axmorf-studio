# Hermes explicit setup prompt

AXMORF Studio does not modify a global Hermes installation. To use Hermes with this Workspace, explicitly start
it in the Workspace root and provide this prompt:

> Read `AGENTS.md` and `.agents/skills/remotion-story-producer-video/SKILL.md` from the current Workspace. Follow
> their Phase B rsp-only workflow. Begin with `./.rsp/bin/rsp doctor`; before creating a Project read the local
> `./.rsp/bin/rsp schema project-create` contract and send its raw input shape without a command/protocol wrapper.
> Before revising an existing Project, read `schema project-revision` plus active `project revise-context`, submit only
> the requested raw patch through `revise-validate/revise`, and produce the returned same-Project candidate; never
> clone an MP4, Project directory, or Scene source.
> Hermes `delegate_task(tasks=[...])` is eligible runtime-native child execution when its children retain terminal/file
> access to this same Workspace and delegation is bounded. Read the actual capacity with
> `hermes config get delegation.max_concurrent_children`, clamp it to the repository ceiling of four, and pass that
> capacity plus `--worker-transport shared-workspace` on the `context` call. AXMORF Studio has no worker-transport switch;
> transport is per-production Hermes runtime evidence, so never ask the user to configure it in the App. If Hermes is
> configured for child worktree isolation or the children cannot enter this Workspace, do not claim shared-workspace.
> Read `schema task-worker`, and run each prepare-returned exact bind command before any task read/write. If binding or
> immutable input validation fails, stop with zero writes and report the structured issue; never guess a path. Repair
> `agent-output` validation issues in declared outputs and never execute host failure for them. A terminal failed
> attempt may only use explicit `attempt recover-inspect` then `attempt reissue`; never reopen it.
> Use only the strict Workspace-local rsp v2 commands it authorizes, and never expose session files, credentials,
> private paths, or provider bodies. Do not
> use repository npm scripts or host tools as a fallback.

Keep the original Hermes output as manual smoke evidence. Agent detection alone is not support evidence. If a
Hermes CLI is unavailable, record that exact capability as pending; do not claim discovery or invocation support.
