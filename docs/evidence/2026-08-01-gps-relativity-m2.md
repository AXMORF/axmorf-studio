# GPS Relativity M2 Narration Evidence

## Sealed identity

- Story: `gps-relativity`
- Generation input fingerprint: `sha256:1b3d1abb5aa14bb8df07d2023a3ab947137a4e9f075234e82ae777a36cb39f96`
- Provider-attempt fingerprint: `sha256:c5a1f9c5f844f5943dbadd335e0747e46774d054b83e1ec565077dad47a3685e`
- Sealed narration fingerprint: `sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5`
- Semantic timing fingerprint: `sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c`
- Complete audio checksum: `sha256:9a6d9201d44f5926f48c7d017ade48e5d59639bbcb4c5bf4089c620d2ac38d98`
- Complete audio sample-frame count: `2721600`

## Generation and timing

- Authored and measured chunks: `10 / 10`; ten CaptionCues preserve the same authored order and ownership.
- Fresh production: ten provider generations, ten normalizations, zero reused chunks.
- Same-attempt resume: zero provider generations, zero normalizations, ten checksum- and measurement-verified reused chunks.
- Canonical audio: `48000 Hz / mono / s16le`.
- Complete duration: `56.700000` seconds.
- Authored pauses: `300 ms = 14400` sample frames and `400 ms = 19200` sample frames.
- The complete sample-frame count equals the integer sum of all ten measured chunks and both authored pauses.
- Timing was derived with `pcm-cumulative-ceil-v1`; no per-chunk floating-second frame accumulation was used.

## Mechanical audio checks

- `ffprobe`: PCM s16le, 48,000 Hz, one channel, positive 56.7-second duration.
- `volumedetect`: mean volume `-18.5 dB`; displayed maximum `-0.0 dB` after rounding.
- Exact PCM inspection: peak magnitude `32583`, zero full-scale rail samples, zero samples at or above magnitude `32700`, and no consecutive rail run. The rounded maximum therefore does not represent clipping.
- `silencedetect=n=-45dB:d=2.5`: no silence event at or above 2.5 seconds.
- File-backed narration check reproduced the manifest checksum, sample-frame count, seal fingerprint, and SemanticTiming fingerprint.

## Listening acceptance

- A full-duration MP3 audition copy was encoded directly from the sealed complete WAV without trimming or rearrangement and supplied for remote review.
- On 2026-08-01 the user accepted the complete narration with: “这语音可以了”.
- No issue was reported for `GPS`, `微秒`, `狭义相对论`, `广义相对论`, either authored pause, chunk joins, completeness, or truncation; these acceptance targets are therefore recorded as passed as rendered.

## Privacy and scope

- Provider address, credentials, deployment configuration object, control instruction, private absolute paths, reference checksum, and reference bytes are absent from tracked artifacts and this evidence.
- Candidate and measured work state remains ignored and separate from the immutable sealed directory and active receipt.
- M2 did not implement NarrativeCore, CaptionLayer, ProjectRegistry, a Story Composition, Remotion runtime integration, Scene, or BaseCanvas capability.
