# Narrative Contracts

> 文档类型：合同参考。可执行 schema 与 fingerprint 逻辑以 `src/contracts/` 为准。
>
> 最后复核：2026-08-15

## Persisted source files

- `brief.json` → `VideoBriefSchema`
- `story.json` → `StorySpecSchema`
- `narration.json` → `NarrationSpecSchema`
- `render.json` → `RenderSpecSchema`
- `reviews/story-check.json` → `StoryCheckReportSchema`
- `generated/sealed-narration.generated.json` → `SealedNarrationManifestSchema`
- `generated/semantic-timing.generated.json` → `SemanticTimingSchema`
- `generated/narrative-baseline-evidence.generated.json` →
  `M3NarrativeBaselineEvidenceReceiptSchema`
- `generated/narrative-auto-check.generated.json` → `NarrativeAutoCheckReportSchema`

The first five files are authored source/review inputs; the four `generated/` files are derived
artifacts. All objects are strict and versioned by their executable schemas.

`VideoBrief.sourceReferences` 是最多 8 条的结构化资料引用，每条严格包含最长 160 字符的
`title` 与最长 240 字符的 HTTP(S) `url`。显示合同会完整换行渲染这些合法值，不用省略号截断。
它属于具体 Project 的内容来源，不属于通用 ProducerConfig、StoryBeat 或发布文案。
新 Project 应显式 author 该数组；没有外部引用时使用空数组。当前未声明该字段的 Project 在解析后
投影为空数组，既有已冻结 source bytes 不被改写。

## Identity

`storyId` is the lowercase filesystem slug and becomes `StoryCompositionProps.projectId`.
`meaningId` is unique per StorySpec. `chunkId` is unique across the complete StorySpec.
Array order is semantic order; no independent numeric order field exists.

## Authored narration

`NarrationSpecSchema` is current-only v2 and contains only `voiceProfileId` plus the fixed
`voice-clone` mode. The removed `seed` field is rejected; VoxCPM has no seed input and no compatibility
branch interprets old NarrationSpec v1. `narration-generation-input` is v3 and consumes only
`narrated-scene` chunks, so the clean-break
contract cannot reuse a v1 generation identity.

StorySpec v2 discriminates `narrated-scene` from `silent-scene`. Every Story still requires at least one
real narrated Scene. silent intro/outro bind a fixed-duration preset and never synthesize an empty TTS
chunk, sealed segment, CaptionCue, narration file or caption text. `ttsChunks` are authored units and are
never split mechanically. An explicit pause is declared by
`{afterChunkId, pauseMs}` in its owning StoryBeat, where `pauseMs` is a non-negative integer. A zero
pause remains an owned zero-length timeline segment; a positive pause must quantize to at least one PCM
sample frame. Pause declarations are excluded from the generation input fingerprint but included in the
sealed narration fingerprint.

Silent Scene preset v2 discriminates `reusable-scene` from `scene-owner`. Defaults use
`reusable-scene`, binding an implementation ID, capability source fingerprint and exact local cue list;
Project replacements must choose explicitly. Scene task/assignment/result/package v5 also carry the exact
`VideoBrief.sourceReferences` consumed by the reusable credits Renderer, so changing visible credits
invalidates the Scene task and all downstream identities.

## Fingerprints

`sha256-canonical-json-v1` recursively sorts object keys, preserves array order, rejects non-JSON
values, and hashes a domain-separated `{namespace, value, version}` envelope as UTF-8 SHA-256.

Narrative Baseline adds a generated-entry checksum, ProjectRegistry entry fingerprint and baseline
fingerprint. The identity binds StorySpec, RenderSpec, sealed narration, SemanticTiming,
registry-entry identity and `narrative-core-v2`. Baseline evidence then adds exact transparent PNG and
full-render checksums without changing the upstream identity.

`narrative-auto-check-v2` binds the complete strict report body, including current source/StoryCheck,
seal, content-addressed mastered narration, timing, registry/baseline/evidence identities, fixed
evidence checksums and the ordered mechanical results. Unknown fields fail closed.

## Sealed narration

`SealedNarrationManifestSchema` records the selected normalized chunk artifacts, explicit pause
segments, canonical PCM format, complete WAV metadata, checksums, generation input fingerprint, and
sealed narration fingerprint. The current workflow normalizes real provider bytes, measures canonical
WAV sample frames, validates selected files and checksums, assembles the complete WAV, and publishes the
immutable content-addressed directory plus active receipt atomically. The read-only checker validates
the persisted contract against the actual files.

`MasteredNarrationManifestSchema` binds that seal to a two-pass FFmpeg loudness result. The output
remains canonical mono 48 kHz signed 16-bit PCM with the exact sealed sample-frame count, lives under
the separate `public/projects/<storyId>/narration-mastered/` root in an immutable directory addressed
by its own fingerprint, targets `-16 LUFS` / `-1.5 dBTP`, and passes
only within the fixed integrated-loudness range and true-peak ceiling. SemanticTiming continues to
derive exclusively from the sealed PCM; the mastered WAV is the render playback artifact.

## StoryCheck and operational work

`StoryCheckReportSchema` binds the current Story fingerprint, generation input fingerprint, voice
profile selection, ordered required checks, and a `proceed` or `revise` decision. The report is authored
by the Agent before external generation; warnings do not add a user approval gate, while failed checks
must revise and block generation.

Candidate progress and the provider-attempt fingerprint are operational work records under the
ignored `.narration-work/` tree. They identify and verify resumable provider output, but they are neither
persisted Story source nor sealed timing authority. A raw candidate becomes a measured candidate only
after canonical PCM, checksum, authored identity, request fingerprint, and positive sample-frame checks.
Only a complete measured batch can produce the persisted seal.

The current VoxCPM provider-attempt fingerprint is v2. Its safe descriptor binds the selected adapter
v2, profile/model identity, content checksums, `cfgValue`, `inferenceTimesteps`, `minLen`, `maxLen`,
`normalize`, `denoise`, `retryBadcase`, `retryBadcaseMaxTimes`, and
`retryBadcaseRatioThreshold`, without persisting provider URLs, credentials, private paths, transcripts,
or audio bytes.

## Semantic timing

`pcm-cumulative-ceil-v1` builds one cumulative integer sample timeline and applies
`ceilDiv(samples × fps, sampleRate)` at shared boundaries with `BigInt`. CaptionCue is one-to-one with
TTSChunk. Explicit pauses have timing but no CaptionCue. RenderSpec timing fields are `fps`,
`leadInFrames`, and `tailFrames`. The current workflow combines sealed narrated sample frames with
silent preset durations once, producing continuous intro → content → outro windows. `narrationStartFrame`
is the absolute frame where the one complete narration WAV begins; lead/tail remain only blank padding.

## ScenePackage Story Composition timeline

`SemanticTiming.durationInFrames` is the full timeline authority. The formal Composition uses
`scene-package-timeline-v1`; `ProjectRegistrationDescriptor.durationInFrames`,
`production-render-plan-v4.semanticTimingFrameCount/frameCount`, Remotion metadata, delivery publishing
and the delivery manifest all use the same value. intro/outro receive ordinary SceneAssignment and
ScenePackage identities. Their selected preset fingerprint enters task/package identity, while visual,
sound, duration or resource changes invalidate the old assignment and package. Default reusable presets
are materialized during freeze as ordinary Project-local Scene artifacts; their owners only validate and
publish receipts. Delivery chapters cover
only narrated StoryBeats and use their absolute SemanticTiming start frames.

## Implemented commands

```bash
npm test
npm run narration:check -- --project <story-id>
npm run registry:check
npm run compositions
npm run baseline:evidence -- --project <story-id>
npm run project:check -- --project <story-id> --level narrative
```

The narration checker validates real file bytes, checksums, sample-frame totals, current StoryCheck,
active seal, and byte-equivalent SemanticTiming. Narrative Baseline validation additionally checks the
current registry, lazy Composition metadata, transparent PNG facts, render facts, and evidence
fingerprint.

`project:check` aggregates `source-contracts`, `story-check`, `sealed-narration`,
`semantic-timing`, `project-registry`, `narrative-baseline` and `m3-evidence`, in that order. Default mode
recomputes read-only and rejects a missing, malformed or byte-drifted persisted AutoCheck. The optional
`--write-auto-check` atomically writes only a passing report and skips unchanged bytes so checksum and
mtime remain stable. Failed checks never overwrite the last valid report. The checker does not implement
NarrativeCheck or any subjective Story, narration, caption or pacing review.

Invalidation follows the existing dependency chain: source or StoryCheck identity changes invalidate
their sealed/timing/Baseline descendants; timing RenderSpec changes leave sealed PCM valid but invalidate
SemanticTiming and downstream identities; non-timing registration or Baseline changes leave sealed PCM
and timing valid; media loss/corruption invalidates baseline evidence without rewriting upstream identities.
The checker never repairs any of these artifacts.
