# create-axmorf-studio

Create a standalone, local-first, agent-ready AXMORF Studio video workspace.

[![npm](https://img.shields.io/npm/v/create-axmorf-studio)](https://www.npmjs.com/package/create-axmorf-studio)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## Give this prompt to your agent

Replace the local target path, then paste this sentence into any coding agent that can edit files and run npm:

```text
Follow the latest README at https://github.com/AXMORF/axmorf-studio to set up and validate a working local AXMORF Studio workspace at <absolute local path>; stop before video production.
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
a clone of the AXMORF monorepo. Bootstrap also projects manifest- and checksum-verified shared media from the runtime package into the
workspace Catalog. The initial set contains a Mixkit “Movie Trailer Epic Impact” opening excerpt, an eight-second Mixkit “Deep Urban”
closing excerpt, and a reusable AXMORF mark; the default bookend templates copy their used audio into each newly created Project.

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

`--no-install` creates a generated but not ready workspace. Run `npm install`, then `npm run bootstrap`, `npm run browser:prepare`, and `npm run doctor` before
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

## Authoring and host readiness

The creator prepares the pinned browser and checks a real tiny PNG render before reporting a ready Workspace. Browser
preparation is serialized and bounded; doctor never silently downloads Chrome. New authoring begins with
`npm run project:create:context -- --project <storyId>`, which returns a complete example and current public choices.
Use the generated Workspace-local authoring and host-execution references for exact task execution and interruption recovery.
