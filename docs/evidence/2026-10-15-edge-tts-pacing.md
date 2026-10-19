# Edge TTS low-frequency diagnosis and pacing mitigation

## Diagnosis

Five isolated requests on 2026-10-15 used the same short sentence and
`zh-CN-XiaoxiaoNeural`. The probe reproduced the installed Node client's handshake
with its existing public `ws` and `https-proxy-agent` dependencies. It did not run
the film production command or the SDK's `ttsPromise` method. The v2 token used
the pinned Python edge-tts 7.3.1 implementation, checked against the upstream
captured-token vector. No dependency, production source or lockfile was changed
during diagnosis.

| Start time (Asia/Tokyo) | Endpoint | GEC | Application route | Gap after previous completion | Result |
| --- | --- | --- | --- | --- | --- |
| 16:40:47.736 | api.msedgeservices.com | v1 | explicit proxy | initial idle 861.877 s | CONNECT 200, Upgrade 101, audio |
| 16:43:08.908 | api.msedgeservices.com | v1 | direct | 137.198 s | Upgrade 101, audio |
| 16:46:15.549 | speech.platform.bing.com | v2 | same explicit proxy | 185.347 s | CONNECT 200, Upgrade 101, audio |
| 16:49:22.440 | speech.platform.bing.com | v2 | direct | 184.536 s | Upgrade 101, audio |
| 16:51:52.340 | api.msedgeservices.com | v2 | same explicit proxy | 148.765 s | CONNECT 200, Upgrade 101, audio |

All five MP3 files passed full decoding. No retries, fallbacks or warm-up requests
were made. Application-direct only bypassed the explicit HTTP proxy; OS VPN/TUN
routing and the public exit IP were not independently verified. Raw diagnostic
files remain outside Git.

This did not reproduce HTTP 429. In particular, it does not prove that v2 fixes
the historical failures or establish a safe request rate. The earlier production
[incident](../archive/project-production/evidence/2026-10-13-edge-tts-endpoint-incident.md) recorded ten successes in about
26 seconds followed by 429 and later recovery. Short-term throttling remains the
leading hypothesis, including possible limits on a shared exit IP.

## Authorized source mitigation

The Edge adapter keeps the pinned SDK, API endpoint and handshake unchanged. It
serializes calls within an adapter instance and admits the next real request no
earlier than ten seconds after the previous request completes. Waiting is lazy:
the first request starts immediately, the last request does not wait after
completion, and time already spent idle counts toward the interval. The film
cache still returns before calling the adapter, including across fresh services.

The ten-second interval is a trial mitigation, not a measured Microsoft quota.
It cannot constrain another adapter instance, process or consumer sharing the
same exit. A rejected request also rejects queued calls without sending more
text; no automatic retry or provider fallback is added.

Each real request emits safe start/end JSON to stderr with wall-clock timestamps,
chunk ID, application proxy/direct route, monotonic elapsed time, outcome and a
recognized HTTP status where available. Narration text, proxy address/credentials,
handshake URLs/tokens and arbitrary upstream messages are not emitted. The SDK
does not expose response headers here, so a logged HTTP status alone still cannot
distinguish proxy CONNECT from origin WebSocket Upgrade. Diagnostics and pacing
do not enter cache identity or alter PCM samples, pauses or film timing.

## Verification boundary

Fake-clock/client regression tests cover concurrent-call serialization, the
completion-to-start interval, already-idle calls, fail-closed queued requests,
safe HTTP/timeout diagnostics and secret redaction. A film-service integration
test uses fake provider WAV bytes and local audio normalization to verify that
cache hits neither request audio nor wait or emit provider diagnostics, including
after recreating the service. No new live TTS request was authorized or made for
this source implementation. Real production effectiveness of the ten-second
setting remains unverified; this source change is unpublished and does not update
an already installed Workspace.

Verification completed: 16 focused adapter/film/cache tests, followed by 108
narration, film, narration-config and documentation regression tests; all passed
with no failures or skips. Repository TypeScript checking, lint on the four
changed TypeScript files, formatting and Markdown/npm-script link checks passed.
No full repository/host rendering check was run for this adapter-only change.
