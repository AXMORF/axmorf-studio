# @axmorf/studio

The runtime, CLI, contracts, Remotion components, and local Web control center behind AXMORF Studio workspaces.

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
- `@axmorf/studio/contracts` — supported versioned data contracts
- `@axmorf/studio/remotion` — supported Remotion components and helpers
- `axmorf` — the workspace CLI used by generated npm scripts

Package internals are not public API. A generated workspace owns its Projects, media, private configuration, artifacts, output, and
Deliveries. Create, revise, recover, and produce through its npm scripts and Workspace-local Skill; do not reconstruct internal CLI
commands.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- the exact Remotion and React peer versions declared in `package.json`

This package does not vendor `node_modules` or Remotion. The creator installs the required third-party packages as exact ordinary npm
dependencies and generates a consumer-owned lockfile. The creator and `axmorf doctor` are the capability gate for the current host.

## Documentation

- [Project overview and Agent prompt](https://github.com/AXMORF/axmorf-studio#readme)
- [Agent compatibility](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/guides/AGENT_COMPATIBILITY.md)
- [Production workflow](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/PRODUCTION_WORKFLOW.md)
- [Local Delivery](https://github.com/AXMORF/axmorf-studio/blob/HEAD/docs/guides/LOCAL_DELIVERY.md)

For production, prefer the current generated Workspace documents because they match the installed runtime version.

## License

AXMORF Studio source in this package is licensed under [Apache-2.0](LICENSE). Third-party dependencies retain their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and each installed package's metadata. Remotion is not relicensed by AXMORF Studio.
