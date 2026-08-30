---
name: axmorf-video
description: Create, produce, validate, and deliver a video in this Workspace.
---

# AXMORF Studio Video

Read [the production workflow](references/production-workflow.md) before acting.
Use the Workspace's npm scripts and their structured output. Do not use package
internals or assume a particular Agent host or global installation.

For a new video, build a strict Project create input from the user brief and run
`npm run project:create`. This command creates authoring source only; it must not
call a provider or start production.

Before cost, run read-only `npm run project:produce:inspect` and report source
readiness, estimate, artifact reuse, and invalidation. Only then run
`npm run project:produce:prepare`, which may call configured providers and
returns content-addressed dirty tasks plus exact terminal commands.

Execute only dirty Agent tasks. Each executor reads its immutable task inputs,
writes only its declared `.producer-work` directory, runs
`npm run project:task:check`, then uses the exact attempt-bound commit or fail
command. ArtifactAttestation and terminal events are authority.

The Root Agent's final production action is the exact continuation command from
prepare. Do not poll, retry, edit another task, manually converge, or fabricate
completion. Only a terminal result that verifies the exact four-file current
Delivery proves completion.

Before writing Scene code, read the repository-local
`.agents/skills/remotion-best-practices/SKILL.md` and only the references routed
for that Scene.
