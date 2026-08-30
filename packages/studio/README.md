# @axmorf/studio

`@axmorf/studio` is the runtime package behind AXMORF Studio workspaces. It
provides the `axmorf` CLI, production contracts, fixed production controllers,
Remotion runtime components, package-owned resources, and the local Web control
center.

Most users should create a workspace with the companion initializer instead of
installing this package by hand:

```bash
npm create axmorf-studio@latest my-video
cd my-video
npm run dev
```

## Public surface

- `@axmorf/studio` — runtime metadata and workspace helpers
- `@axmorf/studio/contracts` — stable data contracts
- `@axmorf/studio/remotion` — supported Remotion components and helpers
- `axmorf` — workspace CLI used by generated npm scripts

Package internals are not public API. A generated workspace owns its projects,
media, private configuration, production artifacts, output, and deliveries.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- the exact Remotion and React peer versions declared in `package.json`

The package does not bundle `node_modules` or vendor Remotion. The creator
installs the required third-party packages as ordinary exact npm dependencies in
the generated workspace.

## License

AXMORF Studio source in this package is licensed under Apache-2.0. Third-party
dependencies retain their own licenses; see `THIRD_PARTY_NOTICES.md` and each
installed package's metadata and license files. Remotion is not relicensed by
AXMORF Studio.
