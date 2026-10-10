# Third-party notices

AXMORF Studio source in this package is licensed under Apache-2.0. That license
does not relicense third-party software installed alongside this package.

## Bundled Workspace media

The AXMORF mark bundled under `dist/assets/workspace-seed/` is an
AXMORF-authored work distributed under this package's Apache-2.0 license.

The 24 `axmorf-*-v1.wav` motion sound effects are original procedural
syntheses distributed under the same Apache-2.0 license. Their reproducible
source is `scripts/sound-effects/generate.ts` in the source repository. No
third-party recordings or samples are used in these effects.

The bundled opening sound is an excerpt of “Movie Trailer Epic Impact” from
Mixkit. The bundled closing music is an excerpt of “Deep Urban” by Eugenio
Mininni from Mixkit. They retain their respective Mixkit Sound Effects Free
License and Mixkit Stock Music Free License; this package's Apache-2.0 license
does not apply to those audio files. Source and license information:

- https://mixkit.co/free-sound-effects/movie/
- https://mixkit.co/free-stock-music/tech-house/
- https://mixkit.co/license/

## AXMORF Studio bundled music permission

The five original instrumental loop masters below were commissioned by the
user and supplied as procedural syntheses without third-party recordings or
samples. On 2026-10-10, the commissioning user authorized their upload to the
public AXMORF Studio GitHub repository so newly created Workspaces can use them.
The authorized scope covers distribution with AXMORF Studio and background
music use in videos made in its Workspaces. This media permission is separate
from the package's Apache-2.0 source-code license; no standardized open-source
license or other licensing grant is asserted for these recordings.

| Recording     | Original WAV SHA-256                                               |
| ------------- | ------------------------------------------------------------------ |
| Neon Motion   | `45ec445cc27956827a683c78f1ea954215c606db096184740f1d9922fde50e17` |
| Easy Day      | `64d3bfa3598325b8a9a4d9cf035940fc5587d8ce3fbeb8a3cf8a2475e1510c43` |
| Next Question | `21ee2f57f9137db5d2dc7c59ea600dbc4179d6311fd2df4ac8ed36c2463cae28` |
| Sunlit Drive  | `4b8576f2bc78cd028d4b5c4cbbb60a0d0f8c0ad2141ef9c999bf35ebe43bd924` |
| Signal Sprint | `217c3d5d103f0df713aa325a235c3f7088c6083069c1ac07fa32861188be6e0a` |

The original 44.1 kHz stereo 16-bit PCM WAV bytes are distributed unchanged.
Private Library identifiers, import reports and retired preview files are not
part of the distribution. The original synthesis source was not supplied.

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
