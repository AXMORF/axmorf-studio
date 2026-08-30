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
- `@axmorf/studio/contracts` — stable data contracts, including strict Project
  revision/authoring validation, Scene originality, GlobalVisual layer policy,
  TaskExecutionContract, and attempt-bound TaskWorkerBinding families
- `@axmorf/studio/remotion` — supported Remotion components and helpers
- `axmorf` — workspace CLI used by generated npm scripts

Package internals are not public API. A generated workspace owns its projects,
media, private configuration, production artifacts, output, and deliveries.
Create, revise, recover, and produce through its generated npm scripts and
Workspace-local Skill; do not reconstruct package-internal commands.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- the exact Remotion and React peer versions declared in `package.json`

The package does not bundle `node_modules` or vendor Remotion. The creator
installs the required third-party packages as ordinary exact npm dependencies in
the generated workspace.

The creator and `axmorf doctor` form the runtime capability gate. Agents may
prepare the declared host environment, but unsupported host conditions must
remain explicit failures; modifying package internals, exact dependencies, or
validators is not environment adaptation. Native evidence for a reference
environment does not restrict installation on other operating systems.

## License

AXMORF Studio source in this package is licensed under Apache-2.0. Third-party
dependencies retain their own licenses; see `THIRD_PARTY_NOTICES.md` and each
installed package's metadata and license files. Remotion is not relicensed by
AXMORF Studio.
