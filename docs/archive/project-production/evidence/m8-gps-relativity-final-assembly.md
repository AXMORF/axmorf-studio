# GPS Relativity M8 Final Assembly Evidence

Date: 2026-08-03

## Scope and current state

- Story: `gps-relativity`; Composition: `GpsRelativity`.
- M8 plan commit: `eb1ee2d`; contracts commit: `abe18b8`; GPS final assembly
  commit: `3ee4262`; preview evidence commit: `102e50c`.
- This record covers the approval-bound final preview, technical measurements and
  batched Agent review. Current state is **user-approved and final v2 pass**.
- The M7 v1 schema/parser remains supported; the GPS persisted report has been
  atomically migrated to `final-mechanical-check-v2` after the exact user approval.

## Bound identities

- FinalAssembly fingerprint:
  `sha256:917f1601b9403316f42f58f95a3033720162883d5e77e542390ca8803388655b`.
- project-local 24-entry ResourceCatalog fingerprint:
  `sha256:d6a5ca5456c24cf8691c4a6879b0b3d2690e6aaccd53932003f69bfe50cd0c88`.
- M7 evidence fingerprint:
  `sha256:9690369ab4f3c08872e1e1ecd565fc4bba6aa37cd31b9a202b88d9045df19012`.
- review fingerprint:
  `sha256:605da854a18d999a9cbbf2b54399606d3cd961746386aa98a60a35d529499027`.
- approval-bound evidence fingerprint:
  `sha256:2141ce8b0f15622437d27c2921cde8d32236e5bf17de5da2e815a8344ded8667`.
- ducking/mix evidence fingerprint:
  `sha256:0a5c3fcc458275adbaadcac792fd9010ee42acee99ed47150e6ea15f7ed0af99`.
- FinalPreviewApproval fingerprint:
  `sha256:7e9022ddc9634f0d36237be54443c45cdf46b4112b59a108a061173bc65cde22`.
- final-mechanical-check-v2 report fingerprint:
  `sha256:d944a88c2a4038447ba0d28b68d93c822d6ededf84e106427786b64525e42533`.

## Review media

- Full normal-speed preview:
  `out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4`.
  Checksum:
  `sha256:d0473bc9ff74b46898c5988b99ff4690b5412a4dbd1508508d3c4a73c63d7036`.
- Contact sheet:
  `out/m8-gps-final-assembly/gps-relativity-m8-contact-sheet.png`.
  Checksum:
  `sha256:4564142af91f38d7f52147fea20f9d22f2e788c335f1cc1c25c52e6b584798a1`.
- The fixed representative set contains 26 stills:
  `0, 188, 349, 360, 361, 373, 530, 684, 695, 696, 708, 855, 1006,
  1017, 1018, 1030, 1280, 1409, 1420, 1421, 1432, 1433, 1445, 1580,
  1715, 1730`.
- Media under `out/` is reproducible review output and remains ignored by Git.

## Technical inspection

| Fact | Measured result |
| --- | --- |
| Video | H.264, 1920×1080, 30/1 fps |
| Frame count | 1731 |
| Container duration | 57.749333 seconds |
| Audio | AAC, 48 kHz, stereo |
| Full decode | Completed to EOF with 1731 decoded video frames |
| Integrated loudness | -17.7 LUFS |
| True peak | -2.9 dBTP |
| Sample peak | -2.9 dBFS |
| Planned thresholds | -24 to -16 LUFS; true peak at or below -1 dBTP |

The deterministic mix proof recomputes the duck envelope at the opening, spoken
start/end, adjacent chunks, the short Scene-boundary pause, the next spoken start
and the final frame. Global BGM and cross-Scene ambience are the only two global
buses. M7 Scene-local SFX remains in the unchanged SoundDesignProjection and is
not copied into or ducked by GlobalSoundPlan.

## Batched Agent review

- GlobalSoundReview: pass. Narration remains the semantic foreground; the fixed
  9-frame attack, 15-frame release and 0.32 spoken gain are continuous; the
  full-length ambience has no boundary break; M7 Scene SFX ownership remains
  unchanged; waveform and full decode show no click, pop or hard truncation.
- GlobalVisualReview: pass. The frame treatment stays stable, the four motif
  windows carry GPS/time-path meaning, Scene graphics remain primary, and all
  dense-caption probes keep CaptionLayer unobstructed.
- FinalContinuityReview: pass. The five Scene sequence, four boundaries, global
  motif, ambience and local SFX align without changing spoken frames or creating
  A/V drift.
- NormalSpeedReview: pass. The exact checksum-bound preview completed a start-to-end
  1× real-time run, accompanied by inspection of the complete contact sheet,
  boundary stills, waveform and spectrum.

These are Agent review results, not user approval.

## User FinalPreviewApproval

The user watched the exact full normal-speed preview identified above and explicitly
approved the current final video on 2026-08-03. The minimal authoring record and
generated approval bind only the fixed `approved` decision, preview checksum,
FinalPreviewEvidence fingerprint and FinalAssembly fingerprint. They contain no
conversation transcript, private data or absolute path. Agent review, evidence and
checker output cannot create or substitute this decision.

## Mechanical results

- `m8:gps:evidence:write` produced a canonical
  `ready-for-user-approval` artifact.
- Two consecutive `m8:gps:evidence` read-only checks returned the same evidence
  fingerprint and preserved bytes/mtime.
- The complete invalidation matrix rejects Story/narrative/timing drift; M7 package,
  coverage, registry and projection drift; global PCM/Catalog/license drift;
  duck/gain/mastering or GlobalVisual/source/z-order drift; Composition/Remotion
  identity drift; media byte drift, truncation, wrong frame count, missing/wrong
  audio streams and threshold failures; incomplete/stale review; evidence/approval
  identity drift; empty, malformed, old-media or Agent-authored approval; and
  single-byte persisted v2 report drift. Failed writers preserve the last passing
  bytes and read-only checkers never repair artifacts.
- Two consecutive `m8:gps:approval` checks returned approval fingerprint
  `sha256:7e9022ddc9634f0d36237be54443c45cdf46b4112b59a108a061173bc65cde22`.
- `project:check --level final --write-final-check` wrote the passing 15-check v2
  report through the existing pass-only atomic writer; the subsequent read-only
  final check returned the same report fingerprint. The two legacy external-reference
  checks are correctly `not-applicable` for GPS's empty recipe selections; all other
  checks pass and none fail.
