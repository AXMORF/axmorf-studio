# Hermes explicit setup prompt

AXMORF Studio does not modify a global Hermes installation. To use Hermes with this Workspace, explicitly start
it in the Workspace root and provide this prompt:

> Read `AGENTS.md` and `.agents/skills/remotion-story-producer-video/SKILL.md` from the current Workspace. Follow
> their Phase B rsp-only workflow. Begin with `./.rsp/bin/rsp doctor`; before creating a Project read the local
> `./.rsp/bin/rsp schema project-create` contract and send its raw input shape without a command/protocol wrapper.
> Before revising an existing Project, read `schema project-revision` plus active `project revise-context`, submit only
> the requested raw patch through `revise-validate/revise`, and produce the returned same-Project candidate; never
> clone an MP4, Project directory, or Scene source.
> Use only the strict Workspace-local rsp v2 commands it authorizes, and never expose session files, credentials,
> private paths, or provider bodies. Do not
> use repository npm scripts or host tools as a fallback.

Keep the original Hermes output as manual smoke evidence. Agent detection alone is not support evidence. If a
Hermes CLI is unavailable, record that exact capability as pending; do not claim discovery or invocation support.
