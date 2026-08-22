# Hermes explicit setup prompt

AXMORF Studio does not modify a global Hermes installation. To use Hermes with this Workspace, explicitly start
it in the Workspace root and provide this prompt:

> Read `AGENTS.md` and `.agents/skills/remotion-story-producer-video/SKILL.md` from the current Workspace. Follow
> their Phase A boundary, then run `./.rsp/bin/rsp doctor` and report the structured result without exposing any
> session files or credentials.

Keep the original Hermes output as manual smoke evidence. Agent detection alone is not support evidence.
