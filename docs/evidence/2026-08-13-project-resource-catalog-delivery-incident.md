# Project ResourceCatalog delivery incident

- Classification: fixed-flow defect in the shared Scene-freeze-to-delivery boundary.
- Affected run: `remotion-story-producer-explained-run-20260812143329-8574a5205a6a`.
- Contained state: production reached `render-ready` at sequence `16`; no delivery package,
  render-launch intent, render-launch receipt, or detached Remotion process was created.
- Safe symptom: automatic delivery stopped before package creation because the frozen Project-local
  ResourceCatalog snapshot was absent.
- Expected invariant: every valid Project, including code-led work with no imported external asset,
  must freeze one Project-local ResourceCatalog snapshot before owner assignments and keep it current
  through render-ready and delivery attribution.
- Root cause: external asset import was the only writer for the Project-local Catalog snapshot. Scene
  freeze tolerated a missing snapshot by deriving the Catalog only in memory, while delivery
  attribution required the persisted snapshot and render-ready did not expose the missing producer.
- Test gap: the delivery attribution fixture manually created the required snapshot, so it did not
  exercise the normal code-led production path.
- Containment: do not retry delivery for the affected Run, do not hand-create the missing snapshot,
  and do not edit its immutable events, state, assignments, results, or render-ready artifacts.
- Hardening: make Scene freeze write/check the Project-local snapshot from current Catalog authority,
  prove code-led generation and drift rejection, keep delivery fail-closed, commit the shared fix,
  then replay production from a fresh Run.
