# Project sound authority incident

- Classification: fixed-flow defect in Project configuration and render-ready sound projection.
- Affected Run: `remotion-story-producer-overview-run-20260816095655-a55b8f219191`.
- Contained state: terminal `failed` at sequence `19`; all nine Scene results and the GlobalVisual result were accepted. No render-ready artifact, delivery package, or render launch was created.
- Safe symptom: render-ready rejected the Project background-music contribution as not runtime-approved.
- Actual resource state: the Project-local BGM descriptor remained approved, runtime-authorized, license-verified, and checksum-valid.
- Root cause: Project configuration fingerprinted the BGM descriptor before the finalized Project asset-manifest checksum was bound into its Catalog authority. The generated Catalog enriched that same descriptor with `authority.sourceChecksum`, so `sound.json` and the current Catalog held different descriptor fingerprints.
- Containment: preserve the failed Run and its append-only events/results; do not retry render-ready or alter the Run.
- Hardening: compute the ProjectSoundPlan descriptor fingerprint against the exact canonical asset-manifest bytes that are committed, matching Catalog authority enrichment. Regression coverage compares configured sound identity with the descriptor produced from the written manifest bytes.
- Replay: after focused/full verification and an exact local commit, deterministically re-freeze the current Project configuration and start a fresh Run.
