# Desktop Runtime Pack narration normalization incident

- Classification: fixed-flow defect in the shared Workspace narration preparation boundary.
- Story: `hand-drawn-idea-to-action-20260825`.
- Revision and attempt: none; preparation failed before ProductionRevision planning and ExecutionAttempt creation.
- Safe symptom: Edge TTS produced one valid 24 kHz mono MP3 candidate, but narration preparation stopped while
  converting that candidate to canonical 48 kHz mono PCM. The public RSP response exposed only
  `rsp-command-failed`.
- Expected invariant: every provider candidate accepted by the configured provider adapter must be normalized by
  the exact embedded Runtime Pack before timing, task planning, rendering, or Delivery begins.
- Containment: the failed preparation was not retried or repaired in place. Its validated raw candidate remains in
  the content-addressed chunk cache for reuse; no Agent task, artifact promotion, live source materialization, or
  Delivery occurred.

## Root cause

The shared provider and prompt normalizers requested the raw `s16le` muxer with `-f s16le pipe:1`. The exact
Remotion compositor FFmpeg embedded in the DMG can decode `s16le` but does not provide that output muxer. It does
provide the WAV muxer, which the existing mastering path already uses. Unit tests supplied mocked raw stdout and
therefore treated the unsupported command as the expected contract. The native gate substituted a deterministic
narration port that created canonical WAV chunks directly, so it exercised mastering but bypassed provider
normalization.

## Hardening

- Normalize through a temporary PCM WAV supported by the exact Runtime Pack, decode its PCM, and rebuild the
  canonical 44-byte WAV so timing and checksum authority remain unchanged.
- Apply the same path to provider candidates and protected VoxCPM prompt audio.
- Execute a regression against the installed Remotion compositor FFmpeg instead of only mocking process stdout.
- Route native-gate deterministic chunks through the shared provider normalizer before sealing, so a future Runtime
  Pack codec/muxer mismatch fails the packaged native gate.
