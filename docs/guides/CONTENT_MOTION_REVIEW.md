# Content-driven motion and creative implementation

New content projects freeze `scene-content-motion-v1`. The default worker example is
`motionPlan` schemaVersion 2: explanatory intent, subjects, observable actions, exact
Scene-local narration or authored visual event anchors, reading windows and motivated handoffs. It does not
prescribe trajectories, easing, camera moves, transition counts or reusable components.
Use content-appropriate SVG, Canvas or already supported 3D capabilities. Existing
source/import, asset-rights, safe-area, frame-determinism and technical-delivery checks
remain in force; this is not permission to add network or unapproved dependencies.

Content-motion consumption checks apply to Agent-authored `scene-owner` tasks.
Fixed `scene-template` tasks are exempt regardless of their timeline position;
their copied sources, resources and canonical artifacts retain fixed validation.

Root authoring freezes continuous seams before isolated workers are dispatched.
An optional Scene brief `outgoingHandoff: { subject, trackedState? }` promises a
shared subject to the next content Scene. Both tasks receive the same deterministic
seam identity and subject through `continuity.handoffs`; local bundle validation
rejects missing or invented identities, kind changes and subject drift before
commit. Tracked v1 requires an authored shared boundary pose; intent v2 leaves
geometry to the renderer and temporal review. Undeclared seams use motivated cuts,
and fixed template boundaries cannot promise continuous motion. Cross-Scene
coverage retains its identity and tracked-pose checks.

Tracked schemaVersion 1 remains supported for optional shared state interpolation.
`ProducerMotionObject` requires those tracks and is optional. A reading hold can be
static without a fabricated response to metadata perturbation. The limited server
probe supports already allowed direct `remotion` imports. Browser hooks or Canvas
painting are not evaluated as pixels by that probe.

`project:task:check` and `project:task:commit` report `motionReview` separately from
technical acceptance. `verified-dom-dependency` means sampled output depends on
tracked props; it proves neither visibility nor aesthetics. `unsupported` and
`intent-only` mean `temporal-review-required`, never visual approval. Known tracked
DOM contradictions and nondeterminism still fail. Custom intent can be ignored by a
renderer; detecting that requires inspection of actual previews, not self-reported
metadata or a generic pixel-motion score.

Before commit, a shared-workspace Scene worker can use its exact bound `commands.preview`
to render the full owning Scene at reduced resolution and unchanged fps, then correct the
same declared outputs. `resolveSceneActionTiming` optionally consumes action/anchor/hold
timing; the Renderer `continuity` prop exposes the frozen seam. Preview remains diagnostic
and excludes adjacent Scenes, GlobalVisual and project music. See [visual narrative](VISUAL_NARRATIVE_QUALITY.md).

After a verified technical Delivery, run:

```sh
npm run project:scene:review -- --project <storyId> --motion
```

Compare real action and boundary clips to explanatory purpose, narrated timing,
label reading time and spatial continuity. The action-scoped `revision-feedback.json`
starts unassessed and identifies the meaning/action/range and preserved narration
and assets. Use the existing isolated `project:revise:context` → validate/create →
bind/finalize/check/commit → unique continuation/promotion workflow for corrections.
Do not edit sealed records. Record actual playback/listening limitations honestly.
This review does not waive independent first-use release acceptance.
