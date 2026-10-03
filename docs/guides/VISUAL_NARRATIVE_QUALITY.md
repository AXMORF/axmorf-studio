# Visual narrative quality

This development branch extends the published 0.1.16 workflow. Technical validation proves
identity, rights, timing and deliverable integrity. It does not prove aesthetic quality.

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
checks still bind the absence of narration. Music uses the `content` scope and excludes boundary
templates. An AAC mux track can be silent; it is not evidence of a narrator.

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

`resolveSceneActionTiming({shots, syncAnchors, actionId, sceneFrame})` is an optional public
runtime helper. It resolves anticipation, change and reading hold from the authored action
and event anchor. End frames are exclusive; the last changing frame reaches the result. It
uses only the requested frame and plans, so seeking backward gives the same state. Geometry,
easing, follow-through and camera remain the renderer's choices.

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
