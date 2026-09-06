# AXMORF Studio Workspace

This is a private, user-owned video workspace created by `create-axmorf-studio`. Its Projects, media, private configuration, production
artifacts, renders, revision candidates, and Deliveries stay in this directory and are ignored by Git by default.

## Copy this prompt for your next video

Replace the brief, then give the whole block to any coding agent that can edit files and run npm commands:

The Agent should first read `README.md`, then read `AGENTS.md` and the Workspace-local Skill before acting.

```text
Work inside the current AXMORF Studio Workspace and complete this video request:
<topic, audience, duration, aspect ratio, language, visual style, required content, and references>

Before changing any Project or calling a provider, read the current README.md and AGENTS.md completely. Then read
.agents/skills/axmorf-video/SKILL.md and every reference it directly requires for the current stage. Use these local documents and the
structured CLI output as authority instead of remembered AXMORF commands.

Run npm run doctor, then follow the Workspace-local Skill and exact CLI output end to end. Use existing authorization for provider cost; ask only if cost or external/destructive actions have not been authorized. Do not patch node_modules, package internals, exact dependencies, sandbox, or validators to force
readiness. Only report completion after the fixed workflow verifies exactly video.mp4, cover-4x3.png, cover-3x4.png, and publish.json.

Use a host terminal handle that survives long commands and delivers the fixed terminal output. Do not treat a tool timeout or
background-start acknowledgement as a production result.
```

## Start here

```bash
npm run doctor
npm run dev
```

`npm run dev` starts the loopback-only Web control center and Remotion Studio. The Web interface owns configuration, diagnostics,
production progress, and verified current Delivery views; Remotion Studio owns live Composition preview. Neither is the creative or
completion authority.

`npm run bootstrap` maintains package-owned shared media under `public/assets/axmorf-shared/` and registers it in the Resource
Catalog. New Projects inherit the configured opening/closing templates unless the create input explicitly overrides them; the
template audio actually used is copied into that Project, so an existing Project never depends on a later package update.

Creator installation prepares the pinned browser and runs a real tiny render before claiming readiness. If browser preparation was
explicitly skipped or the browser was removed, run `npm run browser:prepare`, then `npm run doctor`. Preparation has a bounded
timeout and a single download lock; diagnostics never silently download another browser.

## Useful commands

| Goal                                        | Command                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Get a complete new Project input example    | `npm run project:create:context -- --project <story-id>`                                   |
| Query available styles                      | `npm run catalog:query -- --kind style-profile`                                            |
| Prepare the pinned browser                  | `npm run browser:prepare`                                                                  |
| Inspect an interrupted continuation         | `npm run project:attempt:interrupt-inspect -- --project <story-id> --attempt <attempt-id>` |
| Check host readiness                        | `npm run doctor`                                                                           |
| Open Web and preview together               | `npm run dev`                                                                              |
| Open only the Web control center            | `npm run web`                                                                              |
| Open only Remotion Studio                   | `npm run preview`                                                                          |
| Inspect a production without provider calls | `npm run project:produce:inspect -- --project <story-id>`                                  |
| Check a Project                             | `npm run project:check -- --project <story-id> --level final`                              |

For Project creation, revisions, production, recovery, and deletion, use the order in `AGENTS.md` and the Workspace-local
`axmorf-video` Skill. Prefer commands returned by structured CLI output over manually reconstructed internal parameters.

## Completion means four verified files

```text
deliveries/<storyId>/video.mp4
deliveries/<storyId>/cover-4x3.png
deliveries/<storyId>/cover-3x4.png
deliveries/<storyId>/publish.json
```

Only `project-production-complete` or `project-production-current` after mechanical validation means the current Delivery is complete.
A chat response, Agent self-assessment, running process, or unverified file is not completion evidence.

## What to commit

Commit `package.json`, `package-lock.json`, this README, and any instruction customizations you intentionally want to share. Keep
Project source, media, private config, provider credentials, voice profiles, production work, artifacts, attempts, output, Deliveries,
and revision candidates local unless you deliberately establish a different policy.
