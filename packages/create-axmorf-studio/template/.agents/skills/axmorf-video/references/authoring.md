# New Project authoring

Run the read-only command first:

```bash
npm run project:create:context -- --project <storyId>
```

It returns `example`, `fieldExamples`, `durationBudget`, current `styleProfiles`, capability API guides, licensed `soundResources`, redacted `soundDefaults`, `backgroundMusic` candidates/status, publishing collections, render defaults and inherited boundary templates. Adapt
`example` to the user's brief and write only that object to `inputs/<storyId>.json`. Do not pass the enclosing context response to
create. Never start with `{}` and discover fields by repeatedly invoking create. For exact field shapes:

```bash
npm run project:create -- --schema
npm run catalog:query -- --kind style-profile
npm run catalog:query -- --kind asset
```

Follow `agentHandoff` before create: adapt its example budget to the user's target, then report the selected boundaries and budget as an intermediate progress message, not a final answer. Continue in the same turn: write the adapted input and execute `nextCommand`. The report does not pause production or request another user reply; existing video authorization needs no new confirmation. The example target is not the requested target.

The schema is generated from the installed version. It describes JSON shape; cross-field semantics, current Catalog choices,
caption budget and licensing are still checked by create. Do not read package internals or fetch development-branch contracts.

- Resolve each render field from the explicit user request first, then `renderDefaults` for unspecified fields.
  Set optional `render.width`, `render.height`, `render.fps`, and `render.locale` only when requested. An orientation
  or aspect ratio requires concrete width and height; for example, a requested 16:9 landscape video can use
  `fieldExamples.render` (1920 by 1080), while retaining configured fps and locale by omission. Do not copy this
  landscape example when the user did not request it. Do not leave dimensions only in textual requirements or
  modify saved defaults for one Project. Width/height must be positive even integers; fps is an integer from 1
  through 120; locale is canonical BCP 47. Recalculate duration budget if fps changes. Before production, compare
  the successful create response `render` with the request; stop before provider calls on a mismatch.
- Use lowercase hyphenated `storyId`. Use registered `styleProfileId` values (without the `style.` Catalog ID prefix).
- Each content beat owns one `meaningId`, one Scene brief and one publishing chapter in the same order.
- For a no-narration request, adapt the complete `visualFirst` field example. A `visual-scene` uses `meaningId`, `narrativePurpose` and positive integer `durationInFrames`, with no TTS chunks. Pure visual Story timing is authored frames; narrator and sealed/mastered records are null, captions/segments empty and preparation zero provider. Keep short on-screen copy readable, show causal state changes and budget reading holds; do not strip audio from a narrated Project. One Story currently uses one content mode.
- Write each content Scene as a visible causal sequence: identify the subject and its initial state, the action that changes it,
  and the resulting state the viewer should understand. Put concrete staging and focal hierarchy in `compositionIntent`, and
  describe the timed visible action in `motionIntent`. For narrated content tie the change to the relevant `ttsChunk`; for visual content use its authored event frames. Keep the visual subject consistent
  with `visualStyle` and `continuityBrief`. For longer narration, plan distinct framing or visible state changes at semantic
  turns, then hold the result briefly; camera drift alone does not add information. Keep text and chart labels readable after
  camera scaling, use theme roles for every foreground, and reserve the caption region when captions are present. A generic diagram or decorative movement is not a substitute for that sequence.
- Before create, Root selects continuous seams: add `outgoingHandoff: { "subject": "the same subject and meaning across the boundary" }` to the preceding content Scene brief. Both isolated tasks receive the same immutable `scene.taskInput.continuity.handoffs` ID, subject and outgoing kind. Leave the field absent for a motivated cut; fixed template boundaries cannot promise continuous motion. Tracked v1 continuous seams also need a complete Root-authored `trackedState` boundary pose. Intent v2 leaves geometry and implementation free. Do not invent handoff IDs in workers or coordinate by reading another workspace.
- For a shared SVG subject, Root may also author the optional `outgoingHandoff.visual` safe SVG tree and viewBox. Both tasks consume that frozen boundary drawing with public `SceneContinuityVisual`; keep its viewport ancestors neutral at the seam. Other geometry and frame-driven Canvas/3D remain free. Read the returned capability guide; declaring a subject alone does not ensure the same visible pose.
- New content Projects freeze `scene-content-motion-v1`: use intent-first motionPlan v2 for subjects, explanatory actions, sealed narration or authored visual event anchors and reading holds. Custom frame-driven SVG, Canvas and supported 3D are allowed. Tracked v1 and `ProducerMotionObject` are optional; their limited DOM dependency probe checks declared tracks without proving visibility or aesthetics. Intent-only and unsupported results require actual temporal review. Match frozen handoffs, explain deliberate holds/cuts and inspect real action/boundary previews; no camera quota or fixed metaphor. Fixed `scene-template` tasks retain canonical validation and are exempt from Agent content-motion checks.
- `ttsChunks` contains objects with `chunkId` and `ttsText`, not strings. Keep each within 72 caption display half-units; shorten or
  split by natural meaning when needed. Audio sample measurements determine actual duration.
- The duration brief includes inherited intro/outro Scenes. Report their selection before create; do not silently disable them to
  fit a short duration. Use `durationBudget.boundarySeconds` and `leadAndTailSeconds` to subtract fixed time from the requested
  **total** duration, then budget speech and pauses within the remainder. The returned budget describes the context example;
  recalculate it when adapting the target. Use a conservative text length for the selected language/voice; do not claim a text
  estimate is an exact audio duration. If fixed boundaries leave no narration time, resolve that brief conflict before create.
  Omit `sceneTemplates` to inherit. Only an explicit user choice permits null or different templates.
- `production.additionalRequirements` is an array of structured objects, never strings. Keep `[]` when no additional constraint
  is needed. For a user constraint that is not already represented, adapt the complete nonempty object in
  `fieldExamples["production.additionalRequirements"]`; preserve its required fields and use the user's actual statement.
  A `schema-validation-failed` response supplies structured field paths and a repair example for this field. Fix the draft
  without dropping the user's constraints or changing the contract.
- `visualStyle.theme` accepts dark (default), light, or an object with background/primaryText/secondaryText/accent opaque six-digit hex colors. All foreground roles must contrast with background by at least 4.5:1. Use theme as the numeric authority; artDirection.palette describes intent and cannot override it. Logo shapes, brand fonts, layout and animation remain fixed. Existing themed revisions must preserve or replace the theme; legacy immutable boundaries cannot adopt a theme through revision.
- Evaluate the returned capabilities and authoring guides before self-authored geometry. Match semantic camera, chart, typography, media and motion needs to public APIs; include chosen IDs in the Story pool and each Scene candidateResourceIds. Empty selections are valid when no API fits, with a concrete reason in the visual intent. Query Catalog before selecting media; never invent resource IDs.
- Narration provider, voice and publishing defaults come from settings. Context deliberately omits connections and credentials.
- Source assets must have Workspace ownership and validated manifests. Do not download random files to bypass asset admission.
- For motion sound effects, query `npm run catalog:query -- --kind asset --tag motion-sync`. The bundled AXMORF effects are prebuilt audio, not a generation task. Put selected IDs in both resources.allowedResourceIds and the Scene candidateResourceIds; describe their visible action in soundIntent. At execution, select only availableResources and follow the descriptor's onset or swell-center timing hint in sound-plan.json. SoundDesignTrack owns playback; do not also mount the same audio in the Renderer.
- Choose an approved loop from `backgroundMusic.candidates` by topic/energy/mood; set create input `backgroundMusic:{mode:"selected",resourceId,volume?}`. Omission inherits auto/file/null settings (new Workspaces default auto); auto matches the current brief. Explicit `backgroundMusic:null` disables all scores, retaining narration/effects. Report create's actual selection or unavailable state before preparation. A selected score is frozen Project-local and loops across the entire composition, including unvoiced boundaries and lead/tail; Scene effects stay independent and second Scene scores are suppressed. Catalog discovery alone never proves enabled BGM. Prefer approved loop masters over previews; private user music is separate from bundled media. Review the complete mix; task execution speed does not control music playback.

Once the input is complete, execute its returned `nextCommand`. A successful `project-created` response is authoring only.
For existing authoring, use `project:revise:context`, `project:revise:validate`, and `project:revise`; never overwrite the live Project.

## Existing Project revision

First obtain the exact current base, without editing live authoring:

```bash
npm run project:revise:context -- --project <storyId>
```

Revision has no `--schema` flag. Read the installed public input schema, not package internals:

```bash
node --input-type=module -e 'import {ProjectRevisionInputSchema} from "@axmorf/studio/contracts"; console.log(JSON.stringify(ProjectRevisionInputSchema.toJSONSchema({io:"input"}), null, 2));'
```

Current patch sections are `boundaryScenes`, `brief`, `globalVisual`, `publishing`, `scenes`, `sound`, `story`, and `visualStyle`.
Use only fields supported by the installed schema. Preserve content meaningId/order and narrated/visual mode.
For a local Scene layout correction, take `revisionContext` from the successful context result, select an existing
`targetMeaningId`, and describe the observed correction in `revisedCompositionIntent`. Preserve the full Scene list and
all other Scene fields:

```javascript
import { ProjectRevisionInputSchema } from "@axmorf/studio/contracts";
// axmorf-scene-revision-input
const input = ProjectRevisionInputSchema.parse({
  schemaVersion: 1,
  contractVersion: "project-revision-input-v1",
  storyId: revisionContext.storyId,
  baseRevisionId: revisionContext.baseRevisionId,
  baseDeliveryBuildId: revisionContext.baseDeliveryBuildId,
  patch: {
    scenes: revisionContext.editable.scenes.map((scene) =>
      scene.meaningId === targetMeaningId
        ? { ...scene, compositionIntent: revisedCompositionIntent }
        : scene,
    ),
  },
});
```

Write only `input` to a Workspace-relative JSON file, not the context response or `revision-feedback.json`.
Keep VisualStyle, GlobalVisual, Story/TTS and unaffected Scenes unchanged for a local correction.
Changing shared VisualStyle for one Scene invalidates unrelated visual tasks. There is no `patch.cover` or Cover-only
revision API; if the installed schema cannot express a scoped correction, report that limitation instead of inventing a field.

For boundary playback, copy the full context list and preserve identities/order. Author only `meaningId` and
`playbackRange`: a source-frame `{startFrame, endFrame}` window (end exclusive), or null to restore the full immutable template.
Optional `musicVolume`, `musicFadeInFrames`, `musicFadeOutFrames` inside the range affect only its background music.
Do not submit derived duration/fingerprints or edit template bytes. `patch.sound` takes the full context ProjectSoundPlan;
only existing volume/fadeInFrames/fadeOutFrames may change. Preserve track/resource IDs, descriptor fingerprints, order,
loop and playbackScope. Revision admits no new media. A runtime policy upgrade may require formal unchanged-current
production before a fresh revision context; never patch publish.json or sealed audio to bypass a stale base.

```bash
npm run project:revise:validate -- --input <repository-relative-json>
npm run project:revise -- --project <storyId> --input <repository-relative-json>
```

Validation accepts only `--input`, never `--project`. After candidate creation, carry its exact `--candidate` on
inspect/prepare/task/continuation/recovery commands and return to Root workflow step 4: fresh current capability verification,
one successful execution resolve, inspect, user-visible readiness/cost/reuse/structured invalidation report, then prepare.
This applies to autonomous corrections within the same request; no earlier production's probe or resolver result carries over.
If inspect shows unrelated dirty tasks, narrow the raw patch, validate/create a new candidate and repeat that entry before prepare.
A complete visual rebuild does not prove local reuse.

Validation errors are normal Agent-owned editing work: fix the draft or exact declared task output and rerun the same check.
An already-authorized video request includes ordinary visual implementation choices; do not ask the user to approve changing a
DOM element or adjusting typography. Ask only for a material brief change, missing external authorization or an actual blocker.

`project:produce:inspect` reports the current duration budget; before narration is sealed the actual duration is unknown.
Prepare and fixed completion report the measured total and `deltaSeconds`. Report material deviation from the requested duration.
A target is advisory unless the user states a strict limit; do not invent a tolerance or claim exact compliance. Never trim sealed
speech, silently disable boundaries or restart an attempt to force a duration. A requested change uses the isolated revision flow.
