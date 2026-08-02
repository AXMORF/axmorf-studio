# Narrative Contracts v1

## Persisted source files

- `brief.json` → `VideoBriefSchema`
- `story.json` → `StorySpecSchema`
- `narration.json` → `NarrationSpecSchema`
- `render.json` → `RenderSpecSchema`
- `generated/sealed-narration.generated.json` → `SealedNarrationManifestSchema`
- `generated/semantic-timing.generated.json` → `SemanticTimingSchema`
- `generated/narrative-baseline-evidence.generated.json` →
  `M3NarrativeBaselineEvidenceReceiptSchema`
- `generated/narrative-auto-check.generated.json` → `NarrativeAutoCheckReportSchema`

The first four files are authored source; the four `generated/` files are derived artifacts. All
objects are strict and use `schemaVersion: 1`.

## Identity

`storyId` is the lowercase filesystem slug and becomes `StoryCompositionProps.projectId`.
`meaningId` is unique per StorySpec. `chunkId` is unique across the complete StorySpec.
Array order is semantic order; no independent numeric order field exists.

## Authored narration

`ttsChunks` are authored units and are never split mechanically. An explicit pause is declared by
`{afterChunkId, pauseMs}` in its owning StoryBeat, where `pauseMs` is a non-negative integer. A zero
pause remains an owned zero-length timeline segment; a positive pause must quantize to at least one PCM
sample frame. Pause declarations are excluded from the generation input fingerprint but included in the
sealed narration fingerprint.

## Fingerprints

`sha256-canonical-json-v1` recursively sorts object keys, preserves array order, rejects non-JSON
values, and hashes a domain-separated `{namespace, value, version}` envelope as UTF-8 SHA-256.

M3 adds a generated-entry checksum, ProjectRegistry entry fingerprint and Narrative Baseline
fingerprint. The Baseline identity binds StorySpec, RenderSpec, sealed narration, SemanticTiming,
registry-entry identity and `narrative-core-v2`. The M3 evidence fingerprint then adds exact transparent
PNG and full-render checksums without changing the upstream Baseline identity.

M4 adds `narrative-auto-check-v1`. Its report fingerprint binds the complete strict report body,
including current M1 source/StoryCheck identities, M2 seal/timing identities, M3 registry/Baseline/evidence
identities, fixed evidence checksums and the ordered seven-check result. Unknown fields fail closed.

## Sealed narration

`SealedNarrationManifestSchema` records the selected normalized chunk artifacts, explicit pause
segments, canonical PCM format, complete WAV metadata, checksums, generation input fingerprint, and
sealed narration fingerprint. M1 defines the persisted contract. M2 now normalizes real provider bytes,
measures canonical WAV sample frames, validates selected files and checksums, assembles the complete WAV,
and publishes the immutable content-addressed directory plus active receipt atomically. The read-only
checker validates the persisted contract against the actual files.

## StoryCheck and operational work

`StoryCheckReportSchema` binds the current Story fingerprint, generation input fingerprint, voice
profile selection, ordered required checks, and a `proceed` or `revise` decision. The report is authored
by the Agent before external generation; warnings do not add a user approval gate, while failed checks
must revise and block generation.

Candidate progress and the provider-attempt fingerprint are operational M2 work records under the
ignored `.narration-work/` tree. They identify and verify resumable provider output, but they are neither
M1 persisted Story source nor sealed timing authority. A raw candidate becomes a measured candidate only
after canonical PCM, checksum, authored identity, request fingerprint, and positive sample-frame checks.
Only a complete measured batch can produce the persisted seal.

## Semantic timing

`pcm-cumulative-ceil-v1` builds one cumulative integer sample timeline and applies
`ceilDiv(samples × fps, sampleRate)` at shared boundaries with `BigInt`. CaptionCue is one-to-one with
TTSChunk. Explicit pauses have timing but no CaptionCue. RenderSpec timing fields are `fps`,
`leadInFrames`, and `tailFrames`. M2 uses this unchanged M1 algorithm to generate the real
`gps-relativity` SemanticTiming artifact directly from sealed sample frames.

## Implemented checks

```bash
npm test
npm run narration:check -- --project gps-relativity
npm run registry:check
npm run compositions
npm run baseline:evidence -- --project gps-relativity
npm run project:check -- --project gps-relativity --level narrative
```

The narration checker validates real file bytes, checksums, sample-frame totals, current StoryCheck,
active seal, and byte-equivalent SemanticTiming. M3 now additionally validates a deterministic tracked
registry, lazy Composition metadata, transparent PNG facts, a 1731-frame H.264/AAC render and the
evidence fingerprint.

M4 `project:check` aggregates exactly `source-contracts`, `story-check`, `sealed-narration`,
`semantic-timing`, `project-registry`, `narrative-baseline` and `m3-evidence`, in that order. Default mode
recomputes read-only and rejects a missing, malformed or byte-drifted persisted AutoCheck. The optional
`--write-auto-check` atomically writes only a passing report and skips unchanged bytes so checksum and
mtime remain stable. Failed checks never overwrite the last valid report. M4 does not implement
NarrativeCheck or any subjective Story, narration, caption or pacing review.

Invalidation follows the existing dependency chain: source or StoryCheck identity changes invalidate
their sealed/timing/Baseline descendants; timing RenderSpec changes leave sealed PCM valid but invalidate
SemanticTiming and downstream identities; non-timing registration or Baseline changes leave sealed PCM
and timing valid; media loss/corruption invalidates M3 evidence without rewriting upstream identities.
The checker never repairs any of these artifacts.
