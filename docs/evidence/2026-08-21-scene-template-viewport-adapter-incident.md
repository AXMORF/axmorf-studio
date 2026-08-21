# Scene template SceneViewport adapter incident

- Classification: fixed-flow defect in reusable Scene template renderer generation.
- Story: `remotion-story-producer-intro`.
- Revision: `revision-5734505291135efa27155d5ba0661fc65dae95427b0059c258c806e7a4d993fd`.
- Failing task: `task-c425ff69fd3566fa152c647eea20d5e80ff163f874d29b23391553f068df85a0`
  (`scene-template`, `configured-intro-scene`).
- Safe symptom: fixed preparation stopped at the Scene component contract compile with `TS2322` before Agent
  dispatch or ExecutionAttempt creation.
- Expected invariant: copied template Renderers implement the current `SceneRendererComponent` contract. They
  receive safe-area-local `viewportWidth` and `viewportHeight`, then adapt those dimensions to the copied
  template component's internal `width` and `height` props.
- Containment: the failed lifecycle was not retried or repaired in place. No workspace, artifact manifest,
  validator result, live owner output, or delivery was hand-edited. Prepared narration artifacts remain
  independently reusable by a new lifecycle.

## Root cause

The SceneViewport clean-break renamed shared Renderer props from `width` and `height` to `viewportWidth` and
`viewportHeight`. Ordinary Scene regression fixtures and the shared runtime moved to the new contract, but
`renderCopiedSceneRenderer()` continued generating the old `width` and `height` input type. The fixed template
validator correctly assigned the generated component to `SceneRendererComponent` and rejected it with
`TS2322`.

The existing fixed-template artifact test used a zero-prop synthetic Renderer. React component contravariance
allows that Renderer to accept the broader shared props, so the test exercised artifact completeness but did
not exercise the real copied-template dimension adapter.

## Repair scope

- Add a deterministic regression for both configured template definitions.
- Update only the shared copied-template Renderer generator to consume local viewport dimensions and map them
  to the template components' existing dimension props.
- Keep the component contract compile and all fixed validators fail-closed.

## Resolution and verification

- `renderCopiedSceneRenderer()` now emits `viewportWidth`/`viewportHeight` props and maps them to the copied
  component's internal `width`/`height` props.
- The regression covers every registered configured template and rejects the removed Renderer prop shape.
- Focused template/runtime/SceneViewport checks passed; full `npm run check` passed 525 tests plus typecheck, lint,
  docs, Catalog, Registry, settings build, Remotion bundle, compositions and source verification.
- The failed Project lifecycle was not resumed or mutated. The shared repair applies to future template
  instantiations; existing Project-local copies remain immutable and require explicit recreation or migration.
