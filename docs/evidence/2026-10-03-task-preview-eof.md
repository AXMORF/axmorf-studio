# Bound Scene preview EOF incident

The first real production preview of a validated narrated Scene failed before commit with
`Scene preview did not decode completely to EOF.` Its finalize and check had passed;
the failed attempt was terminated through its fixed failure and original continuation commands.
No installed package, dependency, validator, task output or failed attempt was repaired in place.

## Cause and minimal repair

Workspace-local Remotion 4.0.489 ships FFmpeg n7.1. Its `null` muxer selects
`wrapped_avframe` by default, while that encoder is absent from this trimmed build.
The preview's EOF command omitted output codec selection. Delivery's existing media
checker already explicitly uses the available `rawvideo` and `pcm_s16le` encoders.
Preview now follows that same decoding strategy, retaining `-xerror` and full EOF traversal.
This is a decoder-command correction, not a weaker media acceptance rule.

## Red → Green evidence

The injected preview runner previously accepted every FFmpeg invocation. Modelling the
pinned build's absent default encoder made two existing tests fail at EOF (5/7 passed).
The minimal command correction restores those paths. An additional regression verifies
that a decoder error rejects success, cleans only its new diagnostic directory, preserves
the output fingerprint, and creates no artifact. Focused result: **8/8 passed**.

Two independent 30-frame engineering fixtures were rendered serially with the pinned
Remotion CLI: H.264 without audio, and H.264 with a synthesized AAC tone. For both,
the old command exits nonzero and the repaired command fully decodes with exit zero.
A truncated MP4 remains rejected. These fixtures are codec evidence, not narration,
production deliverables or aesthetic approval.

Local diagnostic evidence is retained outside Git under
`/tmp/axmorf-quality-benchmark-20261003/preview-eof-incident/evidence.json`, with the
fixture generator and videos. A rawvideo input-demuxer fixture attempt also failed
because that demuxer is absent; the successful fixtures use the real Remotion renderer.

The repaired source is repackaged for a fresh candidate Workspace. Formal production,
temporal review and repeatability remain required; unit checks alone do not complete them.
