# Direct production workflow

This is the root Agent's normal path. Agent design decisions and fixed commands alternate; scripts
freeze, validate, and execute contracts but do not choose creative direction.

## 1. Design and freeze the Project

Author a concise brief, causal StoryBeats, and meaning/rhythm-based Agent-authored ttsChunks. Titles,
narration copy, and publishing descriptions are Project content. Choose one configured
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

Use host permission on the first provider/Chromium attempt. The narrative command owns TTS, sealing,
mastering, measured SemanticTiming, registry, Composition listing, baseline evidence, and AutoCheck.
Do not reproduce those steps manually, warm TTS, use fallback, or weaken Chromium sandboxing. Require
`baseline-ready` before continuing.

For implementation changes, run `npm run check` with host permissions and `npm run compositions` with
host permissions before dispatch.

## 3. Design visuals and freeze owners

Using the current Story and measured timing, author VisualStyleSpec, resource choices, Scene briefs,
and the simplest style-aligned GlobalVisual brief. Keep Scene expression specific to each Beat
while maintaining whole-film visual continuity. Cover direction remains an independent design derived
from StorySpec, VisualStyleSpec, and fixed CoverSpec.

Choose asset-led, code-led, or hybrid deliberately. Query the current local ResourceCatalog first. If
an external image is needed, use the external MCP only for search/preview/acquire, then run
`npm run project:asset:import -- --project <storyId> --receipt <absoluteReceiptPath> --role <scene-visual|global-visual>`
before Scene freeze. Only the imported Project-local Resource ID may enter frozen plans. Do not pass a
receipt, candidate path, provider URL, MCP call, credential, or SDK to an owner or runtime. Video/audio
external import is not supported. Cover remains unable to consume Scene/MCP assets.

```bash
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
```

Require N Scene assignments, one GlobalVisual assignment, and one CoverAssignment. Record their
assignment/exclusive paths for owner prompts. Do not mutate frozen inputs afterward.

## 4. Start automation, dispatch, and exit

Run the watcher launcher with host permission:

```bash
npm run production:watch:start -- --run <runId>
```

Require `watcher-started` plus watcher launch intent and receipt. Intent without receipt is permanently
ambiguous and must not be retried. The watcher consumes assignment-keyed receipts and owns all later
checks, formal submission, convergence, render-ready, Cover processing, and delivery launch.

Create one `create_thread` task per Scene plus GlobalVisual and Cover using their prompt references.
After all creation calls return, immediately exit. Do not call `wait_threads`, `read_thread`, status,
check/submit, compositions, or delivery commands after dispatch. Report failed creation calls exactly;
leave the acknowledged watcher and successfully created tasks running. Neither watcher nor delivery
spawn acknowledgement proves MP4 completion.
