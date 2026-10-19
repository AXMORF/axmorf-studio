# Scene safe-area coordinate-space incident

- Classification: fixed-flow defect in the shared Scene runtime boundary and one authoring-governance gap.
- Affected current deliveries:
  - `introducing-github`, build `build-faf841a76c5b30f979c435bc6c72803124c4160c5a435b2c71f2f086e8ccc4b2`;
  - `remotion-story-producer-overview`, build `build-b186d34595fdfdfabc11357da5e8d9284472df74105136f834c0386201ad7d37`.
- ProductionRun/terminal sequence: not applicable. The defect was observed in the default build-centric delivery path, which does not create or replay a ProductionRun.
- Safe symptom: absolute Scene content centered from the frozen full Composition width rendered 90 px to the right in 1080 x 1920 output. IntroducingGitHub body graphics and the shared configured outro exposed the same displacement.
- Expected invariant: Renderer `width` and `height` describe the full Composition coordinate space. Composition-owned `SceneSafeArea` clips content to the frozen inset without changing the coordinate origin.
- Root cause: `SceneSafeArea` used `top/right/bottom/left` to make the mount element itself the inset rectangle. Renderer children therefore resolved absolute positions from an origin already translated by the left/top inset while still receiving full Composition dimensions.
- Governance finding: an untracked root `scripts/gen-briefs.ts` hard-coded the IntroducingGitHub story ID and resource IDs and directly wrote production authoring JSON outside the repository CLI/application/domain layout.
- Containment: preserve the prior delivery packages until their replacements pass the exact four-artifact build checks. Do not patch individual Scenes with negative inset offsets or treat the one-off script as a supported production command.
- Hardening: keep the mount full-frame and apply the frozen inset as a clip path; bind the full-frame coordinate-space semantic into the shared boundary fingerprint and validator; state the coordinate contract in the Scene owner Skill; reject loose files directly under `scripts/`; remove the one-off script; rebuild and visually inspect both affected deliveries.
