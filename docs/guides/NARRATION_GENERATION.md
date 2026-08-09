# Narration Generation and Recovery

> 文档类型：操作指南
>
> 最后复核：2026-08-10

The current host-only narration workflow turns Agent-authored `ttsChunks` into measured canonical
PCM, an immutable narration seal, `SemanticTiming`, and `CaptionCue`. Normal production invokes this
flow through `production:narrative`; the standalone commands below are maintenance and diagnosis
entrypoints. Downstream baseline, Scene, GlobalVisual, assembly, and delivery code consume the seal
read-only and never call the provider.

## Private VoxCPM configuration

`generate` defaults to the following Git-ignored repository-local file:

```text
voxcpm/voxcpm.private.json
```

Operators may override that default with an absolute path:

```bash
export RSP_VOXCPM_PRIVATE_CONFIG=/absolute/operator-owned/path/voxcpm.private.json
```

The default file must remain ignored and untracked. The override may remain outside the repository.
Either way, the referenced JSON has this strict shape:

```json
{
  "schemaVersion": 2,
  "baseUrl": "http://provider-host:port",
  "timeoutMs": 180000,
  "modelId": "operator-deployment-label",
  "endpointPath": "/clone",
  "parameters": {
    "cfgValue": 2,
    "inferenceTimesteps": 10,
    "minLen": 2,
    "maxLen": 4096,
    "normalize": true,
    "denoise": false,
    "retryBadcase": true,
    "retryBadcaseMaxTimes": 3,
    "retryBadcaseRatioThreshold": 6
  },
  "voiceProfiles": [
    {
      "id": "profile-id-from-narration-spec",
      "mode": "controllable-clone",
      "referenceAudioPath": "/absolute/operator-owned/reference.wav",
      "controlInstruction": "compact provider instruction"
    }
  ]
}
```

The strict generation ranges match the current provider API: `cfgValue` is 1–3,
`inferenceTimesteps` is 4–30, `minLen` is 1–8192, `maxLen` is 2–8192 with
`minLen <= maxLen`, `retryBadcaseMaxTimes` is 0–10, and
`retryBadcaseRatioThreshold` is greater than zero. Both clone modes send every listed generation
parameter plus `save=false`; unknown or removed fields such as `seed` fail closed. Provider
`normalize` is a generation-time VoxCPM option, not LUFS loudness normalization or mastering.

High-fidelity clone profiles instead use this strict profile shape:

```json
{
  "id": "profile-id-from-narration-spec",
  "mode": "high-fidelity-clone",
  "promptAudioPath": "/absolute/operator-owned/prompt-audio.wav",
  "promptTextPath": "/absolute/operator-owned/prompt-transcript.txt",
  "promptTranscriptConfirmed": true
}
```

The transcript must be the confirmed exact content of the prompt audio. The adapter normalizes the
prompt source to canonical WAV and submits those same canonical bytes as both `prompt_audio` and
`reference_audio` to `/clone_with_prompt`. High-fidelity mode forbids `controlInstruction`, `control`,
and `emotion`; it never guesses or transcribes prompt text.

An optional non-empty `token` may be added at the top level when the private deployment requires
bearer-scheme authentication. Unknown keys, duplicate profiles, relative references, non-WAV references,
unsupported modes, and missing files fail closed. Provider connection details, credentials, model
configuration, control text, private paths, and reference bytes must not enter Story source, progress
summaries, sealed manifests, evidence, logs, or Git. The exact default config path is protected by
`.gitignore`; environment overrides remain available for alternate operators and deployments.
Repository-local private reference inputs belong under the likewise ignored
`voxcpm/voice_profile/` directory, never under tracked project assets.

The host-only migration command upgrades an explicitly selected legacy profile without printing
private configuration or source paths:

```bash
node --import tsx scripts/narration/migrate-private-config.ts --profile <voice-profile-id>
```

When the legacy reference audio has exactly one regular, non-symlink TXT sibling with the same stem,
and the operator has personally confirmed that TXT is the audio's exact word-for-word transcript, the
confirmation may be supplied explicitly:

```bash
node --import tsx scripts/narration/migrate-private-config.ts --profile <voice-profile-id> --confirm-adjacent-transcript
```

This option does not transcribe, compare, guess, or print the text. Missing, differently named,
non-regular, symlinked, or ambiguous TXT candidates fail closed before the atomic private-config
write. The prompt audio must also normalize successfully to canonical WAV.

Only `generate` and the explicit migration entrypoint read this file; only `generate` calls the
network. `seal` and `check` operate from local measured or sealed artifacts and must work when the
provider and private file are unavailable.

## Commands

Generate or resume candidates:

```bash
npm run --silent narration:generate -- --project <story> > out/<story>/narration-generation.json
```

The JSON on stdout is redaction-safe and includes the Story identity, generation and provider-attempt
fingerprints, and generated/normalized/reused counts. Progress messages go to stderr. Preserve the
reported provider-attempt fingerprint and seal that exact attempt:

```bash
ATTEMPT_FINGERPRINT="$(node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("out/<story>/narration-generation.json","utf8"));process.stdout.write(r.providerAttemptFingerprint)')"
npm run narration:seal -- --project <story> --attempt "$ATTEMPT_FINGERPRINT"
```

Run the read-only file-backed checker at any time after a seal exists:

```bash
npm run narration:check -- --project <story>
```

`seal` and `check` print one redaction-safe JSON result containing the active generation, seal, timing,
checksum, sample-frame, chunk, and CaptionCue identities. They never print private configuration.

## Authored-unit and timing rules

- One authored `TTSChunk` causes exactly one provider request and exactly one CaptionCue.
- Tools never split text by punctuation or infer extra units from punctuation.
- Natural silence inside provider audio is preserved. No `silenceremove`, `atrim`, or other silence
  trimming is allowed.
- Extra narration pauses come only from authored `explicitPauses` and become zero-valued PCM.
- FFmpeg normalizes each selected provider response to 48 kHz, mono, s16le PCM. Node code validates the
  WAV structure, checksum, and positive integer sample-frame count.
- Frames come only from cumulative sealed PCM sample boundaries through `pcm-cumulative-ceil-v1` with
  `BigInt`; per-chunk floating-second conversion is forbidden.

## Candidate, measured, and sealed lifecycle

```text
provider response
→ candidate raw WAV
→ measured canonical WAV
→ complete measured batch
→ immutable sealed directory
→ active receipt + SemanticTiming
```

Operational work is ignored under:

```text
.narration-work/<story>/<generation-digest>/<provider-attempt-digest>/
├── progress.json
└── candidates/<chunk>/<candidate-digest>/{raw,normalized}.wav
```

A raw candidate is not measured authority. A measured candidate has verified canonical PCM,
checksums, authored identity, request fingerprint, and sample-frame count, but is still resumable work.
Only a complete measured batch may be assembled and promoted. Partial success never writes an active
sealed receipt.

Sealed authority is split deliberately:

```text
public/projects/<story>/narration/<sealed-digest>/
├── chunks/*.wav
└── complete.wav

src/projects/<story>/generated/
├── sealed-narration.generated.json
└── semantic-timing.generated.json
```

The content-addressed directory is immutable. The generated manifest is the active receipt, and the
generated timing artifact is derived from that receipt plus RenderSpec timing fields.

## Resume and provider failures

Rerun the same `generate` command unchanged. Reuse occurs only when both the generation input and
provider-attempt fingerprints match and the stored raw checksum, normalized checksum, canonical WAV,
sample-frame count, authored identity, and request fingerprint all verify.

The safe descriptor uses adapter IDs `voxcpm-controllable-clone-http-v2` and
`voxcpm-high-fidelity-clone-http-v2`. It includes all generation parameters, profile identity, and
content checksums while excluding endpoint, token, private paths, and raw private bytes. The
provider-attempt fingerprint uses this descriptor, so changing any generation parameter or switching
from a v1 adapter creates a new attempt and cannot reuse stale candidates.

Changing the private deployment label, reference bytes, control instruction, or generation parameters
creates a different provider-attempt fingerprint and a separate attempt directory. Stale candidates are
never mixed into the new attempt.

If the provider stops during a batch, completed progress remains recoverable and missing chunks fail
closed. No sealed receipt is created from an incomplete batch. A current sealed narration whose source
and fingerprints still match remains usable during a provider outage; runtime and `narration:check` do
not call VoxCPM.

## Seal lock recovery

Sealing uses exactly:

```text
src/projects/<story>/generated/.narration-seal.lock
```

If the lock exists, first verify that no narration process is running and inspect only that file:

```bash
pgrep -af 'scripts/narration/cli.ts (generate|seal)' || true
ls -l "src/projects/<story>/generated/.narration-seal.lock"
```

Only after proving the owner process is gone may the exact stale lock be removed:

```bash
rm -- "src/projects/<story>/generated/.narration-seal.lock"
npm run narration:check -- --project <story>
```

Do not delete the generated directory, immutable narration directory, candidate tree, or a broad glob.
After the checker passes—or reports the precise incomplete state—rerun the exact seal command.
This exact stale-lock recovery is not Project cleanup. When the user explicitly requests deletion of a
whole Project, use [`project:delete`](../PRODUCTION_WORKFLOW.md#7-作品删除) so the Project source,
sealed media, candidate tree, Runs, out, and deliveries are removed as one preflighted set.

## Intentional supersede

Never overwrite an active seal by retrying or guessing. First check it and copy its exact fingerprint:

```bash
npm run --silent narration:check -- --project <story> > out/<story>/narration-check.json
CURRENT_SEAL="$(node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("out/<story>/narration-check.json","utf8"));process.stdout.write(r.sealedNarrationFingerprint)')"
npm run narration:seal -- --project <story> --attempt "$ATTEMPT_FINGERPRINT" --supersede "$CURRENT_SEAL"
npm run narration:check -- --project <story>
```

The compare-and-swap value must equal the current active seal. The old content-addressed directory is
preserved; only a fully verified different seal can replace the active receipt.

## Git and privacy checks

Before any repository staging, confirm private and ignored narration paths remain outside Git:

```bash
git check-ignore .narration-work/<story> out/<story> .env.local private/probe
git status --short
git ls-files .narration-work out .env .env.local private
```

`public/`, `src/projects/`, `.narration-work/` and `out/` are ignored local production artifacts and
must not be staged. Never stage private configuration, reference voice, environment files, lock files,
temporary staging directories, provider logs, or generated Project media.

## Current production consumption

The standalone narration lifecycle ends at verified sealed narration and generated
SemanticTiming/CaptionCue artifacts. `production:narrative` continues with NarrativeCore,
NarrationAudioTrack, CaptionLayer, ProjectRegistry, baseline evidence, and mechanical AutoCheck.
Later production stages consume those exact identities for Scene/GlobalVisual results, FinalAssembly,
render-ready, and automatic delivery. Read-only checks never regenerate, reseal, supersede, or rewrite
SemanticTiming. NarrativeCheck and subjective aesthetic gates remain outside the current flow.
