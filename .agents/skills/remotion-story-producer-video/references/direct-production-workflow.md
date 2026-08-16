# Direct production workflow

This is the root Agent path. The Agent designs. Scripts freeze, validate, and execute; they do not choose creative direction.

## 1. Design and freeze the Project

Author a concise brief and causal narrated StoryBeats. ProducerConfig selects optional boundary Scene
templates; `project:configure` copies them into the new Project. Silent Scenes have no TTS, fake text, CaptionCue,
or sealed segment. Narrated content uses Agent-authored ttsChunks as atomic units. Titles,
narration, descriptions, and 6–7 unique whitespace-free topics are Project data. Choose a configured
`publishingCollections` ID and author `producer-input.json`, then run:

```bash
npm run project:configure -- --project <storyId> --input src/projects/<storyId>/producer-input.json
```

Do not manually copy ProducerConfig values or mechanically split/rewrite narration.

## 2. Produce the narrative baseline

```bash
npm run production:preflight -- --project <storyId>
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
```

Use host permission first. The command owns TTS, sealing, mastering, timing, registry, evidence, and
AutoCheck. Do not reproduce steps, warm TTS, add fallback, or weaken the sandbox. Require `baseline-ready`.

For implementation changes, run `npm run check` with host permissions and `npm run compositions` with
host permissions before dispatch.

## 3. Design visuals and freeze owners

From current Story/timing, author VisualStyleSpec, resource choices, Beat-specific Scene briefs, and a
minimal continuous GlobalVisual brief. Cover remains independent and assignment-derived.

Bind copied silent Scene briefs exactly to their frozen preset visual/sound/resource identities. SemanticTiming
already resolves duration. Template audio overrides are authoring-only and become Project-local at configure.

Choose asset-led, code-led, or hybrid; query ResourceCatalog first. For an external image, use MCP only
for acquisition, then run
`npm run project:asset:import -- --project <storyId> --receipt <absoluteReceiptPath> --role <scene-visual|global-visual>`
before freeze. Only the imported Project-local ID enters plans. Receipts, candidates, provider URLs,
credentials, SDKs, video/audio imports, and Scene/MCP assets for Cover remain forbidden.

```bash
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
```

Scene freeze owns each Project-local Catalog snapshot.

Require ordinary Scene assignments for every Beat, plus GlobalVisual and Cover. Record paths,
`templateMeaningIds`, and `ownerMeaningIds`. Templates are script-verified/direct-resulted; no generic check/review;
only `ownerMeaningIds` need Scene tasks. Do not rewrite frozen inputs.

## 4. Start automation, dispatch, and exit

Run the watcher launcher with host permission:

```bash
npm run production:watch:start -- --run <runId>
```

Require `watcher-started`, intent, and receipt. Intent without receipt is permanently ambiguous. The
watcher alone consumes receipts and owns validation, convergence, render-ready, Cover, and delivery.

Use `create_thread` per `ownerMeaningIds` Scene, GlobalVisual, and Cover. Do not dispatch
`templateMeaningIds`. After creation calls, exit without wait/read,
status, check/submit, compositions, or delivery commands. Report failed calls exactly. Spawn
acknowledgement never proves MP4 completion.
