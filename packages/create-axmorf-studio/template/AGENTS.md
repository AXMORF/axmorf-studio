# AXMORF Studio Workspace

This Workspace is the authority for its user-owned Projects, media, production
artifacts, and Deliveries. Before creating, revising, producing, or delivering a
video, read `.agents/skills/axmorf-video/SKILL.md` completely.

Use only the npm scripts declared in this Workspace. Do not import package
internals, mutate `node_modules`, install global tools, or depend on a source
checkout. Treat structured CLI output, task inputs, fixed validators,
ArtifactAttestations, and the verified current Delivery as authority; chat or
self-assessment is not completion evidence.

Before Project work, run `npm run doctor`. If it fails, prepare the declared
Node.js/npm environment and host prerequisites, then rerun the same command.
Environment preparation may use ordinary package-manager or version-manager
operations, but do not modify `node_modules`, package internals, exact dependency
versions, lockfile authority, or validators to force readiness. If the declared
capabilities cannot be satisfied, report the blocker instead of changing the
product.

Run `npm run project:produce:inspect` before any costly preparation. Only
`npm run project:produce:prepare` may call configured providers. An Agent task
may write only its declared `.producer-work` directory, must pass
`project:task:check`, and must terminate through its attempt-bound commit or fail
command. The Root Agent's last production action is the exact continuation
command returned by prepare.

Load `.agents/skills/remotion-best-practices/SKILL.md` before implementing a
Scene. Render-critical motion uses Remotion frame APIs, Scene roots stay
transparent, and the Composition alone owns narration and captions.

Never publish, push, delete a Project, or expose private configuration unless
the user explicitly requests that action. Project deletion must use
`npm run project:delete -- --project <storyId> --confirm-delete`.
