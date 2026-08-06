# Authoring isolation incident

- Run: `machine-learning-basics-run-20260806063340-4175d2f7ebe3`
- Observed state: `baseline-ready`, sequence 3; the run was not terminal and no fixed production stage failed.
- Safe symptom: a broad CodeGraph contract query unexpectedly returned out-of-scope historical Scene source excerpts.
- Expected invariant: new Scene authoring may use only the current project, contracts, tests, current ResourceCatalog, shared runtime APIs, and explicitly selected immutable references.
- Classification: Agent process / authoring-isolation incident; not an Agent artifact rejection, fixed-flow failure, provider failure, or protected voice-profile access.
- Containment: stopped using the returned material, excluded it from all visual and implementation decisions, loaded the hardening rule, and restricted subsequent reads and searches to the current project plus contract/test/runtime files that exclude historical project Scene trees.
