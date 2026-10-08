# Continuous visual authoring upgrade

Status: implementation and engineering verification complete. This is the engineering scope
approved on 2026-10-07; current implementation facts remain in `docs/ITERATION_STATUS.md`.

## 归档说明

已实施方案的工程快照，不作为当前行为或完成证据；最终检查结果以当前状态文档和升级证据为准。

## Objective

Keep semantic StoryBeats and one Story Composition, while allowing a continuous visual Scene
to own multiple consecutive Beats. Preserve content-addressed tasks, exact executor ownership,
sample-authoritative narrated timing, isolated revisions and verified four-file delivery.
Adopt OneTake's planning and review methods with original Remotion implementations.

## Implementation sequence

- [x] Regress and fix one-frame overlay interpolation and diagnostic-only completion authority.
- [x] Add strict ordered visual grouping, aggregate owning task/context and persistent runtime mounts.
- [x] Carry grouping through coverage, revision inputs, prior source, compilation and source gates.
- [x] Add source-ready candidate/live draft previews with isolated receipts and no promotion.
- [x] Add deterministic world/camera, morph/follow and semantic retiming primitives and examples.
- [x] Add authored-frame visual-only production and shared visual/sound event semantics.
- [x] Add reference rhythm diagnostics and real temporal review without aesthetic acceptance claims.
- [x] Align repository/package/creator documentation and skills; run focused and complete checks.

## Constraints and validation

Single-Beat Scenes remain the degenerate grouping case. Groups must exhaust StoryBeats in order,
contain no overlaps/gaps or mixed fixed-template ownership, and declare complete immutable inputs.
One owning worker writes one Scene source graph. Composition owns captions/narration/background.
Old authored files and deliveries are never silently migrated. Preview output is independent of
current delivery and must bind source bytes, timing and render profile.

Validate group boundaries, persistent frame progress, missing/duplicate coverage, local invalidation,
candidate rollback, stale preview rejection, no-provider visual timelines, deterministic fractional
sampling and source/package consumer boundaries. Use real still/short render evidence for the new
runtime in an isolated proof; do not modify existing user Projects or publish packages.
