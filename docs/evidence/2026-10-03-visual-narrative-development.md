# Visual narrative development checkpoint — 2026-10-03

This is an engineering checkpoint, not completed video-quality acceptance or a release.
Later completion and remaining limits are recorded in [current status](../ITERATION_STATUS.md);
the pending statements below preserve the checkpoint's historical state.
The user requested a checkpoint after a host disconnect notification. Subsequent real command
execution succeeded; no running production render was interrupted.

## Continued source and sample verification

The committed r4 source later passed 1143/1143 full checks and produced an Attention
same-input/same-narration pair plus a 50-second truly visual-only portfolio through the
formal production chain. A narrated public-0.1.16 portfolio baseline also completed.
All four deliveries passed the public final check. Boundary frames still showed a query
shape change and portfolio layout jump; these samples do not establish quality parity.

The follow-on optional common SVG declaration is shared by both frozen task contexts.
It preserves free subject geometry rather than prescribing a layout. Actual first/last
DOM and perturbation checks detect ignored drawings; effective-font validation covers
viewport meet scaling, inherited sizes and cumulative 2D matrices. Semantic-only old
seams are unchanged. The normal runtime build resolved six integration failures caused
by the older dist missing the new helper. Full `npm run check` then passed 1176/1176,
zero failures or skips, with typecheck, lint, build and host checks exiting 0.

Formal corrected revisions, the narrated portfolio candidate pair, new repeat rendering
and continuous viewing/listening remain pending at this source checkpoint. Frame
observations and technical passes are not full motion or listening approval. The earlier
sections below preserve the previous checkpoint's state rather than current completion.

## Source and existing capabilities

The source aliases resolve to the same checkout. Its starting branch was `axmorf/npm-workspace-open-source`,
clean HEAD `c3431f6638847a2664931c134ae5d61dc9652cd3`. Engineering uses an isolated
worktree and the `axmorf/visual-narrative-quality` branch.
The original checkout remains clean at that HEAD. Production Workspace and existing works
were not modified. No push, npm publication, social publication or deletion of user data occurred.

Both public npm packages already have latest 0.1.16. Its existing motionPlan v2, optional
tracked DOM consumption checks, custom SVG/Canvas/supported 3D, frozen subject handoffs,
isolated revisions, delivery motion review and 24 prebuilt effects were verified rather than
reimplemented. None mechanically certifies visual aesthetics.

## Reference observations

The [reference repository](https://github.com/yihui-dev/awesome-opus5-5-videos) is a collection
of heterogeneous creator prompts and examples. It is not one video-generation engine.

| Representative                                                                                     | Evidence inspected                                                                                                                                                                                                                                                   | Limits                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Henri explainer](https://skillry.dev/ai-videos/opus-5-5/henritoivar-445215)                       | Original and remake loaded and played locally near 6 seconds; paper interface, text-entry state and focal hierarchy observed.                                                                                                                                        | The [prompt record](https://github.com/yihui-dev/awesome-opus5-5-videos/blob/main/prompts/henritoivar-445215.md) says the full original prompt was not published. No implementation source was supplied. |
| [IK motion graphics](https://skillry.dev/ai-videos/opus-5-5/ik-builds-585923)                      | Original and remake played locally near 4 seconds; coordinated paper/UI objects and restrained hierarchy observed. The partial prompt describes a voice-free motion film with meaningful physics, reading rhythm and sound.                                          | Remake tags and creator statements are not proof of original code.                                                                                                                                       |
| [Gradient descent spatial explanation](https://skillry.dev/ai-videos/opus-5-5/anirockshady-032809) | Both videos played locally near 4 seconds; terrain, sphere and explanatory text observed. The [prompt](https://github.com/yihui-dev/awesome-opus5-5-videos/blob/main/prompts/anirockshady-032809.md) explicitly asks for a 3D crest-to-trough algorithm explanation. | Technique tags describe the remake; no original source was verified.                                                                                                                                     |

These were sampled playback observations and screenshots, not continuous full viewing or
listening. Additional prompt records including `verbove-268381` describe deterministic draw
functions, persistent subjects, container/content sequencing and rhythm. That is textual
planning evidence only. No reference media or source was copied into production assets.

## Actual gaps and changes

| Gap in 0.1.16                                                                                               | Implemented change                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story, timing, source and Composition require narration. Removing audio cannot make the story visual-first. | Pure `visual-scene` content, authored frame timing, explicit null narrator/sealed/mastered, empty captions and zero-provider preparation through the same production DAG and four-file validation. Narrated mode remains. |
| An owning worker lacks a real clip before committing its isolated Scene.                                    | Bound `project:task:preview`: existing finalize/check, exact owning-source snapshot, real reduced-resolution full Scene at unchanged fps, decode/frame checks and drift revalidation. Its results remain diagnostic.      |
| Intent timing and frozen seams require manual renderer wiring.                                              | Optional `resolveSceneActionTiming` consumes anchors/action ranges/reading holds; Renderer receives continuity. No fixed visual geometry, transition quota or aesthetic score.                                            |
| Visual-only revision cannot copy a nonexistent narration directory.                                         | Verified visual absence permits an empty narration snapshot and a preserved missing root during same-mode promotion; narrated absence still fails, with rollback regression coverage.                                     |

Create context and installed guides connect mode selection, causal state planning and preview
repair to the real authoring workflow. Contract v2 invalidates Agent artifacts once, without
changing ProductionRevision or rewriting current deliveries. Initial scope rejects mixed
visual/narrated content and mode-changing revisions; such changes require a new Project.

## Verification

The complete `npm run check` passed **1138/1138**, zero failures or skips, including
typecheck, lint, links, Catalog/Registry, settings and Remotion bundle, and host compositions.
It listed CapabilityGallery and both boundary previews; this source checkout has zero user
Projects, so that host Project gate does not prove sample production.

Independent review then identified preview static URLs and role filtering differing from the
final runtime. Both were corrected. The final preview regression suite passed **7/7**, including
executing the generated entry under a nonempty browser static base. Final package builds, package/root typechecks, lint, package boundaries and documentation links all passed.
Local r2 packaging and fresh creator installation completed; its six doctor checks passed.

Earlier scope checks passed: contracts 168/168; create/revision/promotion 60/60; pipeline 39/39;
check/Registry 32/32; runtime/contract 31/31. They overlap and are not added to the full count.
Media process tests use explicit mocks. Source creation, preparation, artifact reuse and
promotion regression fixtures are real isolated filesystem operations with no provider/render.
Old narrated Story/create/PCM fingerprints remain identical to baseline test vectors.

The first full run failed only because added repository Skill text exceeded its existing
context budget. Duplicate instructions were shortened; the budget and validator were not raised.
That failed log is retained alongside the passing rerun.

## Remaining acceptance

No official old/new sample video has been produced in this engineering checkpoint. Two
different themes, same-input before/after comparisons, at least one truly visual-first clip,
actual continuous motion/boundary inspection, reading holds, sound/image alignment and repeat
render evidence remain required. Screenshots, mock processes and automatic success statuses
cannot substitute for those checks or human listening.

Local public baseline packages and a creator-installed baseline Workspace are preserved outside Git.
The initial candidate Workspace is superseded after
the preview corrections; do not patch its installed package. Use freshly packed r2 tarballs
to create another isolated Workspace. Keep renders serial, use each production's fresh native
transport probe/resolver and exact bound workers, and retain one-shot continuation handles.
