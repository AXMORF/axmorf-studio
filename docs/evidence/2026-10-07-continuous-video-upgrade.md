# Continuous video authoring engineering evidence

Date: 2026-10-07. Scope: current source changes on `axmorf/npm-workspace-open-source`, based on `c3431f6`.
Node 22.22.3, npm 10.9.8, exact Remotion 4.0.489. Package versions remain 0.1.16; this is an unpublished engineering upgrade.
No user Project production, provider request, commit, push or package publication. Synthetic fixture attempts and deliveries
are isolated engineering checks and are removed with their fixtures.

## Implemented source

- Optional complete-film intent and strict consecutive visual ownership, complete original Beat inputs and one persistent Renderer.
- Owner-aware packages, Coverage, Registry, revisions/prior source, sound contributions, compilation and checks.
- Explicit authored-frame timing without TTS/PCM/seal/mastering/captions; fixed bookends and the PCM branch remain distinct.
- Deterministic world camera, follow/settle, point morph/gather and fractional semantic retiming utilities.
- Isolated artifact-backed preview before the original continuation, independent receipts and source/media drift rejection.
- Pinned-tool sparse reference rhythm analysis; candidate intervals and estimated durations remain diagnostic only.
- Single-frame overlay, diagnostic completion/baseline authority, silent motion cue and publishing chapter fixes.

## Completed verification

| Check                                                  | Result                                                                                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                        | Exit 0: 1195/1195 tests, zero failed/cancelled/skipped; typecheck, full ESLint, doc/script links, Catalog/Registry/template audio, Web/Remotion build, compositions and source gate all passed. |
| `npm run packages:build`, `npm run packages:typecheck` | Exit 0; runtime JS/types/Web/resources and creator boundaries verified.                                                                                                                         |
| Both package `check:package` commands                  | Exit 0; local package checks only, not publication or native first-use acceptance.                                                                                                              |
| Packed creator installation                            | Install/bootstrap/browser preparation/doctor completed; all six doctor checks passed in a new empty Workspace.                                                                                  |
| Final runtime package update and byte comparison       | Normal npm install of the final tarball, doctor recheck, and exact 284-file content equality with its extracted tarball. Creator has 41 files.                                                  |
| Installed public API and CLI                           | Nine motion functions exported, fractional semantic mapping/event retiming worked; strict filmPlan/visualScenes example and preview/reference scripts/help verified.                            |

The source suite took 198102.815 ms. The repository has zero user Projects, so its final `--all --scope source` gate
returned an empty completed list; it is not substituted for the synthetic delivery checks below. Existing Vite chunk-size
advisories remain; no dependency, validator, context budget or Chromium sandbox was weakened.

Local logs are `/tmp/axmorf-upgrade-full-check.log`, `/tmp/axmorf-upgrade-package-build-final.log`,
`/tmp/axmorf-upgrade-package-types-final.log` and `/tmp/axmorf-upgrade-{runtime,creator}-package-final.log`.
The new Workspace is `/tmp/axmorf-upgrade-consumer-verified-YqAo81pf/fresh-workspace`; final runtime tarball and
byte/API/doctor receipts are in `/tmp/axmorf-upgrade-final-content-h9xFMjaJ/`.

Final runtime tarball SHA-1 is `0ee1cbc3962af474ada5b045ccc9740090d032bc`; creator tarball SHA-1 is
`64107ff774d9c962ff99fea17def4d915e745037`. These identify local candidates, not public registry artifacts.
The fresh initial installation preceded a two-line lint cleanup; the same empty Workspace then installed the final runtime
through npm and was revalidated against all final tarball bytes. No installed package was edited manually.

Earlier checks exposed stale Workspace/creator facades, misplaced create-context fields, missing bound command arguments,
archive lifecycle metadata and two unused variables. Those implementation/documentation omissions were corrected and the
complete check rerun. Neither tests nor gates were skipped or relaxed.

## Runtime proofs

`npm run proof:continuous-world:render` generates the strict grouped fixture, compiles current source and renders 150
frames at 1920×1080/30fps; `inspectProjectVideo` confirms H.264/AAC stereo and EOF. Checkpoints are 0/79/80/81/149.
It uses original vector geometry and a shared world camera; the internal Beat boundary is frame80. Media and evidence
live in ignored `out/continuous-world-proof/`, independently of Projects/artifacts/attempts/delivery.

`npm run proof:authored-frames:render` uses a separate strict grouped runtime fixture: two 60-frame silent Beats,
one Scene and one sound contribution across frames54–66. Media, PCM mix, checkpoint stills and evidence live in
ignored `out/authored-frames-proof/`. The PCM event is checked separately from AAC encoding priming.

Its 640×360/30fps/120-frame H.264/AAC stereo file decoded to EOF. The subject's raster centers at frames0/59/60/119
are 55.5/317.5/321.5/583.5 px, without a Beat-boundary reset. PCM activity is 1.801479–2.198521 seconds within the
authored 1.8–2.2 second window. This pinned render path's decoded AAC activity is 1.844146–2.241188 seconds:
2048 samples at 48 kHz, approximately 42.67 ms later. The measured delay is retained as a limitation, not called zero-offset
synchronization or generalized to every codec. Supplemental raster/audio measurement uses host FFmpeg 8.1.2;
delivery probe/decode checks use the pinned Remotion tools.

## Preview and formal delivery host checks

[`tests/project-preview/verify-host.ts`](../../tests/project-preview/verify-host.ts), run with
`node --import tsx tests/project-preview/verify-host.ts`, passed the real default artifact projection, private materialization,
Composition compile, H.264/AAC mono 320×180/30fps/12-frame render, EOF and cache revalidation. It used explicit current
source aliases, made zero provider requests, and left the original Scene/Composition, attempt and formal delivery absent.
The preview regression suite passed 24/24. Motion/continuity/listening remain `not-assessed`.

[`tests/project-production/verify-authored-host.ts`](../../tests/project-production/verify-authored-host.ts), run with
`node --import tsx tests/project-production/verify-authored-host.ts`, passed actual inspect/prepare, one claimed continuation,
convergence, materialization, fixed artifact commits and synchronous exact-four delivery. The disposable fixture has
two authored-frame Beats in one Scene, prevalidated owner artifacts and no dirty Agent tasks or provider calls. Media
and diagnostic ports use the real repository's installed tools with explicit current source aliases, not a fake decoder.

The result was `project-production-complete`; the attempt became succeeded/verified and the completed DAG was all reuse.
The video is H.264/AAC mono, 640×360/30fps/12 frames, decoded to EOF. Covers are PNG 1600×1200 and 1200×1600.
Independent delivery revalidation returned `project-production-current`, preserved publish bytes, and did not render again
(one video render, two cover renders total). Logs are `/tmp/axmorf-upgrade-formal-host.log`.
An earlier synthetic run used an artificial two-minute harness deadline and timed out while other checks ran; the final
isolated run uses the existing production deadline. No production timeout policy or failed attempt was modified.

Reference diagnostics passed 18 focused tests, including actual pinned-tool extraction of ten 64×36 grayscale samples
from a local 4.666667-second fixture. `sampled-frame-difference-v1` remains capped at 120 samples/2fps and reports intervals
and estimated durations; it cannot certify exact cuts, semantic/camera interpretation or audiovisual quality.

## Remaining acceptance scope

These checks do not certify a native production executor's first use, real user creative output, continuous subjective viewing
or listening. Existing npm 0.1.16 release/native receipts are not reused to certify the new source. The legacy PCM-specific
narrative profile remains specific to sealed narration; authored-frame source and delivery use their own current checks.
Mechanical source/motion/media checks do not certify aesthetic quality. Reference analysis does not infer camera/semantic meaning
or grant source/media reuse rights.
