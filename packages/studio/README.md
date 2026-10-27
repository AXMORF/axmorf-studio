# @axmorf/studio

The runtime, CLI, contracts, Remotion components, and local Web control center behind AXMORF Studio workspaces.
An agent writes each film directly as Remotion code; this package measures narration timing, synthesizes an original
score with a beat grid, admits licensed media, renders review frames, checks hard rules, and verifies the four-file
delivery.

[![npm](https://img.shields.io/npm/v/%40axmorf%2Fstudio)](https://www.npmjs.com/package/@axmorf/studio)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## Recommended: let your agent create a workspace

Most users should use the companion initializer instead of installing this package directly. Give this sentence to a coding agent:

```text
Follow the latest README at https://github.com/AXMORF/axmorf-studio to set up and validate a working local AXMORF Studio workspace at <absolute local path>; stop before video production.
```

Quick start:

```bash
npm create axmorf-studio@latest my-video -- --yes
cd my-video
npm run doctor
npm run dev
```

## Public surface

- `@axmorf/studio` — runtime metadata and workspace helpers
- `@axmorf/studio/contracts` — versioned data contracts, including `film.json` and `publish.json`
- `@axmorf/studio/remotion` — film hooks and components (`useFilm`, `useFilmTiming`, `FilmCaptions`,
  `FilmSoundtrack`), the system bookends, and optional camera, motion, interface, media and effect components
- `axmorf` — the workspace CLI used by generated npm scripts (`doctor`, `dev`, `film new|voice|music|asset|review|check|deliver|list|delete`)

Package internals are not public API. A generated workspace owns its films, media, private configuration, output and
deliveries. Make videos through its npm scripts and the Workspace-local `axmorf-film` Skill.

VoxCPM supports the configured local or remote HTTP(S) deployment, including a private Tailscale endpoint. Diagnostics
only read `/health` and `/ready`, without generation, warm-up or redirects. High-fidelity clone prompts are normalized
with the Workspace's Remotion FFmpeg to 48 kHz mono 16-bit PCM WAV before upload; private source files stay unchanged.

The package carries a checksum-covered Workspace seed for shared media. `axmorf bootstrap` projects only its manifested
bytes into reserved Workspace paths and refuses conflicting files or symlinks. The seed includes a Mixkit cinematic
opening impact excerpt and an eight-second Mixkit “Deep Urban” closing excerpt used by the default bookends, an AXMORF
mark SVG, 24 original AXMORF motion sound effects, and five original loop masters. See `THIRD_PARTY_NOTICES.md` for
source and license details.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- the exact Remotion and React peer versions declared in `package.json`

This package does not vendor `node_modules` or Remotion. The creator installs the required third-party packages as exact
ordinary npm dependencies and generates a consumer-owned lockfile. The creator and `axmorf doctor` are the capability
gate for the current host: doctor checks a real tiny browser render before reporting a ready Workspace.

## Documentation

- [Project overview and Agent prompt](https://github.com/AXMORF/axmorf-studio#readme)
- [Architecture](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/ARCHITECTURE.md)
- [Agent compatibility](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/guides/AGENT_COMPATIBILITY.md)
- [Current implementation status](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/ITERATION_STATUS.md)

For production, prefer the generated Workspace documents because they match the installed runtime version.

## License

AXMORF Studio source in this package is licensed under [Apache-2.0](LICENSE). Third-party dependencies retain their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and each installed package's metadata. Remotion is not relicensed by AXMORF Studio.
