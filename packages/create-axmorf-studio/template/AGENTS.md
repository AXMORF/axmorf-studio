# AXMORF Studio Workspace

This Workspace owns the user's films, media and deliveries. To make or change a video, read
`.agents/skills/axmorf-film/SKILL.md` completely and follow it. Each film is an ordinary Remotion source directory under
`src/films/<filmId>/` that the Agent writes directly; the Workspace commands provide narration timing, an original score,
asset admission, review frames, checks and the verified four-file delivery.

Before the first film in this Workspace, run `npm run doctor`. It verifies a real tiny browser render; if the pinned
browser is missing, use `npm run browser:prepare` once and rerun doctor. If it fails, prepare the declared
Node.js/npm environment and host prerequisites, then rerun the same command. Environment preparation may use ordinary
package-manager or version-manager operations, but do not modify `node_modules`, package internals, exact dependency
versions, lockfile authority, or checks to force readiness; report the blocker instead.

Use only the npm scripts declared in this Workspace. Do not import package internals, install global tools, or depend on a
source checkout. A film is complete only when `npm run film:deliver -- --film <filmId>` reports `film-delivered`; chat or
self-assessment is not completion evidence.

Explicit user dimensions, orientation and fps go into that film (`film:new --width/--height/--fps` or its `film.json`);
do not change saved defaults for one film. Provider failures (TTS, image generation) are external: report them and retry
only after the user agrees. Never weaken a check to pass it.

When the user asks to upgrade this Workspace, run `npm run workspace:upgrade -- --dry-run`, report the listed changes and
`localChanges`, then run `npm run workspace:upgrade`. It replaces only product-managed files after backing them up, keeps
films, deliveries and private configuration, and restores everything if install, bootstrap or doctor fails. If it reports
`legacyProjectData`, those directories belong to the Project chain that 0.3.0 removed; tell the user and delete them only
when the user asks. Never upgrade `@axmorf/studio` alone: the Skill and runtime must change together. Do not upgrade
while a film command is running.

Never publish, push, delete a film, or expose private configuration unless the user explicitly requests that action.
Delete films only with `npm run film:delete -- --film <filmId> --confirm-delete`.
