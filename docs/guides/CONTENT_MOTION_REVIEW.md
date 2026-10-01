# Content-driven motion and creative implementation

New narrated projects freeze `scene-content-motion-v1`. The default worker example is
`motionPlan` schemaVersion 2: explanatory intent, subjects, observable actions, exact
Scene-local narration anchors, reading windows and motivated handoffs. It does not
prescribe trajectories, easing, camera moves, transition counts or reusable components.
Use content-appropriate SVG, Canvas or already supported 3D capabilities. Existing
source/import, asset-rights, safe-area, frame-determinism and technical-delivery checks
remain in force; this is not permission to add network or unapproved dependencies.

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
