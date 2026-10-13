# Edge TTS endpoint migration incident

On 2026-10-13, the first production preparation for `rea-inside-the-black-box` failed
on `black-box-01`. No narration was sealed and no production attempt, Agent task or
delivery was created. The original public error intentionally redacted the underlying
exception, so that message alone did not establish the cause.

## Diagnosis

The installed `node-edge-tts@1.2.10` connected to
`speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`.
Its WebSocket handshake returned HTTP 403 through the configured host HTTPS proxy.
The adapter already forwarded that proxy correctly.

An isolated installation of `node-edge-tts@1.2.11` connected successfully through the
same proxy to `api.msedgeservices.com/tts/cognitiveservices/websocket/v1`.
Both diagnostic connections sent no text and requested no audio. This comparison
establishes connection health only; real synthesis remains a production check.

The upstream [endpoint migration fix](https://github.com/SchneeHertz/node-edge-tts/pull/14)
was included in 1.2.11, published on 2026-10-12 at 16:27:27 UTC.

## Source correction

- Pin 1.2.11 in the source repository, runtime package and creator dependency table.
- Match `NO_PROXY` against the current service host.
- Preserve only recognized WebSocket HTTP status codes and the SDK's fixed timeout
  signal in public errors. Arbitrary messages, URLs and credentials remain redacted.
- Keep Edge TTS, one request per authored chunk, and no fallback or automatic retry.

The focused regression suite covers proxy selection, safe diagnostics, single-call
failure behavior, runtime dependency boundaries and creator scaffolding. It passed
20 tests with no failures or skips. The complete `npm run check` also exited 0:
1499 tests passed with no failures or skips, followed by typechecking, lint, docs,
resource checks, Web/Remotion builds and host checks. The log is retained at
`out/edge-tts-fix-20261013/npm-check.log`. This source correction is local and unpublished.

## Actual production after the local upgrade

The rebuilt runtime and creator passed their package checks. A normal npm install
updated the new Workspace to the local runtime tarball and Edge SDK 1.2.11;
bootstrap and all six doctor checks passed. No package internals were patched.

One formal production preparation generated and cached ten valid narration chunks.
The next chunk, `sound-pan-03`, failed with WebSocket HTTP 429. A subsequent
read-only production inspection confirmed ten cache hits and five remaining
provider requests. The runner is serial and calls each uncached authored chunk
once; it has no deliberate inter-request spacing. The failing preparation exited
after about 26 seconds. This is consistent with rate limiting, but does not prove
a specific per-IP quota, service-wide limit or cooldown duration; the SDK error
did not expose `Retry-After`.

The endpoint migration was verified by real successful synthesis. At this stage,
the new 429 was an external blocker; no retry after 429, provider switch, sealed
narration, Agent production task or final delivery occurred in that preparation.

The user subsequently explicitly authorized continuing the remaining five chunks
with Edge TTS, stopping if rate limiting recurred. After a fresh host capability
probe and read-only inspection, one new formal preparation generated exactly five
chunks and reused the ten cached chunks. All 15 chunks were sealed successfully;
the PCM-derived complete film duration is 76.5 seconds, including ten seconds of
boundary Scenes. Preparation created five Agent tasks. This confirms real synthesis
and partial-progress reuse after the endpoint correction; visual delivery remains
separate from this TTS incident verification.

All five fresh native Agent workers subsequently committed their bound artifacts.
The Root inspected 36 decoded frames from the frozen full-film preview, then ran
the original one-shot continuation, which exited 0 with
`project-production-complete`. The exact four-file delivery contains a 76.5-second,
1080×1920, 30 fps H.264/AAC stereo video (2295 frames), two PNG covers and
`publish.json`. `npm run compositions` and all seven final Project checks passed.

DeliveryBuildId: `delivery-b3cf08b50c3f1ec4c0d8c6619c0daef4cd211f34f9f99ca6a27996fbba15fe11`.
Video SHA-256: `f776715e8ef35ea849a3526975cb04a956cb7800f31e9ce583da5ae2f432a9e0`.

Nine final-video frames and both covers were also inspected. Final AAC measured
−15.72 LUFS and −2.26 dBTP; eight original-phase source-fit windows found the
music gain between 0.09939 and 0.09987, consistent with the frozen 0.1 gain.
This establishes technical decode and music presence, not subjective listening
or full continuous visual review. Physical mobile-device playback was not assessed.
The local tarballs retain version 0.1.21 but include unreleased source; they are not
the public 0.1.21 packages or an independent release first-use certification.
The original installed Workspace and existing Projects were not migrated.
Current source and publication status are maintained in
[Iteration Status](../ITERATION_STATUS.md).
