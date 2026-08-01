# M3 Narrative Baseline Runtime and Story Registration Implementation Plan

> **Execution mode:** Execute this plan directly in the active repository conversation, one bounded
> Task at a time, using the checkbox (`- [ ]`) steps as the execution record. Do not use a subagent,
> plan runner, `executing-plans`, or another skill. This planning turn creates only this document; it
> does not implement, commit, or push anything.

**Goal:** Consume the already sealed `gps-relativity` narration and absolute `SemanticTiming` to make
`GpsRelativity` a statically registered, lazy-loaded Remotion Composition that can be listed, previewed,
and rendered as a Narrative Baseline with one complete narration track, one top-level caption layer,
and otherwise transparent visual output.

**Architecture:** Keep M1/M2 source, PCM, manifest, timing, and fingerprints read-only. Add a small
runtime whose dependency direction is `CompositionAssembly -> NarrativeCore ->
NarrationAudioTrack + CaptionLayer`; add one project-local default-export Composition that statically
imports and validates its own data; generate a deterministic TypeScript ProjectRegistry from the fixed
`src/projects/*/Composition.tsx` convention before bundling; and let `Root.tsx` statically enumerate
registry metadata while handing a generated literal loader to Remotion `lazyComponent`. M3 evidence
binds the M2 identities, registry entry, runtime version, transparent PNG checks, and a real full render
without creating the M4 `project:check` or `NarrativeCheck` layer.

**Tech stack:** TypeScript 5.9.3, React 19.2.3, Remotion and all `@remotion/*` packages at exactly
4.0.489, Zod 4.3.6, Node.js 20+ built-ins, `tsx` 4.23.1, TypeScript compiler AST, Prettier 3.8.1,
host FFmpeg/ffprobe, and host Remotion CLI. No new package or Docker workflow is planned.

## Planning baseline

- Repository: `/data/projects/repos/remotion-story-producer`; the environment-reported
  `/home/zzzxc/projects/repos/remotion-story-producer` path resolves to the same checkout.
- Branch: `codex/foundation`.
- Base HEAD: `f3074856a51cacf9b9f586909308a7350c090fee`
  (`docs: close M2 real narration milestone`).
- The worktree is clean before this plan file is created.
- `README.md`, all seven authority documents, `docs/NARRATION_GENERATION.md`, the M2 evidence, the
  complete M2 plan, current code/tests, `git status`, and recent commits were read before writing this
  plan.
- M1 and M2 are implemented. M3 has not started: `Root.tsx` registers only `CapabilityGallery`, the
  runtime directories contain no implementation, `gps-relativity/Composition.tsx` does not exist, and
  `src/projects/project-registry.generated.ts` does not exist.
- Current `gps-relativity` facts that M3 must consume without rewriting:
  - Composition ID `GpsRelativity`, 30 fps, 1920x1080, 15 lead-in frames, 15 tail frames;
  - `SemanticTiming.durationInFrames = 1731`;
  - ten absolute CaptionCues, beginning at frame 15 and ending at frame 1716;
  - sealed narration fingerprint
    `sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5`;
  - SemanticTiming fingerprint
    `sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c`;
  - complete audio checksum
    `sha256:9a6d9201d44f5926f48c7d017ade48e5d59639bbcb4c5bf4089c620d2ac38d98`;
  - complete audio sample-frame count `2721600` at 48 kHz mono s16le.
- H.264 does not preserve alpha. M3 therefore proves two different facts with different artifacts:
  transparent PNG stills prove the Composition draws no background outside `CaptionLayer`; the full
  H.264/AAC MP4 proves the Narrative Baseline is actually listable and playable. A black appearance in
  the MP4 is an encoder/container presentation of transparency, not a NarrativeCore background.

## Global constraints

- Use only host Node.js/npm, Remotion CLI, FFmpeg, and ffprobe. Do not add Docker, docker-compose,
  containers, or a service manager.
- Keep every `remotion` and `@remotion/*` version exactly `4.0.489`; M3 adds no dependency.
- Treat `story.json`, `narration.json`, `render.json`, the M2 sealed manifest, the sealed WAV directory,
  and `semantic-timing.generated.json` as read-only M3 inputs.
- Never call VoxCPM, read `RSP_VOXCPM_PRIVATE_CONFIG`, regenerate chunks, run `narration:generate`, run
  `narration:seal`, supersede a receipt, or overwrite any M2 sealed artifact.
- Preserve authored `ttsChunks`, `SealedNarrationManifest`, sealed PCM bytes, all integer
  sample-frame counts, the `BigInt` implementation, and `pcm-cumulative-ceil-v1` exactly. M3 may
  validate these contracts but may not introduce a competing timing calculation.
- Mount the complete narration WAV exactly once, under one `<Sequence from={leadInFrames}>`, with
  `playbackRate={1}`. Do not mount chunk WAVs, trim audio, loop audio, retime audio, or use
  `trimBefore`/`trimAfter`.
- `CaptionLayer` accepts only already generated absolute CaptionCue frames plus caption layout inputs.
  Its interface must not accept PCM samples, sample rate, fps, durations, TTS chunks, or audio bytes,
  so it cannot recompute time.
- `NarrativeCore` contains only `NarrationAudioTrack` and the top-level `CaptionLayer`. It must not
  render a full-frame background, fallback canvas, decorative visual, Scene placeholder, watermark,
  title card, or capability demo.
- `CompositionAssembly` implements only a required `narrativeCore` slot. Do not add optional
  `storyVisualTrack`, `soundDesignTrack`, or `globalVisualLayers` fields or empty implementations in
  M3.
- `gps-relativity/Composition.tsx` must default export the Story Composition. It statically imports its
  own local JSON and passes only validated M1/M2 data into the runtime.
- Directory discovery occurs only in the fixed Node generation step and only for exact immediate-child
  paths `src/projects/<slug>/Composition.tsx`. Do not recurse, accept a glob, accept an environment
  path, or read a module path from JSON.
- Generated imports must have string-literal specifiers such as
  `() => import("./gps-relativity/Composition")`. No template literal, variable, concatenation,
  `require()`, `import.meta.glob`, or runtime filesystem lookup is allowed.
- Registry metadata is fully enumerable before a Story module loads: `id`, `fps`, `width`, `height`,
  `durationInFrames`, small `defaultProps`, generator identity, registry-entry fingerprint, and
  Narrative Baseline fingerprint.
- `Root.tsx` statically imports only the generated registry. It does not import Story JSON, scan the
  filesystem, execute the generator, or statically import every Story Composition.
- Generated registry output is stable, formatted, atomically replaced only after all entries validate,
  tracked in Git, and compared byte-for-byte by a read-only drift check.
- Keep `CapabilityGallery` as the existing hand-written system Composition. It is not part of project
  discovery and remains registered with `component`, while Story entries use `lazyComponent` only.
- M3 may add narrow registry generation/check and Baseline evidence commands. It must not add
  `project:check`, `NarrativeCheck`, AutoCheck aggregation, approval receipts, or another M4 surface.
- Do not create or modify Scene, SceneVisualPlan, ShotPlan, ScenePackage, RendererRegistry,
  ResourceCatalog, BaseCanvas, StoryVisualTrack, SoundDesignTrack, GlobalVisualLayers, transition, or
  visual-asset code.
- Keep new runtime code under the already reserved `src/remotion/runtime/` directories and the first
  Story Composition under `src/projects/gps-relativity/`. Do not promote a new shared capability.
- Use TDD for every implementation Task: focused failing test, recorded red reason, smallest green
  implementation, focused green test, typecheck, targeted lint, then the Task's exact small commit.
- Protect unrelated work. Stage only the paths listed by the active Task; never reset, overwrite,
  delete, or opportunistically format an unrelated file.
- Each implementation Task below is a future commit boundary. This planning turn executes none of the
  commit commands.
- Do not push unless the user separately requests it.

## Engineering principles and dependency direction

1. Keep contracts and fingerprint functions pure.
2. Keep React runtime independent of Node filesystem and process APIs.
3. Keep registry discovery, TypeScript source inspection, formatting, and atomic writes in Node scripts.
4. Keep project-specific data imports and `staticFile()` path resolution inside the lazy Story module.
5. Keep `Root.tsx` ignorant of Story contents and M2 artifact layouts.
6. Prefer props that make forbidden behavior impossible: CaptionLayer receives frames, not time inputs;
   NarrationAudioTrack receives one complete URL, not chunks.
7. Version the registry generator and NarrativeCore explicitly; do not infer source validity from Agent
   memory.
8. Fail before writing when any project entry, source contract, sealed receipt, timing artifact, default
   export, ID, or fingerprint is stale.
9. Do not build a general runtime framework or generic track array for one required M3 path.
10. Keep evidence generation mechanical and redaction-safe; creative narrative review remains M4.

Concrete dependency direction:

```text
src/contracts/narrative-baseline.ts
        ↑
scripts/registry/domain.ts
        ↑
scripts/registry/project-files.ts
        ↑
scripts/registry/generate.ts
        ↑
scripts/registry/cli.ts

src/remotion/runtime/narrative-core/{NarrationAudioTrack,CaptionLayer}
        ↑
src/remotion/runtime/narrative-core/NarrativeCore
        ↑
src/remotion/runtime/composition-assembly/CompositionAssembly
        ↑
src/projects/gps-relativity/Composition.tsx
        ↑ literal generated loader only
src/projects/project-registry.generated.ts
        ↑ static import
src/Root.tsx

generated registry + ignored preview/render files
        ↑
scripts/baseline/evidence.ts
        ↓
M3 evidence receipt + redacted human evidence
```

Forbidden dependency directions:

```text
React runtime  -X-> node:fs / directory discovery / registry generation / VoxCPM
Root.tsx       -X-> Story JSON / Story Composition static imports / Scene renderer
CaptionLayer   -X-> audio / PCM / fps / sample-frame conversion / ttsChunks
Registry JSON  -X-> JSX / functions / module paths
M3             -X-> M4 check aggregation / Scene / optional enhancement tracks
```

## Execution entry

This plan is intentionally untracked at the end of the planning turn. After the user reviews and
approves it, start the inline implementation conversation with:

```bash
git branch --show-current
git rev-parse HEAD
git status --short --branch
npx prettier --check docs/superpowers/plans/2026-08-01-m3-narrative-baseline-runtime.md
```

Expected baseline:

```text
branch: codex/foundation
HEAD: f3074856a51cacf9b9f586909308a7350c090fee
only untracked path: docs/superpowers/plans/2026-08-01-m3-narrative-baseline-runtime.md
```

If unrelated user changes exist, preserve them and use exact-path staging. Stop only when an unrelated
change overlaps an active Task file and cannot be safely reconciled.

Before any implementation, capture and validate the protected M2 baseline without private config:

```bash
sha256sum \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration/0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5/complete.wav \
  docs/evidence/2026-08-01-gps-relativity-m2.md
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run narration:check -- --project gps-relativity
git ls-files .narration-work out .env .env.local private
```

Expected: the checker exits 0, the four checksums are recorded in the execution notes, and the final
`git ls-files` command prints nothing. Do not print, inspect, or copy the private VoxCPM configuration.

After approval, stage and commit only the plan before Task 1:

```bash
git add docs/superpowers/plans/2026-08-01-m3-narrative-baseline-runtime.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: add M3 narrative baseline plan"
```

Then execute Task 1 through Task 7 in order in the same conversation. Do not reopen the approved M3
scope or ask for routine confirmation. Pause only for a genuine blocker, such as a host browser that
cannot run Remotion after a permitted host retry. Never replace a failed real render with fabricated
evidence, and never solve a browser sandbox issue by adding Docker.

## Locked M3 file structure

```text
src/contracts/
├── narrative-baseline.ts                 M3 registry/Baseline/evidence fingerprints and schemas
└── index.ts                              export the M3 pure contract

src/remotion/runtime/narrative-core/
├── NarrationAudioTrack.tsx               one complete WAV at playbackRate 1
├── CaptionLayer.tsx                      absolute-frame caption selection and transparent overlay
├── NarrativeCore.tsx                     required audio + top-level caption aggregate
└── index.ts                              narrow runtime exports

src/remotion/runtime/composition-assembly/
├── CompositionAssembly.tsx               required narrativeCore slot only
└── index.ts

src/projects/gps-relativity/
└── Composition.tsx                       project-local static data, validation, default export

scripts/registry/
├── domain.ts                             pure descriptor ordering, checksum, source rendering
├── project-files.ts                      fixed first-level discovery and TS default-export inspection
├── generate.ts                           all-or-nothing generation and byte drift check
└── cli.ts                                fixed `generate` / `check` commands

src/projects/project-registry.generated.ts
                                            tracked metadata + literal lazy imports

scripts/baseline/
└── evidence.ts                           fixed-path alpha/media inspection and M3 receipt write

tests/
├── contracts/narrative-baseline.test.ts
├── runtime/narrative-core.test.tsx
├── runtime/composition-assembly.test.tsx
├── projects/gps-relativity-composition.test.tsx
├── registry/project-registry.test.ts
├── registry/root-registration.test.tsx
└── baseline/evidence.test.ts

src/projects/gps-relativity/generated/
└── narrative-baseline-evidence.generated.json

docs/evidence/2026-08-01-gps-relativity-m3.md
```

Existing M2 generated files and all files under the content-addressed narration directory are protected
inputs, not M3 modification targets.

## Locked interfaces

The implementation may refine internal helper names, but these public boundaries and meanings are
fixed. Do not introduce parallel timing, registry, or evidence types.

### Runtime interfaces

```ts
import type { ReactNode } from "react";
import type { CaptionSafeArea, SemanticTiming } from "../../contracts";

export type CaptionCue = SemanticTiming["captionCues"][number];

export type NarrationAudioTrackProps = {
  readonly src: string;
  readonly leadInFrames: number;
};

export type CaptionLayerProps = {
  readonly captionCues: SemanticTiming["captionCues"];
  readonly safeAreaPx: CaptionSafeArea;
};

export type NarrativeCoreProps = NarrationAudioTrackProps & CaptionLayerProps;

export type CompositionAssemblyProps = {
  readonly narrativeCore: ReactNode;
};
```

`CaptionLayerProps` deliberately has no `fps`, `sampleRate`, `leadInFrames`, `ttsChunks`, manifest, or
audio input. `CompositionAssemblyProps` deliberately has no optional M4/M8 or visual slots.

Required component form:

```tsx
export const NarrationAudioTrack: FC<NarrationAudioTrackProps> = ({
  src,
  leadInFrames,
}) => (
  <Sequence from={leadInFrames}>
    <Html5Audio src={src} playbackRate={1} />
  </Sequence>
);

export const NarrativeCore: FC<NarrativeCoreProps> = (props) => (
  <>
    <NarrationAudioTrack src={props.src} leadInFrames={props.leadInFrames} />
    <CaptionLayer
      captionCues={props.captionCues}
      safeAreaPx={props.safeAreaPx}
    />
  </>
);

export const CompositionAssembly: FC<CompositionAssemblyProps> = ({
  narrativeCore,
}) => <>{narrativeCore}</>;
```

`CaptionLayer` uses `useCurrentFrame()` only to choose the cue whose existing absolute range satisfies
`startFrame <= frame && frame < endFrame`. It returns `null` when there is no cue. Its top-level overlay
has no background; a bounded caption text container may have readable text styling.

### Fingerprint identities

```ts
export const PROJECT_REGISTRY_GENERATOR_ID =
  "project-registry-generator-v1" as const;
export const NARRATIVE_CORE_VERSION = "narrative-core-v1" as const;
export const M3_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type ProjectRegistrationDescriptor = {
  readonly storyId: string;
  readonly id: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
  readonly defaultProps: StoryCompositionProps;
  readonly compositionModulePath: `./${string}/Composition`;
};

export const computeGeneratedRegistryEntryChecksum = (
  descriptor: ProjectRegistrationDescriptor,
): Sha256Digest;

export const computeProjectRegistryEntryFingerprint = (input: {
  readonly descriptor: ProjectRegistrationDescriptor;
  readonly semanticTimingFingerprint: Sha256Digest;
  readonly generatedEntryChecksum: Sha256Digest;
  readonly generatorId: typeof PROJECT_REGISTRY_GENERATOR_ID;
}): Sha256Digest;

export const computeNarrativeBaselineFingerprint = (input: {
  readonly artifactBundle: M1ArtifactBundle;
  readonly projectRegistryEntryFingerprint: Sha256Digest;
  readonly narrativeCoreVersion: typeof NARRATIVE_CORE_VERSION;
}): Sha256Digest;
```

`computeNarrativeBaselineFingerprint()` first calls `validateM1ArtifactBundle()` and hashes exactly the
documented M3 dependency chain: StorySpec, RenderSpec, sealed narration, SemanticTiming, registry-entry
fingerprint, and NarrativeCore version. It does not hash preview/render bytes; those belong to the
evidence fingerprint.

### Generated registry entry

```ts
export type ProjectRegistryEntry = {
  readonly id: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
  readonly defaultProps: StoryCompositionProps;
  readonly generatedEntryChecksum: string;
  readonly projectRegistryEntryFingerprint: string;
  readonly narrativeBaselineFingerprint: string;
  readonly load: () => Promise<{
    default: ComponentType<StoryCompositionProps>;
  }>;
};
```

For the current Story the generated metadata must be:

```ts
{
  id: "GpsRelativity",
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 1731,
  defaultProps: {projectId: "gps-relativity"},
  load: () => import("./gps-relativity/Composition"),
}
```

The three fingerprints are generated values and must not be copied from this plan or guessed.

### M3 evidence receipt

```ts
export type M3NarrativeBaselineEvidenceReceipt = {
  readonly schemaVersion: 1;
  readonly storyId: string;
  readonly compositionId: string;
  readonly sealedNarrationFingerprint: string;
  readonly semanticTimingFingerprint: string;
  readonly generatedRegistryChecksum: string;
  readonly projectRegistryEntryFingerprint: string;
  readonly narrativeBaselineFingerprint: string;
  readonly artifacts: {
    readonly transparentStill: {
      readonly localPath: string;
      readonly checksum: string;
      readonly frame: 0;
      readonly alphaMin: 0;
      readonly alphaMax: 0;
    };
    readonly captionStill: {
      readonly localPath: string;
      readonly checksum: string;
      readonly frame: 15;
      readonly alphaMin: 0;
      readonly alphaMax: number;
      readonly topLeftAlphaMax: 0;
    };
    readonly render: {
      readonly localPath: string;
      readonly checksum: string;
      readonly fps: 30;
      readonly durationInFrames: 1731;
      readonly videoStreamCount: 1;
      readonly audioStreamCount: 1;
    };
  };
  readonly evidenceFingerprint: string;
};
```

`evidenceFingerprint` is `sha256-canonical-json-v1` over the receipt without its own fingerprint. The
receipt is written as canonical pretty JSON plus one newline. Output bytes may differ after a fresh
encode; that creates a new evidence fingerprint without changing the upstream Narrative Baseline
fingerprint.

## Fingerprint and invalidation rules

```text
M2 generation input fingerprint
  -> sealed narration fingerprint
     -> SemanticTiming fingerprint
        -> generated registry entry checksum
           -> ProjectRegistry entry fingerprint
              -> Narrative Baseline fingerprint
                 -> M3 evidence fingerprint
```

- `ttsText`, authored chunk order, meaning ownership, or NarrationSpec changes: M2 seal/timing becomes
  stale; registry generation and M3 runtime evidence fail closed. M3 never repairs this.
- Explicit pause changes: sealed complete WAV, timing, registry entry, Baseline, and evidence invalidate;
  M3 never reuses or reassembles chunk candidates.
- RenderSpec timing changes: sealed narration remains valid; SemanticTiming, registry metadata,
  Baseline, and evidence invalidate through the existing M1 algorithm.
- RenderSpec non-timing changes: sealed narration and SemanticTiming may remain valid, but registry
  metadata/default props, Baseline, and evidence invalidate.
- Story entry add/delete/rename, Composition ID change, missing default export, literal entry change, or
  registry generator version change: registry bytes, entry fingerprint, listing, Baseline, and evidence
  invalidate; M2 stays valid if its own inputs still match.
- NarrativeCore behavior change requires `NARRATIVE_CORE_VERSION` to change; Baseline and evidence then
  invalidate. A version-only test guards this explicit contract.
- Registry generated-file edits that do not equal the in-memory expected bytes are drift and fail before
  bundle/check. Runtime never regenerates them.
- Preview still or render bytes changing under the same Baseline identity changes only the evidence
  fingerprint. It does not mutate Story, audio, timing, registry identity, or Baseline identity.
- M4 checks and later visual/sound/global fingerprints remain absent.

---

### Task 1: Define M3 registry, Baseline, and evidence fingerprint contracts

**Files:**

- Create: `src/contracts/narrative-baseline.ts`
- Modify: `src/contracts/index.ts`
- Create: `tests/contracts/narrative-baseline.test.ts`

**Interfaces:**

- Consumes: existing `StoryCompositionProps`, `M1ArtifactBundle`, `validateM1ArtifactBundle()`,
  `createFingerprint()`, `Sha256DigestSchema`, and the real M2 fixture identities.
- Produces: the two version constants, strict project-registration descriptor parsing, generated entry
  checksum, registry-entry fingerprint, Narrative Baseline fingerprint, strict M3 evidence receipt
  schema, and evidence fingerprint validation.

- [ ] **Step 1: Write the focused failing tests**

Cover these cases:

```ts
test("the real M2 bundle produces stable downstream M3 fingerprints", () => {
  const entryChecksum = computeGeneratedRegistryEntryChecksum(descriptor);
  const entryFingerprint = computeProjectRegistryEntryFingerprint({
    descriptor,
    semanticTimingFingerprint: timing.fingerprint,
    generatedEntryChecksum: entryChecksum,
    generatorId: PROJECT_REGISTRY_GENERATOR_ID,
  });
  assert.equal(
    computeNarrativeBaselineFingerprint({
      artifactBundle,
      projectRegistryEntryFingerprint: entryFingerprint,
      narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    }),
    computeNarrativeBaselineFingerprint({
      artifactBundle,
      projectRegistryEntryFingerprint: entryFingerprint,
      narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    }),
  );
});

test("registry identity changes do not rewrite M2 authority", () => {
  assert.notEqual(
    fingerprintFor(originalDescriptor),
    fingerprintFor(renamedEntry),
  );
  assert.equal(
    originalBundle.sealedNarration.sealedNarrationFingerprint,
    changedRegistryBundle.sealedNarration.sealedNarrationFingerprint,
  );
  assert.equal(
    originalBundle.semanticTiming.fingerprint,
    changedRegistryBundle.semanticTiming.fingerprint,
  );
});

test("NarrativeCore version and each documented upstream layer invalidate downstream", () => {
  assert.notEqual(baselineV1, baselineWithChangedCoreVersion);
  assert.notEqual(baselineV1, baselineWithChangedRender);
  assert.notEqual(baselineV1, baselineWithChangedTiming);
  assert.notEqual(baselineV1, baselineWithChangedRegistryEntry);
});

test("evidence receipt fingerprint excludes only itself and rejects edits", () => {
  assert.doesNotThrow(() =>
    M3NarrativeBaselineEvidenceReceiptSchema.parse(validReceipt),
  );
  assert.throws(() =>
    M3NarrativeBaselineEvidenceReceiptSchema.parse({
      ...validReceipt,
      artifacts: changedRenderChecksum,
    }),
  );
});
```

Also reject unknown fields, unsafe frame values, a descriptor whose `durationInFrames` differs from
SemanticTiming, non-literal-shaped module paths, Story/defaultProps mismatch, wrong project output
prefixes, invalid alpha facts, and stale M1 bundles. Assert the existing M2 seal and timing fingerprint
fixtures remain exactly unchanged.

- [ ] **Step 2: Run the focused test and verify red**

```bash
node --import tsx --test tests/contracts/narrative-baseline.test.ts
```

Expected: FAIL because `src/contracts/narrative-baseline.ts` does not exist.

- [ ] **Step 3: Implement the smallest pure M3 contract**

Use strict Zod objects and the existing `createFingerprint()` only. Do not add a second SHA/canonical
JSON implementation. `computeNarrativeBaselineFingerprint()` must call `validateM1ArtifactBundle()`
before hashing. The registration descriptor's module path is an in-memory/generated-source value; it is
never added to a JSON source file.

The generated entry checksum hashes the complete canonical descriptor under namespace
`project-registry-generated-entry`, version 1. The registry fingerprint uses namespace
`project-registry-entry`, version 1. The Baseline fingerprint uses namespace `narrative-baseline`,
version 1. The evidence fingerprint uses namespace `m3-narrative-baseline-evidence`, version 1.

Do not edit `semantic-timing.ts`, `sealed-narration.ts`, their algorithms, or the M2 generated JSON.

- [ ] **Step 4: Run green checks**

```bash
node --import tsx --test tests/contracts/narrative-baseline.test.ts
npm run typecheck
npx eslint src/contracts/narrative-baseline.ts src/contracts/index.ts tests/contracts/narrative-baseline.test.ts
git diff --check
```

Expected: all commands exit 0; no M2 file changed.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/contracts/narrative-baseline.ts src/contracts/index.ts tests/contracts/narrative-baseline.test.ts
git commit -m "feat: define M3 baseline fingerprints"
```

---

### Task 2: Implement the transparent NarrativeCore and required-only assembly

**Files:**

- Create: `src/remotion/runtime/narrative-core/NarrationAudioTrack.tsx`
- Create: `src/remotion/runtime/narrative-core/CaptionLayer.tsx`
- Create: `src/remotion/runtime/narrative-core/NarrativeCore.tsx`
- Create: `src/remotion/runtime/narrative-core/index.ts`
- Create: `src/remotion/runtime/composition-assembly/CompositionAssembly.tsx`
- Create: `src/remotion/runtime/composition-assembly/index.ts`
- Create: `tests/runtime/narrative-core.test.tsx`
- Create: `tests/runtime/composition-assembly.test.tsx`

**Interfaces:**

- Consumes: one resolved complete-audio URL, `leadInFrames`, generated absolute CaptionCues, and
  RenderSpec caption safe-area values.
- Produces: `NarrationAudioTrack`, `findActiveCaptionCue()`, top-level `CaptionLayer`, transparent
  `NarrativeCore`, and `CompositionAssembly({narrativeCore})` with no other slots.

- [ ] **Step 1: Write failing runtime boundary tests**

Test the React element shape without a browser and test caption selection as a pure function:

```ts
test("NarrationAudioTrack mounts exactly one complete audio at rate one", () => {
  const track = NarrationAudioTrack({
    src: "resolved-complete.wav",
    leadInFrames: 15,
  });
  assert.equal(track.type, Sequence);
  assert.equal(track.props.from, 15);
  const audio = Children.only(track.props.children);
  assert.equal(audio.type, Html5Audio);
  assert.equal(audio.props.src, "resolved-complete.wav");
  assert.equal(audio.props.playbackRate, 1);
  assert.equal(audio.props.trimBefore, undefined);
  assert.equal(audio.props.trimAfter, undefined);
});

test("CaptionLayer selects only existing absolute left-closed right-open ranges", () => {
  assert.equal(findActiveCaptionCue(cues, 14), undefined);
  assert.equal(findActiveCaptionCue(cues, 15)?.chunkId, "position-is-time-01");
  assert.equal(findActiveCaptionCue(cues, 155)?.chunkId, "position-is-time-02");
  assert.equal(findActiveCaptionCue(cues, 687), undefined);
  assert.equal(findActiveCaptionCue(cues, 696)?.chunkId, "net-drift-01");
  assert.equal(findActiveCaptionCue(cues, 1716), undefined);
});

test("NarrativeCore has one audio track and one CaptionLayer with no canvas", () => {
  const core = NarrativeCore(props);
  const children = Children.toArray(core.props.children);
  assert.deepEqual(
    children.map((child) => child.type),
    [NarrationAudioTrack, CaptionLayer],
  );
});

test("CompositionAssembly exposes only the required narrativeCore slot", () => {
  assert.deepEqual(Object.keys(assembly.props), ["narrativeCore"]);
});
```

Add source/AST assertions that:

- NarrationAudioTrack contains one `Html5Audio`, no chunk mapping, loop, trim, or rate other than 1;
- CaptionLayer contains no fps/sample/sample-frame/audio/ttsChunk calculation;
- NarrativeCore does not import `BaseCanvas`, `AbsoluteFill`, capabilities, Scene, or enhancement tracks;
- only CaptionLayer may use `AbsoluteFill`, and its full-frame overlay has no background property;
- CompositionAssembly has exactly one prop and does not contain an optional track array or placeholder.

- [ ] **Step 2: Run focused tests and verify red**

```bash
node --import tsx --test tests/runtime/narrative-core.test.tsx tests/runtime/composition-assembly.test.tsx
```

Expected: FAIL because the runtime modules do not exist.

- [ ] **Step 3: Implement NarrationAudioTrack and CaptionLayer**

Use `Html5Audio` from the pinned Remotion version, because `Audio` is deprecated in 4.0.489. Pass
`playbackRate={1}` explicitly. The component accepts a single `src`; no array or chunk type is allowed.

`findActiveCaptionCue()` performs only integer frame-range membership. It does not sort or repair cues;
the already validated SemanticTiming order remains authoritative. `CaptionLayer` calls
`useCurrentFrame()`, returns `null` when no cue is active, and otherwise renders one bounded caption
container inside the configured safe area. Use static inline style only—no CSS animation, transition,
Tailwind animation utility, or frame-derived timing transform.

The caption container may use an opaque/semitransparent local background for legibility. The enclosing
full-frame layer and all space outside the caption container remain transparent.

- [ ] **Step 4: Implement NarrativeCore and required-only CompositionAssembly**

`NarrativeCore` returns a fragment with the audio track first and CaptionLayer second. It does not wrap
them in a colored `AbsoluteFill`. `CompositionAssembly` returns only its required React node and adds no
visual/audio behavior of its own.

- [ ] **Step 5: Run green checks and explicit scope searches**

```bash
node --import tsx --test tests/runtime/narrative-core.test.tsx tests/runtime/composition-assembly.test.tsx
npm run typecheck
npx eslint \
  src/remotion/runtime/narrative-core \
  src/remotion/runtime/composition-assembly \
  tests/runtime
rg -n "playbackRate|trimBefore|trimAfter|loop|ttsChunks|sampleRate|pcm-cumulative|Math\.(round|ceil)" \
  src/remotion/runtime/narrative-core
rg -n "BaseCanvas|Scene|ResourceCatalog|StoryVisualTrack|SoundDesignTrack|GlobalVisualLayers|renderer" \
  src/remotion/runtime/narrative-core \
  src/remotion/runtime/composition-assembly
```

Expected: tests/typecheck/lint pass; the first search shows only the single explicit
`playbackRate={1}` plus negative test text outside production; the second search has no production
match.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/remotion/runtime/narrative-core src/remotion/runtime/composition-assembly tests/runtime
git commit -m "feat: add transparent narrative core runtime"
```

---

### Task 3: Add the project-local default-export GPS Composition

**Files:**

- Create: `src/projects/gps-relativity/Composition.tsx`
- Create: `tests/projects/gps-relativity-composition.test.tsx`

**Interfaces:**

- Consumes: statically imported project-local `brief.json`, `story.json`, `narration.json`,
  `render.json`, active sealed manifest, generated SemanticTiming, `StoryCompositionProps`,
  `validateM1ArtifactBundle()`, `staticFile()`, NarrativeCore, and CompositionAssembly.
- Produces: named validated metadata for tests and one `default export` React Composition accepting only
  `{projectId: "gps-relativity"}`.

- [ ] **Step 1: Write the failing project Composition tests**

Cover:

```ts
test("gps-relativity has a default-export Composition", async () => {
  const module = await import("../../src/projects/gps-relativity/Composition");
  assert.equal(typeof module.default, "function");
});

test("project-local metadata is exactly the current absolute authority", () => {
  assert.deepEqual(gpsRelativityCompositionMetadata, {
    id: "GpsRelativity",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 1731,
    defaultProps: { projectId: "gps-relativity" },
  });
});

test("a mismatched projectId fails instead of loading another Story", () => {
  assert.throws(() =>
    createGpsRelativityNarrativeCoreProps({ projectId: "other-story" }),
  );
});
```

Add source/AST assertions that all six project data files are static JSON imports, the complete-audio
URL comes only from `sealedNarration.completeAudio.localPath` through `staticFile()`, the module imports
no chunk WAV, filesystem, network, registry generator, Scene, capability, or BaseCanvas, and the default
export is present.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/projects/gps-relativity-composition.test.tsx
```

Expected: FAIL because `src/projects/gps-relativity/Composition.tsx` does not exist.

- [ ] **Step 3: Implement static project data validation**

At module load:

1. parse the four source JSON imports with `parseNarrativeProjectSource()`;
2. parse the active manifest with `SealedNarrationManifestSchema`;
3. parse timing with `SemanticTimingSchema`;
4. call `validateM1ArtifactBundle()`;
5. assert Story ID, RenderSpec Composition ID, fps, and timing duration are the values exposed as
   metadata;
6. convert the validated `public/.../complete.wav` path to a Remotion `staticFile()` path only after
   verifying/removing the exact `public/` prefix.

Do not import or consume `reviews/story-check.json` in render runtime. StoryCheck already guarded M2;
M4 will aggregate review/check records. Do not read files dynamically.

- [ ] **Step 4: Implement the default-export component**

Parse `StoryCompositionProps`, require `projectId === "gps-relativity"`, and return:

```tsx
<CompositionAssembly
  narrativeCore={
    <NarrativeCore
      src={completeNarrationSrc}
      leadInFrames={render.leadInFrames}
      captionCues={timing.captionCues}
      safeAreaPx={render.captionSafeAreaPx}
    />
  }
/>
```

Do not add a background or optional track prop.

- [ ] **Step 5: Run green and protected-input checks**

```bash
node --import tsx --test tests/projects/gps-relativity-composition.test.tsx
npm run typecheck
npx eslint src/projects/gps-relativity/Composition.tsx tests/projects/gps-relativity-composition.test.tsx
git diff --exit-code -- \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration \
  docs/evidence/2026-08-01-gps-relativity-m2.md
```

Expected: all checks pass and the protected-input diff is empty.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/projects/gps-relativity/Composition.tsx tests/projects/gps-relativity-composition.test.tsx
git commit -m "feat: add gps relativity baseline composition"
```

---

### Task 4: Generate the deterministic static ProjectRegistry and detect drift

**Files:**

- Create: `scripts/registry/domain.ts`
- Create: `scripts/registry/project-files.ts`
- Create: `scripts/registry/generate.ts`
- Create: `scripts/registry/cli.ts`
- Create: `src/projects/project-registry.generated.ts`
- Create: `tests/registry/project-registry.test.ts`

**Interfaces:**

- Consumes: fixed repository root, immediate project directories, exact `Composition.tsx`, validated
  source/manifest/timing JSON, TypeScript AST, Task 1 fingerprint functions, and Prettier.
- Produces: `discoverProjectEntries()`, `renderProjectRegistrySource()`,
  `generateProjectRegistry({rootDir,mode:"write"|"check"})`, and a fixed CLI with only `generate` and
  `check`.

- [ ] **Step 1: Write failing deterministic discovery and generation tests**

Use temporary fixture repositories. Cover:

```ts
test("discovery considers only exact first-level Composition.tsx files", async () => {
  assert.deepEqual(await discoverProjectEntries(root), [
    "src/projects/alpha/Composition.tsx",
    "src/projects/zeta/Composition.tsx",
  ]);
  assert.equal(
    discovered.includes("src/projects/group/nested/Composition.tsx"),
    false,
  );
});

test("generated entries are stably sorted and use literal import expressions", async () => {
  const first = await renderExpectedRegistry(fixtureRoot);
  const second = await renderExpectedRegistry(fixtureRoot);
  assert.equal(first, second);
  assert.match(first, /load: \(\) => import\("\.\/alpha\/Composition"\)/);
  assertNoNonLiteralDynamicImports(parseTypeScript(first));
});

test("read-only check detects one-byte registry drift", async () => {
  await generateProjectRegistry({ rootDir, mode: "write" });
  await appendFile(generatedPath, " ");
  await assert.rejects(
    () => generateProjectRegistry({ rootDir, mode: "check" }),
    /ProjectRegistry drift/i,
  );
});

test("an invalid project leaves the previous registry byte-identical", async () => {
  const before = await readFile(generatedPath);
  await assert.rejects(() => generateAfterRemovingDefaultExport());
  assert.deepEqual(await readFile(generatedPath), before);
});
```

Also test stable Composition-ID sorting; invalid slug; duplicate Composition ID; Story ID/defaultProps
mismatch; missing or malformed source, manifest, timing, or Composition; stale M1 bundle; timing fps or
duration mismatch; missing/multiple default export; non-file/symlink entry rejection; nested entry
ignore; no environment/glob/module-path input; and strict `generate|check` CLI args.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/registry/project-registry.test.ts
```

Expected: FAIL because registry modules do not exist.

- [ ] **Step 3: Implement fixed first-level discovery and validation**

Use `readdir(src/projects, {withFileTypes:true})`; inspect only immediate real directories and the exact
child `Composition.tsx`. Do not recurse and do not follow symlinks. A directory without a Composition is
not an entry; a discovered entry with an invalid slug or missing required project data fails.

Read only these exact sibling files for each discovered Story:

```text
brief.json
story.json
narration.json
render.json
generated/sealed-narration.generated.json
generated/semantic-timing.generated.json
Composition.tsx
```

Parse source and artifacts with existing contracts and call `validateM1ArtifactBundle()`. Inspect
`Composition.tsx` with the TypeScript compiler AST and require one default export. The module path is
constructed solely from the validated directory slug; JSON never supplies it.

- [ ] **Step 4: Render deterministic generated TypeScript**

For every validated entry:

1. create the locked registration descriptor;
2. compute the generated-entry checksum;
3. compute the ProjectRegistry entry fingerprint;
4. compute the Narrative Baseline fingerprint;
5. render static metadata and a literal `import()`;
6. sort by Composition ID;
7. format once with the pinned Prettier TypeScript parser;
8. append exactly one newline.

The generated file declares `ProjectRegistryEntry`, exports generator identity and
`projectRegistry`, and contains no filesystem or generator imports. `mode: "check"` computes expected
bytes in memory and compares byte-for-byte. `mode: "write"` validates every entry before exclusively
writing and syncing a sibling temporary file, renaming it atomically, and syncing the parent directory
when supported. Never partially update the tracked registry.

- [ ] **Step 5: Run focused green and generate the real registry**

```bash
node --import tsx --test tests/registry/project-registry.test.ts
node --import tsx scripts/registry/cli.ts generate
node --import tsx scripts/registry/cli.ts check
npm run typecheck
npx eslint scripts/registry tests/registry src/projects/project-registry.generated.ts
npx prettier --check scripts/registry tests/registry src/projects/project-registry.generated.ts
```

Expected: all commands exit 0; the real registry has exactly one Story entry with `GpsRelativity`,
1731 frames, literal `./gps-relativity/Composition`, and generated—not hand-copied—fingerprints.

- [ ] **Step 6: Prove literal lazy import and no runtime discovery**

```bash
rg -n "import\(|read(dir|File)|readdir|glob|process\.env|require\(" \
  src/projects/project-registry.generated.ts
rg -n "src/projects|Composition\.tsx|modulePath|import\.meta\.glob" \
  src/Root.tsx src/index.ts
```

Expected: the generated file contains only literal `import("./gps-relativity/Composition")`; it has no
Node/runtime discovery. Root/index still contain no project scan or project entry at this Task.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/registry src/projects/project-registry.generated.ts tests/registry/project-registry.test.ts
git commit -m "feat: generate static project registry"
```

---

### Task 5: Register lazy Story Compositions and enforce pre-bundle generation

**Files:**

- Modify: `src/Root.tsx`
- Modify: `package.json`
- Create: `tests/registry/root-registration.test.tsx`

**Interfaces:**

- Consumes: the generated registry and existing `CapabilityGallery`.
- Produces: a `Stories` folder whose entries use Remotion `lazyComponent`, retained hand-written
  `System/CapabilityGallery`, npm registry generation/check commands, pre-dev/build/compositions
  generation, and full-test inclusion for new test directories.

- [ ] **Step 1: Write failing Root and package-script tests**

Assert:

```ts
test("Root keeps the system Composition and maps Story entries lazily", () => {
  const root = RemotionRoot({});
  const folders = Children.toArray(root.props.children);
  assertFolderContainsComponent(folders, "System", "CapabilityGallery");
  const story = findStoryComposition(folders, "GpsRelativity");
  assert.equal(story.props.component, undefined);
  assert.equal(story.props.lazyComponent, projectRegistry[0].load);
  assert.equal(story.props.durationInFrames, 1731);
  assert.deepEqual(story.props.defaultProps, { projectId: "gps-relativity" });
});

test("build and listing generate before bundle while formal check detects drift first", () => {
  assert.equal(scripts["registry:generate"], expectedGenerateCommand);
  assert.equal(scripts["registry:check"], expectedCheckCommand);
  assert.equal(scripts.prebuild, "npm run registry:generate");
  assert.equal(scripts.precompositions, "npm run registry:generate");
  assert.match(scripts.check, /registry:check.*build.*compositions/);
});
```

Use AST assertions that `Root.tsx` imports the generated registry statically, contains no static import
ending in a Story `Composition`, does not read JSON/filesystem, and passes the generated loader directly
to `lazyComponent`.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/registry/root-registration.test.tsx
```

Expected: FAIL because Root does not register generated Story entries and package scripts are absent.

- [ ] **Step 3: Update Root with two explicit registration groups**

Keep `CapabilityGallery` under `Folder name="System"` with its existing `component`. Add a separate
`Folder name="Stories"`; map `projectRegistry` to `<Composition>` using only generated metadata and
`lazyComponent={entry.load}`. Use `key={entry.id}`. Do not invoke the loader or read project data in
Root.

- [ ] **Step 4: Add deterministic package entrypoints**

Add exactly:

```json
{
  "registry:generate": "node --import tsx scripts/registry/cli.ts generate",
  "registry:check": "node --import tsx scripts/registry/cli.ts check",
  "predev": "npm run registry:generate",
  "prebuild": "npm run registry:generate",
  "precompositions": "npm run registry:generate"
}
```

Extend `test` to include existing contract/narration tests plus
`tests/runtime/*.test.tsx`, `tests/projects/*.test.tsx`, `tests/registry/*.test.ts`, and
`tests/registry/*.test.tsx`. Put `npm run registry:check` before `npm run build` in `check`, so a formal
check reports tracked drift before prebuild generation can repair it. Do not add `project:check`.

- [ ] **Step 5: Run green, real listing, and lazy-loading checks**

```bash
node --import tsx --test tests/registry/root-registration.test.tsx
npm run registry:check
npm test
npm run typecheck
npx eslint src/Root.tsx tests/registry/root-registration.test.tsx
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run compositions
```

Expected listing contains exactly the existing system Composition plus the Story Composition:

```text
CapabilityGallery  30 fps  1920x1080  150 frames
GpsRelativity      30 fps  1920x1080  1731 frames
```

Exact CLI spacing may differ; IDs and metadata must match. The command succeeds without VoxCPM config,
Scene files, ResourceCatalog, or a renderer registry.

- [ ] **Step 6: Prove the Story module remains lazy**

```bash
rg -n "gps-relativity/Composition|brief\.json|story\.json|render\.json|semantic-timing" \
  src/Root.tsx src/index.ts
rg -n "lazyComponent|component=" src/Root.tsx
```

Expected: the first search has no match. The second shows `component` only for CapabilityGallery and
`lazyComponent` for generated Story entries.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/Root.tsx package.json tests/registry/root-registration.test.tsx
git commit -m "feat: register lazy story compositions"
```

---

### Task 6: Produce real transparent preview/render evidence and the M3 receipt

**Files:**

- Create: `scripts/baseline/evidence.ts`
- Create: `tests/baseline/evidence.test.ts`
- Modify: `package.json`
- Create at runtime: `src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json`
- Create: `docs/evidence/2026-08-01-gps-relativity-m3.md`
- Ignored runtime evidence: `out/gps-relativity/m3-transparent-frame-0.png`
- Ignored runtime evidence: `out/gps-relativity/m3-caption-frame-15.png`
- Ignored runtime evidence: `out/gps-relativity/m3-narrative-baseline.mp4`

**Interfaces:**

- Consumes: generated registry, fixed ignored output paths, host FFmpeg/ffprobe, M3 receipt schema, and
  no provider/private configuration.
- Produces: `inspectAlphaStill()`, `inspectBaselineRender()`,
  `writeM3NarrativeBaselineEvidence()`, `npm run baseline:evidence`, one generated receipt, and one
  redacted human-readable evidence file.

- [ ] **Step 1: Write failing evidence inspection tests**

Use injected process/file adapters and fixture output bytes. Cover:

```ts
test("frame zero must be fully transparent", async () => {
  const alpha = await inspectAlphaStill(frame0, fakeFfmpeg);
  assert.deepEqual(alpha, { alphaMin: 0, alphaMax: 0 });
});

test("caption frame keeps transparent exterior and visible caption pixels", async () => {
  const alpha = await inspectAlphaStill(frame15, fakeFfmpeg);
  assert.equal(alpha.alphaMin, 0);
  assert.ok(alpha.alphaMax > 0);
  assert.equal(alpha.topLeftAlphaMax, 0);
});

test("render metadata must match the registered Composition", async () => {
  const media = await inspectBaselineRender(mp4, fakeFfprobe);
  assert.deepEqual(media, {
    fps: 30,
    durationInFrames: 1731,
    videoStreamCount: 1,
    audioStreamCount: 1,
  });
});

test("receipt changes when an evidence artifact checksum changes", async () => {
  assert.notEqual(
    original.evidenceFingerprint,
    changedRender.evidenceFingerprint,
  );
  assert.equal(
    original.narrativeBaselineFingerprint,
    changedRender.narrativeBaselineFingerprint,
  );
});
```

Also reject missing files, PNG without alpha, opaque frame 0, caption frame with no visible alpha,
opaque top-left caption frame, wrong codec/stream count/fps/frame count, stale registry, malformed
ffprobe output, non-zero process status, unknown project/flags, output paths outside fixed
`out/<project>/`, and attempted writes to M2 artifacts.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/baseline/evidence.test.ts
```

Expected: FAIL because the evidence module does not exist.

- [ ] **Step 3: Implement narrow fixed-path evidence inspection**

The CLI accepts only `--project <StoryId>`, resolves the registry entry by
`defaultProps.projectId`, and reads exactly the three fixed ignored files listed above. It does not
accept arbitrary artifact or destination paths.

Spawn FFmpeg/ffprobe with `shell:false`. For PNG alpha, use `alphaextract` plus `signalstats` and parse
the machine-readable `lavfi.signalstats.YMIN/YMAX`; also inspect a small top-left crop of frame 15. For
the MP4, use `ffprobe -count_frames -of json` and require one H.264 video stream at 30 fps with 1731
decoded frames and one AAC audio stream. Hash the exact registry file and evidence artifact bytes with
SHA-256, build the strict Task 1 receipt, and atomically write only
`narrative-baseline-evidence.generated.json`.

Add:

```json
{
  "baseline:evidence": "node --import tsx scripts/baseline/evidence.ts",
  "test": "<existing globs> tests/baseline/*.test.ts"
}
```

This is a narrow M3 evidence command, not an AutoCheck aggregator and not `project:check`.

- [ ] **Step 4: Run green synthetic checks**

```bash
node --import tsx --test tests/baseline/evidence.test.ts
npm test
npm run typecheck
npx eslint scripts/baseline/evidence.ts tests/baseline/evidence.test.ts
```

Expected: all commands exit 0 with no browser, provider, or network access.

- [ ] **Step 5: Recheck registry and render two real PNG preview frames**

```bash
mkdir -p out/gps-relativity
npm run registry:generate
npm run registry:check
env -u RSP_VOXCPM_PRIVATE_CONFIG npx remotion still \
  src/index.ts GpsRelativity \
  out/gps-relativity/m3-transparent-frame-0.png \
  --frame=0 --image-format=png
env -u RSP_VOXCPM_PRIVATE_CONFIG npx remotion still \
  src/index.ts GpsRelativity \
  out/gps-relativity/m3-caption-frame-15.png \
  --frame=15 --image-format=png
```

Expected: frame 0 is fully transparent; frame 15 visibly contains the first CaptionCue while the area
outside the bounded caption remains transparent. Inspect frame 15 with the available image viewer and
record only mechanical observations (text present, not cropped, safe-area placement). Do not create a
NarrativeCheck report or ask for a new creative approval.

If the Remotion browser fails only because the coding sandbox denies Chromium startup, rerun the same
host command with permitted host execution. Do not alter product code, add browser security workarounds
to the repository, use Docker, or fabricate the still.

- [ ] **Step 6: Render the complete real Narrative Baseline**

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npx remotion render \
  src/index.ts GpsRelativity \
  out/gps-relativity/m3-narrative-baseline.mp4 \
  --codec=h264 --audio-codec=aac
```

Expected: the render covers all 1731 frames, has one video and one audio stream, plays the complete
sealed narration once at natural rate after the 15-frame lead-in, displays captions only on their ten
absolute ranges, and has no visual content except captions. The MP4 may present transparent pixels as
black because H.264 has no alpha; that is why the PNG alpha evidence is mandatory.

Perform a mechanical full-duration smoke playback: confirm audio exists from beginning to end, captions
appear/disappear, and there is no truncation or second narration pass. This is not the M4 narrative
quality review.

- [ ] **Step 7: Generate and verify the M3 evidence receipt**

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run baseline:evidence -- --project gps-relativity
node -e 'const fs=require("node:fs");const p="src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json";const r=JSON.parse(fs.readFileSync(p,"utf8"));for(const k of ["storyId","compositionId","sealedNarrationFingerprint","semanticTimingFingerprint","generatedRegistryChecksum","projectRegistryEntryFingerprint","narrativeBaselineFingerprint","evidenceFingerprint"])console.log(`${k}: ${r[k]}`)'
ffprobe -v error -count_frames \
  -show_entries stream=codec_type,codec_name,avg_frame_rate,nb_read_frames,sample_rate,channels \
  -show_entries format=duration \
  -of json out/gps-relativity/m3-narrative-baseline.mp4
```

Expected: the receipt validates, prints only redaction-safe hashes/IDs, and ffprobe confirms H.264/AAC,
30 fps, 1731 frames, and both streams.

- [ ] **Step 8: Write the redacted human evidence**

Create `docs/evidence/2026-08-01-gps-relativity-m3.md` with:

- exact M2 seal/timing identities copied from the generated receipt;
- generator ID, generated registry checksum, registry-entry fingerprint, Baseline fingerprint, and M3
  evidence fingerprint;
- exact listing metadata for `CapabilityGallery` and `GpsRelativity`;
- frame 0 full-alpha-zero result;
- frame 15 full-frame alpha min/max, top-left alpha zero, caption text presence, and safe-area observation;
- full MP4 checksum, 1731-frame/30-fps/stream/codec evidence, and mechanical playback result;
- the explicit statement that H.264 display background is not drawn by NarrativeCore;
- private-config absence, M2 artifact preservation, and M3/M4/Scene scope statements.

Do not include private configuration, absolute private paths, provider data, instructions, local machine
paths, or unverified creative claims.

- [ ] **Step 9: Protect M2 and privacy boundaries before staging**

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run narration:check -- --project gps-relativity
git diff --exit-code -- \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration \
  docs/evidence/2026-08-01-gps-relativity-m2.md
git check-ignore \
  out/gps-relativity/m3-transparent-frame-0.png \
  out/gps-relativity/m3-caption-frame-15.png \
  out/gps-relativity/m3-narrative-baseline.mp4 \
  .narration-work/gps-relativity .env.local private/probe
git ls-files .narration-work out .env .env.local private
git grep -n -E "Bearer [A-Za-z0-9]|VOXCPM.*TOKEN=.+|referenceAudioPath.*(/home/|/data/|/srv/)" \
  -- . ':!docs/superpowers/plans/2026-08-01-m2-real-narration-generation-sealing.md'
```

Expected: narration check passes; protected diff is empty; all private/work/output probes are ignored;
no ignored/private file is tracked; no secret/private absolute reference match exists.

- [ ] **Step 10: Commit Task 6**

```bash
git add scripts/baseline/evidence.ts tests/baseline/evidence.test.ts package.json
git add src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json
git add docs/evidence/2026-08-01-gps-relativity-m3.md
git commit -m "test: prove gps relativity narrative baseline"
```

The ignored PNG/MP4 files remain local evidence and are not staged.

---

### Task 7: Synchronize M3 documentation and run the complete acceptance gate

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/NARRATION_GENERATION.md`
- Modify: `docs/contracts/NARRATIVE_CONTRACTS.md`
- Modify: `docs/PRODUCTION_WORKFLOW.md`
- Modify: `docs/ITERATION_STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DETERMINISTIC_EXECUTION.md`
- Verify unchanged unless a real inconsistency is found: `docs/FINAL_PRODUCT_GOAL.md`
- Verify unchanged unless a real inconsistency is found: `docs/TERMINOLOGY.md`

**Interfaces:**

- Consumes: verified Task 1–6 code, generated registry, real Composition listing, transparent stills,
  real render, fingerprints, and redacted evidence.
- Produces: authority/status/docs that mark only M3 runtime/registration/Baseline complete, set M4 as
  the next separately planned milestone, and keep all Scene/optional tracks unimplemented.

- [ ] **Step 1: Run the focused documentation status check and verify red**

```bash
rg -n "M3 尚未开始|M3 计划审阅为下一步|M3 及后续 Remotion runtime 尚未实现|NarrativeCore.*仍未实现" \
  AGENTS.md README.md docs/README.md docs/PRODUCTION_WORKFLOW.md \
  docs/ITERATION_STATUS.md docs/ROADMAP.md docs/ARCHITECTURE.md \
  docs/DETERMINISTIC_EXECUTION.md
```

Expected: the search finds the pre-M3 status statements. This is the intentional documentation-red
state after verified implementation/evidence and before status synchronization; do not delete target
architecture or M4 exclusions merely to make the search empty.

- [ ] **Step 2: Update usage and navigation docs**

Update README and `docs/README.md` with:

- `GpsRelativity` as the first real Narrative Baseline Composition;
- `npm run registry:generate`, `npm run registry:check`, `npm run compositions`, the two still commands,
  the full render command, and `baseline:evidence`;
- the distinction between transparent Composition output and H.264 presentation;
- links to M2 narration evidence and M3 Baseline evidence;
- no claim that `project:check`, NarrativeCheck, Scene, assets, or optional tracks exist.

Update `NARRATION_GENERATION.md` only to state that M3 consumes the current sealed receipt without
calling provider/seal and to link forward to M3 evidence. Do not rewrite M2 recovery semantics.

Update `NARRATIVE_CONTRACTS.md` with the implemented registry-entry, Narrative Baseline, and M3 evidence
fingerprint dependencies. Preserve M1/M2 algorithms and data shapes.

- [ ] **Step 3: Synchronize authority status exactly to M3**

- `AGENTS.md`: mark M3 NarrativeCore/static registry/lazy Composition/Baseline as implemented and M4
  narrative checks as next; retain the no-Scene current boundary.
- `PRODUCTION_WORKFLOW.md`: move the implemented boundary through Narrative Baseline, but leave AutoCheck
  aggregation and NarrativeCheck at M4 target status.
- `ITERATION_STATUS.md`: add the exact runtime, registry, listing, preview/render, and evidence facts;
  remove them from unfinished; set “write/review M4 plan” as the only next step.
- `ROADMAP.md`: mark M3 complete only after this Task's gates pass; set M4 planning as next. Do not begin
  M4 in this run.
- `ARCHITECTURE.md`: list actual M3 modules, project Composition, generated registry, Root lazy loading,
  and transparent layer order. Keep Scene/sound/global sections explicitly future.
- `DETERMINISTIC_EXECUTION.md`: mark ProjectRegistry and NarrativeCore implemented, record generator/check
  commands and fingerprint/evidence boundary, and retain `project:check` as M4 target.
- `FINAL_PRODUCT_GOAL.md` and `TERMINOLOGY.md`: inspect for contradictions; do not churn them if their
  target definitions remain accurate.

- [ ] **Step 4: Run all focused and repository gates fresh**

Run separately so the failing layer is visible:

```bash
npm test
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run narration:check -- --project gps-relativity
npm run typecheck
npm run lint
npm run registry:check
npm run build
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run compositions
npm run registry:generate
env -u RSP_VOXCPM_PRIVATE_CONFIG npx remotion render \
  src/index.ts GpsRelativity \
  out/gps-relativity/m3-narrative-baseline.mp4 \
  --codec=h264 --audio-codec=aac
npm run check
git diff --check
```

Expected:

- all contract/runtime/project/registry/evidence and M1/M2 tests pass;
- real M2 file-backed checker passes without private config;
- typecheck/lint/registry drift/bundle pass;
- listing contains `CapabilityGallery` and `GpsRelativity` with exact metadata;
- the fresh final-gate render completes all 1731 frames with audio;
- `npm run check` passes and no generated registry drift appears afterward.

- [ ] **Step 5: Re-run transparent acceptance on the final source**

```bash
env -u RSP_VOXCPM_PRIVATE_CONFIG npx remotion still \
  src/index.ts GpsRelativity \
  out/gps-relativity/m3-transparent-frame-0.png \
  --frame=0 --image-format=png
env -u RSP_VOXCPM_PRIVATE_CONFIG npx remotion still \
  src/index.ts GpsRelativity \
  out/gps-relativity/m3-caption-frame-15.png \
  --frame=15 --image-format=png
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run baseline:evidence -- --project gps-relativity
npm run registry:check
```

The commands deliberately overwrite only the three fixed ignored evidence paths from Task 6. If fresh
render bytes update the receipt, update the human evidence with the new exact checksum and fingerprint
before staging docs.

- [ ] **Step 6: Prove no M4, Scene, BaseCanvas, or optional-track implementation leaked in**

```bash
git diff --name-only f307485 -- \
  src scripts tests package.json public
rg -n "project:check|NarrativeCheck|AutoCheck" \
  package.json src/remotion/runtime src/projects/gps-relativity/Composition.tsx \
  scripts/registry scripts/baseline
rg -n "SceneVisualPlan|ShotPlan|ScenePackage|RendererRegistry|rendererId|ResourceCatalog|BaseCanvas|StoryVisualTrack|SoundDesignTrack|GlobalVisualLayers|StoryBeatTransition" \
  src/remotion/runtime/narrative-core \
  src/remotion/runtime/composition-assembly \
  src/projects/gps-relativity/Composition.tsx \
  scripts/registry scripts/baseline
rg -n "from [\"']node:|process\.|readdir|readFile" \
  src/remotion/runtime src/projects/gps-relativity/Composition.tsx src/Root.tsx
```

Expected:

- implementation diff is limited to the locked M3 files and `package.json`;
- the first two boundary searches have no production match;
- Node/filesystem APIs exist only in scripts, never React runtime/Root/project Composition;
- no file is created under `scenes/`, `story-visual-track/`, catalog, renderer registry, sound, global, or
  BaseCanvas paths.

- [ ] **Step 7: Re-prove M2 immutability and privacy**

Compare the exact Task-entry checksums and run:

```bash
git diff --exit-code f307485 -- \
  src/projects/gps-relativity/generated/sealed-narration.generated.json \
  src/projects/gps-relativity/generated/semantic-timing.generated.json \
  public/projects/gps-relativity/narration \
  docs/evidence/2026-08-01-gps-relativity-m2.md
git ls-files .narration-work out .env .env.local private
git status --short
git diff --stat
git diff --check
```

Expected: M2 protected paths are byte-unchanged, ignored/private paths are untracked, and only Task 7
documentation changes remain unstaged after prior commits.

- [ ] **Step 8: Run the documentation green check, review staged scope, and commit Task 7**

First rerun the Step 1 search. Expected: no active-status claim still says M3 is unimplemented or the
next action is M3 planning; historical references clearly labeled as prior state are allowed only when
needed for evidence history.

```bash
git add AGENTS.md README.md docs/README.md docs/NARRATION_GENERATION.md
git add docs/contracts/NARRATIVE_CONTRACTS.md
git add docs/PRODUCTION_WORKFLOW.md docs/ITERATION_STATUS.md docs/ROADMAP.md
git add docs/ARCHITECTURE.md docs/DETERMINISTIC_EXECUTION.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "docs: close M3 narrative baseline milestone"
```

If `FINAL_PRODUCT_GOAL.md` or `TERMINOLOGY.md` required a real consistency correction, review and stage
that exact file explicitly; otherwise leave both untouched.

After the commit, stop. Do not begin M4, create an M4 implementation plan without a new user request,
or push.

---

## M3 completion evidence

M3 is complete only when all of the following are simultaneously true:

- the original M2 manifest, SemanticTiming, complete WAV, and M2 evidence remain byte-identical and
  `narration:check` still passes without private config;
- `NarrationAudioTrack` mounts one complete audio URL once, at `leadInFrames`, with explicit
  `playbackRate={1}` and no trim/loop/chunk playback;
- CaptionLayer receives only generated absolute CaptionCues, uses left-closed/right-open frame
  membership, and performs no PCM/fps/time conversion;
- NarrativeCore renders no background or visual element except CaptionLayer, and
  CompositionAssembly has only its required `narrativeCore` slot;
- `gps-relativity/Composition.tsx` statically validates local M1/M2 data and default exports the Story
  Composition;
- ProjectRegistry discovery is fixed to exact first-level entries, sorted, all-or-nothing, formatted,
  atomically written, tracked, and byte-for-byte drift checked;
- each generated Story loader is a string-literal `import()` consumed through Remotion
  `lazyComponent`; Root performs no discovery and no Story static import;
- `npm run compositions` lists `CapabilityGallery` and `GpsRelativity`, with `GpsRelativity` at
  30 fps, 1920x1080, and 1731 frames;
- real frame 0 is fully transparent; real frame 15 contains visible caption pixels while exterior and
  top-left pixels remain transparent;
- a real complete 1731-frame H.264/AAC render has one video and one audio stream and passes mechanical
  full-duration smoke playback;
- registry-entry, Narrative Baseline, artifact checksums, and M3 evidence fingerprint are generated and
  recorded without secrets or private paths;
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run registry:check`, `npm run build`,
  `npm run compositions`, `npm run check`, and the fresh real render all pass;
- no `project:check`, NarrativeCheck, AutoCheck aggregation, Scene, renderer registry, ResourceCatalog,
  BaseCanvas, optional enhancement track, Docker, skill, or provider call was added;
- authority docs state M3—not M4 or Scene—is complete and make separately reviewed M4 planning the only
  next milestone.

## Failure recovery

- **Unrelated work appears:** preserve it; use exact-path staging. Stop only for an irreconcilable
  overlap with an active Task file.
- **Registry generation fails:** no generated file may change. Fix the invalid source/default export or
  stale upstream artifact, rerun the relevant focused tests, then generate again.
- **Registry check reports drift:** inspect the exact diff. If source inputs intentionally changed,
  regenerate and let downstream fingerprints/evidence invalidate. Never hand-edit the generated file.
- **Bundle/listing cannot find the Story module:** run `registry:check`, inspect the generated literal
  loader/default export, and typecheck. Do not add runtime scanning or a JSON module path fallback.
- **M2 validation fails:** stop M3. Do not call VoxCPM or reseal. Report the exact stale/corrupt M2 input
  and handle it under a separately approved M2 recovery action.
- **Remotion browser fails in a restricted execution sandbox:** rerun the identical host command with
  permitted host execution. Do not add Docker or claim a render passed without a real artifact.
- **Real render fails after partial `out/` files:** `out/` is ignored and non-authoritative. Preserve logs,
  rerun after the underlying issue is fixed, and generate the receipt only from complete verified files.
- **Evidence generation fails:** upstream Baseline remains valid; no receipt is written or overwritten
  until all alpha/media checks pass. Repair/re-render the evidence artifact and rerun.
- **Documentation conflicts with code:** treat executable code, tests, generated registry, and real
  evidence as current truth; correct docs without broadening M3 scope.

## Plan self-review record

### Scope coverage

| Requested area                    | Planned implementation/evidence                                                  |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Execution entry and repo truth    | Planning baseline, full HEAD, clean-tree preflight, protected M2 snapshot        |
| NarrationAudioTrack               | Task 2 single complete `Html5Audio`, one Sequence, rate 1, structural test       |
| Top-level CaptionLayer            | Task 2 absolute cue membership, safe area, transparent overlay, no timing inputs |
| Transparent NarrativeCore         | Task 2 source tests plus Task 6 real alpha stills                                |
| Required-only CompositionAssembly | Task 2 one required ReactNode prop, no optional placeholders                     |
| GPS default-export Composition    | Task 3 static local imports, M1 validation, default-export AST test              |
| Generated ProjectRegistry         | Task 4 fixed discovery, validated metadata, stable/atomic tracked source         |
| Drift and literal imports         | Task 4 byte check, TypeScript AST literal-loader/default-export tests            |
| `lazyComponent` and listing       | Task 5 Root mapping and real `npm run compositions`                              |
| Preview/render                    | Task 6 real PNG previews and full H.264/AAC render                               |
| M3 fingerprints/evidence          | Tasks 1, 4, 6 generated entry/Baseline/evidence chain and receipt                |
| Private/M2 protection             | Execution entry, Task 3/6/7 exact-path diffs, no-config checks, secret scans     |
| No M4/Scene/BaseCanvas leakage    | Global exclusions and Task 7 production-path searches                            |
| Final gates                       | Task 7 test/typecheck/lint/drift/build/compositions/check/real render            |

### Interface consistency

- `StoryCompositionProps` remains `{projectId}` and is the only defaultProps shape crossing Root into a
  lazy Story Composition.
- CaptionLayer consumes `SemanticTiming.captionCues` directly and cannot access the inputs required to
  recompute frames.
- NarrationAudioTrack consumes one resolved complete-audio URL and lead-in frame only; sealed manifest
  and `staticFile()` path ownership stay in the project module.
- CompositionAssembly exposes only the required M3 aggregate. Later slots require a later milestone
  change rather than existing as premature `undefined` fields.
- Registry generation consumes validated M1/M2 data and project source but generated runtime code
  contains only metadata, fingerprints, and literal loaders.
- ProjectRegistry and future RendererRegistry remain separate; this plan never creates the latter.
- Baseline fingerprint stops at stable upstream/runtime identity; evidence fingerprint adds actual
  preview/render bytes without changing upstream identity.

### Fault and recovery review

- Invalid discovery or validation cannot partially overwrite the tracked registry.
- Read-only drift mode never repairs state.
- Missing default export fails before bundle instead of falling back to an eager import.
- M2 staleness blocks M3 and cannot trigger regeneration.
- Browser/render failure leaves only ignored non-authoritative output and cannot produce a valid M3
  receipt.
- Evidence is written atomically only after alpha, stream, codec, fps, and frame-count checks pass.
- Every Task can be reverted or retried at its small commit boundary without mutating M2 authority.

### Privacy review

- No M3 command needs `RSP_VOXCPM_PRIVATE_CONFIG`; real gates explicitly unset it.
- Registry and evidence scripts read only repository source, sealed public artifacts, generated metadata,
  and fixed ignored output.
- Provider endpoint, token, deployment config, control text, reference path/checksum/bytes, candidate
  workspace, and local machine paths are excluded from registry, receipt, docs, logs, and Git.
- Exact ignore/tracked-file/secret checks run before evidence and final documentation commits.

### M3/M4 and visual boundary review

- M3 implements runtime playback, captions, transparent composition, registration, listing, preview,
  render, and mechanical evidence only.
- M3 does not implement `project:check`, AutoCheck aggregation, NarrativeCheck, approval, or a reusable
  check-level framework. Those remain M4.
- M3 does not create Scene/Shot/ScenePackage contracts, renderer registry, visual/sound/global tracks,
  BaseCanvas, ResourceCatalog, assets, transitions, or visual placeholders.
- The limited playback smoke is an artifact/runtime acceptance, not a narrative-quality judgment or
  user creative approval.

### Planning-only stop condition

This document is the only artifact created by this planning turn. The turn runs only Markdown/style,
diff, and Git-state self-review for the plan itself. It does not implement M3, run new-code tests,
commit, or push. Implementation starts only after explicit user review/approval.
