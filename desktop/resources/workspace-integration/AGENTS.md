# AXMORF Studio Workspace

This Workspace is managed by the AXMORF Studio Desktop App Phase A repository adapter.

- Read `.agents/skills/remotion-story-producer-video/SKILL.md` before interacting with the App.
- Use only `./.rsp/bin/rsp doctor` to discover the current local App session.
- Phase A does not expose production or delivery commands. Do not run repository npm scripts as a fallback.
- Do not edit `.rsp/`, this file, the host adapters, or the managed Skill. Their exact bytes are checksum-bound.
- Do not infer success from a running App window or playable preview; rely on the structured doctor response.

`productionAvailable`, `deliveryAvailable`, `distributionReady`, and `runtimePackAvailable` remain `false` in Phase A.
The repository adapter is a build-time checkout prototype, exposes no App-owned TCP listeners, and reports only
the validated Preview Catalog readiness/count through `rsp doctor`.
