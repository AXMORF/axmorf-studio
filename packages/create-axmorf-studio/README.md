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
closing excerpt, a reusable AXMORF mark, 24 original motion effects and five authorized original loop masters.
The default bookend templates copy their used audio into each newly created Project.

Setup reports the `install`, `bootstrap`, `browser`, and `doctor` stages with elapsed seconds on stderr. While a stage is running,
a status line appears every 30 seconds; npm and runtime output remains visible. The creator prints the private temporary directory
containing npm diagnostic logs, which remain available if staging cleanup follows a failure. Progress reports do not imply readiness:
only the final `workspace-ready` result means all setup checks passed.

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

## Upgrade an existing workspace

Run inside the workspace:

```bash
npx create-axmorf-studio@latest upgrade
```

The command updates the product-managed files to this release: the `axmorf-video` and `remotion-best-practices`
Skills, `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`README.md`, runtime facades and configs, the generated npm scripts and
the exact `@axmorf/studio` version. It then runs `npm install`, `bootstrap` and `doctor`. Projects, `public/`,
`deliveries/`, `private/` configuration, your own scripts, dependencies and other skills stay unchanged.

Every replaced or removed managed file is first copied to `.axmorf/backups/<time>/`; if install, bootstrap or doctor fails,
the files are restored. `.axmorf/managed.json` records checksums so later upgrades list files you edited locally in
`localChanges`. Use `--dry-run` to list changes without writing. The upgrade refuses to run while a Project operation
holds `.project-operation.lock`. Workspaces created from 0.1.23 on also have `npm run workspace:upgrade`.

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
Explicit render requests use optional `render.width/height/fps/locale` fields in the create input. Unspecified fields
inherit settings without changing saved defaults; create returns the frozen render values for verification before production.
Use the generated Workspace-local authoring and host-execution references for exact task execution and interruption recovery.

The current source template also guides optional capability selection, full-frame body art with independent text safety,
verified original images/SVG and topic-specific score arrangements. Its dependency table pins Edge TTS SDK 1.2.11 for the
migrated endpoint. These additions require the corresponding unreleased runtime and creator; public 0.1.21 does not include
them. See [current implementation status](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/ITERATION_STATUS.md).

New video Skills default to local code synthesis using the bundled Node/FFmpeg helper, with a frozen original WAV/timeline.
Synthesized music spans the composition, replaces template/Scene scores and preserves independent effects; measured speech
still defines semantic timing. Existing configured library/file defaults remain compatible and play across content only.
Create context exposes both authoring methods; explicit silence disables music. Private user music is not bundled.

The generated template documents narrated and visual content, licensed sound choices, optional shared SVG continuity,
bound Scene previews and narrow boundary/music revisions from 0.1.17. Version 0.1.18 also adds whole-film direction,
continuous multi-Beat Scene ownership, frozen film previews and explicit silent-owner frame timing.
Generated guides must match the installed runtime; updating this repository does not upgrade existing private Workspaces,
rewrite immutable templates or migrate sealed audio. Visual and listening review remain separate from mechanical completion.

The bundled creative playbook covers composition, material, causal motion, music cues and reading holds, with optional
paper-collage and voice-led/music-led examples. Its palettes, layouts and tempo are examples; user render choices and
sealed speech timing stay authoritative. See the generated Skill and
[creative guide](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/guides/VIDEO_CREATIVE_PLAYBOOK.md).
