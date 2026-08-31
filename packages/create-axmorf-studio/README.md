# create-axmorf-studio

Create a standalone, local-first, agent-ready AXMORF Studio video workspace.

[![npm](https://img.shields.io/npm/v/create-axmorf-studio)](https://www.npmjs.com/package/create-axmorf-studio)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## Give this prompt to your agent

Replace the parent directory and workspace name, then paste the block into any coding agent that can edit files and run npm:

```text
Set up and validate a complete local AXMORF Studio workspace.

Project: https://github.com/AXMORF/axmorf-studio
Workspace parent directory: <absolute local path>
Workspace name: <for example, my-video>

Read the latest README and its current linked documentation at the project URL. Follow those official instructions to prepare the
environment, install the workspace, and verify that it runs and is ready for continued use. Stop before video production, do not bypass
project checks, and do not overwrite existing data.

Report the workspace path, installed version, validations actually completed and their results, available local entrypoints, and any
remaining blocker.
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
