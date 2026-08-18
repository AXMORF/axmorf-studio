# Direct production workflow

Agent designs. Scripts freeze; they do not choose creative direction or self-review.

## 1. Design and freeze the Project

Author a concise brief and causal narrated StoryBeats. ProducerConfig selects optional boundary Scene
templates; `project:configure` copies them into the Project. Silent Scenes have no TTS, fake text,
CaptionCue, or sealed segment. Narrated content uses Agent-authored ttsChunks as atomic units. Choose a
configured `publishingCollections` ID, author `producer-input.json`, then run:

```bash
npm run project:configure -- --project <storyId> --input src/projects/<storyId>/producer-input.json
```

## 2. Produce the narrative baseline

```bash
npm run production:preflight -- --project <storyId>
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
```

Use host permissions first. Do not reproduce fixed steps, warm TTS, add fallback, or weaken the sandbox.
Require `baseline-ready`. For implementation changes, run `npm run check` with host permissions and
`npm run compositions` with host permissions.

## 3. Design visuals and freeze owners

From current Story/timing, author VisualStyleSpec, resource choices, Beat-specific Scene briefs, and a
minimal continuous GlobalVisual brief. Cover remains independent and assignment-derived. Bind copied
silent Scene briefs exactly to frozen preset visual/sound/resource identities.

Choose asset-led, code-led, or hybrid; query ResourceCatalog first. Import external images with
`project:asset:import` before freeze. Only the imported Project-local ID enters plans.

```bash
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
```

Record assignment paths, `templateMeaningIds`, and `ownerMeaningIds`.
Scripts direct-result templates; do not delegate them.
Agent write boundary: current Project before freeze; exclusive assignment paths after. Fixed outputs
are exempt.

## 4. Delegate, wait, and finalize

Use runtime-native child Agents in the shared checkout: one per `ownerMeaningIds` Scene, one GlobalVisual,
and one Cover. Each child runs its focused check, publishes exactly one assignment-keyed receipt, and
returns only a minimal terminal signal. Do not use a user task/thread API or worktrees. Capacity-limited
batches are allowed, but never combine owners in one child. If child Agents or shared checkout are
unavailable, fail closed without root inline authoring.

Wait for every dispatched child to reach success, explicit failure, or host failure. Do not inspect owner
outputs, submit results, read Run progress, or infer receipt authority from chat status. Then invoke exactly
once, regardless of apparent receipt completeness:

```bash
npm run production:finalize -- --run <runId>
```

`owner-receipts-incomplete`, `agent-write-boundary-violated`, `production-failed`, and
`render-ready-delivery-blocked` are expected exit-2 JSON outcomes. `delivery-render-started` is exit 0 and proves only detached render spawn acknowledgement.
Unexpected failures are safe stderr/exit 1. Do not repeat finalize in the same orchestration attempt.
