# Narration loudness mastering incident

- Classification: fixed-flow defect in the shared narration-to-render boundary.
- Affected run: `ai-in-your-workflow-run-20260809165148-8d721cce81c8`.
- Contained state: `render-ready`, last sequence `20`; the existing sealed narration, Run events,
  delivery package, and detached render remain immutable.
- Safe symptom: the bound complete narration measured `-18.77 LUFS` integrated loudness while its
  true peak was already `-0.25 dBTP`, so the voice sounded quiet but had insufficient headroom for a
  plain render-time gain increase.
- Expected invariant: production must bind one immutable playback narration whose sample count and
  PCM format match the sealed timing authority, whose integrated loudness is within the fixed speech
  range, and whose true peak does not exceed the fixed ceiling.
- Root cause: provider normalization only canonicalized sample format, rate, and channel layout. The
  fixed narrative chain had no deterministic playback mastering artifact or loudness/true-peak gate,
  and the generated Composition played the raw sealed complete WAV at unity gain.
- Containment: do not modify or reinterpret the old seal, Run, delivery, or MP4; do not add unchecked
  Remotion amplification.
- Hardening: add a seal-bound mastered narration contract and deterministic two-pass FFmpeg writer,
  require exact sample-count preservation and measured loudness/true-peak acceptance, bind the
  artifact through Narrative AutoCheck, ProductionRenderPlan, and the generated Composition, commit
  the shared fix, then replay production from a fresh Run.
- Replay finding: fresh Run `ai-in-your-workflow-run-20260810062654-d432f6c4a714` failed immutably in
  narrative because the first mastered path nested inside the sealed immutable directory and changed
  its file set. The corrected contract keeps mastered output under a separate sibling project root;
  the failed Run is not retried or edited.
