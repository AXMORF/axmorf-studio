# M2 Real Narration Generation and Sealing Implementation Plan

> **Execution mode:** Implement this plan directly in the active repository conversation, Task by Task, using the checkbox (`- [ ]`) steps for tracking. No external plan runner or subagent workflow is a prerequisite.

**Goal:** Use one new real Story, `gps-relativity`, to turn authored `ttsChunks` into resumable VoxCPM candidates, measured canonical PCM, one atomically sealed complete narration WAV, and M1-compatible `SemanticTiming`/`CaptionCue` artifacts without implementing any Remotion runtime.

**Architecture:** Keep creative source and review declarations under `src/projects/gps-relativity/`, pure contracts and state transitions in `src/contracts/` plus `scripts/narration/domain/`, and all file/process/network effects behind narrow adapters in `scripts/narration/adapters/`. Candidate and measured artifacts stay in an ignored, fingerprint-addressed work area; only a complete, validated selection can be promoted into immutable content-addressed public audio and an atomically written `SealedNarrationManifest`, after which the existing M1 pure timing generator produces the absolute sample/frame timeline.

**Tech Stack:** TypeScript 5.9.3, Zod 4.3.6, Node.js 20+ built-ins (`node:test`, `fetch`, `crypto`, `fs`, `child_process`), `tsx` 4.23.1, host FFmpeg/ffprobe, VoxCPM HTTP API, npm. No new runtime package is planned.

## Planning baseline

- Repository: `/data/projects/repos/remotion-story-producer` (`/home/zzzxc/projects/repos/remotion-story-producer` resolves to the same checkout).
- Branch: `codex/foundation`.
- Base HEAD: `34777b85dcbe5acd34c2a94c40d040170e8c6350` (`docs: close M1 deterministic contract milestone`).
- The worktree was clean before this plan file was created.
- M1 is implemented and accepted: strict source contracts, canonical fingerprints, metadata-level `SealedNarrationManifest`, aggregate stale-artifact validation, and pure `BigInt`/`pcm-cumulative-ceil-v1` timing exist. Real audio/network/file sealing does not.
- The old `ai-video-studio` materials are reference-only for VoxCPM request shape, profile resolution, expression controls, direct host runtime, and recovery. Their punctuation splitter, silence trimmer, per-Scene WAV/captions, float duration-to-frame math, generated paths, and BaseCanvas are explicitly non-authoritative here.

## Global Constraints

- Use the host Node.js/npm workflow only; invoke the host FFmpeg/ffprobe binaries from Node adapters where audio normalization or evidence inspection requires them. Do not add Docker, docker-compose, container validation, or a service manager.
- Keep every `remotion` and `@remotion/*` dependency pinned exactly to `4.0.489`; M2 does not modify Remotion source or dependencies.
- `ttsChunks` are Agent-authored reading units based on semantics, tone, and spoken rhythm. The provider adapter receives each authored `ttsText` exactly once and must never split it by punctuation.
- CaptionCue remains exactly one-to-one with TTSChunk and uses the actual `ttsText`; do not add word timestamps, character-ratio timing, VAD timing, or subtitle summaries.
- Sealed canonical PCM sample frames are the only time authority. Use the existing `BigInt` and `pcm-cumulative-ceil-v1` implementation; never convert each chunk from floating-point seconds to frames.
- Preserve generated natural silence inside each normalized chunk. Do not trim, crop, or infer pauses from punctuation or silence detection. Insert only the explicit pauses declared in `StorySpec` as zero-valued PCM.
- Candidate audio and measured work artifacts are not sealed narration. They live under ignored `.narration-work/` paths and cannot satisfy any sealed-artifact check.
- A partial generation batch cannot write `sealed-narration.generated.json`. A seal receipt is written only after every authored chunk, every explicit pause, the complete WAV, all checksums, all sample-frame counts, and all fingerprints validate together.
- Retry and regeneration never silently replace an active sealed receipt. A different seal requires an explicit compare-and-swap `--supersede <current-sealed-fingerprint>` argument; old content-addressed audio remains preserved.
- Private provider address, token, deployment/model label, tuning values, and voice-reference paths stay in an operator-owned file outside the repository. Project source, work progress, manifests, logs, and evidence must not contain those values or absolute private paths.
- Only the VoxCPM controllable-clone path required by the selected real profile is implemented in M2. Do not add a provider selector, fallback provider, generic TTS framework, DI container, voice-design mode, or high-fidelity-clone mode without a separate approved need.
- Provider connection, timeout, authentication, response-format, reference-file, normalization, measurement, checksum, completeness, lock, and stale-fingerprint failures all fail closed. Never fall back to silence, a different voice, or a stale candidate.
- M2 does not implement `NarrativeCore`, `NarrationAudioTrack`, `CaptionLayer`, `ProjectRegistry`, Story `Composition.tsx`, Remotion runtime, `Scene`, `SceneVisualPlan`, `ShotPlan`, `ScenePackage`, renderer registry, `StoryVisualTrack`, `SoundDesignTrack`, `GlobalVisualLayers`, or `BaseCanvas`.
- Use TDD for every implementation Task: write a focused failing test, run it and record the intended red reason, implement the smallest behavior, run the focused green test, then run typecheck and targeted lint before the Task commit.
- Execute inline from this document. Do not require, install, or emulate an external plan runner, and do not dispatch subagents unless the user explicitly asks for delegation in the implementation conversation.
- Each Task is a future implementation commit boundary. During this planning review, none of the listed commit commands is executed.
- Preserve unrelated work and stage only the exact files listed by the active Task. Do not push unless the user separately requests it.

## Engineering Principles

1. 遵循清晰的软件设计规范。
2. 模块化设计，模块边界明确。
3. 低耦合、高内聚。
4. 遵循单一职责原则。
5. 领域纯函数与文件、进程、网络等副作用分离。
6. 依赖方向清晰，外部 provider 通过窄接口接入。
7. 优先实现当前里程碑所需的最小正确方案。
8. 不建立万能抽象、通用框架、复杂 DI 容器或尚未出现真实复用需求的扩展层。
9. 不为了“以后可能需要”提前设计。
10. 可测试、可恢复、可观测，但避免流程和抽象过重。

The concrete dependency direction is:

```text
src/contracts + scripts/narration/domain
                ↑
scripts/narration/adapters
                ↑
scripts/narration/project-files + generate-runner + seal-runner + check
                ↑
scripts/narration/cli
```

Pure modules accept values and `Buffer`s and return plans, receipts, or canonical bytes. They never call `fetch`, `spawn`, `readFile`, `writeFile`, `rename`, or inspect `process.env`. Adapters own exactly one external boundary. Runners coordinate explicit dependencies as plain function arguments; there is no container or provider registry.

## Execution entry

This plan has been reviewed and approved by the user but is intentionally still untracked at the planning checkpoint. The implementation conversation starts with this exact preflight:

```bash
git branch --show-current
git rev-parse HEAD
git status --short --branch
npx prettier --check docs/superpowers/plans/2026-08-01-m2-real-narration-generation-sealing.md
```

Expected baseline:

```text
branch: codex/foundation
HEAD: 34777b85dcbe5acd34c2a94c40d040170e8c6350
only untracked path: docs/superpowers/plans/2026-08-01-m2-real-narration-generation-sealing.md
```

If unrelated user changes exist, preserve them and continue with exact-path staging; stop only if they overlap files required by the active Task and cannot be safely reconciled. Stage and commit only the approved plan before Task 1:

```bash
git add docs/superpowers/plans/2026-08-01-m2-real-narration-generation-sealing.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: add M2 narration implementation plan"
```

Then execute Task 1 through Task 11 in order in the same conversation. Do not rewrite the plan, reopen approved product boundaries, or ask for routine per-Task confirmation. Pause only for a genuine blocker—most notably missing private VoxCPM configuration/reference files or an unreachable real provider at Task 10—and never fabricate live evidence.

## Locked M2 file structure

```text
src/contracts/
├── story-check.ts                         StoryCheck report contract and stale-input validation
├── project.ts                             add the fixed StoryCheck report path
└── index.ts                               export the M2 report contract

src/projects/gps-relativity/
├── brief.json                             real topic source and audience
├── story.json                             five StoryBeats and ten authored ttsChunks
├── narration.json                         science voice-profile reference
├── render.json                            user-provided render/timing input
├── reviews/story-check.json               Agent-authored, non-user-blocking pre-generation report
└── generated/
    ├── sealed-narration.generated.json    active sealed receipt; absent until complete seal
    └── semantic-timing.generated.json     existing M1 timing output

scripts/narration/
├── domain/
│   ├── provider-input.ts                  safe provider/request fingerprints; no I/O or secrets
│   ├── candidate-progress.ts              candidate/measured lifecycle and resume decisions
│   ├── pcm-wav.ts                         canonical PCM encode/measure/concat and explicit silence
│   └── seal.ts                            pure ordered assembly and manifest construction
├── adapters/
│   ├── private-config.ts                  read one external VoxCPM config and private reference
│   ├── voxcpm-client.ts                   one narrow controllable-clone HTTP adapter
│   ├── ffmpeg-normalizer.ts               provider audio -> 48 kHz mono s16le raw PCM
│   ├── candidate-workspace.ts             ignored progress/candidate file I/O
│   └── atomic-files.ts                    exact-path lock, atomic JSON, immutable directory commit
├── project-files.ts                       fixed-path source/report/artifact loading
├── generate-runner.ts                     execute the resumable per-chunk generation plan
├── seal-runner.ts                         validate, assemble, promote, write receipt, then timing
├── check.ts                               read-only M2 artifact verification and safe evidence summary
└── cli.ts                                 `generate`, `seal`, and `check` argument routing

tests/
├── fixtures/wav.ts                        in-memory WAV/raw-PCM fixture builders
└── narration/
    ├── story-check.test.ts
    ├── gps-relativity-project.test.ts
    ├── private-config.test.ts
    ├── voxcpm-client.test.ts
    ├── pcm-wav.test.ts
    ├── candidate-resume.test.ts
    ├── seal-domain.test.ts
    ├── atomic-seal.test.ts
    └── narration-cli.test.ts

public/projects/gps-relativity/narration/<sealed-digest>/
├── chunks/<chunkId>.wav                   immutable canonical selected chunks
└── complete.wav                           immutable canonical complete narration

docs/
├── NARRATION_GENERATION.md                private setup, lifecycle, commands, and recovery
├── evidence/2026-08-01-gps-relativity-m2.md
└── authority/status files listed in Task 11
```

`<sealed-digest>` is not a planning placeholder. It is the 64 lowercase hexadecimal characters from the runtime-computed `sealedNarrationFingerprint` after removing the `sha256:` prefix; by design it cannot be known before real VoxCPM bytes are measured. The final directory is immutable and content-addressed.

## Locked interfaces

These names and shapes are shared across Tasks. A later Task must use them exactly rather than introducing parallel types.

```ts
export type StoryCheckId =
  | "story-beat-order"
  | "narrative-completeness"
  | "authored-tts-chunks"
  | "voice-profile-selection"
  | "pronunciation-risks";

export type StoryCheckReport = {
  readonly schemaVersion: 1;
  readonly storyId: string;
  readonly storyFingerprint: string;
  readonly generationInputFingerprint: string;
  readonly voiceProfileId: string;
  readonly decision: "proceed" | "revise";
  readonly checks: readonly {
    readonly checkId: StoryCheckId;
    readonly status: "pass" | "warn" | "fail";
    readonly note: string;
  }[];
};

export type SafeVoxcpmExecutionDescriptor = {
  readonly adapterId: "voxcpm-controllable-clone-http-v1";
  readonly modelId: string;
  readonly mode: "controllable-clone";
  readonly cfgValue: number;
  readonly inferenceTimesteps: number;
  readonly normalize: boolean;
  readonly denoise: boolean;
  readonly retryBadcase: boolean;
  readonly voiceProfileId: string;
  readonly referenceAudioChecksum: string;
  readonly controlInstruction: string;
};

export type ResolvedVoxcpmProfile = {
  readonly baseUrl: string;
  readonly endpointPath: "/clone";
  readonly token?: string;
  readonly timeoutMs: number;
  readonly referenceAudioBytes: Buffer;
  readonly controlInstruction: string;
  readonly parameters: {
    readonly cfgValue: number;
    readonly inferenceTimesteps: number;
    readonly normalize: boolean;
    readonly denoise: boolean;
    readonly retryBadcase: boolean;
  };
  readonly safeDescriptor: SafeVoxcpmExecutionDescriptor;
};

export type VoxcpmChunkRequest = {
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly requestFingerprint: string;
  readonly chunkId: string;
  readonly meaningId: string;
  readonly ttsText: string;
};

export type ChunkAudioGenerator = (
  request: VoxcpmChunkRequest,
) => Promise<Buffer>;

export type PcmNormalizer = (sourceBytes: Buffer) => Promise<Buffer>;

export type RawNarrationCandidate = {
  readonly stage: "candidate";
  readonly chunkId: string;
  readonly meaningId: string;
  readonly ttsText: string;
  readonly requestFingerprint: string;
  readonly candidateId: string;
  readonly rawChecksum: string;
  readonly rawRelativePath: string;
};

export type CanonicalMeasuredChunk = {
  readonly stage: "measured";
  readonly chunkId: string;
  readonly meaningId: string;
  readonly ttsText: string;
  readonly requestFingerprint: string;
  readonly candidateId: string;
  readonly rawChecksum: string;
  readonly normalizedChecksum: string;
  readonly pcm: {
    readonly sampleRate: 48000;
    readonly channelLayout: "mono";
    readonly sampleFormat: "s16le";
  };
  readonly sampleFrameCount: number;
  readonly rawRelativePath: string;
  readonly normalizedRelativePath: string;
};

export type NarrationGenerationProgress = {
  readonly schemaVersion: 1;
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly chunks: readonly (RawNarrationCandidate | CanonicalMeasuredChunk)[];
};

export type NarrationGenerationResult = {
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly chunkCount: number;
  readonly measuredChunkCount: number;
  readonly generatedChunkCount: number;
  readonly normalizedChunkCount: number;
  readonly reusedChunkCount: number;
};

export type M2NarrationCheckResult = {
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly sealedNarrationFingerprint: string;
  readonly semanticTimingFingerprint: string;
  readonly chunkCount: number;
  readonly captionCueCount: number;
  readonly completeAudioChecksum: string;
  readonly completeAudioSampleFrameCount: number;
};

export type NarrationSeal = {
  readonly manifest: SealedNarrationManifest;
  readonly completeWav: Buffer;
  readonly chunkWavs: ReadonlyMap<string, Buffer>;
};

export type NarrationSealFileOperations = {
  readonly commitImmutableDirectory: (input: {
    readonly sourceDir: string;
    readonly destinationDir: string;
  }) => Promise<void>;
  readonly writeJsonAtomic: (input: {
    readonly destination: string;
    readonly value: unknown;
  }) => Promise<void>;
};
```

## Artifact lifecycle and fail-closed state machine

```text
Authored source + current StoryCheck
  └─ generationInputFingerprint
       └─ providerAttemptFingerprint
            └─ raw candidate response
                 └─ canonical measured candidate
                      └─ complete measured selection
                           └─ staged complete WAV + manifest
                                └─ immutable public artifact directory
                                     └─ active sealed receipt
                                          └─ SemanticTiming + CaptionCue
```

Rules:

- A raw candidate has provider bytes and a checksum, but no canonical PCM authority. It is persisted before normalization so a local normalization failure can resume without another provider call.
- A measured candidate has canonical PCM bytes, checksum, and integer `sampleFrameCount`, but still lives only under `.narration-work/` and is not sealed.
- Resume requires the same M1 `generationInputFingerprint`, the same safe `providerAttemptFingerprint`, the same per-chunk `requestFingerprint`, and byte/checksum/measurement agreement for every reused file.
- A changed provider deployment label, tuning value, control instruction, or private reference checksum creates a different provider-attempt directory even when the M1 generation input is unchanged. This prevents stale candidate reuse without putting secrets into M1 fingerprints.
- A complete selection contains exactly one measured candidate for every authored TTSChunk, in authored order. Missing, duplicate, extra, stale, or corrupt candidates block sealing.
- The seal transaction writes public bytes into a new content-addressed directory and writes the active manifest only after complete validation. A crash may leave an orphan immutable directory, but cannot leave a receipt that points to missing or unvalidated audio.
- Existing matching sealed narration is verified and reused without provider access. Existing different sealed narration is not replaced unless `--supersede` exactly matches its current fingerprint.
- `SemanticTiming` is generated only from the active sealed manifest through the existing M1 `generateSemanticTiming()` function. It is an atomically written downstream artifact, not part of the multi-file seal commit; an interrupted timing write leaves a valid seal plus missing/stale timing that `narration:check` detects and the same no-provider seal command repairs. M2 does not duplicate or modify the timing algorithm.

---

### Task 1: Define the StoryCheck contract and focused narration test entrypoint

**Files:**

- Modify: `package.json`
- Create: `src/contracts/story-check.ts`
- Modify: `src/contracts/project.ts`
- Modify: `src/contracts/index.ts`
- Create: `tests/narration/story-check.test.ts`

**Interfaces:**

- Consumes: `StorySpec`, `NarrationSpec`, `computeStoryFingerprint()`, and `computeGenerationInputFingerprint()` from M1.
- Produces: `StoryCheckReportSchema`, `StoryCheckReport`, `validateStoryCheckReport({story,narration,report})`, `NARRATIVE_PROJECT_FILES.storyCheck = "reviews/story-check.json"`, and the `tests/narration/*.test.ts` test entrypoint.

- [ ] **Step 1: Add the narration test glob without changing dependencies**

Set the package script to:

```json
{
  "test": "node --import tsx --test tests/contracts/*.test.ts tests/narration/*.test.ts"
}
```

Do not change the package lock because no package is added.

- [ ] **Step 2: Write the failing StoryCheck contract tests**

Create `tests/narration/story-check.test.ts` with focused cases equivalent to:

```ts
test("a proceed report covers each required StoryCheck exactly once", () => {
  assert.doesNotThrow(() =>
    validateStoryCheckReport({
      story,
      narration,
      report: validStoryCheckReport,
    }),
  );
});

test("warnings do not create a user approval gate", () => {
  assert.equal(
    validateStoryCheckReport({ story, narration, report: warningReport })
      .decision,
    "proceed",
  );
});

test("fail findings require revise and block external generation", () => {
  assert.throws(() =>
    validateStoryCheckReport({
      story,
      narration,
      report: invalidProceedReport,
    }),
  );
  assert.equal(
    validateStoryCheckReport({ story, narration, report: reviseReport })
      .decision,
    "revise",
  );
});

test("StoryCheck fails closed when source or voice selection is stale", () => {
  assert.throws(
    () => validateStoryCheckReport({ story: changedStory, narration, report }),
    /story fingerprint is stale/i,
  );
  assert.throws(
    () =>
      validateStoryCheckReport({ story, narration: changedNarration, report }),
    /generation input fingerprint is stale/i,
  );
});

test("RenderSpec is not part of StoryCheck", () => {
  assert.equal("render" in validStoryCheckReport, false);
  assert.throws(() =>
    StoryCheckReportSchema.parse({
      ...validStoryCheckReport,
      render: { fps: 30 },
    }),
  );
});
```

Use all five locked check IDs and assert duplicate, missing, unknown, and out-of-order IDs fail.

- [ ] **Step 3: Run the focused test and verify red**

Run:

```bash
node --import tsx --test tests/narration/story-check.test.ts
```

Expected: FAIL because `src/contracts/story-check.ts` and its exports do not exist.

- [ ] **Step 4: Implement the strict report schema and stale-input validator**

Implement `StoryCheckReportSchema` as a strict Zod object. Its `superRefine` must enforce:

```ts
export const STORY_CHECK_IDS = [
  "story-beat-order",
  "narrative-completeness",
  "authored-tts-chunks",
  "voice-profile-selection",
  "pronunciation-risks",
] as const;
```

- `checks` has exactly five items in this order;
- every note is non-empty after trimming;
- `decision === "proceed"` iff no item has status `"fail"`;
- `decision === "revise"` iff at least one item has status `"fail"`.

Implement:

```ts
export const validateStoryCheckReport = ({
  story,
  narration,
  report,
}: {
  readonly story: StorySpec;
  readonly narration: NarrationSpec;
  readonly report: unknown;
}): StoryCheckReport => {
  const parsed = StoryCheckReportSchema.parse(report);
  if (parsed.storyId !== story.storyId)
    throw new Error("StoryCheck storyId does not match StorySpec.");
  if (parsed.storyFingerprint !== computeStoryFingerprint(story))
    throw new Error("StoryCheck story fingerprint is stale.");
  if (
    parsed.generationInputFingerprint !==
    computeGenerationInputFingerprint(story, narration)
  )
    throw new Error("StoryCheck generation input fingerprint is stale.");
  if (parsed.voiceProfileId !== narration.voiceProfileId)
    throw new Error("StoryCheck voice profile does not match NarrationSpec.");
  return parsed;
};
```

Export the module from `src/contracts/index.ts` and add the fixed report path to `NARRATIVE_PROJECT_FILES` without changing the four M1 source file names.

- [ ] **Step 5: Run green checks**

```bash
node --import tsx --test tests/narration/story-check.test.ts
npm run typecheck
npx eslint src/contracts/story-check.ts src/contracts/project.ts src/contracts/index.ts tests/narration/story-check.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json src/contracts/story-check.ts src/contracts/project.ts src/contracts/index.ts tests/narration/story-check.test.ts
git commit -m "feat: define M2 story check contract"
```

---

### Task 2: Add the real GPS relativity source project and non-blocking StoryCheck report

**Files:**

- Create: `src/projects/gps-relativity/brief.json`
- Create: `src/projects/gps-relativity/story.json`
- Create: `src/projects/gps-relativity/narration.json`
- Create: `src/projects/gps-relativity/render.json`
- Create: `src/projects/gps-relativity/reviews/story-check.json`
- Create: `tests/narration/gps-relativity-project.test.ts`

**Interfaces:**

- Consumes: M1 source schemas and Task 1 StoryCheck validation.
- Produces: a concrete `gps-relativity` project with five ordered StoryBeats, ten authored chunks, two explicit pauses, profile `science-explainer-young-male`, and a current `proceed` StoryCheck report.

- [ ] **Step 1: Write the failing project-source test**

The test reads the five exact files, parses the source with `parseNarrativeProjectSource()`, validates the report, and asserts:

```ts
assert.equal(project.story.storyId, "gps-relativity");
assert.equal(project.story.beats.length, 5);
assert.equal(flattenTtsChunks(project.story).length, 10);
assert.deepEqual(
  project.story.beats.flatMap((beat) => beat.explicitPauses),
  [
    { afterChunkId: "two-relativistic-effects-02", pauseMs: 300 },
    { afterChunkId: "error-accumulation-02", pauseMs: 400 },
  ],
);
assert.equal(project.narration.voiceProfileId, "science-explainer-young-male");
assert.equal(report.decision, "proceed");
assert.equal(
  computeGenerationInputFingerprint(project.story, project.narration),
  "sha256:1b3d1abb5aa14bb8df07d2023a3ab947137a4e9f075234e82ae777a36cb39f96",
);
```

Add a no-resplitting proof:

```ts
assert.equal(
  project.story.beats[0].ttsChunks[0].ttsText,
  "手机定位，表面上是在算位置，底层先是在比较时间。",
);
```

This single authored chunk contains multiple punctuation marks and remains one request unit.

- [ ] **Step 2: Run the focused test and verify red**

```bash
node --import tsx --test tests/narration/gps-relativity-project.test.ts
```

Expected: FAIL with `ENOENT` because the real project files do not exist.

- [ ] **Step 3: Create the exact source files**

Use this source content:

```json
{
  "schemaVersion": 1,
  "storyId": "gps-relativity",
  "title": "为什么 GPS 必须校正相对论",
  "sourceMaterial": "NIST: https://www.nist.gov/atomic-clocks/a-powerful-tool-for-science/putting-einstein-test ; NASA: https://assets.science.nasa.gov/content/dam/science/astro/programs/physics-of-the-cosmos/documents/brochures-factsheets/jan-2015-aas/GR_Centennial_Brochure-Final.pdf",
  "audience": "希望理解日常技术背后物理原理的中文大众观众",
  "targetDurationSeconds": 75,
  "deliveryConstraints": [
    "没有视觉画面时，旁白本身必须完整、准确、可理解。",
    "保留七微秒、四十五微秒和净快三十八微秒的数量关系。",
    "ttsChunks 只按语义、语气和朗读节奏创作，不按标点二次拆分。"
  ]
}
```

```json
{
  "schemaVersion": 1,
  "storyId": "gps-relativity",
  "title": "为什么 GPS 必须校正相对论",
  "beats": [
    {
      "meaningId": "position-is-time",
      "narrativePurpose": "把日常定位问题还原为精密计时问题。",
      "ttsChunks": [
        {
          "chunkId": "position-is-time-01",
          "ttsText": "手机定位，表面上是在算位置，底层先是在比较时间。"
        },
        {
          "chunkId": "position-is-time-02",
          "ttsText": "GPS 接收机测量多颗卫星信号的到达时间，再把光速乘上时间差，换算成距离。"
        }
      ],
      "explicitPauses": []
    },
    {
      "meaningId": "two-relativistic-effects",
      "narrativePurpose": "分别解释速度与引力对卫星钟的相反影响。",
      "ttsChunks": [
        {
          "chunkId": "two-relativistic-effects-01",
          "ttsText": "卫星高速运动，让它的钟按照狭义相对论每天慢大约七微秒。"
        },
        {
          "chunkId": "two-relativistic-effects-02",
          "ttsText": "但卫星所在位置引力更弱，广义相对论又让它的钟每天快大约四十五微秒。"
        }
      ],
      "explicitPauses": [
        { "afterChunkId": "two-relativistic-effects-02", "pauseMs": 300 }
      ]
    },
    {
      "meaningId": "net-drift",
      "narrativePurpose": "说明两种相对论效应叠加后的净时间偏差。",
      "ttsChunks": [
        {
          "chunkId": "net-drift-01",
          "ttsText": "两种效应合在一起，卫星钟相对地面每天大约快三十八微秒。"
        },
        {
          "chunkId": "net-drift-02",
          "ttsText": "这个数字听起来很小，可无线电信号每一微秒就能传播大约三百米。"
        }
      ],
      "explicitPauses": []
    },
    {
      "meaningId": "error-accumulation",
      "narrativePurpose": "把微小钟差连接到会破坏导航的测距误差。",
      "ttsChunks": [
        {
          "chunkId": "error-accumulation-01",
          "ttsText": "如果系统不做校正，测距误差会迅速累积到公里量级。"
        },
        {
          "chunkId": "error-accumulation-02",
          "ttsText": "导航依赖的不是一只孤立的钟，而是卫星、地面控制和接收机共享的一套精密时间基准。"
        }
      ],
      "explicitPauses": [
        { "afterChunkId": "error-accumulation-02", "pauseMs": 400 }
      ]
    },
    {
      "meaningId": "practical-conclusion",
      "narrativePurpose": "以手机蓝点收束相对论的现实用途。",
      "ttsChunks": [
        {
          "chunkId": "practical-conclusion-01",
          "ttsText": "所以，相对论不是只存在于黑板上的抽象理论。"
        },
        {
          "chunkId": "practical-conclusion-02",
          "ttsText": "每次手机把蓝点放到地图上，背后都有爱因斯坦的时间修正正在工作。"
        }
      ],
      "explicitPauses": []
    }
  ]
}
```

```json
{
  "schemaVersion": 1,
  "voiceProfileId": "science-explainer-young-male",
  "mode": "voice-clone"
}
```

```json
{
  "schemaVersion": 1,
  "compositionId": "GpsRelativity",
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "locale": "zh-CN",
  "leadInFrames": 15,
  "tailFrames": 15,
  "captionSafeAreaPx": { "top": 72, "right": 96, "bottom": 96, "left": 96 },
  "output": {
    "container": "mp4",
    "videoCodec": "h264",
    "audioCodec": "aac",
    "audioChannels": 2
  }
}
```

Create `reviews/story-check.json` with the exact current fingerprints:

```json
{
  "schemaVersion": 1,
  "storyId": "gps-relativity",
  "storyFingerprint": "sha256:8fd18dc4377c8d82e7d041effcf92271d521c31db252b3c04135852a88774e2c",
  "generationInputFingerprint": "sha256:1b3d1abb5aa14bb8df07d2023a3ab947137a4e9f075234e82ae777a36cb39f96",
  "voiceProfileId": "science-explainer-young-male",
  "decision": "proceed",
  "checks": [
    {
      "checkId": "story-beat-order",
      "status": "pass",
      "note": "从计时原理进入两种相对论效应，再到净偏差、误差后果和日常结论，推进顺序完整。"
    },
    {
      "checkId": "narrative-completeness",
      "status": "pass",
      "note": "旁白独立交代 GPS 测距、七微秒与四十五微秒的相反效应、净快三十八微秒和工程校正意义。"
    },
    {
      "checkId": "authored-tts-chunks",
      "status": "pass",
      "note": "十个 chunk 均按语义、语气和朗读节奏创作；标点保留在 chunk 内，不要求工具重新拆分。"
    },
    {
      "checkId": "voice-profile-selection",
      "status": "pass",
      "note": "science-explainer-young-male 与中文大众科学解释的冷静、清晰表达目标一致。"
    },
    {
      "checkId": "pronunciation-risks",
      "status": "warn",
      "note": "真实生成后需重点听检 GPS、微秒、狭义相对论、广义相对论和精密时间基准的发音与停连。"
    }
  ]
}
```

- [ ] **Step 4: Run green checks and verify no derived artifact exists yet**

```bash
node --import tsx --test tests/narration/gps-relativity-project.test.ts
test ! -e src/projects/gps-relativity/generated/sealed-narration.generated.json
test ! -e src/projects/gps-relativity/generated/semantic-timing.generated.json
test ! -e src/projects/gps-relativity/Composition.tsx
npm run typecheck
```

Expected: all commands exit 0; the StoryCheck warning remains non-user-blocking, and no sealed/timing/runtime file exists.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/projects/gps-relativity tests/narration/gps-relativity-project.test.ts
git commit -m "feat: author gps relativity narration source"
```

---

### Task 3: Isolate private VoxCPM configuration and compute safe attempt fingerprints

**Files:**

- Modify: `.gitignore`
- Create: `.env.example`
- Create: `scripts/narration/domain/provider-input.ts`
- Create: `scripts/narration/adapters/private-config.ts`
- Create: `tests/narration/private-config.test.ts`

**Interfaces:**

- Consumes: `NarrationSpec.voiceProfileId`, the external file path in `RSP_VOXCPM_PRIVATE_CONFIG`, and M1 `createFingerprint()`.
- Produces: `VoxcpmPrivateConfig`, `ResolvedVoxcpmProfile`, `SafeVoxcpmExecutionDescriptor`, `readVoxcpmPrivateConfig({configPath,readFile})`, `resolveVoxcpmProfile({config,narration,readFile})`, `computeProviderAttemptFingerprint()`, and `computeChunkRequestFingerprint()`.

- [ ] **Step 1: Write failing isolation and fingerprint tests**

Cover these concrete behaviors:

```ts
test("private config resolves one controllable-clone profile", async () => {
  const resolved = await resolveVoxcpmProfile({
    config: fixturePrivateConfig,
    narration,
    readFile: fixtureReadFile,
  });
  assert.equal(
    resolved.safeDescriptor.voiceProfileId,
    narration.voiceProfileId,
  );
  assert.equal(resolved.safeDescriptor.mode, "controllable-clone");
  assert.match(
    resolved.safeDescriptor.referenceAudioChecksum,
    /^sha256:[a-f0-9]{64}$/,
  );
});

test("safe fingerprints exclude endpoints tokens and absolute paths", async () => {
  const serialized = JSON.stringify(resolved.safeDescriptor);
  assert.equal(serialized.includes("127.0.0.1"), false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("/srv/private"), false);
});

test("provider configuration changes fork the attempt but not M1 generation input", () => {
  assert.notEqual(
    computeProviderAttemptFingerprint({ ...descriptor, cfgValue: 2 }),
    computeProviderAttemptFingerprint({ ...descriptor, cfgValue: 2.5 }),
  );
  assert.equal(
    currentGenerationInputFingerprint,
    unchangedGenerationInputFingerprint,
  );
});

test("unknown profiles missing references and malformed URLs fail closed", async () => {
  await assert.rejects(() => resolveUnknownProfile(), /unknown voice profile/i);
  await assert.rejects(() => resolveMissingReference(), /reference audio/i);
  await assert.rejects(() => readInvalidUrlConfig(), /valid HTTP URL/i);
});
```

Also assert `token`, `baseUrl`, `referenceAudioPath`, and the raw private config object are not members of `SafeVoxcpmExecutionDescriptor`.

- [ ] **Step 2: Run the focused test and verify red**

```bash
node --import tsx --test tests/narration/private-config.test.ts
```

Expected: FAIL because the domain and adapter modules do not exist.

- [ ] **Step 3: Add exact ignore and environment boundaries**

Append to `.gitignore`:

```gitignore
.env.*
!.env.example
.narration-work/
private/
```

Create `.env.example` containing only:

```dotenv
RSP_VOXCPM_PRIVATE_CONFIG=/absolute/operator-owned/path/voxcpm.private.json
```

The live private file stays outside the repository and has this strict shape:

```ts
type VoxcpmPrivateConfig = {
  readonly schemaVersion: 1;
  readonly baseUrl: string;
  readonly token?: string;
  readonly timeoutMs: number;
  readonly modelId: string;
  readonly endpointPath: "/clone";
  readonly parameters: {
    readonly cfgValue: number;
    readonly inferenceTimesteps: number;
    readonly normalize: boolean;
    readonly denoise: boolean;
    readonly retryBadcase: boolean;
  };
  readonly voiceProfiles: readonly {
    readonly id: string;
    readonly mode: "controllable-clone";
    readonly referenceAudioPath: string;
    readonly controlInstruction: string;
  }[];
};
```

`referenceAudioPath` must be absolute, readable, and end in `.wav`; the adapter reads it but never returns or logs the path. Require exactly one matching profile ID. Reject fallback profile fields, alternative providers, unsupported modes, duplicate IDs, empty control, missing files, and unexpected object keys.

- [ ] **Step 4: Implement safe fingerprints**

`computeProviderAttemptFingerprint(descriptor)` uses:

```ts
createFingerprint({
  namespace: "voxcpm-provider-attempt",
  version: 1,
  value: descriptor,
});
```

`computeChunkRequestFingerprint()` hashes the exact safe envelope:

```ts
createFingerprint({
  namespace: "voxcpm-chunk-request",
  version: 1,
  value: {
    generationInputFingerprint,
    providerAttemptFingerprint,
    chunkId,
    meaningId,
    ttsText,
  },
});
```

The resolved adapter-only value may hold `baseUrl`, `token`, reference bytes, and timeout in memory. Only its `safeDescriptor` is hashable or serializable into work progress.

- [ ] **Step 5: Run green checks**

```bash
node --import tsx --test tests/narration/private-config.test.ts
npm run typecheck
npx eslint scripts/narration/domain/provider-input.ts scripts/narration/adapters/private-config.ts tests/narration/private-config.test.ts
git check-ignore .narration-work/probe private/probe .env.local
```

Expected: tests/typecheck/lint pass; all three probe paths are reported ignored.

- [ ] **Step 6: Commit Task 3**

```bash
git add .gitignore .env.example scripts/narration/domain/provider-input.ts scripts/narration/adapters/private-config.ts tests/narration/private-config.test.ts
git commit -m "feat: isolate private VoxCPM configuration"
```

---

### Task 4: Implement the narrow host VoxCPM controllable-clone adapter

**Files:**

- Create: `scripts/narration/adapters/voxcpm-client.ts`
- Create: `tests/narration/voxcpm-client.test.ts`

**Interfaces:**

- Consumes: a resolved private config/profile held only in memory, `VoxcpmChunkRequest`, injected `fetch`, and the exact authored `ttsText`.
- Produces: `createVoxcpmChunkGenerator({resolved,fetchImpl}): ChunkAudioGenerator`.

- [ ] **Step 1: Write failing request and failure tests**

Use a fake `fetch` and assert:

```ts
test("one authored TTSChunk causes exactly one VoxCPM request", async () => {
  const generate = createVoxcpmChunkGenerator({ resolved, fetchImpl });
  await generate({
    ...request,
    ttsText: "手机定位，表面上是在算位置，底层先是在比较时间。",
  });
  assert.equal(fetchCalls.length, 1);
  const form = fetchCalls[0].init.body as FormData;
  assert.equal(
    form.get("text"),
    "手机定位，表面上是在算位置，底层先是在比较时间。",
  );
});
```

Assert the request uses `POST`, `${baseUrl}/clone`, the private reference WAV, compact control instruction, cfg/timestep/normalize/denoise/retry fields, and an Authorization header using the Bearer scheme only when a token exists. `modelId` labels and fingerprints the private deployment; it is not sent as an undocumented VoxCPM form field.

Add red tests for timeout/network exceptions, non-2xx responses, a content type other than WAV audio, empty bytes, unsupported mode, and accidental punctuation helper imports. The returned error may include status and a bounded response excerpt, but must not include token, reference bytes, or private path.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/narration/voxcpm-client.test.ts
```

Expected: FAIL because `voxcpm-client.ts` does not exist.

- [ ] **Step 3: Implement only the approved direct request**

Build one `FormData` per authored chunk:

```ts
form.set("text", request.ttsText);
form.set("control", resolved.controlInstruction);
form.set("cfg_value", String(resolved.parameters.cfgValue));
form.set("inference_timesteps", String(resolved.parameters.inferenceTimesteps));
form.set("normalize", String(resolved.parameters.normalize));
form.set("denoise", String(resolved.parameters.denoise));
form.set("retry_badcase", String(resolved.parameters.retryBadcase));
form.set("save", "false");
form.set(
  "reference_audio",
  new Blob([Uint8Array.from(resolved.referenceAudioBytes)], {
    type: "audio/wav",
  }),
  "reference.wav",
);
```

Use `AbortSignal.timeout(resolved.timeoutMs)`. Accept only a successful response with content type `audio/wav`, `audio/x-wav`, or `audio/wave` (parameters such as `charset` may follow) and a positive body length. Return the raw provider bytes and perform no splitting, trimming, measurement, file write, or fallback.

- [ ] **Step 4: Run green and explicit boundary search**

```bash
node --import tsx --test tests/narration/voxcpm-client.test.ts
npm run typecheck
npx eslint scripts/narration/adapters/voxcpm-client.ts tests/narration/voxcpm-client.test.ts
rg -n "split|punctuation|silenceremove|atrim|/api/tts|F5" scripts/narration/adapters/voxcpm-client.ts
```

Expected: tests/typecheck/lint pass; the search returns no matches.

- [ ] **Step 5: Commit Task 4**

```bash
git add scripts/narration/adapters/voxcpm-client.ts tests/narration/voxcpm-client.test.ts
git commit -m "feat: add direct VoxCPM chunk adapter"
```

---

### Task 5: Normalize provider audio into canonical PCM and measure integer sample frames

**Files:**

- Create: `tests/fixtures/wav.ts`
- Create: `scripts/narration/domain/pcm-wav.ts`
- Create: `scripts/narration/adapters/ffmpeg-normalizer.ts`
- Create: `tests/narration/pcm-wav.test.ts`

**Interfaces:**

- Consumes: provider response bytes, injected host-process runner, M1 `pauseMsToSampleFrames()`, and canonical PCM `{sampleRate:48000,channelLayout:"mono",sampleFormat:"s16le"}`.
- Produces: `CANONICAL_NARRATION_PCM`, `encodeCanonicalPcmWav(rawPcm)`, `decodeCanonicalPcmWav(wav)`, `measureCanonicalPcmWav(wav)`, `createExplicitPausePcm(pauseMs)`, `concatenateCanonicalPcm(parts)`, `sha256Bytes(bytes)`, and `normalizeProviderAudio({sourceBytes,runProcess})`.

- [ ] **Step 1: Write failing pure PCM and process-adapter tests**

Cover:

```ts
test("sampleFrameCount counts channel frames rather than interleaved samples", () => {
  const wav = encodeCanonicalPcmWav(Buffer.alloc(48000 * 2));
  assert.equal(measureCanonicalPcmWav(wav).sampleFrameCount, 48000);
});

test("explicit pauses use M1 round-half-up sample conversion", () => {
  assert.equal(createExplicitPausePcm(250).sampleFrameCount, 12000);
  assert.equal(createExplicitPausePcm(300).sampleFrameCount, 14400);
  assert.equal(createExplicitPausePcm(400).sampleFrameCount, 19200);
});

test("canonical concatenation preserves natural zero samples inside chunks", () => {
  const combined = concatenateCanonicalPcm([
    chunkWithNaturalSilence,
    explicitPause,
    chunkB,
  ]);
  assert.deepEqual(decodeCanonicalPcmWav(combined).rawPcm, expectedRawPcm);
});

test("normalizer requests raw 48 kHz mono s16le without trim filters", async () => {
  await normalizeProviderAudio({ sourceBytes, runProcess });
  assert.deepEqual(captured.args.slice(-8), [
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-acodec",
    "pcm_s16le",
    "pipe:1",
  ]);
  assert.equal(
    captured.args.some((arg) => /silenceremove|atrim/.test(arg)),
    false,
  );
});
```

Also reject odd raw PCM byte length, malformed/truncated WAV, non-PCM or non-s16le canonical WAV, unsafe sample counts, empty chunk audio, non-zero FFmpeg exit, and empty FFmpeg stdout.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/narration/pcm-wav.test.ts
```

Expected: FAIL because the PCM domain and FFmpeg adapter do not exist.

- [ ] **Step 3: Implement the pure canonical WAV kernel**

Use a canonical 44-byte RIFF/WAVE header with PCM format `1`, one channel, 48,000 Hz, 16 bits, block align `2`, and byte rate `96,000`. The decoder may accept additional RIFF chunks while finding `fmt ` and `data`, but the encoder always emits the minimal canonical header.

`measureCanonicalPcmWav()` returns integer `sampleFrameCount = data.length / 2`; it never computes a floating duration. `createExplicitPausePcm()` calls the existing M1 `pauseMsToSampleFrames(pauseMs, 48000)` and returns zero-filled raw PCM. `concatenateCanonicalPcm()` sums lengths with `BigInt`, range-checks before Buffer allocation, and never modifies chunk boundaries.

- [ ] **Step 4: Implement the FFmpeg side-effect adapter**

Write provider bytes to an exact temporary input file inside a `mkdtemp()` directory, invoke:

```text
ffmpeg -nostdin -hide_banner -loglevel error -i <temp-input> -map_metadata -1 -vn -ac 1 -ar 48000 -acodec pcm_s16le -f s16le pipe:1
```

Pass stdout raw PCM into `encodeCanonicalPcmWav()`. The adapter owns process spawning and exact temporary-directory cleanup; the pure domain owns the final canonical bytes and measurement. Never pass provider/user text through a shell string—use `spawn(command, args, {shell:false})`.

- [ ] **Step 5: Run green checks**

```bash
node --import tsx --test tests/narration/pcm-wav.test.ts
npm run typecheck
npx eslint tests/fixtures/wav.ts scripts/narration/domain/pcm-wav.ts scripts/narration/adapters/ffmpeg-normalizer.ts tests/narration/pcm-wav.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add tests/fixtures/wav.ts scripts/narration/domain/pcm-wav.ts scripts/narration/adapters/ffmpeg-normalizer.ts tests/narration/pcm-wav.test.ts
git commit -m "feat: normalize and measure canonical narration PCM"
```

---

### Task 6: Add fingerprint-addressed candidate progress and resumable chunk generation

**Files:**

- Create: `scripts/narration/domain/candidate-progress.ts`
- Create: `scripts/narration/adapters/candidate-workspace.ts`
- Create: `scripts/narration/generate-runner.ts`
- Create: `tests/narration/candidate-resume.test.ts`

**Interfaces:**

- Consumes: validated StoryCheck, ordered M1 generation input, safe provider fingerprints, `ChunkAudioGenerator`, PCM normalizer, and one ignored work root.
- Produces: `NarrationGenerationProgressSchema`, `planChunkGeneration({expected,verifiedProgress})`, `loadVerifiedProgress()`, `writeCandidateAndProgress()`, and `runNarrationGeneration(): Promise<NarrationGenerationResult>`.

- [ ] **Step 1: Write failing resume and interruption tests**

Use a temporary work root and fake provider. Cover:

```ts
test("ten authored chunks cause ten requests and no punctuation subrequests", async () => {
  const result = await runNarrationGeneration(fixtureDependencies);
  assert.equal(providerRequests.length, 10);
  assert.deepEqual(
    providerRequests.map((request) => request.ttsText),
    flattenTtsChunks(project.story).map((chunk) => chunk.ttsText),
  );
  assert.equal(result.chunkCount, 10);
  assert.equal(result.measuredChunkCount, 10);
});

test("an interrupted run persists each completed chunk atomically", async () => {
  await assert.rejects(() => runWithFailureOnChunk(4), /fixture interruption/);
  const progress = await loadVerifiedProgress({
    rootDir,
    storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
  });
  assert.equal(progress.chunks.length, 3);
  assert.equal(sealedManifestExists, false);
});

test("normalization failure preserves the verified raw candidate", async () => {
  await assert.rejects(() => runWithNormalizationFailureOnChunk(4));
  const progress = await loadVerifiedProgress({
    rootDir,
    storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
  });
  assert.equal(progress.chunks.length, 4);
  assert.equal(progress.chunks[3].stage, "candidate");
  await runNarrationGeneration(resumeRun);
  assert.equal(resumeProviderRequests.length, 0);
  assert.deepEqual(resumeNormalizedChunkIds, ["two-relativistic-effects-02"]);
});

test("same generation and attempt fingerprints reuse verified measured chunks", async () => {
  await runNarrationGeneration(firstRun);
  await runNarrationGeneration(secondRun);
  assert.equal(secondRunProviderRequests.length, 0);
});

test("missing normalized bytes re-normalize without a provider request", async () => {
  await corruptNormalizedChunk("net-drift-01");
  await runNarrationGeneration(resumeRun);
  assert.equal(resumeProviderRequests.length, 0);
  assert.deepEqual(resumeNormalizedChunkIds, ["net-drift-01"]);
});

test("missing or corrupt raw bytes regenerate only that candidate", async () => {
  await corruptRawChunk("net-drift-01");
  await runNarrationGeneration(resumeRun);
  assert.deepEqual(
    resumeProviderRequests.map((request) => request.chunkId),
    ["net-drift-01"],
  );
});

test("changed generation input or provider attempt never mixes progress", async () => {
  assert.notEqual(progressPathFor(oldInput), progressPathFor(changedInput));
  assert.notEqual(progressPathFor(oldAttempt), progressPathFor(changedAttempt));
});
```

Also test malformed progress, duplicate/extra/out-of-order chunk entries, request fingerprint mismatch, raw checksum mismatch, normalized checksum mismatch, measured sample count mismatch, stale StoryCheck, and provider failure. None may write a sealed receipt.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/narration/candidate-resume.test.ts
```

Expected: FAIL because candidate progress/workspace/runner modules do not exist.

- [ ] **Step 3: Implement the pure resume decision**

The work path is deterministic:

```text
.narration-work/<storyId>/<generationDigest>/<attemptDigest>/progress.json
.narration-work/<storyId>/<generationDigest>/<attemptDigest>/candidates/<chunkId>/<candidateDigest>/raw.wav
.narration-work/<storyId>/<generationDigest>/<attemptDigest>/candidates/<chunkId>/<candidateDigest>/normalized.wav
```

Each digest is the 64-hex body of its prefixed SHA-256 value. `planChunkGeneration()` returns one ordered action per authored chunk:

```ts
type ChunkGenerationAction =
  | { readonly kind: "reuse"; readonly measured: CanonicalMeasuredChunk }
  | { readonly kind: "normalize"; readonly candidate: RawNarrationCandidate }
  | { readonly kind: "generate"; readonly request: VoxcpmChunkRequest };
```

Reuse is legal only after the adapter has verified both files, both checksums, canonical PCM, sample-frame count, chunk identity/text, and all three fingerprints. A verified raw candidate with missing/corrupt measured bytes produces `normalize`; a missing/corrupt raw candidate produces `generate`. No “file exists” shortcut is sufficient.

- [ ] **Step 4: Implement exact-path candidate persistence and orchestration**

For every generated chunk:

1. call the injected `ChunkAudioGenerator` once;
2. hash raw provider bytes and derive `candidateId` from that checksum;
3. write raw bytes under the content-addressed candidate directory using exclusive creation;
4. atomically rewrite `progress.json` with a `stage: "candidate"` entry;
5. normalize through the injected normalizer;
6. hash, measure, and exclusively write canonical WAV;
7. atomically replace that progress entry with `stage: "measured"` while preserving authored order;
8. continue to the next authored chunk.

If the provider step fails, preserve prior verified progress without adding that chunk. If normalization fails after a raw candidate was verified, preserve its candidate-stage entry so the next run can normalize locally without another provider call. `runNarrationGeneration()` returns only safe fingerprints, chunk IDs, work-relative paths, checksums, and sample counts; it never returns or logs token, endpoint, model config object, or private absolute paths.

- [ ] **Step 5: Run green checks**

```bash
node --import tsx --test tests/narration/candidate-resume.test.ts
npm run typecheck
npx eslint scripts/narration/domain/candidate-progress.ts scripts/narration/adapters/candidate-workspace.ts scripts/narration/generate-runner.ts tests/narration/candidate-resume.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 6**

```bash
git add scripts/narration/domain/candidate-progress.ts scripts/narration/adapters/candidate-workspace.ts scripts/narration/generate-runner.ts tests/narration/candidate-resume.test.ts
git commit -m "feat: resume measured narration candidates"
```

---

### Task 7: Build the complete PCM timeline and M1-compatible seal manifest in pure code

**Files:**

- Create: `scripts/narration/domain/seal.ts`
- Create: `tests/narration/seal-domain.test.ts`

**Interfaces:**

- Consumes: `StorySpec`, `NarrationSpec`, one complete `NarrationGenerationProgress`, selected normalized chunk bytes, M1 pause conversion, `computeSealedNarrationFingerprint()`, and `SealedNarrationManifestSchema`.
- Produces: `buildNarrationSeal({story,narration,progress,normalizedChunks})` returning `{manifest,completeWav,chunkWavs}` with no file I/O.

- [ ] **Step 1: Write failing ordered assembly tests**

Cover:

```ts
test("assembly interleaves authored chunks and explicit pauses exactly", () => {
  const seal = buildNarrationSeal(fixture);
  assert.deepEqual(
    seal.manifest.segments.map((segment) => segment.kind),
    [
      "chunk",
      "chunk",
      "chunk",
      "chunk",
      "pause",
      "chunk",
      "chunk",
      "chunk",
      "chunk",
      "pause",
      "chunk",
      "chunk",
    ],
  );
});

test("complete WAV sample frames equal all segment sample frames", () => {
  const segmentTotal = seal.manifest.segments.reduce(
    (sum, segment) => sum + BigInt(segment.sampleFrameCount),
    0n,
  );
  assert.equal(
    segmentTotal,
    BigInt(seal.manifest.completeAudio.sampleFrameCount),
  );
  assert.equal(
    measureCanonicalPcmWav(seal.completeWav).sampleFrameCount,
    seal.manifest.completeAudio.sampleFrameCount,
  );
});

test("pause changes reuse candidates but invalidate seal bytes and fingerprint", () => {
  assert.deepEqual(originalProgress.chunks, changedPauseProgress.chunks);
  assert.notEqual(originalSeal.completeWav, changedPauseSeal.completeWav);
  assert.notEqual(
    originalSeal.manifest.sealedNarrationFingerprint,
    changedPauseSeal.manifest.sealedNarrationFingerprint,
  );
});
```

Also reject incomplete/extra/out-of-order progress, stale generation fingerprint, ttsText mismatch, meaning mismatch, duplicate chunk selection, noncanonical chunk WAV, checksum mismatch, zero-frame chunk, unsafe total size, and a complete WAV whose decoded sample count differs from the segment sum.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/narration/seal-domain.test.ts
```

Expected: FAIL because `scripts/narration/domain/seal.ts` does not exist.

- [ ] **Step 3: Implement the pure seal builder**

Flatten Story chunks in authored order. After each chunk, append a zero-valued raw PCM segment only when that exact chunk owns an `explicitPause`. Build the complete canonical WAV from one continuous raw PCM buffer; do not concatenate floating durations or frame counts.

Construct chunk paths and the complete path as:

```text
public/projects/<storyId>/narration/<sealedDigest>/chunks/<chunkId>.wav
public/projects/<storyId>/narration/<sealedDigest>/complete.wav
```

Because M1 deliberately excludes local paths from `computeSealedNarrationFingerprint()`, compute the fingerprint once from validated checksums/counts with in-memory provisional project paths, derive `sealedDigest`, replace all paths with the content-addressed final paths, and parse the final object with `SealedNarrationManifestSchema`. Recompute and assert the fingerprint remains identical.

The manifest must use exactly:

```ts
{
  normalizationAlgorithmId: "pcm-s16le-normalize-v1",
  assemblyAlgorithmId: "ordered-pcm-concat-v1",
  canonicalPcm: CANONICAL_NARRATION_PCM,
}
```

- [ ] **Step 4: Run green checks**

```bash
node --import tsx --test tests/narration/seal-domain.test.ts
npm run typecheck
npx eslint scripts/narration/domain/seal.ts tests/narration/seal-domain.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit Task 7**

```bash
git add scripts/narration/domain/seal.ts tests/narration/seal-domain.test.ts
git commit -m "feat: assemble complete narration seal"
```

---

### Task 8: Atomically promote sealed audio, generate timing, and verify actual files

**Files:**

- Create: `scripts/narration/adapters/atomic-files.ts`
- Create: `scripts/narration/seal-runner.ts`
- Create: `scripts/narration/check.ts`
- Create: `tests/narration/atomic-seal.test.ts`

**Interfaces:**

- Consumes: Task 7 seal result, existing active receipt if present, optional expected `supersedeFingerprint`, project root, M1 `generateSemanticTiming()` and `validateM1ArtifactBundle()`.
- Produces: `withProjectSealLock()`, `writeJsonAtomic()`, `commitImmutableDirectory()`, the narrow `NarrationSealFileOperations` adapter interface consumed by `runNarrationSeal()`, and `checkM2NarrationArtifacts(): Promise<M2NarrationCheckResult>`.

- [ ] **Step 1: Write failing atomicity, supersede, and read-only check tests**

Test fault injection at exact phases:

```ts
test("failure before public promotion leaves no receipt", async () => {
  await assert.rejects(() =>
    runNarrationSeal({
      ...input,
      fileOperations: createFailingSealFileOperations("before-promote"),
    }),
  );
  assert.equal(await exists(activeManifestPath), false);
});

test("failure after immutable promotion but before receipt leaves only an orphan", async () => {
  await assert.rejects(() =>
    runNarrationSeal({
      ...input,
      fileOperations: createFailingSealFileOperations("before-receipt"),
    }),
  );
  assert.equal(await exists(immutableAudioDirectory), true);
  assert.equal(await exists(activeManifestPath), false);
});

test("failure after receipt leaves a valid seal and recoverable stale timing", async () => {
  await assert.rejects(() =>
    runNarrationSeal({
      ...input,
      fileOperations: createFailingSealFileOperations("before-timing"),
    }),
  );
  assert.doesNotThrow(() => readAndValidateActiveManifest());
  await assert.rejects(
    () => checkM2NarrationArtifacts(project),
    /semantic-timing/i,
  );
  await runNarrationSeal(sameSeal);
  await assert.doesNotReject(() => checkM2NarrationArtifacts(project));
});

test("different active seal requires exact compare-and-swap fingerprint", async () => {
  await assert.rejects(() => runNarrationSeal(newSeal), /--supersede/i);
  await assert.rejects(
    () =>
      runNarrationSeal({ ...newSeal, supersedeFingerprint: wrongFingerprint }),
    /current sealed fingerprint/i,
  );
  assert.deepEqual(await readFile(activeManifestPath), originalManifestBytes);
});

test("same sealed fingerprint keeps the receipt and repairs timing when needed", async () => {
  const before = await stat(activeManifestPath);
  await runNarrationSeal(sameSeal);
  const after = await stat(activeManifestPath);
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test("read-only check detects changed chunk complete WAV and timing", async () => {
  await assert.rejects(() => checkAfterChunkCorruption(), /checksum/i);
  await assert.rejects(() => checkAfterCompleteCorruption(), /complete audio/i);
  await assert.rejects(() => checkAfterTimingEdit(), /semantic-timing.*stale/i);
});
```

Also test exclusive lock contention, stale lock reporting, no manifest on incomplete progress, timing written from cumulative PCM, CaptionCue count equal to authored chunk count, and old immutable audio preservation after an explicit supersede.

`createFailingSealFileOperations()` is a test fixture that wraps the real temporary-root adapter and throws at the named adapter boundary. Do not add a production `failAt` CLI flag or test-only branch to `seal-runner.ts`.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/narration/atomic-seal.test.ts
```

Expected: FAIL because the atomic adapters/runners/checker do not exist.

- [ ] **Step 3: Implement exact-path locking and atomic writes**

Use `src/projects/<storyId>/generated/.narration-seal.lock` with `open(path, "wx")`. The lock body contains only process ID and operation name. A present lock fails immediately and prints the exact recovery instruction; code never automatically deletes an unknown lock.

`writeJsonAtomic()` must:

1. serialize canonical pretty JSON plus one trailing newline;
2. create a unique sibling temp file with exclusive mode;
3. write and `FileHandle.sync()`;
4. rename the sibling onto the destination while holding the project seal lock;
5. sync the parent directory when the platform supports it.

`commitImmutableDirectory()` renames one verified staging directory to the content-addressed public destination. If the destination exists, validate it byte-for-byte and reuse it; never mutate it.

- [ ] **Step 4: Implement the seal transaction in fail-closed order**

While holding the lock:

1. load and validate source, StoryCheck, selected progress, and every measured WAV;
2. build the seal entirely in memory/staging;
3. call `generateSemanticTiming({story,narration,render,sealedNarration})` in memory;
4. call `validateM1ArtifactBundle()` with the generated values before any promotion;
5. compare the existing receipt and enforce no-op or exact `--supersede` semantics;
6. commit the immutable audio directory;
7. atomically write `sealed-narration.generated.json` after every referenced audio file exists;
8. atomically write `semantic-timing.generated.json` from that active receipt; if the same receipt is already active, keep its bytes/mtime and only repair missing or stale timing;
9. immediately call the read-only checker before reporting success.

The manifest is the atomic seal boundary and never points to missing audio. Timing is a downstream generated artifact with its own atomic write. A stop between steps 7 and 8 leaves a valid sealed narration plus missing/stale timing, never an unsealed candidate pretending to be sealed; rerunning the same seal repairs timing without a provider call or manifest overwrite. This ordering also avoids replacing an old valid receipt's timing before the new receipt becomes active.

`checkM2NarrationArtifacts()` reopens every file, hashes bytes, decodes every canonical WAV, verifies PCM/sample counts and segment sum, regenerates timing through M1, validates StoryCheck staleness, and returns only the locked safe summary fields.

- [ ] **Step 5: Run green checks**

```bash
node --import tsx --test tests/narration/atomic-seal.test.ts
npm run typecheck
npx eslint scripts/narration/adapters/atomic-files.ts scripts/narration/seal-runner.ts scripts/narration/check.ts tests/narration/atomic-seal.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 8**

```bash
git add scripts/narration/adapters/atomic-files.ts scripts/narration/seal-runner.ts scripts/narration/check.ts tests/narration/atomic-seal.test.ts
git commit -m "feat: seal narration artifacts atomically"
```

---

### Task 9: Add the fixed M2 CLI and a synthetic end-to-end recovery proof

**Files:**

- Create: `scripts/narration/project-files.ts`
- Create: `scripts/narration/cli.ts`
- Modify: `package.json`
- Create: `tests/narration/narration-cli.test.ts`

**Interfaces:**

- Consumes: fixed project files, Task 3–8 adapters/runners, `RSP_VOXCPM_PRIVATE_CONFIG`, and CLI args.
- Produces: `npm run narration:generate`, `npm run narration:seal`, `npm run narration:check`, strict argument parsing, and JSON-only safe stdout summaries.

- [ ] **Step 1: Write failing CLI and synthetic workflow tests**

Test exact commands through an injected CLI context rather than a real provider:

```ts
test("generate requires current StoryCheck and external private config", async () => {
  await assert.rejects(
    () => runCli(["generate", "--project", "gps-relativity"], noConfig),
    /RSP_VOXCPM_PRIVATE_CONFIG/,
  );
  await assert.rejects(
    () => runCli(["generate", "--project", "gps-relativity"], staleStoryCheck),
    /StoryCheck/i,
  );
});

test("synthetic interruption resume seal and check complete end to end", async () => {
  await assert.rejects(() => runGenerateWithFailureOnChunk(6));
  const resumed = await runGenerateSuccessfully();
  assert.equal(resumed.generatedChunkCount, 5);
  assert.equal(resumed.reusedChunkCount, 5);
  await runCli(
    [
      "seal",
      "--project",
      "gps-relativity",
      "--attempt",
      resumed.providerAttemptFingerprint,
    ],
    context,
  );
  const checked = await runCli(
    ["check", "--project", "gps-relativity"],
    context,
  );
  assert.equal(checked.chunkCount, 10);
  assert.equal(checked.captionCueCount, 10);
});

test("unknown flags arbitrary paths and M3 commands are rejected", async () => {
  await assert.rejects(
    () => runCli(["render", "--project", "gps-relativity"], context),
    /generate|seal|check/,
  );
  await assert.rejects(
    () => runCli(["check", "--project", "../other"], context),
    /project slug/i,
  );
});
```

Assert stdout contains no base URL, token, model configuration object, control instruction, absolute path, or private reference checksum. The safe provider attempt fingerprint may be printed.

- [ ] **Step 2: Run focused red**

```bash
node --import tsx --test tests/narration/narration-cli.test.ts
```

Expected: FAIL because project file loading and CLI modules do not exist.

- [ ] **Step 3: Implement fixed project loading and strict CLI routing**

`project-files.ts` accepts `{rootDir,projectId}` but resolves only:

```text
src/projects/<projectId>/brief.json
src/projects/<projectId>/story.json
src/projects/<projectId>/narration.json
src/projects/<projectId>/render.json
src/projects/<projectId>/reviews/story-check.json
src/projects/<projectId>/generated/sealed-narration.generated.json
src/projects/<projectId>/generated/semantic-timing.generated.json
```

Validate `projectId` with `StoryIdSchema`; reject arbitrary source/output paths and unknown flags.

CLI commands:

```text
generate --project <storyId>
seal --project <storyId> --attempt <sha256> [--supersede <sha256>]
check --project <storyId>
```

`generate` is the only command that reads `RSP_VOXCPM_PRIVATE_CONFIG` or calls the network. `seal` and `check` must work without provider address/token/reference files. Status lines go to stderr; stdout is one JSON object safe to redirect as evidence.

- [ ] **Step 4: Add package commands**

Add:

```json
{
  "narration:generate": "node --import tsx scripts/narration/cli.ts generate",
  "narration:seal": "node --import tsx scripts/narration/cli.ts seal",
  "narration:check": "node --import tsx scripts/narration/cli.ts check"
}
```

Do not add `project:check`; that is M4.

- [ ] **Step 5: Run green and full synthetic checks**

```bash
node --import tsx --test tests/narration/narration-cli.test.ts
npm test
npm run typecheck
npx eslint scripts/narration/project-files.ts scripts/narration/cli.ts tests/narration/narration-cli.test.ts
```

Expected: all contract/narration tests pass with zero provider/network access.

- [ ] **Step 6: Commit Task 9**

```bash
git add package.json scripts/narration/project-files.ts scripts/narration/cli.ts tests/narration/narration-cli.test.ts
git commit -m "feat: add M2 narration workflow commands"
```

---

### Task 10: Run the real VoxCPM production, seal the Story, and record acceptance evidence

**Files:**

- Create at runtime: `public/projects/gps-relativity/narration/<sealed-digest>/chunks/*.wav`
- Create at runtime: `public/projects/gps-relativity/narration/<sealed-digest>/complete.wav`
- Create at runtime: `src/projects/gps-relativity/generated/sealed-narration.generated.json`
- Create at runtime: `src/projects/gps-relativity/generated/semantic-timing.generated.json`
- Create: `docs/evidence/2026-08-01-gps-relativity-m2.md`
- Ignored runtime state: `.narration-work/gps-relativity/**`
- Ignored local evidence: `out/gps-relativity/m2-generation.json`
- Ignored local evidence: `out/gps-relativity/m2-check.json`

**Interfaces:**

- Consumes: the current real project/report, one operator-owned VoxCPM config, a reachable host VoxCPM service, the Task 9 CLI, and no Remotion runtime.
- Produces: ten real selected canonical chunk WAVs, one complete WAV, one active M1-compatible manifest, one SemanticTiming/CaptionCue artifact, and a redacted M2 evidence record.

- [ ] **Step 1: Verify live prerequisites without printing secrets**

```bash
test -n "$RSP_VOXCPM_PRIVATE_CONFIG"
test -f "$RSP_VOXCPM_PRIVATE_CONFIG"
command -v ffmpeg
command -v ffprobe
git status --short
npm test
```

Expected: the config variable is set to an external readable file, FFmpeg/ffprobe resolve, the worktree contains only the active planned slice, and tests pass. Do not print or copy the private file.

- [ ] **Step 2: Generate real chunks and deliberately prove resume**

Start generation:

```bash
mkdir -p out/gps-relativity
npm run --silent narration:generate -- --project gps-relativity > out/gps-relativity/m2-generation.json
```

If the provider or process stops, rerun the same command unchanged. The final JSON must report ten verified chunks and may report a mix of reused/generated counts. Inspect safe progress without opening private config:

```bash
node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("out/gps-relativity/m2-generation.json","utf8"));if(r.chunkCount!==10)process.exit(1);console.log(r.providerAttemptFingerprint)'
```

Expected: one `sha256:` provider attempt fingerprint and `chunkCount: 10`; no sealed manifest exists before the seal command.

- [ ] **Step 3: Seal the exact measured attempt**

```bash
M2_ATTEMPT_FINGERPRINT="$(node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("out/gps-relativity/m2-generation.json","utf8"));process.stdout.write(r.providerAttemptFingerprint)' )"
npm run narration:seal -- --project gps-relativity --attempt "$M2_ATTEMPT_FINGERPRINT"
npm run --silent narration:check -- --project gps-relativity > out/gps-relativity/m2-check.json
```

Expected: seal and check exit 0. No `--supersede` is used for the first seal. If a different active receipt already exists, stop and review it; do not guess or delete it.

- [ ] **Step 4: Verify real audio mechanically and by listening**

Resolve the complete audio path only from the active manifest:

```bash
M2_COMPLETE_WAV="$(node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync("src/projects/gps-relativity/generated/sealed-narration.generated.json","utf8"));process.stdout.write(m.completeAudio.localPath)' )"
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -show_entries format=duration -of json "$M2_COMPLETE_WAV"
ffmpeg -hide_banner -i "$M2_COMPLETE_WAV" -af volumedetect -f null -
ffmpeg -hide_banner -i "$M2_COMPLETE_WAV" -af silencedetect=n=-45dB:d=2.5 -f null -
```

Expected: PCM s16le, 48,000 Hz, mono, positive duration, no clipping-level anomaly, and no unexplained long silence. Listen to the complete WAV from start to finish and record specific checks for `GPS`, `微秒`, `狭义相对论`, `广义相对论`, the two authored pauses, chunk joins, completeness, and absence of truncation. This is M2 artifact acceptance, not the M4 `NarrativeCheck` contract.

- [ ] **Step 5: Write redacted acceptance evidence**

First print the exact redaction-safe fields that must be transcribed:

```bash
node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("out/gps-relativity/m2-check.json","utf8"));for(const key of ["storyId","generationInputFingerprint","sealedNarrationFingerprint","semanticTimingFingerprint","chunkCount","captionCueCount","completeAudioChecksum","completeAudioSampleFrameCount"])console.log(`${key}: ${r[key]}`)'
```

Then create `docs/evidence/2026-08-01-gps-relativity-m2.md`. Its title is `GPS Relativity M2 Narration Evidence`; transcribe the exact printed Story/generation/seal/timing/checksum/sample values and the safe provider-attempt fingerprint from `m2-generation.json`. Record `10 / 10` authored/measured chunks, the actual `captionCueCount`, canonical `48000 Hz / mono / s16le`, generated/normalized/reused counts, ffprobe/volumedetect/silencedetect results, and the listening findings for pronunciation, joins, pauses, completeness, and truncation. End with explicit privacy and scope checks. Do not include instruction prose, endpoint, token, model config object, control text, absolute private path, reference checksum, or reference bytes in the committed evidence.

- [ ] **Step 6: Re-run the seal and prove it does not overwrite**

Record the manifest checksum, rerun the same seal, and compare:

```bash
sha256sum src/projects/gps-relativity/generated/sealed-narration.generated.json > out/gps-relativity/manifest-before.sha256
npm run narration:seal -- --project gps-relativity --attempt "$M2_ATTEMPT_FINGERPRINT"
sha256sum -c out/gps-relativity/manifest-before.sha256
```

Expected: the second seal verifies/reuses the identical fingerprint, performs no provider call, and leaves the active manifest byte-identical.

- [ ] **Step 7: Verify Git isolation before staging**

```bash
git status --short
git check-ignore .narration-work/gps-relativity out/gps-relativity .env.local private/probe
rg -n "https?://|Bearer |token|referenceAudioPath|/home/|/data/|/srv/" \
  src/projects/gps-relativity/generated \
  public/projects/gps-relativity/narration \
  docs/evidence/2026-08-01-gps-relativity-m2.md
```

Expected: work and out paths are ignored; only public sealed audio, generated manifest/timing, and redacted evidence are tracked candidates; the privacy search returns no match.

- [ ] **Step 8: Commit Task 10**

```bash
git add public/projects/gps-relativity/narration
git add src/projects/gps-relativity/generated/sealed-narration.generated.json
git add src/projects/gps-relativity/generated/semantic-timing.generated.json
git add docs/evidence/2026-08-01-gps-relativity-m2.md
git commit -m "feat: seal gps relativity narration"
```

---

### Task 11: Document recovery, close M2, and prove no M3 or Scene scope leaked in

**Files:**

- Create: `docs/NARRATION_GENERATION.md`
- Modify: `docs/README.md`
- Modify: `docs/contracts/NARRATIVE_CONTRACTS.md`
- Modify: `README.md`
- Modify: `docs/PRODUCTION_WORKFLOW.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DETERMINISTIC_EXECUTION.md`
- Modify: `docs/ITERATION_STATUS.md`
- Modify: `docs/ROADMAP.md`

**Interfaces:**

- Consumes: verified Task 1–10 code, real artifacts, command output, recovery behavior, and scope evidence.
- Produces: operator-facing M2 usage/recovery docs and authority docs that mark only real narration generation/sealing/timing complete while leaving M3+ unimplemented.

- [ ] **Step 1: Write the exact generation and recovery guide**

`docs/NARRATION_GENERATION.md` must document:

- external `RSP_VOXCPM_PRIVATE_CONFIG` shape and why it stays outside the repo;
- `generate`, `seal`, and `check` commands and safe JSON output;
- authored-chunk rule and the explicit prohibition on punctuation splitting/silence trimming;
- candidate → measured → sealed lifecycle and exact `.narration-work` versus `public/projects` locations;
- same generation/attempt fingerprint resume validation;
- provider configuration change creating a new attempt rather than reusing stale candidates;
- provider outage behavior: current matching sealed narration remains usable; generation of missing chunks fails closed;
- incomplete batch behavior: progress is recoverable, sealed receipt absent;
- lock behavior: first verify no narration process is running, inspect the exact `.narration-seal.lock`, then remove only that exact stale lock and rerun `narration:check` before sealing;
- supersede behavior: run `narration:check`, copy the current fingerprint, pass it exactly via `--supersede`, preserve the old immutable directory, and rerun the checker;
- privacy/redaction requirements and Git isolation checks;
- M2 does not preview, render, register a Composition, or implement captions visually.

- [ ] **Step 2: Update contract and navigation docs**

In `docs/contracts/NARRATIVE_CONTRACTS.md`, change only the M2 portions from target to implemented:

- real chunk normalization/measurement and file-backed seal validation now exist;
- StoryCheck contract exists and is Agent-authored/non-user-blocking;
- candidate progress and provider attempt fingerprint are operational work records, not M1 persisted source or sealed authority;
- `pcm-cumulative-ceil-v1` remains unchanged and still creates CaptionCue 1:1 from sealed samples.

Link `docs/NARRATION_GENERATION.md` and the evidence file from `docs/README.md` and README. Document the three M2 commands in README without presenting `project:check`, Narrative Baseline, preview, or render as available.

- [ ] **Step 3: Synchronize authority status without overstating implementation**

Update:

- `PRODUCTION_WORKFLOW.md`: mark the flow through real sealed narration and SemanticTiming as implemented for `gps-relativity`; keep NarrativeCore onward as target.
- `ARCHITECTURE.md`: name the implemented domain/adapters/runners and retain the M3 runtime boundary as absent.
- `DETERMINISTIC_EXECUTION.md`: mark M2 file I/O/provider/sealing/check modules implemented; state canonical FFmpeg normalization plus Node measurement; retain ProjectRegistry/runtime/Scene sections as targets.
- `ITERATION_STATUS.md`: move only StoryCheck, one profile adapter, real VoxCPM generation/resume, normalization, checksums, complete WAV, atomic seal, SemanticTiming/CaptionCue artifact, tests, recovery docs, and real M2 evidence to completed. Explicitly keep NarrativeCore, CaptionLayer, ProjectRegistry, Composition, NarrativeCheck, all Scene/visual/sound/global work unfinished.
- `ROADMAP.md`: mark M2 complete only after all verification below passes; set M3 as the next milestone and require a separately reviewed M3 plan.

- [ ] **Step 4: Run the complete repository verification gate**

Run fresh:

```bash
npm test
npm run narration:check -- --project gps-relativity
npm run check
git diff --check
```

Expected:

- every contract, resume, adapter, atomicity, and end-to-end test passes;
- the real file-backed narration check exits 0;
- typecheck, lint, Remotion bundle, and composition listing pass;
- `CapabilityGallery` remains the only Composition because M3 has not started;
- no whitespace errors.

- [ ] **Step 5: Prove no M3, Scene, or BaseCanvas implementation exists**

Run:

```bash
git diff --name-only 34777b8
find src/projects/gps-relativity -maxdepth 2 -type f | sort
rg -n "from [\"']remotion|@remotion|NarrativeCore|NarrationAudioTrack|CaptionLayer|ProjectRegistry|lazyComponent|Composition\.tsx|SceneVisualPlan|ShotPlan|ScenePackage|rendererId|StoryVisualTrack|SoundDesignTrack|GlobalVisualLayers|BaseCanvas" \
  scripts/narration \
  src/contracts \
  src/projects/gps-relativity \
  tests/narration
```

Expected:

- changed implementation paths are limited to contracts, narration scripts/tests, one source project, sealed audio/artifacts, package scripts, ignore/example config, evidence, this plan, and listed docs;
- the project file listing has no `Composition.tsx`, renderer, Scene, Shot, sound, global, or Remotion runtime source;
- the boundary search returns only negative assertions/test strings or documented contract names, with no Remotion import or implementation.

Also run:

```bash
rg -n "split.*punct|punct.*split|silenceremove|atrim|Math\.(round|ceil)\([^\n]*fps|durationInSeconds[^\n]*fps" scripts/narration tests/narration
```

Expected: no production-code match that splits punctuation, trims silence, or derives per-chunk frames from float seconds. Fixture/test descriptions may mention the forbidden behavior only as negative assertions.

- [ ] **Step 6: Inspect the exact staged scope and secret boundary**

```bash
git status --short
git diff --stat
git diff --check
git ls-files .narration-work out .env .env.local private
git grep -n -E "Bearer [A-Za-z0-9]|VOXCPM.*TOKEN=.+|referenceAudioPath.*(/home/|/data/|/srv/)" -- . ':!docs/superpowers/plans/2026-08-01-m2-real-narration-generation-sealing.md'
```

Expected: no ignored private/work/output file is tracked and no live secret or private absolute reference path is found.

- [ ] **Step 7: Commit Task 11**

```bash
git add docs/NARRATION_GENERATION.md docs/README.md docs/contracts/NARRATIVE_CONTRACTS.md README.md
git add docs/PRODUCTION_WORKFLOW.md docs/ARCHITECTURE.md docs/DETERMINISTIC_EXECUTION.md docs/ITERATION_STATUS.md docs/ROADMAP.md
git commit -m "docs: close M2 real narration milestone"
```

After this commit, stop. Do not begin M3 in the same execution run and do not push without explicit user instruction.

---

## M2 completion evidence

M2 is complete only when all of the following are simultaneously true:

- the real `gps-relativity` source and current StoryCheck report validate;
- ten authored TTSChunks caused exactly ten VoxCPM requests on a fresh run, with no punctuation resplitting;
- interruption/resume reused only checksum- and measurement-verified chunks under the same generation and provider-attempt fingerprints;
- all selected chunks are canonical 48 kHz mono s16le PCM with positive integer sample-frame counts;
- the 300 ms and 400 ms authored pauses are zero-valued PCM segments of 14,400 and 19,200 sample frames respectively;
- complete WAV decoded sample frames equal the exact BigInt sum of all chunk and pause segments;
- the active manifest validates through `SealedNarrationManifestSchema` and actual-file checks;
- `SemanticTiming` regenerates byte-equivalently through M1 `pcm-cumulative-ceil-v1` and has ten CaptionCues for ten chunks;
- a partial run writes no sealed receipt, an identical rerun does not overwrite, and a different seal requires exact `--supersede` compare-and-swap;
- provider address/token/model config/private paths are absent from tracked source, manifests, evidence, progress summaries, and logs;
- `npm test`, `npm run narration:check -- --project gps-relativity`, and `npm run check` pass;
- `CapabilityGallery` remains the only listed Composition and no M3/Scene/BaseCanvas implementation exists;
- authority docs identify M3 planning—not M3 implementation—as the next step.

## Plan self-review record

### Spec coverage

| Requested area                                     | Planned evidence                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Module responsibilities and clean design           | Locked file structure, dependency direction, Tasks 1–9                                 |
| Pure domain versus file/process/network effects    | Engineering Principles plus domain/adapter split in Tasks 3–8                          |
| Candidate/measured/sealed lifecycle                | Lifecycle state machine, Tasks 6–8                                                     |
| Resume and atomic fail-closed sealing              | Task 6 resume matrix, Task 8 fault injection/CAS semantics                             |
| M1 fingerprint/invalidation linkage                | generation, provider-attempt, request, sealed, and timing fingerprints in Tasks 3, 6–8 |
| Private config separation                          | Task 3 external config and Task 10/11 redaction checks                                 |
| Authored chunk, 1:1 caption, cumulative PCM timing | Global constraints and Tasks 2, 4, 5, 7, 8                                             |
| Real VoxCPM proof                                  | Task 10                                                                                |
| Failure recovery and observability                 | Tasks 6, 8, 9, 11                                                                      |
| TDD, focused verification, small commits           | Every implementation Task has red/green commands and one commit boundary               |
| Execution without external plan tooling            | Execution-mode header and exact-path Execution entry                                   |
| No M3 or Scene scope                               | Global exclusions and Task 11 scope searches                                           |

### Interface consistency

- `StoryCheckReport` always binds M1 story and generation fingerprints and never consumes RenderSpec.
- `providerAttemptFingerprint` is safe operational identity; it never replaces or mutates M1 `generationInputFingerprint`.
- `CanonicalMeasuredChunk` is the only candidate type consumed by the seal builder.
- `SealedNarrationManifest` and `SemanticTiming` remain the existing M1 contracts; M2 produces real bytes for them rather than creating competing receipt/timing types.
- `generate` alone needs private/network inputs; `seal` and `check` consume local measured or sealed artifacts.
- `M2NarrationCheckResult` contains only redaction-safe acceptance fields used by Task 10 evidence.

### Boundary review

- Reused from the old project: direct host VoxCPM request pattern, explicit voice-profile resolution, per-unit progress persistence, response validation, and fail-closed provider behavior.
- Explicitly not reused: punctuation splitting, `displayText` compatibility, per-Scene audio, silence trimming, float-second duration/frame math, scene-local captions, old generated paths, provider fallback, and BaseCanvas.
- No new shared capability is promoted. All M2 production code stays in the narration domain/scripts required by the first real Story.
- No implementation step creates a Composition, imports Remotion, renders captions, lists a ProjectRegistry entry, or introduces any visual/sound/global contract.

### Planning-only stop condition

This document is the only artifact created by the planning/optimization run. Implementation begins only in the user's new execution conversation; this turn does not run new-code tests, commit, or push.
