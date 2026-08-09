# Whole-film GlobalVisual Agent orchestration

This reference owns the GlobalVisual side of the mandatory post-freeze N+1 production Agent protocol.
The independent Cover owner runs concurrently under
[cover-agent-orchestration.md](cover-agent-orchestration.md) but never joins production state.

## Keep one exclusive owner

Create exactly one whole-film GlobalVisual child Agent concurrently with the N Scene owners. Give it
only the frozen GlobalVisual assignment, GlobalVisual brief, Story and StoryBeat timing windows,
VisualStyleSpec, readability/caption safe area, ResourceCatalog allowlist, and its exclusive paths.
Tell it to build the simplest full-frame background board that remains recognizably aligned with the
current VisualStyleSpec. It may use restrained color, gradient, or subtle texture, but must not invent
standalone decoration, continuity motifs, or Beat-specific visual changes unless the user explicitly
requested them and the frozen brief carries that requirement.
The root Agent owns shared inputs, result submission, central state, generated projection/assembly,
staging, and commits. Never author GlobalVisual deliverables in the root task or reuse a Scene owner.

The owner writes only:

- `src/projects/<storyId>/global-visual-plan.json`;
- `src/projects/<storyId>/global-visual/GlobalVisualLayers.tsx` and its local static dependencies;
- `src/projects/<storyId>/global-visual/selected-resources.json`;
- assignment-owned public assets under `public/projects/<storyId>/global-visual/`.

It must preserve all other changes and does not read Scene outputs, Scene results, historical
Compositions, previews, stills, or layouts. It may use only assignment-approved resources and approved
shared capabilities. It does not write package/result/event/state/projection/assembly files, stage,
commit, or create nested Agents.

## Preserve the visual-only boundary

`GlobalVisualLayers` is a style-aligned background board, not a second visual storytelling layer. Keep
it visually quiet and subordinate to every Scene. It must not render captions, narration, audio,
visible text, Scene semantics, safe-area panels, standalone decoration, a generic DSL, automatic
layout, or an automatic director. Do not vary it by StoryBeat unless the frozen brief contains an
explicit user requirement. Use Remotion frame APIs only, keep the root non-interactive, and keep JSON
free of executable expressions or module paths.

Export `GlobalVisualLayers` as a no-Props React component. Do not declare required Props and do not
accept GlobalVisual plan/projection Props: the generated Composition already parses those artifacts
and verifies their identities before mounting `<GlobalVisualLayers />`. The fixed validator checks the
shared component type, and render-ready compiles the target Composition import graph before it may
write the ready artifact.

## Check, rework, then root-submit

The child runs:

```bash
npm run production:global-visual:check -- --run <runId>
```

A failure writes no immutable result, event, or derived state. Return the fixed finding to the same
owner and rerun the check. After `ready-to-submit`, the root audits changed paths, reruns the check,
then invokes exactly one of:

```bash
npm run production:global-visual:submit -- --run <runId>
npm run production:global-visual:fail -- --run <runId> --code <CODE> --description "<safe description>"
```

Use fail only for a genuine terminal owner failure. The watcher reads immutable result contracts
only; repository files never record or monitor Agent, task, thread, progress, conversation, logs, or
heartbeat state. Keep polling until all N+1 results are accepted or the Run becomes terminal.
