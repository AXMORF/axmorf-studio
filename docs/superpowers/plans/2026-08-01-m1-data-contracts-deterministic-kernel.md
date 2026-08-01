# M1 Data Contracts and Deterministic Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the versioned narrative input contracts, canonical SHA-256 fingerprint kernel, sealed narration receipt contract, and cumulative PCM-to-frame timing generator that every later milestone consumes.

**Architecture:** Keep M1 entirely inside `src/contracts/` plus pure tests: authoring inputs are strict Zod schemas, external audio is represented only by sealed metadata, and every derived value comes from canonical JSON or integer `BigInt` arithmetic. M1 does not call VoxCPM, read audio files, render Remotion, generate ProjectRegistry, or define Scene contracts; later milestones consume the stable interfaces produced here.

**Tech Stack:** TypeScript 5.9.3, Zod 4.3.6, Node.js 20+ built-in `node:test`, `tsx` 4.23.1, Node `crypto` SHA-256, npm, ESLint 9, Prettier 3.8.1.

## Global Constraints

- Use host Node.js/npm and Remotion CLI only; do not add Docker, docker-compose, or container verification.
- Keep every `remotion` and `@remotion/*` dependency pinned exactly to `4.0.489`.
- Add only `tsx@4.23.1` as the M1 test-runtime dependency; keep it in `devDependencies` with an exact version.
- `ttsChunks` are authored reading units. No schema, validator, fixture, or helper may split text on punctuation.
- Sealed PCM integer sample-frame counts are the time authority; frame boundaries use `pcm-cumulative-ceil-v1` and `BigInt` arithmetic.
- CaptionCue remains one-to-one with TTSChunk and uses actual `ttsText`; M1 does not add word-level alignment.
- Data files contain declarations and stable IDs only; they cannot contain JSX, functions, expressions, provider URLs, tokens, or module paths.
- M1 does not implement VoxCPM calls, audio decoding, audio normalization, Remotion runtime, NarrativeCore, ProjectRegistry, SceneVisualPlan, ScenePackage, renderer registries, sound/global tracks, or release tooling.
- NarrativeCore remains an M3 concern and will have no BaseCanvas. M1 defines only `StoryCompositionProps` project identity, not NarrativeCore props or runtime visuals.
- All Zod object schemas are strict. Unknown fields, duplicate IDs, invalid order, incompatible ranges, stale fingerprints, and unsafe integer conversion fail closed.
- Use TDD for every task. Run the focused test red, implement the minimum behavior, run it green, then run `npm run typecheck` before each task commit.
- Preserve unrelated work and stage only the exact files listed by the current task.

---

## Locked M1 file structure

```text
src/contracts/
├── assets.ts                         existing; unchanged by M1
├── primitives.ts                     branded IDs, integer/path/checksum primitives
├── brief.ts                          VideoBrief
├── story.ts                          StorySpec, StoryBeat, TTSChunk, explicit pauses
├── narration.ts                      NarrationSpec
├── render.ts                         RenderSpec
├── project.ts                        source-file names and StoryCompositionProps
├── fingerprint.ts                    canonical JSON and domain-separated SHA-256
├── generation-input.ts               ordered generation payload and fingerprints
├── sealed-narration.ts                sealed PCM artifact receipt
├── semantic-timing.ts                 cumulative sample-to-frame timing
├── m1-validation.ts                   aggregate stale-artifact verification
└── index.ts                           public M1 exports

tests/
├── contracts/
│   ├── primitives.test.ts
│   ├── authoring.test.ts
│   ├── project.test.ts
│   ├── fingerprint.test.ts
│   ├── sealed-narration.test.ts
│   ├── semantic-timing.test.ts
│   └── invalidation.test.ts
└── fixtures/
    └── narrative.ts                    valid raw inputs and sealed receipt builder

docs/contracts/
└── NARRATIVE_CONTRACTS.md             persisted shapes and algorithm contract
```

Persisted project source file names are fixed in M1:

```text
src/projects/<story>/brief.json
src/projects/<story>/story.json
src/projects/<story>/narration.json
src/projects/<story>/render.json
src/projects/<story>/generated/sealed-narration.generated.json
src/projects/<story>/generated/semantic-timing.generated.json
```

The first four are authored source files; the last two are derived artifacts. M1 defines their data shapes and fixed names but does not create a real Story directory, read/write these files, or perform filesystem discovery.

---

### Task 1: Add the TypeScript contract test harness and primitives

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/contracts/primitives.ts`
- Create: `tests/contracts/primitives.test.ts`

**Interfaces:**

- Consumes: Node.js 20+, Zod 4.3.6, existing npm scripts.
- Produces: `StoryIdSchema`, `MeaningIdSchema`, `TtsChunkIdSchema`, `VoiceProfileIdSchema`, `CompositionIdSchema`, `PositiveIntegerSchema`, `NonNegativeIntegerSchema`, `Sha256DigestSchema`, `PublicProjectPathSchema`, and `npm test`.

- [ ] **Step 1: Install the one exact test-runtime dependency and add scripts**

Run:

```bash
npm install --save-dev --save-exact tsx@4.23.1
```

Set the script block to include:

```json
{
  "test": "node --import tsx --test tests/contracts/*.test.ts",
  "check": "npm run test && npm run typecheck && npm run lint && npm run build && npm run compositions"
}
```

Do not change any Remotion dependency version.

- [ ] **Step 2: Write the failing primitive contract tests**

Create `tests/contracts/primitives.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  CompositionIdSchema,
  MeaningIdSchema,
  PublicProjectPathSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "../../src/contracts/primitives";

test("stable ids accept lowercase slugs and reject paths or whitespace", () => {
  assert.equal(StoryIdSchema.parse("story-example"), "story-example");
  assert.equal(MeaningIdSchema.parse("opening-claim"), "opening-claim");
  assert.equal(TtsChunkIdSchema.parse("opening-01"), "opening-01");
  assert.throws(() => StoryIdSchema.parse("Story Example"));
  assert.throws(() => MeaningIdSchema.parse("../opening"));
});

test("composition ids use the Remotion-safe local subset", () => {
  assert.equal(CompositionIdSchema.parse("StoryExample_01"), "StoryExample_01");
  assert.throws(() => CompositionIdSchema.parse("Story Example"));
  assert.throws(() => CompositionIdSchema.parse(".hidden"));
});

test("repository artifact paths stay under public/projects", () => {
  assert.equal(
    PublicProjectPathSchema.parse(
      "public/projects/story-example/narration/complete.wav",
    ),
    "public/projects/story-example/narration/complete.wav",
  );
  assert.throws(() => PublicProjectPathSchema.parse("/tmp/complete.wav"));
  assert.throws(() =>
    PublicProjectPathSchema.parse("public/projects/../secret.wav"),
  );
  assert.throws(() =>
    PublicProjectPathSchema.parse("public\\projects\\story.wav"),
  );
});

test("sha256 digests are lowercase and prefixed", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  assert.equal(Sha256DigestSchema.parse(digest), digest);
  assert.throws(() => Sha256DigestSchema.parse("a".repeat(64)));
  assert.throws(() => Sha256DigestSchema.parse(`sha256:${"A".repeat(64)}`));
});
```

- [ ] **Step 3: Run the focused test and verify the red state**

Run:

```bash
node --import tsx --test --test-name-pattern="stable ids|composition ids|repository artifact paths|sha256" tests/contracts/primitives.test.ts
```

Expected: FAIL because `src/contracts/primitives.ts` does not exist.

- [ ] **Step 4: Implement the primitive schemas**

Create `src/contracts/primitives.ts`:

```ts
import { z } from "zod";

const stableSlugSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const StoryIdSchema = stableSlugSchema.brand<"StoryId">();
export const MeaningIdSchema = stableSlugSchema.brand<"MeaningId">();
export const TtsChunkIdSchema = stableSlugSchema.brand<"TtsChunkId">();
export const VoiceProfileIdSchema = stableSlugSchema.brand<"VoiceProfileId">();

export const CompositionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  .brand<"CompositionId">();

export const PositiveIntegerSchema = z.number().int().positive().safe();
export const NonNegativeIntegerSchema = z.number().int().nonnegative().safe();

export const Sha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/)
  .brand<"Sha256Digest">();

export const PublicProjectPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith("public/projects/") &&
      !value.startsWith("/") &&
      !value.includes("..") &&
      !value.includes("\\"),
    "Path must stay under public/projects and use forward slashes.",
  )
  .brand<"PublicProjectPath">();

export type StoryId = z.infer<typeof StoryIdSchema>;
export type MeaningId = z.infer<typeof MeaningIdSchema>;
export type TtsChunkId = z.infer<typeof TtsChunkIdSchema>;
export type VoiceProfileId = z.infer<typeof VoiceProfileIdSchema>;
export type CompositionId = z.infer<typeof CompositionIdSchema>;
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;
export type PublicProjectPath = z.infer<typeof PublicProjectPathSchema>;
```

- [ ] **Step 5: Run the focused and static checks**

Run:

```bash
node --import tsx --test --test-name-pattern="stable ids|composition ids|repository artifact paths|sha256" tests/contracts/primitives.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json src/contracts/primitives.ts tests/contracts/primitives.test.ts
git commit -m "test: add narrative contract harness"
```

---

### Task 2: Define VideoBrief, StorySpec, authored chunks, and explicit pauses

**Files:**

- Create: `src/contracts/brief.ts`
- Create: `src/contracts/story.ts`
- Create: `tests/fixtures/narrative.ts`
- Create: `tests/contracts/authoring.test.ts`

**Interfaces:**

- Consumes: Task 1 branded IDs and integer schemas.
- Produces: `VideoBriefSchema`, `TTSChunkSchema`, `ExplicitPauseSchema`, `StoryBeatSchema`, `StorySpecSchema`, and `flattenTtsChunks(storySpec)`.

- [ ] **Step 1: Write valid raw authoring fixtures**

Create `tests/fixtures/narrative.ts` with these first exports:

```ts
export const validVideoBrief = {
  schemaVersion: 1,
  storyId: "story-example",
  title: "A deterministic narration example",
  sourceMaterial: "Explain why cumulative PCM boundaries prevent frame drift.",
  audience: "Developers building narrated video systems",
  targetDurationSeconds: 10,
  deliveryConstraints: [
    "Narration and captions must remain understandable without Scene visuals.",
  ],
} as const;

export const validStorySpec = {
  schemaVersion: 1,
  storyId: "story-example",
  title: "A deterministic narration example",
  beats: [
    {
      meaningId: "opening",
      narrativePurpose: "State the timing problem.",
      ttsChunks: [{ chunkId: "opening-01", ttsText: "A" }],
      explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 250 }],
    },
    {
      meaningId: "conclusion",
      narrativePurpose: "State the deterministic result.",
      ttsChunks: [{ chunkId: "conclusion-01", ttsText: "B" }],
      explicitPauses: [],
    },
  ],
} as const;
```

- [ ] **Step 2: Write failing authoring contract tests**

Create `tests/contracts/authoring.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { VideoBriefSchema } from "../../src/contracts/brief";
import { flattenTtsChunks, StorySpecSchema } from "../../src/contracts/story";
import { validStorySpec, validVideoBrief } from "../fixtures/narrative";

test("valid authored inputs preserve StoryBeat and TTSChunk order", () => {
  const brief = VideoBriefSchema.parse(validVideoBrief);
  const story = StorySpecSchema.parse(validStorySpec);

  assert.equal(brief.storyId, story.storyId);
  assert.deepEqual(flattenTtsChunks(story), [
    { chunkId: "opening-01", meaningId: "opening", ttsText: "A" },
    { chunkId: "conclusion-01", meaningId: "conclusion", ttsText: "B" },
  ]);
});

test("all authoring objects reject unknown fields", () => {
  assert.throws(() =>
    VideoBriefSchema.parse({ ...validVideoBrief, providerUrl: "http://tts" }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({ ...validStorySpec, rendererId: "forbidden" }),
  );
});

test("StorySpec rejects duplicate semantic and chunk ids", () => {
  const duplicateMeaning = {
    ...validStorySpec,
    beats: [
      validStorySpec.beats[0],
      { ...validStorySpec.beats[1], meaningId: "opening" },
    ],
  };
  const duplicateChunk = {
    ...validStorySpec,
    beats: [
      validStorySpec.beats[0],
      {
        ...validStorySpec.beats[1],
        ttsChunks: [{ chunkId: "opening-01", ttsText: "B" }],
      },
    ],
  };

  assert.throws(() => StorySpecSchema.parse(duplicateMeaning));
  assert.throws(() => StorySpecSchema.parse(duplicateChunk));
});

test("explicit pauses must follow one chunk in the owning StoryBeat", () => {
  const unknownChunk = {
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "missing-01", pauseMs: 250 }],
      },
      validStorySpec.beats[1],
    ],
  };
  const duplicatePause = {
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [
          { afterChunkId: "opening-01", pauseMs: 250 },
          { afterChunkId: "opening-01", pauseMs: 500 },
        ],
      },
      validStorySpec.beats[1],
    ],
  };

  assert.throws(() => StorySpecSchema.parse(unknownChunk));
  assert.throws(() => StorySpecSchema.parse(duplicatePause));
});

test("explicit pause declarations follow their chunk order", () => {
  assert.throws(() =>
    StorySpecSchema.parse({
      ...validStorySpec,
      beats: [
        {
          ...validStorySpec.beats[0],
          ttsChunks: [
            { chunkId: "opening-01", ttsText: "A" },
            { chunkId: "opening-02", ttsText: "A2" },
          ],
          explicitPauses: [
            { afterChunkId: "opening-02", pauseMs: 100 },
            { afterChunkId: "opening-01", pauseMs: 100 },
          ],
        },
        validStorySpec.beats[1],
      ],
    }),
  );
});

test("explicit pause milliseconds are non-negative integers", () => {
  assert.doesNotThrow(() =>
    StorySpecSchema.parse({
      ...validStorySpec,
      beats: [
        {
          ...validStorySpec.beats[0],
          explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 0 }],
        },
        validStorySpec.beats[1],
      ],
    }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({
      ...validStorySpec,
      beats: [
        {
          ...validStorySpec.beats[0],
          explicitPauses: [{ afterChunkId: "opening-01", pauseMs: -1 }],
        },
        validStorySpec.beats[1],
      ],
    }),
  );
});
```

- [ ] **Step 3: Run the authoring tests and verify the red state**

Run:

```bash
node --import tsx --test --test-name-pattern="authored inputs|authoring objects|duplicate semantic|explicit pauses|pause declarations|pause milliseconds" tests/contracts/authoring.test.ts
```

Expected: FAIL because `brief.ts` and `story.ts` do not exist.

- [ ] **Step 4: Implement VideoBrief**

Create `src/contracts/brief.ts`:

```ts
import { z } from "zod";

import { PositiveIntegerSchema, StoryIdSchema } from "./primitives";

const NonEmptyTextSchema = z.string().trim().min(1);

export const VideoBriefSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    sourceMaterial: NonEmptyTextSchema,
    audience: NonEmptyTextSchema,
    targetDurationSeconds: PositiveIntegerSchema.max(3600),
    deliveryConstraints: z.array(NonEmptyTextSchema).max(32).readonly(),
  })
  .strict()
  .readonly();

export type VideoBrief = z.infer<typeof VideoBriefSchema>;
```

- [ ] **Step 5: Implement StorySpec and cross-field validation**

Create `src/contracts/story.ts`:

```ts
import { z } from "zod";

import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";

const NonEmptyTextSchema = z.string().trim().min(1);

export const TTSChunkSchema = z
  .object({
    chunkId: TtsChunkIdSchema,
    ttsText: NonEmptyTextSchema,
  })
  .strict()
  .readonly();

export const ExplicitPauseSchema = z
  .object({
    afterChunkId: TtsChunkIdSchema,
    pauseMs: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

export const StoryBeatSchema = z
  .object({
    meaningId: MeaningIdSchema,
    narrativePurpose: NonEmptyTextSchema,
    ttsChunks: z.array(TTSChunkSchema).min(1).readonly(),
    explicitPauses: z.array(ExplicitPauseSchema).readonly(),
  })
  .strict()
  .superRefine((beat, context) => {
    const chunkOrder = new Map(
      beat.ttsChunks.map((chunk, index) => [chunk.chunkId, index]),
    );
    const ownedChunks = new Set(chunkOrder.keys());
    const pausedChunks = new Set<string>();
    let previousPauseChunkIndex = -1;

    beat.explicitPauses.forEach((pause, index) => {
      if (!ownedChunks.has(pause.afterChunkId)) {
        context.addIssue({
          code: "custom",
          message:
            "Explicit pause must follow a chunk owned by the same StoryBeat.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      if (pausedChunks.has(pause.afterChunkId)) {
        context.addIssue({
          code: "custom",
          message: "A TTSChunk can have at most one explicit pause after it.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      pausedChunks.add(pause.afterChunkId);
      const currentChunkIndex = chunkOrder.get(pause.afterChunkId);
      if (
        currentChunkIndex !== undefined &&
        currentChunkIndex <= previousPauseChunkIndex
      ) {
        context.addIssue({
          code: "custom",
          message: "Explicit pauses must follow TTSChunk order.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      if (currentChunkIndex !== undefined)
        previousPauseChunkIndex = currentChunkIndex;
    });
  })
  .readonly();

export const StorySpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    beats: z.array(StoryBeatSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((story, context) => {
    const meaningIds = new Set<string>();
    const chunkIds = new Set<string>();

    story.beats.forEach((beat, beatIndex) => {
      if (meaningIds.has(beat.meaningId)) {
        context.addIssue({
          code: "custom",
          message: "meaningId must be globally unique within StorySpec.",
          path: ["beats", beatIndex, "meaningId"],
        });
      }
      meaningIds.add(beat.meaningId);

      beat.ttsChunks.forEach((chunk, chunkIndex) => {
        if (chunkIds.has(chunk.chunkId)) {
          context.addIssue({
            code: "custom",
            message: "chunkId must be globally unique within StorySpec.",
            path: ["beats", beatIndex, "ttsChunks", chunkIndex, "chunkId"],
          });
        }
        chunkIds.add(chunk.chunkId);
      });
    });
  })
  .readonly();

export type TTSChunk = z.infer<typeof TTSChunkSchema>;
export type ExplicitPause = z.infer<typeof ExplicitPauseSchema>;
export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type StorySpec = z.infer<typeof StorySpecSchema>;

export const flattenTtsChunks = (story: StorySpec) =>
  story.beats.flatMap((beat) =>
    beat.ttsChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      meaningId: beat.meaningId,
      ttsText: chunk.ttsText,
    })),
  );
```

- [ ] **Step 6: Run focused tests and static checks**

```bash
node --import tsx --test --test-name-pattern="authored inputs|authoring objects|duplicate semantic|explicit pauses|pause declarations|pause milliseconds" tests/contracts/authoring.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/contracts/brief.ts src/contracts/story.ts tests/fixtures/narrative.ts tests/contracts/authoring.test.ts
git commit -m "feat: define narrative authoring contracts"
```

---

### Task 3: Define NarrationSpec, RenderSpec, and the source project contract

**Files:**

- Create: `src/contracts/narration.ts`
- Create: `src/contracts/render.ts`
- Create: `src/contracts/project.ts`
- Modify: `tests/fixtures/narrative.ts`
- Create: `tests/contracts/project.test.ts`

**Interfaces:**

- Consumes: Task 1 primitives and Task 2 authoring schemas.
- Produces: `NarrationSpecSchema`, `RenderSpecSchema`, `NarrativeProjectSourceSchema`, `NARRATIVE_PROJECT_FILES`, `StoryCompositionPropsSchema`, and `parseNarrativeProjectSource(input)`.

- [ ] **Step 1: Extend the valid fixture with narration and render declarations**

Append to `tests/fixtures/narrative.ts`:

```ts
export const validNarrationSpec = {
  schemaVersion: 1,
  voiceProfileId: "primary-voice",
  mode: "voice-clone",
  seed: 42,
} as const;

export const validRenderSpec = {
  schemaVersion: 1,
  compositionId: "StoryExample",
  fps: 30,
  width: 1920,
  height: 1080,
  locale: "zh-CN",
  leadInFrames: 15,
  tailFrames: 12,
  captionSafeAreaPx: { top: 72, right: 96, bottom: 72, left: 96 },
  output: {
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    audioChannels: 2,
  },
} as const;

export const validProjectSource = {
  brief: validVideoBrief,
  story: validStorySpec,
  narration: validNarrationSpec,
  render: validRenderSpec,
} as const;
```

- [ ] **Step 2: Write failing project contract tests**

Create `tests/contracts/project.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { NarrationSpecSchema } from "../../src/contracts/narration";
import {
  NARRATIVE_PROJECT_FILES,
  NarrativeProjectSourceSchema,
  StoryCompositionPropsSchema,
} from "../../src/contracts/project";
import { RenderSpecSchema } from "../../src/contracts/render";
import {
  validNarrationSpec,
  validProjectSource,
  validRenderSpec,
} from "../fixtures/narrative";

test("NarrationSpec stores only a voice reference and allowed generation controls", () => {
  assert.deepEqual(
    NarrationSpecSchema.parse(validNarrationSpec),
    validNarrationSpec,
  );
  assert.throws(() =>
    NarrationSpecSchema.parse({
      ...validNarrationSpec,
      providerUrl: "http://127.0.0.1:9000",
    }),
  );
  assert.throws(() =>
    NarrationSpecSchema.parse({ ...validNarrationSpec, token: "secret" }),
  );
});

test("RenderSpec validates dimensions, safe area, and the fixed v1 output tuple", () => {
  assert.deepEqual(RenderSpecSchema.parse(validRenderSpec), validRenderSpec);
  assert.throws(() =>
    RenderSpecSchema.parse({ ...validRenderSpec, width: 1919 }),
  );
  assert.throws(() =>
    RenderSpecSchema.parse({
      ...validRenderSpec,
      captionSafeAreaPx: { ...validRenderSpec.captionSafeAreaPx, left: 1900 },
    }),
  );
  assert.throws(() =>
    RenderSpecSchema.parse({
      ...validRenderSpec,
      output: { ...validRenderSpec.output, audioCodec: "opus" },
    }),
  );
});

test("project source identity and Composition props use the Story slug", () => {
  assert.equal(
    NarrativeProjectSourceSchema.parse(validProjectSource).story.storyId,
    "story-example",
  );
  assert.throws(() =>
    NarrativeProjectSourceSchema.parse({
      ...validProjectSource,
      brief: { ...validProjectSource.brief, storyId: "different-story" },
    }),
  );
  assert.deepEqual(
    StoryCompositionPropsSchema.parse({ projectId: "story-example" }),
    {
      projectId: "story-example",
    },
  );
  assert.deepEqual(NARRATIVE_PROJECT_FILES, {
    brief: "brief.json",
    story: "story.json",
    narration: "narration.json",
    render: "render.json",
    sealedNarration: "generated/sealed-narration.generated.json",
    semanticTiming: "generated/semantic-timing.generated.json",
  });
});
```

- [ ] **Step 3: Run the project tests and verify the red state**

```bash
node --import tsx --test --test-name-pattern="NarrationSpec|RenderSpec|project source identity" tests/contracts/project.test.ts
```

Expected: FAIL because the three source modules do not exist.

- [ ] **Step 4: Implement NarrationSpec**

Create `src/contracts/narration.ts`:

```ts
import { z } from "zod";

import { NonNegativeIntegerSchema, VoiceProfileIdSchema } from "./primitives";

export const NarrationSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    voiceProfileId: VoiceProfileIdSchema,
    mode: z.literal("voice-clone"),
    seed: NonNegativeIntegerSchema.max(2_147_483_647).optional(),
  })
  .strict()
  .readonly();

export type NarrationSpec = z.infer<typeof NarrationSpecSchema>;
```

- [ ] **Step 5: Implement RenderSpec and its compatibility checks**

Create `src/contracts/render.ts`:

```ts
import { z } from "zod";

import {
  CompositionIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "./primitives";

const CanonicalLocaleSchema = z.string().refine((value) => {
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}, "locale must be a canonical BCP 47 language tag");

export const CaptionSafeAreaSchema = z
  .object({
    top: NonNegativeIntegerSchema,
    right: NonNegativeIntegerSchema,
    bottom: NonNegativeIntegerSchema,
    left: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

export const RenderOutputSchema = z
  .object({
    container: z.literal("mp4"),
    videoCodec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    audioChannels: z.union([z.literal(1), z.literal(2)]),
  })
  .strict()
  .readonly();

export const RenderSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    compositionId: CompositionIdSchema,
    fps: PositiveIntegerSchema.max(120),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    locale: CanonicalLocaleSchema,
    leadInFrames: NonNegativeIntegerSchema,
    tailFrames: NonNegativeIntegerSchema,
    captionSafeAreaPx: CaptionSafeAreaSchema,
    output: RenderOutputSchema,
  })
  .strict()
  .superRefine((render, context) => {
    if (render.width % 2 !== 0 || render.height % 2 !== 0) {
      context.addIssue({
        code: "custom",
        message: "H.264 v1 width and height must be even integers.",
        path: [render.width % 2 !== 0 ? "width" : "height"],
      });
    }
    if (
      render.captionSafeAreaPx.left + render.captionSafeAreaPx.right >=
      render.width
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Horizontal caption safe area must leave positive content width.",
        path: ["captionSafeAreaPx"],
      });
    }
    if (
      render.captionSafeAreaPx.top + render.captionSafeAreaPx.bottom >=
      render.height
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Vertical caption safe area must leave positive content height.",
        path: ["captionSafeAreaPx"],
      });
    }
  })
  .readonly();

export type CaptionSafeArea = z.infer<typeof CaptionSafeAreaSchema>;
export type RenderSpec = z.infer<typeof RenderSpecSchema>;
```

- [ ] **Step 6: Implement the source project and Composition props contracts**

Create `src/contracts/project.ts`:

```ts
import { z } from "zod";

import { VideoBriefSchema } from "./brief";
import { NarrationSpecSchema } from "./narration";
import { StoryIdSchema } from "./primitives";
import { RenderSpecSchema } from "./render";
import { StorySpecSchema } from "./story";

export const NARRATIVE_PROJECT_FILES = {
  brief: "brief.json",
  story: "story.json",
  narration: "narration.json",
  render: "render.json",
  sealedNarration: "generated/sealed-narration.generated.json",
  semanticTiming: "generated/semantic-timing.generated.json",
} as const;

export const StoryCompositionPropsSchema = z
  .object({ projectId: StoryIdSchema })
  .strict()
  .readonly();

export const NarrativeProjectSourceSchema = z
  .object({
    brief: VideoBriefSchema,
    story: StorySpecSchema,
    narration: NarrationSpecSchema,
    render: RenderSpecSchema,
  })
  .strict()
  .superRefine((project, context) => {
    if (project.brief.storyId !== project.story.storyId) {
      context.addIssue({
        code: "custom",
        message: "VideoBrief.storyId must match StorySpec.storyId.",
        path: ["brief", "storyId"],
      });
    }
  })
  .readonly();

export type StoryCompositionProps = z.infer<typeof StoryCompositionPropsSchema>;
export type NarrativeProjectSource = z.infer<
  typeof NarrativeProjectSourceSchema
>;

export const parseNarrativeProjectSource = (
  input: unknown,
): NarrativeProjectSource => NarrativeProjectSourceSchema.parse(input);
```

- [ ] **Step 7: Run focused tests and static checks**

```bash
node --import tsx --test --test-name-pattern="NarrationSpec|RenderSpec|project source identity" tests/contracts/project.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/contracts/narration.ts src/contracts/render.ts src/contracts/project.ts tests/fixtures/narrative.ts tests/contracts/project.test.ts
git commit -m "feat: define narrative project inputs"
```

---

### Task 4: Add canonical JSON and domain-separated fingerprints

**Files:**

- Create: `src/contracts/fingerprint.ts`
- Create: `src/contracts/generation-input.ts`
- Create: `tests/contracts/fingerprint.test.ts`

**Interfaces:**

- Consumes: `StorySpec`, `NarrationSpec`, ordered flattened chunks, SHA-256 primitive.
- Produces: `serializeCanonicalJson(value)`, `createFingerprint({namespace, version, value})`, `GenerationInputSchema`, `buildGenerationInput(story, narration)`, `computeStoryFingerprint(story)`, and `computeGenerationInputFingerprint(story, narration)`.

- [ ] **Step 1: Write failing canonicalization and fingerprint tests**

Create `tests/contracts/fingerprint.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  createFingerprint,
  serializeCanonicalJson,
} from "../../src/contracts/fingerprint";
import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
} from "../../src/contracts/generation-input";
import { NarrationSpecSchema } from "../../src/contracts/narration";
import { StorySpecSchema } from "../../src/contracts/story";
import { validNarrationSpec, validStorySpec } from "../fixtures/narrative";

test("canonical JSON sorts object keys and preserves array order", () => {
  assert.equal(
    serializeCanonicalJson({ b: 2, a: [3, 1] }),
    '{"a":[3,1],"b":2}',
  );
  assert.notEqual(
    serializeCanonicalJson([1, 2]),
    serializeCanonicalJson([2, 1]),
  );
  assert.throws(() => serializeCanonicalJson({ invalid: undefined }));
  assert.throws(() => serializeCanonicalJson(Number.POSITIVE_INFINITY));
  assert.throws(() => serializeCanonicalJson(new Array(1)));
  assert.throws(() => serializeCanonicalJson({ [Symbol("hidden")]: true }));
});

test("fingerprint uses a stable domain-separated SHA-256 value", () => {
  assert.equal(
    createFingerprint({ namespace: "test", version: 1, value: { b: 2, a: 1 } }),
    "sha256:b4e91d40fea999175beb7d25b9b48f5328882e5bd798c61bff5544822fae64fa",
  );
});

test("generation fingerprint includes ordered ttsChunks and NarrationSpec but excludes pauses", () => {
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const changedPause = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 700 }],
      },
      validStorySpec.beats[1],
    ],
  });
  const changedText = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        ttsChunks: [{ chunkId: "opening-01", ttsText: "Changed" }],
      },
      validStorySpec.beats[1],
    ],
  });

  assert.equal(
    computeGenerationInputFingerprint(story, narration),
    computeGenerationInputFingerprint(changedPause, narration),
  );
  assert.notEqual(
    computeGenerationInputFingerprint(story, narration),
    computeGenerationInputFingerprint(changedText, narration),
  );
  assert.notEqual(
    computeGenerationInputFingerprint(story, narration),
    computeGenerationInputFingerprint(
      story,
      NarrationSpecSchema.parse({ ...validNarrationSpec, seed: 43 }),
    ),
  );
  assert.notEqual(
    computeStoryFingerprint(story),
    computeStoryFingerprint(changedPause),
  );
});
```

- [ ] **Step 2: Run fingerprint tests and verify the red state**

```bash
node --import tsx --test --test-name-pattern="canonical JSON|domain-separated|generation fingerprint" tests/contracts/fingerprint.test.ts
```

Expected: FAIL because the fingerprint modules do not exist.

- [ ] **Step 3: Implement canonical JSON and SHA-256**

Create `src/contracts/fingerprint.ts`:

```ts
import { createHash } from "node:crypto";

import { Sha256DigestSchema, type Sha256Digest } from "./primitives";

export const FINGERPRINT_ALGORITHM_ID = "sha256-canonical-json-v1" as const;

const serialize = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON accepts finite numbers only.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value))
        throw new Error("Canonical JSON does not accept sparse arrays.");
    }
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Canonical JSON accepts plain objects only.");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error("Canonical JSON does not accept symbol keys.");
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${serialize(entryValue)}`,
      )
      .join(",")}}`;
  }
  throw new Error(`Canonical JSON does not accept ${typeof value}.`);
};

export const serializeCanonicalJson = (value: unknown): string =>
  serialize(value);

export const createFingerprint = ({
  namespace,
  version,
  value,
}: {
  readonly namespace: string;
  readonly version: number;
  readonly value: unknown;
}): Sha256Digest => {
  if (!namespace.trim())
    throw new Error("Fingerprint namespace must be non-empty.");
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error("Fingerprint version must be a positive safe integer.");
  }
  const canonical = serializeCanonicalJson({ namespace, value, version });
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
  );
};
```

- [ ] **Step 4: Implement the generation payload and domain helpers**

Create `src/contracts/generation-input.ts`:

```ts
import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { NarrationSpecSchema, type NarrationSpec } from "./narration";
import { MeaningIdSchema, TtsChunkIdSchema } from "./primitives";
import { flattenTtsChunks, type StorySpec } from "./story";

export const GenerationChunkSchema = z
  .object({
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: z.string().trim().min(1),
  })
  .strict()
  .readonly();

export const GenerationInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    chunks: z.array(GenerationChunkSchema).min(1).readonly(),
    narration: NarrationSpecSchema,
  })
  .strict()
  .readonly();

export type GenerationInput = z.infer<typeof GenerationInputSchema>;

export const buildGenerationInput = (
  story: StorySpec,
  narration: NarrationSpec,
): GenerationInput =>
  GenerationInputSchema.parse({
    schemaVersion: 1,
    chunks: flattenTtsChunks(story),
    narration,
  });

export const computeStoryFingerprint = (story: StorySpec) =>
  createFingerprint({ namespace: "story-spec", version: 1, value: story });

export const computeGenerationInputFingerprint = (
  story: StorySpec,
  narration: NarrationSpec,
) =>
  createFingerprint({
    namespace: "narration-generation-input",
    version: 1,
    value: buildGenerationInput(story, narration),
  });
```

- [ ] **Step 5: Run focused tests and static checks**

```bash
node --import tsx --test --test-name-pattern="canonical JSON|domain-separated|generation fingerprint" tests/contracts/fingerprint.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0 and the golden SHA-256 matches exactly.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/contracts/fingerprint.ts src/contracts/generation-input.ts tests/contracts/fingerprint.test.ts
git commit -m "feat: add canonical narrative fingerprints"
```

---

### Task 5: Define and verify the sealed narration manifest

**Files:**

- Create: `src/contracts/sealed-narration.ts`
- Modify: `tests/fixtures/narrative.ts`
- Create: `tests/contracts/sealed-narration.test.ts`

**Interfaces:**

- Consumes: `NarrationSpec`, repository-local paths, SHA-256 digests, canonical fingerprinting.
- Produces: `PcmFormatSchema`, `SealedNarrationSegmentSchema`, `SealedNarrationManifestSchema`, `computeSealedNarrationFingerprint(data)`, and `buildValidSealedNarrationManifest()` test fixture.

- [ ] **Step 1: Write the failing sealed manifest tests**

Create `tests/contracts/sealed-narration.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { SealedNarrationManifestSchema } from "../../src/contracts/sealed-narration";
import { buildValidSealedNarrationManifest } from "../fixtures/narrative";

test("sealed narration validates ordered measured PCM artifacts", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.equal(
    SealedNarrationManifestSchema.parse(manifest).completeAudio
      .sampleFrameCount,
    110400,
  );
});

test("sealed narration rejects partial totals and stale fingerprints", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      completeAudio: { ...manifest.completeAudio, sampleFrameCount: 110399 },
    }),
  );
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      segments: manifest.segments.map((segment, index) =>
        index === 0 && segment.kind === "chunk"
          ? { ...segment, checksum: `sha256:${"d".repeat(64)}` }
          : segment,
      ),
    }),
  );
});

test("pause segments must immediately follow their declared chunk", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      segments: [
        manifest.segments[1],
        manifest.segments[0],
        manifest.segments[2],
      ],
    }),
  );
});

test("sealed narration paths stay inside the owning Story directory", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      segments: manifest.segments.map((segment, index) =>
        index === 0 && segment.kind === "chunk"
          ? {
              ...segment,
              localPath: "public/projects/other-story/narration/opening.wav",
            }
          : segment,
      ),
    }),
  );
});
```

- [ ] **Step 2: Run sealed manifest tests and verify the red state**

```bash
node --import tsx --test --test-name-pattern="sealed narration|pause segments|owning Story" tests/contracts/sealed-narration.test.ts
```

Expected: FAIL because `sealed-narration.ts` and the fixture builder do not exist.

- [ ] **Step 3: Implement the sealed receipt schemas and fingerprint payload**

Create `src/contracts/sealed-narration.ts` with these exact persisted fields and checks:

```ts
import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { NarrationSpecSchema } from "./narration";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  PublicProjectPathSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";

export const PcmFormatSchema = z
  .object({
    sampleRate: PositiveIntegerSchema,
    channelLayout: z.enum(["mono", "stereo"]),
    sampleFormat: z.literal("s16le"),
  })
  .strict()
  .readonly();

const ChunkSegmentSchema = z
  .object({
    kind: z.literal("chunk"),
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: z.string().trim().min(1),
    localPath: PublicProjectPathSchema,
    checksum: Sha256DigestSchema,
    pcm: PcmFormatSchema,
    sampleFrameCount: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

const PauseSegmentSchema = z
  .object({
    kind: z.literal("pause"),
    afterChunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    pauseMs: NonNegativeIntegerSchema,
    sampleFrameCount: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

export const SealedNarrationSegmentSchema = z.discriminatedUnion("kind", [
  ChunkSegmentSchema,
  PauseSegmentSchema,
]);

const CompleteAudioSchema = z
  .object({
    localPath: PublicProjectPathSchema,
    checksum: Sha256DigestSchema,
    pcm: PcmFormatSchema,
    sampleFrameCount: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

const SealedNarrationFingerprintInputObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    narrationSpec: NarrationSpecSchema,
    generationInputFingerprint: Sha256DigestSchema,
    normalizationAlgorithmId: z.literal("pcm-s16le-normalize-v1"),
    assemblyAlgorithmId: z.literal("ordered-pcm-concat-v1"),
    canonicalPcm: PcmFormatSchema,
    segments: z.array(SealedNarrationSegmentSchema).min(1).readonly(),
    completeAudio: CompleteAudioSchema,
  })
  .strict();

export const SealedNarrationFingerprintInputSchema =
  SealedNarrationFingerprintInputObjectSchema.readonly();

const SealedNarrationManifestBaseSchema =
  SealedNarrationFingerprintInputObjectSchema.extend({
    sealedNarrationFingerprint: Sha256DigestSchema,
  }).strict();

export type SealedNarrationFingerprintInput = z.infer<
  typeof SealedNarrationFingerprintInputSchema
>;

export const computeSealedNarrationFingerprint = (input: unknown) => {
  const data = SealedNarrationFingerprintInputSchema.parse(input);
  return createFingerprint({
    namespace: "sealed-narration",
    version: 1,
    value: {
      generationInputFingerprint: data.generationInputFingerprint,
      normalizationAlgorithmId: data.normalizationAlgorithmId,
      assemblyAlgorithmId: data.assemblyAlgorithmId,
      canonicalPcm: data.canonicalPcm,
      segments: data.segments.map((segment) =>
        segment.kind === "chunk"
          ? {
              kind: segment.kind,
              chunkId: segment.chunkId,
              meaningId: segment.meaningId,
              checksum: segment.checksum,
              sampleFrameCount: segment.sampleFrameCount,
            }
          : segment,
      ),
      completeAudio: {
        checksum: data.completeAudio.checksum,
        sampleFrameCount: data.completeAudio.sampleFrameCount,
      },
    },
  });
};

export const SealedNarrationManifestSchema =
  SealedNarrationManifestBaseSchema.superRefine((manifest, context) => {
    let previousChunk:
      | { readonly chunkId: string; readonly meaningId: string }
      | undefined;
    const chunkIds = new Set<string>();
    let totalSampleFrames = 0n;
    const projectPathPrefix = `public/projects/${manifest.storyId}/`;

    manifest.segments.forEach((segment, index) => {
      totalSampleFrames += BigInt(segment.sampleFrameCount);
      if (segment.kind === "chunk") {
        if (!segment.localPath.startsWith(projectPathPrefix)) {
          context.addIssue({
            code: "custom",
            message: "Chunk path must stay inside the owning Story directory.",
            path: ["segments", index, "localPath"],
          });
        }
        if (chunkIds.has(segment.chunkId)) {
          context.addIssue({
            code: "custom",
            message: "Sealed chunkId must be unique.",
            path: ["segments", index, "chunkId"],
          });
        }
        chunkIds.add(segment.chunkId);
        previousChunk = {
          chunkId: segment.chunkId,
          meaningId: segment.meaningId,
        };
        if (
          serializeCanonicalJson(segment.pcm) !==
          serializeCanonicalJson(manifest.canonicalPcm)
        ) {
          context.addIssue({
            code: "custom",
            message: "Every chunk must use canonical PCM.",
            path: ["segments", index, "pcm"],
          });
        }
      } else {
        if (
          (segment.pauseMs === 0 && segment.sampleFrameCount !== 0) ||
          (segment.pauseMs > 0 && segment.sampleFrameCount === 0)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Zero pause must have zero samples; positive pause must have samples.",
            path: ["segments", index, "sampleFrameCount"],
          });
        }
        if (
          segment.afterChunkId !== previousChunk?.chunkId ||
          segment.meaningId !== previousChunk.meaningId
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Pause must immediately follow its owned chunk and meaningId.",
            path: ["segments", index, "afterChunkId"],
          });
        }
        previousChunk = undefined;
      }
    });

    if (chunkIds.size === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one sealed chunk is required.",
      });
    }
    if (BigInt(manifest.completeAudio.sampleFrameCount) !== totalSampleFrames) {
      context.addIssue({
        code: "custom",
        message: "Complete audio sampleFrameCount must equal the segment sum.",
        path: ["completeAudio", "sampleFrameCount"],
      });
    }
    if (!manifest.completeAudio.localPath.startsWith(projectPathPrefix)) {
      context.addIssue({
        code: "custom",
        message:
          "Complete audio path must stay inside the owning Story directory.",
        path: ["completeAudio", "localPath"],
      });
    }
    if (
      serializeCanonicalJson(manifest.completeAudio.pcm) !==
      serializeCanonicalJson(manifest.canonicalPcm)
    ) {
      context.addIssue({
        code: "custom",
        message: "Complete audio must use canonical PCM.",
        path: ["completeAudio", "pcm"],
      });
    }

    const { sealedNarrationFingerprint, ...input } = manifest;
    if (
      computeSealedNarrationFingerprint(input) !== sealedNarrationFingerprint
    ) {
      context.addIssue({
        code: "custom",
        message: "sealedNarrationFingerprint is stale.",
        path: ["sealedNarrationFingerprint"],
      });
    }
  }).readonly();

export type PcmFormat = z.infer<typeof PcmFormatSchema>;
export type SealedNarrationManifest = z.infer<
  typeof SealedNarrationManifestSchema
>;
```

- [ ] **Step 4: Add the valid sealed manifest builder**

Append to `tests/fixtures/narrative.ts`:

```ts
import {
  computeSealedNarrationFingerprint,
  SealedNarrationManifestSchema,
} from "../../src/contracts/sealed-narration";
import { computeGenerationInputFingerprint } from "../../src/contracts/generation-input";
import { NarrationSpecSchema } from "../../src/contracts/narration";
import { StorySpecSchema } from "../../src/contracts/story";

export const buildValidSealedNarrationManifest = () => {
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const pcm = {
    sampleRate: 48000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const input = {
    schemaVersion: 1,
    storyId: "story-example",
    narrationSpec: validNarrationSpec,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments: [
      {
        kind: "chunk",
        chunkId: "opening-01",
        meaningId: "opening",
        ttsText: "A",
        localPath:
          "public/projects/story-example/narration/chunks/opening-01.wav",
        checksum: `sha256:${"a".repeat(64)}`,
        pcm,
        sampleFrameCount: 52800,
      },
      {
        kind: "pause",
        afterChunkId: "opening-01",
        meaningId: "opening",
        pauseMs: 250,
        sampleFrameCount: 12000,
      },
      {
        kind: "chunk",
        chunkId: "conclusion-01",
        meaningId: "conclusion",
        ttsText: "B",
        localPath:
          "public/projects/story-example/narration/chunks/conclusion-01.wav",
        checksum: `sha256:${"b".repeat(64)}`,
        pcm,
        sampleFrameCount: 45600,
      },
    ],
    completeAudio: {
      localPath: "public/projects/story-example/narration/complete.wav",
      checksum: `sha256:${"c".repeat(64)}`,
      pcm,
      sampleFrameCount: 110400,
    },
  } as const;

  return SealedNarrationManifestSchema.parse({
    ...input,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(input),
  });
};
```

Keep all imports at the top of the fixture file when applying this append.

- [ ] **Step 5: Run focused tests and static checks**

```bash
node --import tsx --test --test-name-pattern="sealed narration|pause segments|owning Story" tests/contracts/sealed-narration.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/contracts/sealed-narration.ts tests/fixtures/narrative.ts tests/contracts/sealed-narration.test.ts
git commit -m "feat: define sealed narration receipt"
```

---

### Task 6: Generate SemanticTiming from cumulative PCM boundaries

**Files:**

- Create: `src/contracts/semantic-timing.ts`
- Create: `tests/contracts/semantic-timing.test.ts`

**Interfaces:**

- Consumes: `StorySpec`, `NarrationSpec`, `RenderSpec`, `SealedNarrationManifest`, and generation fingerprints.
- Produces: `ceilDivBigInt(a, b)`, `pauseMsToSampleFrames(pauseMs, sampleRate)`, `sampleFrameToFrame(input)`, `computeSemanticTimingFingerprint(manifest, render)`, `SemanticTimingSchema`, and `generateSemanticTiming({story, narration, render, sealedNarration})`.

- [ ] **Step 1: Write the failing timing example and boundary tests**

Create `tests/contracts/semantic-timing.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { NarrationSpecSchema } from "../../src/contracts/narration";
import { RenderSpecSchema } from "../../src/contracts/render";
import {
  computeSealedNarrationFingerprint,
  SealedNarrationManifestSchema,
} from "../../src/contracts/sealed-narration";
import {
  generateSemanticTiming,
  pauseMsToSampleFrames,
  sampleFrameToFrame,
} from "../../src/contracts/semantic-timing";
import { StorySpecSchema } from "../../src/contracts/story";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

test("pcm-cumulative-ceil-v1 reproduces the authority example", () => {
  const timing = generateSemanticTiming({
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration: buildValidSealedNarrationManifest(),
  });

  assert.deepEqual(
    timing.segments.map((segment) => segment.frameRange),
    [
      { startFrame: 15, endFrame: 48 },
      { startFrame: 48, endFrame: 56 },
      { startFrame: 56, endFrame: 84 },
    ],
  );
  assert.deepEqual(timing.captionCues, [
    {
      chunkId: "opening-01",
      meaningId: "opening",
      text: "A",
      startFrame: 15,
      endFrame: 48,
    },
    {
      chunkId: "conclusion-01",
      meaningId: "conclusion",
      text: "B",
      startFrame: 56,
      endFrame: 84,
    },
  ]);
  assert.deepEqual(timing.storyBeats, [
    { meaningId: "opening", startFrame: 15, endFrame: 56 },
    { meaningId: "conclusion", startFrame: 56, endFrame: 84 },
  ]);
  assert.equal(timing.durationInFrames, 96);
});

test("pause milliseconds use integer round-half-up sample conversion", () => {
  assert.equal(pauseMsToSampleFrames(0, 48000), 0);
  assert.equal(pauseMsToSampleFrames(250, 48000), 12000);
  assert.equal(pauseMsToSampleFrames(1, 44100), 44);
  assert.throws(() => pauseMsToSampleFrames(1, 1));
});

test("sample boundaries ceil once and reject unsafe output", () => {
  assert.equal(
    sampleFrameToFrame({ sampleFrame: 64800, fps: 30, sampleRate: 48000 }),
    41,
  );
  assert.throws(() =>
    sampleFrameToFrame({
      sampleFrame: Number.MAX_SAFE_INTEGER,
      fps: Number.MAX_SAFE_INTEGER,
      sampleRate: 1,
    }),
  );
});

test("a TTSChunk that quantizes to zero frames fails closed", () => {
  const original = buildValidSealedNarrationManifest();
  const resizedInput = {
    schemaVersion: original.schemaVersion,
    storyId: original.storyId,
    narrationSpec: original.narrationSpec,
    generationInputFingerprint: original.generationInputFingerprint,
    normalizationAlgorithmId: original.normalizationAlgorithmId,
    assemblyAlgorithmId: original.assemblyAlgorithmId,
    canonicalPcm: original.canonicalPcm,
    segments: original.segments.map((segment, index) =>
      index === 2 && segment.kind === "chunk"
        ? { ...segment, sampleFrameCount: 1 }
        : segment,
    ),
    completeAudio: {
      ...original.completeAudio,
      checksum: `sha256:${"d".repeat(64)}`,
      sampleFrameCount: 64801,
    },
  };
  const resized = SealedNarrationManifestSchema.parse({
    ...resizedInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(resizedInput),
  });

  assert.throws(() =>
    generateSemanticTiming({
      story: StorySpecSchema.parse(validStorySpec),
      narration: NarrationSpecSchema.parse(validNarrationSpec),
      render: RenderSpecSchema.parse(validRenderSpec),
      sealedNarration: resized,
    }),
  );
});

test("a positive pause keeps PCM samples even when its frame range is zero", () => {
  const original = buildValidSealedNarrationManifest();
  const oneMillisecondPauseStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 1 }],
      },
      validStorySpec.beats[1],
    ],
  });
  const resizedInput = {
    schemaVersion: original.schemaVersion,
    storyId: original.storyId,
    narrationSpec: original.narrationSpec,
    generationInputFingerprint: original.generationInputFingerprint,
    normalizationAlgorithmId: original.normalizationAlgorithmId,
    assemblyAlgorithmId: original.assemblyAlgorithmId,
    canonicalPcm: original.canonicalPcm,
    segments: original.segments.map((segment, index) => {
      if (index === 0 && segment.kind === "chunk") {
        return { ...segment, sampleFrameCount: 52000 };
      }
      if (segment.kind === "pause") {
        return { ...segment, pauseMs: 1, sampleFrameCount: 48 };
      }
      return segment;
    }),
    completeAudio: {
      ...original.completeAudio,
      checksum: `sha256:${"e".repeat(64)}`,
      sampleFrameCount: 97648,
    },
  };
  const resized = SealedNarrationManifestSchema.parse({
    ...resizedInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(resizedInput),
  });
  const timing = generateSemanticTiming({
    story: oneMillisecondPauseStory,
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration: resized,
  });

  assert.deepEqual(timing.segments[1].frameRange, {
    startFrame: 48,
    endFrame: 48,
  });
  assert.deepEqual(timing.segments[1].sampleRange, {
    startSampleFrame: 52000,
    endSampleFrame: 52048,
  });
});

test("a zero pause keeps an explicit zero-length owned segment", () => {
  const original = buildValidSealedNarrationManifest();
  const zeroPauseStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 0 }],
      },
      validStorySpec.beats[1],
    ],
  });
  const zeroPauseInput = {
    schemaVersion: original.schemaVersion,
    storyId: original.storyId,
    narrationSpec: original.narrationSpec,
    generationInputFingerprint: original.generationInputFingerprint,
    normalizationAlgorithmId: original.normalizationAlgorithmId,
    assemblyAlgorithmId: original.assemblyAlgorithmId,
    canonicalPcm: original.canonicalPcm,
    segments: original.segments.map((segment) =>
      segment.kind === "pause"
        ? { ...segment, pauseMs: 0, sampleFrameCount: 0 }
        : segment,
    ),
    completeAudio: {
      ...original.completeAudio,
      checksum: `sha256:${"f".repeat(64)}`,
      sampleFrameCount: 98400,
    },
  };
  const sealedNarration = SealedNarrationManifestSchema.parse({
    ...zeroPauseInput,
    sealedNarrationFingerprint:
      computeSealedNarrationFingerprint(zeroPauseInput),
  });
  const timing = generateSemanticTiming({
    story: zeroPauseStory,
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration,
  });

  assert.deepEqual(timing.segments[1].frameRange, {
    startFrame: 48,
    endFrame: 48,
  });
  assert.deepEqual(timing.segments[1].sampleRange, {
    startSampleFrame: 52800,
    endSampleFrame: 52800,
  });
});

test("timing fingerprint ignores RenderSpec non-timing fields", () => {
  const input = {
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    sealedNarration: buildValidSealedNarrationManifest(),
  };
  const original = generateSemanticTiming({
    ...input,
    render: RenderSpecSchema.parse(validRenderSpec),
  });
  const captionLayoutOnly = generateSemanticTiming({
    ...input,
    render: RenderSpecSchema.parse({
      ...validRenderSpec,
      captionSafeAreaPx: { ...validRenderSpec.captionSafeAreaPx, bottom: 96 },
    }),
  });
  const changedFps = generateSemanticTiming({
    ...input,
    render: RenderSpecSchema.parse({ ...validRenderSpec, fps: 24 }),
  });

  assert.equal(original.fingerprint, captionLayoutOnly.fingerprint);
  assert.notEqual(original.fingerprint, changedFps.fingerprint);
});
```

- [ ] **Step 2: Run timing tests and verify the red state**

```bash
node --import tsx --test --test-name-pattern="pcm-cumulative|pause milliseconds|sample boundaries|zero frames|positive pause|zero pause|timing fingerprint" tests/contracts/semantic-timing.test.ts
```

Expected: FAIL because `semantic-timing.ts` does not exist.

- [ ] **Step 3: Define the persisted SemanticTiming schemas**

Create `src/contracts/semantic-timing.ts` with these strict shapes:

```ts
import { z } from "zod";

import { serializeCanonicalJson, createFingerprint } from "./fingerprint";
import { computeGenerationInputFingerprint } from "./generation-input";
import type { NarrationSpec } from "./narration";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";
import type { RenderSpec } from "./render";
import type { SealedNarrationManifest } from "./sealed-narration";
import type { StorySpec } from "./story";

export const TIMING_ALGORITHM_ID = "pcm-cumulative-ceil-v1" as const;

const FrameRangeSchema = z
  .object({
    startFrame: NonNegativeIntegerSchema,
    endFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.endFrame < range.startFrame) {
      context.addIssue({
        code: "custom",
        message: "Frame range must not run backward.",
      });
    }
  })
  .readonly();

const SampleRangeSchema = z
  .object({
    startSampleFrame: NonNegativeIntegerSchema,
    endSampleFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.endSampleFrame < range.startSampleFrame) {
      context.addIssue({
        code: "custom",
        message: "Sample range must not run backward.",
      });
    }
  })
  .readonly();

const NonEmptySampleRangeSchema = SampleRangeSchema.superRefine(
  (range, context) => {
    if (range.endSampleFrame === range.startSampleFrame) {
      context.addIssue({
        code: "custom",
        message: "Chunk sample range must contain PCM samples.",
      });
    }
  },
);

const TimedChunkSchema = z
  .object({
    kind: z.literal("chunk"),
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: z.string().trim().min(1),
    sampleRange: NonEmptySampleRangeSchema,
    frameRange: FrameRangeSchema,
  })
  .strict()
  .readonly();

const TimedPauseSchema = z
  .object({
    kind: z.literal("pause"),
    afterChunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    pauseMs: NonNegativeIntegerSchema,
    sampleRange: SampleRangeSchema,
    frameRange: FrameRangeSchema,
  })
  .strict()
  .readonly();

const CaptionCueSchema = z
  .object({
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    text: z.string().trim().min(1),
    startFrame: NonNegativeIntegerSchema,
    endFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.endFrame <= cue.startFrame) {
      context.addIssue({
        code: "custom",
        message: "CaptionCue must cover at least one frame.",
      });
    }
  })
  .readonly();

const StoryBeatTimingSchema = z
  .object({
    meaningId: MeaningIdSchema,
    startFrame: NonNegativeIntegerSchema,
    endFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((beat, context) => {
    if (beat.endFrame <= beat.startFrame) {
      context.addIssue({
        code: "custom",
        message: "StoryBeat timing must cover at least one frame.",
      });
    }
  })
  .readonly();

export const SemanticTimingSchema = z
  .object({
    schemaVersion: z.literal(1),
    algorithmId: z.literal(TIMING_ALGORITHM_ID),
    storyId: StoryIdSchema,
    fingerprint: Sha256DigestSchema,
    sampleRate: z.number().int().positive().safe(),
    fps: z.number().int().positive().safe(),
    leadInFrames: NonNegativeIntegerSchema,
    tailFrames: NonNegativeIntegerSchema,
    durationInFrames: z.number().int().positive().safe(),
    segments: z
      .array(z.discriminatedUnion("kind", [TimedChunkSchema, TimedPauseSchema]))
      .min(1)
      .readonly(),
    captionCues: z.array(CaptionCueSchema).min(1).readonly(),
    storyBeats: z.array(StoryBeatTimingSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

export type SemanticTiming = z.infer<typeof SemanticTimingSchema>;
```

- [ ] **Step 4: Implement integer conversion helpers and the timing fingerprint**

Add to `src/contracts/semantic-timing.ts`:

```ts
export const ceilDivBigInt = (value: bigint, divisor: bigint): bigint => {
  if (value < 0n || divisor <= 0n)
    throw new Error("ceilDivBigInt requires value >= 0 and divisor > 0.");
  return (value + divisor - 1n) / divisor;
};

const toSafeNumber = (value: bigint, label: string): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is outside the non-negative safe integer range.`);
  }
  return Number(value);
};

export const pauseMsToSampleFrames = (
  pauseMs: number,
  sampleRate: number,
): number => {
  if (!Number.isSafeInteger(pauseMs) || pauseMs < 0)
    throw new Error("pauseMs must be non-negative.");
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0)
    throw new Error("sampleRate must be positive.");
  const samples = (BigInt(pauseMs) * BigInt(sampleRate) + 500n) / 1000n;
  if (pauseMs > 0 && samples === 0n)
    throw new Error("Positive pause must produce at least one sample frame.");
  return toSafeNumber(samples, "pause sampleFrameCount");
};

export const sampleFrameToFrame = ({
  sampleFrame,
  fps,
  sampleRate,
}: {
  readonly sampleFrame: number;
  readonly fps: number;
  readonly sampleRate: number;
}): number => {
  if (![sampleFrame, fps, sampleRate].every(Number.isSafeInteger)) {
    throw new Error("sampleFrame, fps, and sampleRate must be safe integers.");
  }
  return toSafeNumber(
    ceilDivBigInt(BigInt(sampleFrame) * BigInt(fps), BigInt(sampleRate)),
    "frame boundary",
  );
};

export const computeSemanticTimingFingerprint = (
  sealedNarration: SealedNarrationManifest,
  render: RenderSpec,
) =>
  createFingerprint({
    namespace: "semantic-timing",
    version: 1,
    value: {
      algorithmId: TIMING_ALGORITHM_ID,
      sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
      fps: render.fps,
      leadInFrames: render.leadInFrames,
      tailFrames: render.tailFrames,
    },
  });
```

- [ ] **Step 5: Implement ordered-source verification and cumulative timing generation**

Add `generateSemanticTiming` to the same file. It must perform these operations in this order:

```ts
export const generateSemanticTiming = ({
  story,
  narration,
  render,
  sealedNarration,
}: {
  readonly story: StorySpec;
  readonly narration: NarrationSpec;
  readonly render: RenderSpec;
  readonly sealedNarration: SealedNarrationManifest;
}): SemanticTiming => {
  if (story.storyId !== sealedNarration.storyId)
    throw new Error("Story and sealed narration ids differ.");
  if (
    serializeCanonicalJson(narration) !==
    serializeCanonicalJson(sealedNarration.narrationSpec)
  ) {
    throw new Error("NarrationSpec does not match sealed narration.");
  }
  if (
    computeGenerationInputFingerprint(story, narration) !==
    sealedNarration.generationInputFingerprint
  ) {
    throw new Error("Generation input fingerprint is stale.");
  }

  const expected = story.beats.flatMap((beat) => {
    const pauses = new Map(
      beat.explicitPauses.map((pause) => [pause.afterChunkId, pause]),
    );
    return beat.ttsChunks.flatMap((chunk) => {
      const pause = pauses.get(chunk.chunkId);
      return [
        {
          kind: "chunk" as const,
          chunkId: chunk.chunkId,
          meaningId: beat.meaningId,
          ttsText: chunk.ttsText,
        },
        ...(pause
          ? [
              {
                kind: "pause" as const,
                afterChunkId: chunk.chunkId,
                meaningId: beat.meaningId,
                pauseMs: pause.pauseMs,
              },
            ]
          : []),
      ];
    });
  });

  if (expected.length !== sealedNarration.segments.length) {
    throw new Error("Sealed timeline segment count does not match StorySpec.");
  }

  let sampleCursor = 0n;
  const timedSegments = sealedNarration.segments.map((segment, index) => {
    const declaration = expected[index];
    if (
      serializeCanonicalJson(declaration) !==
      serializeCanonicalJson(
        segment.kind === "chunk"
          ? {
              kind: segment.kind,
              chunkId: segment.chunkId,
              meaningId: segment.meaningId,
              ttsText: segment.ttsText,
            }
          : {
              kind: segment.kind,
              afterChunkId: segment.afterChunkId,
              meaningId: segment.meaningId,
              pauseMs: segment.pauseMs,
            },
      )
    ) {
      throw new Error(`Sealed segment ${index} does not match StorySpec.`);
    }
    if (
      segment.kind === "pause" &&
      segment.sampleFrameCount !==
        pauseMsToSampleFrames(
          segment.pauseMs,
          sealedNarration.canonicalPcm.sampleRate,
        )
    ) {
      throw new Error(`Pause segment ${index} has a stale sampleFrameCount.`);
    }

    const startSampleFrameBigInt = sampleCursor;
    sampleCursor += BigInt(segment.sampleFrameCount);
    const endSampleFrameBigInt = sampleCursor;
    const startSampleFrame = toSafeNumber(
      startSampleFrameBigInt,
      "startSampleFrame",
    );
    const endSampleFrame = toSafeNumber(endSampleFrameBigInt, "endSampleFrame");
    const startFrame = toSafeNumber(
      BigInt(render.leadInFrames) +
        BigInt(
          sampleFrameToFrame({
            sampleFrame: startSampleFrame,
            fps: render.fps,
            sampleRate: sealedNarration.canonicalPcm.sampleRate,
          }),
        ),
      "absolute startFrame",
    );
    const endFrame = toSafeNumber(
      BigInt(render.leadInFrames) +
        BigInt(
          sampleFrameToFrame({
            sampleFrame: endSampleFrame,
            fps: render.fps,
            sampleRate: sealedNarration.canonicalPcm.sampleRate,
          }),
        ),
      "absolute endFrame",
    );
    if (segment.kind === "chunk" && endFrame <= startFrame) {
      throw new Error(`TTSChunk ${segment.chunkId} quantizes to zero frames.`);
    }

    return {
      ...declaration,
      sampleRange: { startSampleFrame, endSampleFrame },
      frameRange: { startFrame, endFrame },
    };
  });

  if (sampleCursor !== BigInt(sealedNarration.completeAudio.sampleFrameCount)) {
    throw new Error("Generated sample timeline does not match complete audio.");
  }

  const captionCues = timedSegments.flatMap((segment) =>
    segment.kind === "chunk"
      ? [
          {
            chunkId: segment.chunkId,
            meaningId: segment.meaningId,
            text: segment.ttsText,
            startFrame: segment.frameRange.startFrame,
            endFrame: segment.frameRange.endFrame,
          },
        ]
      : [],
  );

  const storyBeats = story.beats.map((beat) => {
    const owned = timedSegments.filter(
      (segment) => segment.meaningId === beat.meaningId,
    );
    if (owned.length === 0)
      throw new Error(`StoryBeat ${beat.meaningId} has no timed segments.`);
    return {
      meaningId: beat.meaningId,
      startFrame: owned[0].frameRange.startFrame,
      endFrame: owned[owned.length - 1].frameRange.endFrame,
    };
  });

  const narrationFrames = sampleFrameToFrame({
    sampleFrame: toSafeNumber(sampleCursor, "total sampleFrameCount"),
    fps: render.fps,
    sampleRate: sealedNarration.canonicalPcm.sampleRate,
  });

  return SemanticTimingSchema.parse({
    schemaVersion: 1,
    algorithmId: TIMING_ALGORITHM_ID,
    storyId: story.storyId,
    fingerprint: computeSemanticTimingFingerprint(sealedNarration, render),
    sampleRate: sealedNarration.canonicalPcm.sampleRate,
    fps: render.fps,
    leadInFrames: render.leadInFrames,
    tailFrames: render.tailFrames,
    durationInFrames: toSafeNumber(
      BigInt(render.leadInFrames) +
        BigInt(narrationFrames) +
        BigInt(render.tailFrames),
      "durationInFrames",
    ),
    segments: timedSegments,
    captionCues,
    storyBeats,
  });
};
```

- [ ] **Step 6: Run focused tests and static checks**

```bash
node --import tsx --test --test-name-pattern="pcm-cumulative|pause milliseconds|sample boundaries|zero frames|positive pause|zero pause|timing fingerprint" tests/contracts/semantic-timing.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0 and the example returns duration `96`.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/contracts/semantic-timing.ts tests/contracts/semantic-timing.test.ts
git commit -m "feat: generate cumulative semantic timing"
```

---

### Task 7: Add aggregate validation, public exports, and the invalidation matrix

**Files:**

- Create: `src/contracts/m1-validation.ts`
- Create: `src/contracts/index.ts`
- Create: `tests/contracts/invalidation.test.ts`

**Interfaces:**

- Consumes: all Task 1–6 schemas and pure functions.
- Produces: `M1ArtifactBundleSchema`, `validateM1ArtifactBundle(input)`, a single public contract barrel, and executable evidence for the M1 invalidation rules.

- [ ] **Step 1: Write failing aggregate and invalidation tests**

Create `tests/contracts/invalidation.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  generateSemanticTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
  StorySpecSchema,
  validateM1ArtifactBundle,
} from "../../src/contracts";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validProjectSource,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

const buildBundle = () => {
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const render = RenderSpecSchema.parse(validRenderSpec);
  const sealedNarration = buildValidSealedNarrationManifest();
  const semanticTiming = generateSemanticTiming({
    story,
    narration,
    render,
    sealedNarration,
  });
  return { projectSource: validProjectSource, sealedNarration, semanticTiming };
};

test("M1 aggregate accepts a mutually matching source, seal, and timing set", () => {
  assert.equal(
    validateM1ArtifactBundle(buildBundle()).semanticTiming.durationInFrames,
    96,
  );
});

test("ttsText and NarrationSpec changes invalidate generation and all sealed downstream", () => {
  const bundle = buildBundle();
  const changedStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        ttsChunks: [{ chunkId: "opening-01", ttsText: "Changed" }],
      },
      validStorySpec.beats[1],
    ],
  });
  assert.notEqual(
    computeGenerationInputFingerprint(
      changedStory,
      NarrationSpecSchema.parse(validNarrationSpec),
    ),
    bundle.sealedNarration.generationInputFingerprint,
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: { ...validProjectSource, story: changedStory },
    }),
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: {
        ...validProjectSource,
        narration: { ...validNarrationSpec, seed: 43 },
      },
    }),
  );
});

test("pause changes retain generation input but invalidate sealed narration and timing", () => {
  const bundle = buildBundle();
  const changedPauseStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 500 }],
      },
      validStorySpec.beats[1],
    ],
  });
  assert.equal(
    computeGenerationInputFingerprint(
      changedPauseStory,
      NarrationSpecSchema.parse(validNarrationSpec),
    ),
    bundle.sealedNarration.generationInputFingerprint,
  );
  const { sealedNarrationFingerprint: currentFingerprint, ...sealedInput } =
    bundle.sealedNarration;
  assert.notEqual(
    computeSealedNarrationFingerprint({
      ...sealedInput,
      segments: bundle.sealedNarration.segments.map((segment) =>
        segment.kind === "pause"
          ? { ...segment, pauseMs: 500, sampleFrameCount: 24000 }
          : segment,
      ),
      completeAudio: {
        ...bundle.sealedNarration.completeAudio,
        sampleFrameCount: 122400,
      },
    }),
    currentFingerprint,
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: { ...validProjectSource, story: changedPauseStory },
    }),
  );
});

test("RenderSpec timing changes invalidate timing while non-timing fields do not", () => {
  const bundle = buildBundle();
  const source = {
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    sealedNarration: bundle.sealedNarration,
  };
  const changedLayout = generateSemanticTiming({
    ...source,
    render: RenderSpecSchema.parse({
      ...validRenderSpec,
      captionSafeAreaPx: { ...validRenderSpec.captionSafeAreaPx, bottom: 96 },
    }),
  });
  const changedLeadIn = generateSemanticTiming({
    ...source,
    render: RenderSpecSchema.parse({ ...validRenderSpec, leadInFrames: 30 }),
  });

  assert.equal(changedLayout.fingerprint, bundle.semanticTiming.fingerprint);
  assert.notEqual(changedLeadIn.fingerprint, bundle.semanticTiming.fingerprint);
  assert.doesNotThrow(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: {
        ...validProjectSource,
        render: {
          ...validRenderSpec,
          captionSafeAreaPx: {
            ...validRenderSpec.captionSafeAreaPx,
            bottom: 96,
          },
        },
      },
    }),
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: {
        ...validProjectSource,
        render: { ...validRenderSpec, leadInFrames: 30 },
      },
    }),
  );
});
```

- [ ] **Step 2: Run aggregate tests and verify the red state**

```bash
node --import tsx --test --test-name-pattern="M1 aggregate|ttsText|pause changes|RenderSpec timing" tests/contracts/invalidation.test.ts
```

Expected: FAIL because `src/contracts/index.ts` and `m1-validation.ts` do not exist.

- [ ] **Step 3: Implement aggregate stale-artifact validation**

Create `src/contracts/m1-validation.ts`:

```ts
import { z } from "zod";

import { serializeCanonicalJson } from "./fingerprint";
import { NarrativeProjectSourceSchema } from "./project";
import { SealedNarrationManifestSchema } from "./sealed-narration";
import {
  generateSemanticTiming,
  SemanticTimingSchema,
} from "./semantic-timing";

export const M1ArtifactBundleSchema = z
  .object({
    projectSource: NarrativeProjectSourceSchema,
    sealedNarration: SealedNarrationManifestSchema,
    semanticTiming: SemanticTimingSchema,
  })
  .strict()
  .readonly();

export type M1ArtifactBundle = z.infer<typeof M1ArtifactBundleSchema>;

export const validateM1ArtifactBundle = (input: unknown): M1ArtifactBundle => {
  const bundle = M1ArtifactBundleSchema.parse(input);
  const regenerated = generateSemanticTiming({
    story: bundle.projectSource.story,
    narration: bundle.projectSource.narration,
    render: bundle.projectSource.render,
    sealedNarration: bundle.sealedNarration,
  });
  if (
    serializeCanonicalJson(regenerated) !==
    serializeCanonicalJson(bundle.semanticTiming)
  ) {
    throw new Error("semantic-timing.generated.json is stale.");
  }
  return bundle;
};
```

- [ ] **Step 4: Add the public barrel without changing `assets.ts` imports**

Create `src/contracts/index.ts`:

```ts
export * from "./brief";
export * from "./fingerprint";
export * from "./generation-input";
export * from "./m1-validation";
export * from "./narration";
export * from "./primitives";
export * from "./project";
export * from "./render";
export * from "./sealed-narration";
export * from "./semantic-timing";
export * from "./story";
```

Do not re-export or rewrite `assets.ts` in M1; existing sound capability imports remain unchanged.

- [ ] **Step 5: Run the complete M1 test suite and static checks**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: every contract test passes with zero failures, and static checks exit 0.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/contracts/m1-validation.ts src/contracts/index.ts tests/contracts/invalidation.test.ts
git commit -m "test: prove narrative invalidation semantics"
```

---

### Task 8: Document and close the M1 milestone

**Files:**

- Delete: `docs/contracts/.gitkeep`
- Create: `docs/contracts/NARRATIVE_CONTRACTS.md`
- Modify: `docs/README.md`
- Modify: `README.md`
- Modify: `docs/DETERMINISTIC_EXECUTION.md`
- Modify: `docs/ITERATION_STATUS.md`
- Modify: `docs/ROADMAP.md`

**Interfaces:**

- Consumes: all verified Task 1–7 code, commands, schema names, algorithm IDs, and test evidence.
- Produces: repository-local contract reference, documented `npm test`, and authority docs that describe M1 as implemented while leaving M2+ unimplemented.

- [ ] **Step 1: Write the contract reference from the implemented schemas**

Create `docs/contracts/NARRATIVE_CONTRACTS.md` with these sections and exact decisions:

````markdown
# Narrative Contracts v1

## Persisted source files

- `brief.json` → `VideoBriefSchema`
- `story.json` → `StorySpecSchema`
- `narration.json` → `NarrationSpecSchema`
- `render.json` → `RenderSpecSchema`
- `generated/sealed-narration.generated.json` → `SealedNarrationManifestSchema`
- `generated/semantic-timing.generated.json` → `SemanticTimingSchema`

The first four files are authored source; the two `generated/` files are derived artifacts. All
objects are strict and use `schemaVersion: 1`.

## Identity

`storyId` is the lowercase filesystem slug and becomes `StoryCompositionProps.projectId`.
`meaningId` is unique per StorySpec. `chunkId` is unique across the complete StorySpec.
Array order is semantic order; no independent numeric order field exists.

## Authored narration

`ttsChunks` are authored units and are never split mechanically. An explicit pause is declared by
`{afterChunkId, pauseMs}` in its owning StoryBeat, where `pauseMs` is a non-negative integer. A zero
pause remains an owned zero-length timeline segment; a positive pause must quantize to at least one PCM
sample frame. Pause declarations are excluded from the generation input fingerprint but included in the
sealed narration fingerprint.

## Fingerprints

`sha256-canonical-json-v1` recursively sorts object keys, preserves array order, rejects non-JSON
values, and hashes a domain-separated `{namespace, value, version}` envelope as UTF-8 SHA-256.

## Sealed narration

`SealedNarrationManifestSchema` records the selected normalized chunk artifacts, explicit pause
segments, canonical PCM format, complete WAV metadata, checksums, generation input fingerprint, and
sealed narration fingerprint. M1 validates metadata only; M2 performs real file measurement and sealing.

## Semantic timing

`pcm-cumulative-ceil-v1` builds one cumulative integer sample timeline and applies
`ceilDiv(samples × fps, sampleRate)` at shared boundaries with `BigInt`. CaptionCue is one-to-one with
TTSChunk. Explicit pauses have timing but no CaptionCue. RenderSpec timing fields are `fps`,
`leadInFrames`, and `tailFrames`.

## M1 command

```bash
npm test
```
````

Remove `docs/contracts/.gitkeep` because the directory now has a real authority document.

- [ ] **Step 2: Update navigation and usage docs**

In `docs/README.md`, add `contracts/NARRATIVE_CONTRACTS.md` as the implemented v1 contract reference.

In `README.md`, add:

```bash
npm test
```

to the common verification commands and state that M1 contracts/timing are implemented while VoxCPM, NarrativeCore, ProjectRegistry, and Scene remain unimplemented.

- [ ] **Step 3: Update deterministic and status authority without overstating progress**

In `docs/DETERMINISTIC_EXECUTION.md`:

- replace M1 target-only wording for schemas, canonical fingerprints, and `pcm-cumulative-ceil-v1` with the exact implemented modules;
- keep TTS file generation/sealing, NarrativeCore, ProjectRegistry, and all enhancement tracks marked as future work;
- document `npm test` as the focused M1 mechanical check.

In `docs/ITERATION_STATUS.md`:

- move only contracts, canonical fingerprint primitives, metadata-only sealed receipt validation, timing generation, and their tests into `已完成`;
- keep real VoxCPM, audio measurement, complete WAV creation, StoryCheck, runtime, registry, preview/render, and M2+ items in `尚未完成`;
- set the next step to writing and reviewing the M2 implementation plan.

In `docs/ROADMAP.md`, mark M1 complete only after the final verification step below passes and mark M2 as next.

- [ ] **Step 4: Run the complete repository verification gate**

Run fresh:

```bash
npm test
npm run check
git diff --check
```

Expected:

- all Node contract tests pass with zero failures;
- typecheck, lint, Remotion bundle, and composition listing exit 0;
- `CapabilityGallery` remains listed;
- `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Verify M1 scope remained bounded**

Run:

```bash
git diff --name-only 1535d3f
rg -n "VoxCPM|NarrativeCore|ProjectRegistry|ScenePackage|RendererRegistry" src tests
```

Expected:

- changed implementation files are limited to `src/contracts/`, `tests/`, package metadata, this M1 plan, and the listed documentation;
- the search returns only type-level/documented boundary references, with no provider calls, Remotion runtime, registry generation, or Scene implementation.

- [ ] **Step 6: Commit Task 8**

```bash
git add -A docs/contracts
git add docs/README.md README.md docs/DETERMINISTIC_EXECUTION.md docs/ITERATION_STATUS.md docs/ROADMAP.md
git commit -m "docs: close M1 deterministic contract milestone"
```

---

## M1 completion evidence

M1 is complete only when all of the following are simultaneously true:

- `npm test` passes every contract, timing, aggregate, and invalidation test.
- `npm run check` passes typecheck, lint, bundle, and composition listing.
- The authority example produces `[15,48)`, `[48,56)`, `[56,84)`, and total duration `96`.
- `ttsText`, NarrationSpec, pause, RenderSpec timing, and RenderSpec non-timing changes follow the documented invalidation matrix.
- No provider address, token, module path, JSX, or executable expression is accepted by persisted schemas.
- No VoxCPM call, audio file measurement, Remotion runtime, ProjectRegistry, Scene contract, or enhancement track has been implemented.
- `docs/ITERATION_STATUS.md` states only the verified M1 subset as complete and identifies M2 planning as next.

After this evidence is recorded, stop. Do not begin M2 in the same execution run.
