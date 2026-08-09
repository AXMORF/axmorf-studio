# GlobalVisual literal no-Props interface incident

- Classification: fixed-flow defect in the shared GlobalVisual TypeScript interface gate.
- Affected run: `ai-in-your-workflow-run-20260809162148-4412426c8943`.
- Contained state: `scenes-running`, last sequence `6`; the non-terminal check wrote no result or derived-state update.
- Safe symptom: a literal zero-parameter `GlobalVisualLayers` component failed the fixed check with `TS2322`, while an equivalent component with an explicitly declared empty Props parameter passed.
- Expected invariant: the fixed check must accept a literal no-Props component and must continue rejecting required, optional, `any`, `unknown`, and union Props.
- Root cause: `GlobalVisualLayersComponent` inspected only React `ComponentProps`. A zero-parameter function component does not expose the same empty Props shape as `React.FC`, so the type gate rejected the protocol's canonical literal no-Props form.
- Containment: the live watcher was stopped; no Scene or GlobalVisual result was submitted to the affected run, and its events and derived state remain untouched.
- Hardening: add a deterministic literal-zero-parameter regression, accept the exact zero-argument function shape, retain all existing loose/required Props rejections, commit the shared fix, then replay production from a fresh Run.
