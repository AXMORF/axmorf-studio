# Third-party notices

AXMORF Studio source in this package is licensed under Apache-2.0. That license
does not relicense third-party software installed alongside this package.

## Bundled Workspace media

The AXMORF mark bundled under `dist/assets/workspace-seed/` is an
AXMORF-authored work distributed under this package's Apache-2.0 license.

The bundled opening sound is an excerpt of “Movie Trailer Epic Impact” from
Mixkit. The bundled closing music is an excerpt of “Deep Urban” by Eugenio
Mininni from Mixkit. They retain their respective Mixkit Sound Effects Free
License and Mixkit Stock Music Free License; this package's Apache-2.0 license
does not apply to those audio files. Source and license information:

- https://mixkit.co/free-sound-effects/movie/
- https://mixkit.co/free-stock-music/tech-house/
- https://mixkit.co/license/

## Remotion

`remotion` and the `@remotion/*` packages are declared as exact peer
dependencies and are installed as separate npm packages. Their npm metadata for
the versions declared in `package.json` identifies the license as
`SEE LICENSE IN LICENSE.md`. Review the license distributed with each installed
package and the [Remotion website](https://www.remotion.dev/) before use. No
Remotion source code or `node_modules` directory is bundled in this package.

## Other direct dependencies and peers

This package directly declares software from the following npm projects:

- React, React DOM, React Three Fiber, and Three.js
- TypeScript and Zod
- Lottie Web, OGL, and Node Edge TTS
- Speech SDK Core

The exact package names and versions are authoritative in `package.json`.
Transitive dependencies are resolved by the consumer's package manager and keep
their own licenses. Installed package metadata and license files are the
authoritative notices for those dependencies.
