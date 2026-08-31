# create-axmorf-studio

Create a standalone, local-first, agent-ready AXMORF Studio video workspace.

[![npm](https://img.shields.io/npm/v/create-axmorf-studio)](https://www.npmjs.com/package/create-axmorf-studio)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## Give this prompt to your agent

Replace the workspace name and video brief, then paste the whole block into any coding agent that can edit files and run npm:

```text
Use AXMORF Studio to create and deliver this video locally.

Workspace: <new workspace name or absolute path to an existing workspace>
Video brief: <topic, audience, duration, aspect ratio, language, style, required content, and references>

If the target is not already an AXMORF Studio workspace, verify Node.js >= 20.19 and npm >= 10, then run:
npm create axmorf-studio@latest <workspace-name> -- --yes

Once inside the workspace, read the current README.md and AGENTS.md completely. Then read
.agents/skills/axmorf-video/SKILL.md and the references it directly requires for the current stage. Run npm run doctor, then follow
those current local instructions and the structured CLI output end to end instead of relying on remembered or package-internal
commands. Report the exact scope and wait for approval before provider cost or an external/destructive action. Only report completion
after the fixed workflow verifies the exact four-file Delivery.

Do not clone the AXMORF source repository, install @axmorf/studio globally, weaken validators, or expose private configuration.
```

The generated `README.md`, `AGENTS.md`, and `axmorf-video` Skill are versioned with the workspace template, so the agent reads the
instructions that match the installed runtime instead of relying on remembered commands.

## Quick start

```bash
npm create axmorf-studio@latest my-video -- --yes
cd my-video
npm run doctor
npm run dev
```

The initializer writes exact dependencies, installs them, creates a `package-lock.json`, and runs package-provided `bootstrap` and
`doctor` checks before atomically publishing the target directory. The resulting directory is a normal private npm application, not
a clone of the AXMORF monorepo.

The workspace owns its Projects, media, private configuration, production artifacts, render output, revision candidates, and
Deliveries. Its generated npm scripts cover strict Project creation, isolated revisions, read-only production inspection,
attempt-bound Agent tasks, fixed continuation, recovery, and verified four-file Delivery.

## Options

```text
--yes                         accept non-interactive defaults
--no-install                  generate files without installing dependencies
--runtime-package <version-or-path>
                              use an exact @axmorf/studio version or local tarball
```

`--no-install` creates a generated but not ready workspace. Run `npm install`, then `npm run bootstrap` and `npm run doctor` before
using it.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer for the generated workspace
- host capabilities reported by `npm run doctor`

The agent may prepare declared host prerequisites, but it must not patch `node_modules`, package internals, exact dependency versions,
the lockfile authority, Chromium sandbox, or validators to force readiness.

## Documentation

- [Project README](https://github.com/AXMORF/axmorf-studio#readme)
- [Agent compatibility](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/guides/AGENT_COMPATIBILITY.md)
- [Production workflow](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/PRODUCTION_WORKFLOW.md)

The generated workspace-local instructions take precedence for actual production because they match the installed package version.

## License

The initializer and included template files are licensed under [Apache-2.0](LICENSE). A generated workspace is private and
`UNLICENSED` by default, so the creator does not choose a license for the user's videos or Project source. Third-party packages retain
their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
