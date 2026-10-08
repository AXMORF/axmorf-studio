# Film direction

Root reads this for new films, substantial creative revisions and media review. Bound Scene executors use
[Scene execution](#scene-execution) after binding. A local correction preserves priorSource and applies only its delta.
This guide supplies creative decisions, not new JSON fields, file access or a visual approval gate.

## Plan the film

Start with what the audience should understand and the observable change that conveys it. Match complexity to the brief:
a pipeline proof does not demonstrate a requested creative film, while extra objects or camera moves do not prove quality.
Choose a visual language appropriate to the subject; symbolic geometry, actual UI, illustration and supported 3D are options.

Write concept, subject, cameraIntent, rhythmIntent and soundIntent in story.filmPlan. In each Beat's scenes[] brief, describe
the visible cause, action and consequence, focal subject, framing and result hold. Make each consequence motivate the next
Beat. A list of headings, decorative motion or camera drift alone does not explain a process.

Choose visualScenes by continuity of subject, space and action. A continuous short film can use one owner across many
semantic Beats; a new space or chapter can justify another owner or a cut. Retain per-Beat meaning and timing. Freeze
cross-owner handoffs through the supported contract; fixed bookends stay separate. Put creative choices in the briefs
so an isolated executor can implement them without the Root conversation.

Budget the requested total including inherited bookends and lead/tail. For authored-frames, allocate only the remaining
body frames; narration estimates still need PCM measurement. Bookend soundCues are independent of body BGM. A request
for no music or audio needs their inspection too. Resolve conflicting requirements before create using existing user
instructions, asking only if a material conflict remains; do not silently disable inherited boundaries.

Choose resources for actual use. Top-level create input resources.allowedResourceIds is an admissible pool; narrated candidateResourceIds
offers choices. Silent presets instead require exact consumption: buildSilentScenePreset receives sorted, unique resourceIds,
and that Beat's candidateResourceIds must match them. Do not freeze an entire Catalog shortlist into every preset and force
irrelevant effects later. Validate the complete input with current public contracts; failed input generation stops dependent create.

## Scene execution

Use only bound current context and allowed resources, never historical Scenes or images as a creative template. Preserve
object identity and causal state across coveredBeats using the uninterrupted sceneFrame. Evaluate motion from frames,
including arbitrary seeks; analytic follow/settle can express inertia without accumulating render history.

Separate world geometry, camera transforms and stable reading text. Give each transform one owner; do not accidentally
apply the same rotation or scale in two camera layers. Move the camera to reveal detail, follow an action or expose a
relationship. Use depth/parallax when it clarifies space, and let the camera settle for the result. Choose indexed shape
correspondence, foreground occlusion or matched action when they carry the subject into the next state; a deliberate cut
or fade is also valid. Check position, scale, direction and motion phase at the join instead of resetting at each Beat.

Plan anticipation, change, settle and a readable result within the frozen timing. Contrast motion density with genuine
pauses; do not keep every layer moving. Keep important text in a stable reading layer when world-camera scaling would
compromise it. Declare provable sizes on text-bearing elements and check actual viewport size, scale, contrast and spacing.

Use the same meaningful events for visual actions, sync anchors and sound-plan contributions. Align an impact to its
onset or a whoosh to its described swell center, including the required source offset. Use only approved audio; the
SoundDesignTrack owns playback. Music-led editing needs an available, inspected track and its phrasing; cue-led effects
are a different choice. No universal BPM, cue quota or loudness follows from a previous film. Leave space for narration
and quiet; source selection and technical synchronization do not establish a good mix.

## Review the actual media

When creative quality is central, plan frozen project:preview before the unique continuation, after native worker
completion. Budget review within the attempt deadline. Committed artifacts remain immutable; improvements use the
strict exact-base revision flow after current delivery, without rerunning providers to change visual taste.

Watch complete cause/action/result windows and inspect internal Beat joins, owner seams, camera extremes and dense text.
Still samples can show layout and state, but cannot prove smooth velocity or timing. Assess audible accents, masking,
balance and silence by listening when available. Muted playback and decoded-audio measurements are technical evidence.

Bind observations to the media checksum and previewBuildId or DeliveryBuildId. State sampled frames versus continuous
viewing, audio measurements versus listening, observed defects and unobserved items. Keep unavailable judgments
not-assessed; task counts, review receipts and EOF success do not certify creative quality. A diagnostic tool failure
is reported separately from a verified delivery; do not rewrite chapters, artifacts or checks to conceal it.
