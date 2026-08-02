# Narration Generation and Recovery

M2 provides a host-only Node.js workflow for turning authored `ttsChunks` into measured canonical
PCM, an immutable narration seal, and `SemanticTiming`. M3 now consumes the current seal read-only for
Narrative Baseline preview/render; it never calls the provider or seal workflow. See
[M3 Narrative Baseline evidence](evidence/2026-08-01-gps-relativity-m3.md).

## Private VoxCPM configuration

`generate` reads one absolute operator-owned file path from:

```bash
export RSP_VOXCPM_PRIVATE_CONFIG=/absolute/operator-owned/path/voxcpm.private.json
```

The referenced JSON stays outside the repository and has this strict shape:

```json
{
  "schemaVersion": 1,
  "baseUrl": "http://provider-host:port",
  "timeoutMs": 180000,
  "modelId": "operator-deployment-label",
  "endpointPath": "/clone",
  "parameters": {
    "cfgValue": 2,
    "inferenceTimesteps": 10,
    "normalize": true,
    "denoise": false,
    "retryBadcase": true
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

An optional non-empty `token` may be added at the top level when the private deployment requires
bearer-scheme authentication. Unknown keys, duplicate profiles, relative references, non-WAV references,
unsupported modes, and missing files fail closed. Provider connection details, credentials, model
configuration, control text, private paths, and reference bytes must not enter Story source, progress
summaries, sealed manifests, evidence, logs, or Git.

Only `generate` reads this file or calls the network. `seal` and `check` operate from local measured or
sealed artifacts and must work when the provider and private file are unavailable.

## Commands

Generate or resume candidates:

```bash
npm run --silent narration:generate -- --project <story> > out/<story>/m2-generation.json
```

The JSON on stdout is redaction-safe and includes the Story identity, generation and provider-attempt
fingerprints, and generated/normalized/reused counts. Progress messages go to stderr. Preserve the
reported provider-attempt fingerprint and seal that exact attempt:

```bash
ATTEMPT_FINGERPRINT="$(node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("out/<story>/m2-generation.json","utf8"));process.stdout.write(r.providerAttemptFingerprint)')"
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

## Intentional supersede

Never overwrite an active seal by retrying or guessing. First check it and copy its exact fingerprint:

```bash
npm run --silent narration:check -- --project <story> > out/<story>/m2-check.json
CURRENT_SEAL="$(node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("out/<story>/m2-check.json","utf8"));process.stdout.write(r.sealedNarrationFingerprint)')"
npm run narration:seal -- --project <story> --attempt "$ATTEMPT_FINGERPRINT" --supersede "$CURRENT_SEAL"
npm run narration:check -- --project <story>
```

The compare-and-swap value must equal the current active seal. The old content-addressed directory is
preserved; only a fully verified different seal can replace the active receipt.

## Git and privacy checks

Before staging a narration seal:

```bash
git check-ignore .narration-work/<story> out/<story> .env.local private/probe
git status --short
git ls-files .narration-work out .env .env.local private
```

Stage only the content-addressed public WAV directory, active manifest, SemanticTiming artifact, and
redacted evidence. Never stage the private configuration, reference voice, `.narration-work`, `out`,
environment files, lock files, temporary staging directories, or provider logs.

## M2 scope boundary and M3 consumption

M2 itself ends at verified sealed narration and generated SemanticTiming/CaptionCue artifacts. M3 reads
those exact artifacts to provide NarrativeCore, NarrationAudioTrack, CaptionLayer, generated
ProjectRegistry, one lazy Story Composition, transparent stills and a full Baseline render. M4 now checks
the same sealed files read-only as part of `project:check`; it does not regenerate, reseal, supersede or
rewrite SemanticTiming. NarrativeCheck, Scene, renderer, Shot, BaseCanvas, sound and global visual layers
remain unimplemented.
