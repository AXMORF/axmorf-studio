# Configured Scene template readability incident

- Classification: fixed-flow defect in the shared configured Scene template to Scene-submit boundary.
- Affected run: `remotion-story-producer-overview-run-20260816080830-9cc985d30470`.
- Contained state: terminal `failed` at sequence `6`; no Scene assignment, Scene result, GlobalVisual assignment, watcher launch, delivery package, or render launch was created.
- Safe symptom: Scene freeze rejected the configured opening template because its frame-driven transform could not be statically proven readable.
- Expected invariant: every Scene template selectable through current ProducerConfig must pass the same frozen readability and Scene-submit validators that production applies after configuration.
- Root cause: the reusable AXMORF templates contain frame-driven scale treatments and undersized closing-button text that predate the current readability gate. The copied opening Renderer also destructured an unused source-reference prop. The configured-template Scene-freeze test replaced real template submission with a stub, so the selected templates were copied and frozen without exercising their production validator boundary; the generator test did not assert the no-source-reference variant.
- Containment: keep the failed Run, its append-only events, and its derived state immutable; do not retry Scene freeze, manually submit templates, or start a watcher for it.
- Hardening: add deterministic configured-template regressions through the production readability validator and both Renderer generator variants, make the shared template sources satisfy the frozen readability policy without weakening the validator, run focused and full verification, commit the shared fix, then replay from a fresh Run.
