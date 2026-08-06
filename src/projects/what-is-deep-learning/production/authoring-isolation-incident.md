# Authoring isolation incident

- Run: `what-is-deep-learning-run-20260806085342-595a1f1b6259`
- Observed state: `scene-inputs-frozen`; the run was not terminal and no fixed production stage failed.
- Safe symptom: broad CodeGraph contract queries by the `layers-find-patterns`, `features-build-up`, and `training-adjusts-weights` Scene owners unexpectedly returned out-of-scope historical Scene source excerpts.
- Expected invariant: new Scene authoring may use only the current project, contracts, tests, current ResourceCatalog, shared runtime APIs, and explicitly selected immutable references.
- Classification: Agent process / authoring-isolation incident; not an Agent artifact rejection, fixed-flow failure, provider failure, or protected voice-profile access.
- Containment: both owners stopped using the returned material, excluded it from visual and implementation decisions, and restricted subsequent work to assignment-authorized current inputs and non-historical contract/runtime sources. Root recorded the incident before immutable Scene submission and reran each fixed Scene check.
