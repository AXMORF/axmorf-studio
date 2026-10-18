# GPS Relativity M7 Scene Production Evidence

## Scope

- Branch: `codex/foundation`.
- Protected base HEAD: `31c55407be78ced268eb8051e997a9a1b1d0d874`.
- M7 plan/docs commit: `70036281348da229f39ed29c22cf9fbe5240ae4b`.
- Task 1–4 implementation range: `e042b2f9f2b01924e41e923db139e23bf1d8b62c` through
  `53ae0461556ee465e07d6edfd59b62e343a0baf6`.
- This evidence records M7 Scene production and mechanical review only. It is not
  `FinalPreviewApproval`, M8 global sound/visual work, release, or publishing evidence.

## Frozen authorities

- Visual style: `editorial-tech`, fingerprint
  `sha256:fcef69cf598adbd995f381fb4f185c937b503f86b2af02766baa33c381a2a0b8`.
- ResourceCatalog: 22 current entries, fingerprint
  `sha256:83872a754e05df18d0ec008ecd4f9cb637c0c159481dc59b0368898125188689`.
- Narrative report remained current at
  `sha256:dd1dc79547123cc2a3c69a3f95ce81cdf951f3e569afbbdb94b51345bc52424c`.
- Story, authored `ttsChunks`, sealed narration, CaptionCue and SemanticTiming were not changed.
- Each Scene used one project-authored, verified 48 kHz mono PCM `s16le` cue. The five asset
  checksums are bound by the Catalog and ScenePackage selected-resource receipts.

## Formal ScenePackages

| meaningId                  | absolute Beat range | package fingerprint                                                       | recipe mode |
| -------------------------- | ------------------- | ------------------------------------------------------------------------- | ----------- |
| `position-is-time`         | `[15, 361)`         | `sha256:3c7734121f936d4c66dff73b0ca635b5f1f00615e844a993aada4b71133dc71c` | `empty`     |
| `two-relativistic-effects` | `[361, 696)`        | `sha256:5d8e9d61759935c244fed76fc045903fe3e7839ebd2193fe67f9dbc080798d1e` | `empty`     |
| `net-drift`                | `[696, 1018)`       | `sha256:482fcb399c30c5e544c5e51a0286495f9130ccdf068beab64b6d3ff2e333fe8c` | `empty`     |
| `error-accumulation`       | `[1018, 1433)`      | `sha256:acda62bf7f1368097c5e982898b9534c874748d2f16dcfb2d985458af6d633d2` | `empty`     |
| `practical-conclusion`     | `[1433, 1716)`      | `sha256:51e6ecdd4887e7047dc8cec1415b6293824b1883a67ef718210c4f25a10caddb` | `empty`     |

All five coverage entries are `ready`; there is no synthetic package, fallback, missing or stale
entry. No Scene selected an external snapshot or Shotcraft recipe, so exact fidelity evidence is
correctly not applicable rather than represented by a fake pass.

## Runtime and review identities

- SceneCoverageMap:
  `sha256:7d3c9bce02769cba5906ef4c09d75b8c66d0b0208d88d144e2c85dde3b64b3ad`.
- RendererRegistry:
  `sha256:93b7059c9e3de9421e0dbe2a9dfe84b9bd6cdbc465cb6175bdc20f893ea336af`.
- StoryVisualProjection:
  `sha256:191a8b293e812d366a3005a155c80413978f4fd65352c2951dcf8b7a5be4994e`.
- SoundDesignProjection:
  `sha256:c62c2ad62cbc75851d8f015bc70e8b5c65a75ccd4c41fcae2696ac217734f7ca`.
- Agent-authored batch review:
  `sha256:74b6f6870649c0a8745f18fac27053ffaaef980fb89fbfd1711fd22900344987`.
- M7 production evidence:
  `sha256:9690369ab4f3c08872e1e1ecd565fc4bba6aa37cd31b9a202b88d9045df19012`.
- FinalMechanicalCheck:
  `sha256:7bd7b501e559fe79a2f4c96fa7dfbda88bae86ccd202b27326d7a655d99beced`.

The batch review contains one SceneVisualCheck and SceneSoundCheck conclusion per Scene and four
ordered adjacent-continuity conclusions. Mechanical code verifies that these authored conclusions
still match the current package, coverage, registry, projection and media identities; it does not
perform automatic aesthetic scoring.

## Real media

- Fifteen 1920×1080 Story Composition stills: early/mid/late for each Beat at frames
  `101/188/274`, `444/528/612`, `776/857/937`, `1121/1225/1329`, and `1503/1574/1645`.
- Contact sheet:
  `out/gps-relativity/m7-review/gps-relativity-m7-contact-sheet.png`, 1920×1800, five Scene rows by
  three phase columns, checksum
  `sha256:c267bd6a4f00884eac6c3d82c860316312f0ed39d411ccdcf87498271007832f`.
- Representative integration still:
  `out/gps-relativity/m7-integration/frame-857.png`, inside `net-drift`, showing current Scene pixels
  beneath the top-level CaptionLayer.
- Normal-speed review:
  `out/gps-relativity/m7-review/gps-relativity-m7-review.mp4`, 1920×1080, 30 fps, 1731 decoded
  H.264 frames, one AAC stereo output stream, 57.749333 seconds, checksum
  `sha256:ab2d0ac32d1b2e6a98bfa28ae00825b585180a56ed6cf35d1b296b84106ad4ae`.
- The review mix decoded without error. `volumedetect` reported mean `-21.6 dB` and peak `-2.9 dB`.
  It contains protected narration plus the five Scene-local contributions, with no M8 BGM,
  cross-Scene ambience, ducking or mastering claim.

## Mechanical result and boundary

- Normal composition listing remains exactly `CapabilityGallery` and `GpsRelativity`; authoring and M6
  synthetic entries stay isolated.
- `project:check --level narrative` passes independently with the unchanged narrative fingerprint.
- `project:check --level final` passes all ten fixed checks. External reference and exact fidelity checks
  are `not-applicable` because all five recipe selections are `empty`.
- Repeated final report writes preserved checksum and mtime; default final checks are read-only.
- M8 was not started. No GlobalSoundPlan, global BGM, cross-Scene ambience, ducking, mastering,
  GlobalVisualLayers, user approval, release or publish action is included.
