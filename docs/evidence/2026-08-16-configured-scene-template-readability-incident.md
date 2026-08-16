# Configured Scene template readability incident

- Classification: fixed-flow defect in the shared configured Scene template to Scene-submit boundary.
- Affected run: `remotion-story-producer-overview-run-20260816080830-9cc985d30470`.
- Contained state: terminal `failed` at sequence `6`; no Scene assignment, Scene result, GlobalVisual assignment, watcher launch, delivery package, or render launch was created.
- Safe symptom: Scene freeze rejected the configured opening template because its frame-driven transform could not be statically proven readable.
- Correct invariant: a configured Scene template is a deterministic, human-approved fragment. Production must verify its frozen instance identity, copied source/asset checksums, resource selection, renderer graph identity, and ScenePackage binding, then write its result directly. It must not enter generic Agent-authored Scene readability checks, focused compile, creative review, owner tasks, or owner receipts.
- Root cause: template results reused the generic Agent-authored Scene submit validator and re-resolved the assignment through the generic narrative path. That incorrectly applied authoring-time readability heuristics to an already approved immutable copy. Separately, the Renderer generator destructured an unused source-reference prop in its no-reference variant.
- Containment: keep the failed Run, its append-only events, and its derived state immutable; do not retry Scene freeze, manually submit templates, or start a watcher for it.
- Hardening: restore the approved template visuals unchanged; add a template-specific deterministic validator and direct result path; bind it to the assignment frozen by the same Scene-freeze call; keep generic Scene readability and focused compile unchanged for owner-authored Scenes; cover both Renderer generator variants; run focused and full verification, commit the shared fix, then replay from a fresh Run.
