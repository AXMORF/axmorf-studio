# Peak-limited narration mastering incident

- Classification: fixed-flow defect in the shared narration mastering boundary.
- Affected run: `remotion-story-producer-explained-run-20260812122717-c4ccd8e40ac6`.
- Contained state: terminal `failed`, last sequence `3`; the Run events and valid sealed narration
  remain immutable, and no Scene, GlobalVisual, Cover, watcher, or delivery work was dispatched.
- Safe symptom: the deterministic two-pass master measured `-15.54 LUFS` integrated loudness and
  `-1.49 dBTP` true peak for a `-15 LUFS / -1.5 dBTP` policy. The true-peak constraint was met, but
  integrated loudness missed the existing lower acceptance boundary by `0.04 LU`.
- Expected invariant: valid sealed speech must produce a sample-count-preserving master whose
  measured loudness and true peak both satisfy the frozen mastering policy.
- Root cause: the shared FFmpeg filter requested the exact authored integrated-loudness target.
  Peak-limited speech can finish slightly below that target after loudnorm protects true peak, while
  the contract intentionally accepts only the fixed `target +/- 0.5 LU` window.
- Diagnostic limitation: the thrown ZodError used a multi-line message beginning with `[`, and the
  current production redactor preserved only that first line. The artifact and measurements above
  were established through read-only validation of the sealed narration and isolated FFmpeg runs.
- Containment: do not retry or edit the failed Run, do not widen the acceptance contract, and do not
  modify the sealed narration or its measured timing.
- Hardening: reserve a deterministic `0.25 LU` processing margin inside the existing acceptance
  window, version the mastering algorithm identity, prove the regression and adjacent checks Green,
  commit the shared fix, then replay production from a fresh Run.
