# New Project authoring

Run the read-only command first:

```bash
npm run project:create:context -- --project <storyId>
```

It returns `example`, `fieldExamples`, `durationBudget`, current `styleProfiles`, publishing collections, render defaults and inherited boundary templates. Adapt
`example` to the user's brief and write only that object to `inputs/<storyId>.json`. Do not pass the enclosing context response to
create. Never start with `{}` and discover fields by repeatedly invoking create. For exact field shapes:

```bash
npm run project:create -- --schema
npm run catalog:query -- --kind style-profile
npm run catalog:query -- --kind asset
```

Follow `agentHandoff` before create: adapt its example budget to the user's target, then report the selected boundaries and budget in a separate message. The example target is not the requested target; existing video authorization needs no new confirmation.

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
- Each narrated beat owns one `meaningId`, one Scene brief and one publishing chapter in the same order.
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
- Empty resource selections are valid for self-authored geometry. Query Catalog before selecting media; never invent resource IDs.
- Narration provider, voice and publishing defaults come from settings. Context deliberately omits connections and credentials.
- Source assets must have Workspace ownership and validated manifests. Do not download random files to bypass asset admission.

Once the input is complete, execute its returned `nextCommand`. A successful `project-created` response is authoring only.
For existing authoring, use `project:revise:context`, `project:revise:validate`, and `project:revise`; never overwrite the live Project.

Validation errors are normal Agent-owned editing work: fix the draft or exact declared task output and rerun the same check.
An already-authorized video request includes ordinary visual implementation choices; do not ask the user to approve changing a
DOM element or adjusting typography. Ask only for a material brief change, missing external authorization or an actual blocker.

`project:produce:inspect` reports the current duration budget; before narration is sealed the actual duration is unknown.
Prepare and fixed completion report the measured total and `deltaSeconds`. Report material deviation from the requested duration.
A target is advisory unless the user states a strict limit; do not invent a tolerance or claim exact compliance. Never trim sealed
speech, silently disable boundaries or restart an attempt to force a duration. A requested change uses the isolated revision flow.
