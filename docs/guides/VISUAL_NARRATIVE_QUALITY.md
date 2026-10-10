# Visual narrative quality

This development branch extends the published 0.1.16 workflow. Technical validation proves
identity, rights, timing and deliverable integrity. It does not prove aesthetic quality.

The published baseline already has intent motionPlan v2, custom frame-driven SVG/Canvas/3D,
plan consumption checks, local revision and artifact reuse. This branch connects additional
inputs and runtime behavior; the director and Scene executor still author the visual mechanism.
It does not add an autonomous aesthetic reviewer or guarantee a good first result for every topic.

| Entry                             | Formal consumption                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `project:create:context`          | Select current APIs, resources and a narrated or visual example before strict create.       |
| Scene `outgoingHandoff.visual`    | Root freezes the shared subject; adjacent bound Renderers consume the same SVG data.        |
| Public `resolveSceneActionTiming` | Renderer optionally evaluates its authored action and reading windows at the current frame. |
| Bound `commands.preview`          | Owning worker renders and revises its declared outputs before commit.                       |
| `project:scene:review --motion`   | Root reviews delivered action/boundary clips and scopes an isolated revision.               |

## Choose how meaning reaches the viewer

Use narrated content when the explanation needs spoken qualification or detail. Use visual
content when changes in objects, short copy and event rhythm can carry the explanation.
The create context provides a complete `visualFirst` example. A `visual-scene` has
`meaningId`, `narrativePurpose` and positive integer `durationInFrames`; there are no TTS
chunks. One Story currently uses one content mode, with inherited silent boundary templates.
Changing mode requires a new Project; ordinary same-mode revisions remain isolated.

Visual timing is `authored-frames-v1`: exact authored frames, null sample rate and narration
start, empty segments and captions. Narration source and sealed/mastered records are explicit
JSON null. Preparation calls no provider and creates no fake PCM. Source, artifact and delivery
checks still bind the absence of narration. New Project music uses `content-window`, excluding boundary templates and lead/tail;
it suppresses only content Scene scores and preserves template music. Legacy scopes retain their semantics until an explicit
supported revision. An AAC mux track can be silent; it is not evidence of a narrator.

## Plan a mechanism, then choose a technique

For each causal point decide what the viewer already sees, what changes and why that change
allows a new conclusion. Express those decisions in the existing Scene brief and motionPlan;
there is no mandatory metaphor, scene count, transition count, geometry or camera quota.
Choose SVG, Canvas, supported 3D or localized media for that specific mechanism. Long text
fades and decorative movement alone cannot demonstrate a causal relationship.

Keep useful subjects alive through state changes. A Scene brief can freeze an outgoing
subject shared with the next content Scene. Both workers receive that seam through their
immutable context and the Renderer `continuity` prop. The seam binds identity and meaning;
it does not mechanically guarantee matching pixels. Intent v2 leaves the implementation free.
Tracked v1 can bind an exact boundary pose. Neither creates extra transition frames or trims
speech. Review both sides of the actual boundary.

For a subject that must preserve its visible pose and appearance, Root can freeze
`outgoingHandoff.visual` before dispatch. It is a free declarative SVG drawing tree
(`viewBox` and safe SVG elements/attributes), copied unchanged into both immutable task
contexts. It contains no executable expression, external media or preset layout. The
public `SceneContinuityVisual({handoff})` component renders that same drawing and stable
SVG identities in each Scene's viewport. Each Scene should move into or away from the
common state; do not replace the drawing for a single boundary frame or hide a jump with
a crossfade. Only the shared subject needs this representation. Other SVG, Canvas, 3D
and within-Scene composition remain authored choices.

Use `<SceneContinuityVisual handoff={continuity.incoming}/>` or the continuous outgoing
handoff. At the seam it must have neutral viewport ancestors: even a visually identity
transform or an overflow-hidden wrapper conflicts with that check. A Fragment root can
keep the shared drawing independent from the Scene's animated camera and typography.

For these explicit visual handoffs, task checks compare the actual first/last rendered
SVG subtree with the frozen drawing, check neutral viewport ancestors, and perturb the
input to detect a copied or ignored drawing. Contradictory supported DOM output blocks
commit. Semantic-only legacy seams make no such proof claim. Unsupported browser effects
are explicitly unverified: this bounded SSR check does not prove occlusion, CSS paint,
the behavior of other objects, semantic or aesthetic quality. Final boundary playback
remains necessary.

The same viewport font minimum also applies to text inside the frozen SVG data. Its
effective size includes `viewBox` meet scaling, inherited text sizes and cumulative 2D
transforms. Shapes without text remain unrestricted by the font check. This preserves
the existing readability boundary; it is not an aesthetic score.

`resolveSceneActionTiming({shots, syncAnchors, actionId, sceneFrame})` is an optional public
runtime helper. It resolves anticipation, change and reading hold from the authored action
and event anchor. End frames are exclusive; the last changing frame reaches the result. It
uses only the requested frame and plans, so seeking backward gives the same state. Geometry,
easing, follow-through and camera remain the renderer's choices.

## Direct attention and sound

Plan framing and hierarchy in the existing compositionIntent and motionIntent: what fills
the viewport, what becomes a close-up, and what meaningful event takes over next. Short
claims can be large visual actors. Geometry, particles, masks or morphs can carry the subject's
aggregation and transformation; choose them for the idea rather than repeating an effect
recipe. Alternate action with the time needed to read, instead of filling a Scene with a
long static result.

The create context exposes `soundResources`: current approved, runtime-approved audio with
verified licenses, plus `soundDefaults` configuration state and volume without private paths.
Select effect IDs into the Project resource pool and the relevant Scene allowlist. Use each
descriptor's onset or swell-center guidance to offset startFrame against the visible anchor;
the entire media duration must fit the Scene. Sparse accents support the motion and voice.

New Workspaces default to automatic approved global loop selection. The context's `backgroundMusic.candidates`
lets the Agent choose by the subject and mood through create input `{mode:"selected",resourceId,volume?}`;
omission inherits settings, null explicitly disables music, and an empty library reports unavailable.
Creation freezes the selected license and bytes in the Project. One Composition-owned track plays across all Scenes,
including unvoiced boundaries and lead/tail; Scene scores are suppressed while effects remain independent.
Naming music in a brief or Scene resource allowlist alone does not enable it. An isolated Scene preview excludes Project
BGM, so review the final music, effects and narration when used together. Technical audio
levels and successful decode do not establish the subjective mix.
Original user-local loop music is distinct from package seed media; see
[sound selection and retirement](SCENE_SOUND_EFFECTS.md). Narrow existing music gain/envelope
and immutable boundary playback revisions use the [strict revision input](PROJECT_REVISION.md).
They have regression coverage but still need a new complete candidate and perceptual validation.

## Render while the owning task can still change

After a successful shared-workspace Scene bind, use its exact `commands.preview` before
commit. The fixed command finalizes and validates the same declared outputs, snapshots their
bytes, and renders the complete Scene at unchanged fps and a reduced resolution. It verifies
frame count, decode and source/media drift, and returns the source fingerprint and clip path.
Diagnostics stay outside task outputs and content identity. Controller-IO previews are
explicitly unavailable; that transport does not gain filesystem access.

Compare real playback with the causal action and reading windows, then amend only the owning
declared outputs. For a visual explanation, also check whether the muted sequence communicates
the main point without a narrator. For narrated content, compare changes with actual spoken
chunks. Record uncertain observations and playback/listening limits honestly.

The task clip omits adjacent Scenes, GlobalVisual and project music. After the fixed four-file
delivery, use `project:scene:review -- --project <storyId> --motion` to inspect action and
boundary clips and target isolated revisions. Preview existence, screenshots, DOM dependency
and generic motion scores do not constitute semantic or aesthetic approval.
