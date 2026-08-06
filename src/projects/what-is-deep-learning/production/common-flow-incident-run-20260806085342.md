# Common-flow incident

- Run: `what-is-deep-learning-run-20260806085342-595a1f1b6259`
- Terminal sequence: 14, `post-scene-failed`.
- Safe symptom: Preview rendering terminated when a v3 Scene Renderer required the composition-owned boundary-version prop that the shared mount intentionally removes before invoking the Renderer.
- Expected invariant: `production:scene:check` must reject any v3 Renderer source graph that reads or owns composition boundary props before immutable Scene submission.
- Classification: fixed-flow validation defect exposed by Agent-owned Scene source; not a provider, sandbox, authorization, or protected-artifact failure.
- Containment: the failed Run remains terminal and immutable; no Preview retry or manual state edit was attempted. A temporary single-frame render reproduced the mismatch outside the Run output path. The common validator will be hardened with Red/Green coverage, affected Scene sources will be returned to their original owners, and production will restart as a fresh Run.
