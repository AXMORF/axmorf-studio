# Scene template outro lockup centering

- Classification: visual geometry defect in the shared configured outro Scene template.
- Surface: `DefaultOutroPreview`, portrait frame 211; the supplied review screenshot showed the same state.
- Safe symptom: the follow button was centered, while the combined AXMORF mark and wordmark appeared right of the
  shared center axis.
- Expected invariant: the mark + wordmark lockup has one responsive bounding box centered on the local viewport in
  portrait and landscape. The mark begins centered before expanding into its final position; the follow button
  remains independently centered on the same axis.

## Root cause

The mark and wordmark used separate absolute positions. The mark's final left shift was a hand-tuned constant, while
the wordmark width came from font layout. Each element looked locally reasonable, but their combined bounding box
was never centered.

## Repair and verification

- `resolveBrandFollowLockupLayout()` now derives one explicit responsive lockup width and centered left edge.
- The mark animates from the lockup center to its final left edge; the wordmark occupies the remaining fixed-width
  region with deterministic spacing.
- Regression coverage proves the final lockup center and initial mark center for 1080×1920 and 1920×1080.
- Real `DefaultOutroPreview` stills at frames 150 and 211 verified the centered initial mark and final lockup.
- Full `npm run check` passed 525 tests plus typecheck, lint, docs, Catalog, Registry, settings build, Remotion bundle,
  compositions and source verification.
- No Project-local template copy, production artifact or delivery was edited. The shared capability change affects
  system preview and future Project creation only.
