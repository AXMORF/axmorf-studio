# Remotion Studio Project sound authority incident

- Classification: fixed-flow defect in the generated production Scene runtime.
- Affected Run: `remotion-story-producer-overview-run-20260816110346-50db15604f00`.
- Observed state: the Run reached `render-ready` at sequence `19`; automatic delivery recorded only a detached render spawn acknowledgement.
- Safe symptom: Remotion Studio rejected the Project background-music contribution as not runtime-approved while the render-ready check passed.
- Expected invariant: Studio, render-ready, Project checks, and delivery rendering must resolve Project sound descriptors from the same frozen Project Catalog authority.
- Root cause: the generated browser runtime read raw descriptors from `assets.manifest.json`, while render-ready read authority-enriched descriptors from `generated/resource-catalog.generated.json`. The two paths computed different descriptor fingerprints for the same approved Project-local BGM.
- Containment: do not relax runtime approval checks, edit Run events/state, retry the detached delivery launch, or rewrite owner results. Keep private configuration and protected voice media outside diagnostics.
- Hardening: generate a static Project Catalog import in the production Scene runtime and resolve Project BGM descriptors exclusively from its entries.
