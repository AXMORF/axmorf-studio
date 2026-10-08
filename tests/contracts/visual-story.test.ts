import assert from "node:assert/strict";
import test from "node:test";

import * as c from "@axmorf/studio/contracts";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validProjectSource,
  validRenderSpec,
  validStorySpec,
  validVideoBrief,
} from "../fixtures/narrative";
import {
  validProjectCreateInput,
  validProjectCreateProducerConfig,
} from "../fixtures/project-create";
import {
  createScenePlans,
  createSceneTaskInput,
} from "../fixtures/scene/scene-input";
import { finalAssemblyInput } from "../fixtures/final-assembly/input";
import { createAuthoredGroupedRuntimeFixture } from "../fixtures/scene/authored-grouped";

const digest = `sha256:${"a".repeat(64)}`;
const render = c.RenderSpecSchema.parse(validRenderSpec);
const visualBeat = (meaningId = "opening", durationInFrames = 120) => ({
  kind: "visual-scene" as const,
  meaningId,
  narrativePurpose:
    "The source ribbon separates a plausible answer from its evidence.",
  durationInFrames,
});
const visualStory = () =>
  c.StorySpecSchema.parse({
    ...validStorySpec,
    beats: [visualBeat(), visualBeat("conclusion", 90)],
  });
const boundary = (meaningId: string, durationInFrames: number) => ({
  kind: "silent-scene" as const,
  meaningId,
  narrativePurpose: "A reusable boundary.",
  preset: c.buildSilentScenePreset({
    presetId: meaningId,
    durationInFrames,
    visualIntent: "A quiet boundary.",
    soundIntent: "No audio.",
    resourceIds: [],
    implementation: { kind: "scene-owner" },
  }),
});

test("explicit silent-owner frame authoring accepts null narration consistently with Project source", () => {
  const { projectSource } = createAuthoredGroupedRuntimeFixture();
  const source = c.parseNarrativeProjectSource({
    ...projectSource,
    narration: null,
  });
  const requirements = c.buildAuthoringRequirements({
    source: {
      ...source,
      projectSound: c.buildProjectSoundPlan({
        storyId: source.story.storyId,
        contributions: [],
      }),
    },
    sourceChecksums: {
      videoBrief: digest,
      storySpec: digest,
      narrationSpec: digest,
      renderSpec: digest,
      projectSound: digest,
    },
    ...validProjectCreateInput.production,
    readability: { edgeInsetPx: 24 },
  });
  assert.equal(requirements.normalizedSummary.voiceProfileId, null);
  assert.equal(requirements.readabilityPolicy.policyVersion, 2);
  assert.equal(
    requirements.sourceBindings.narrationSpec.fingerprint,
    c.computeNoNarrationFingerprint(),
  );
});

test("Visual content has its own authored duration and never creates TTS chunks", () => {
  const story = visualStory();
  assert.ok(c.isVisualStory(story));
  assert.deepEqual(c.flattenTtsChunks(story), []);
  const input = c.ProjectCreateInputSchema.parse({
    ...validProjectCreateInput,
    story: { ...validProjectCreateInput.story, beats: [visualBeat()] },
    scenes: [
      {
        ...validProjectCreateInput.scenes[0],
        soundIntent: "Frame-aligned local sound effects only.",
      },
    ],
  });
  assert.deepEqual(input.story.beats, [visualBeat()]);
  for (const durationInFrames of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() =>
      c.StoryBeatSchema.parse(visualBeat("opening", durationInFrames)),
    );
  }
  for (const extra of [
    { ttsChunks: [{ chunkId: "fake", ttsText: "silence" }] },
    { explicitPauses: [] },
    { preset: boundary("intro", 30).preset },
  ])
    assert.throws(() => c.StoryBeatSchema.parse({ ...visualBeat(), ...extra }));
});

test("Story and create authoring reject mixed visual and narrated timing authorities", () => {
  const beats = [visualBeat(), validStorySpec.beats[1]];
  assert.throws(
    () => c.StorySpecSchema.parse({ ...validStorySpec, beats }),
    /cannot be mixed/u,
  );
  assert.throws(
    () => c.ProjectCreateStorySchema.parse({ ...validStorySpec, beats }),
    /cannot be mixed/u,
  );
  assert.throws(
    () =>
      c.StorySpecSchema.parse({
        ...validStorySpec,
        beats: [boundary("intro", 30)],
      }),
    /content Scene/u,
  );
});

test("Authored timing includes boundaries and padding without PCM, captions or a narration start", () => {
  const story = c.StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      boundary("intro", 30),
      ...visualStory().beats,
      boundary("outro", 45),
    ],
  });
  const timing = c.generateVisualSemanticTiming({ story, render });
  assert.equal(timing.algorithmId, "authored-frames-v1");
  assert.equal(timing.sampleRate, null);
  assert.equal(timing.narrationStartFrame, null);
  assert.deepEqual(timing.segments, []);
  assert.deepEqual(timing.captionCues, []);
  assert.deepEqual(
    timing.storyBeats.map(({ startFrame, endFrame }) => ({
      startFrame,
      endFrame,
    })),
    [
      { startFrame: 15, endFrame: 45 },
      { startFrame: 45, endFrame: 165 },
      { startFrame: 165, endFrame: 255 },
      { startFrame: 255, endFrame: 300 },
    ],
  );
  assert.equal(timing.durationInFrames, 312);
  assert.deepEqual(
    c.deriveGlobalVisualLayerPolicy(timing).decorationFrameRange,
    { startFrame: 45, endFrame: 255 },
  );
  assert.doesNotThrow(() => c.SemanticTimingSchema.parse(timing));
});

test("Persisted authored timing rejects fake PCM, discontinuity, stale duration and overflow", () => {
  const timing = c.generateVisualSemanticTiming({
    story: visualStory(),
    render,
  });
  for (const mutation of [
    { sampleRate: 48000 },
    { narrationStartFrame: 15 },
    {
      captionCues: [
        {
          chunkId: "fake",
          meaningId: "opening",
          text: "Fake speech",
          startFrame: 15,
          endFrame: 16,
        },
      ],
    },
    { durationInFrames: timing.durationInFrames + 1 },
    {
      storyBeats: timing.storyBeats.map((beat, index) =>
        index === 0 ? { ...beat, durationInFrames: 119 } : beat,
      ),
    },
    {
      storyBeats: timing.storyBeats.map((beat, index) =>
        index === 1 ? { ...beat, startFrame: beat.startFrame + 1 } : beat,
      ),
    },
  ])
    assert.throws(() =>
      c.SemanticTimingSchema.parse({ ...timing, ...mutation }),
    );
  assert.throws(
    () =>
      c.generateVisualSemanticTiming({
        story: c.StorySpecSchema.parse({
          ...validStorySpec,
          beats: [visualBeat("opening", Number.MAX_SAFE_INTEGER)],
        }),
        render,
      }),
    /safe integer/u,
  );
  assert.throws(
    () =>
      c.generateVisualSemanticTiming({
        story: c.StorySpecSchema.parse(validStorySpec),
        render,
      }),
    /visual Story/u,
  );
});

test("Visual timing is deterministic and depends on authored duration, fps and padding", () => {
  const original = c.generateVisualSemanticTiming({
    story: visualStory(),
    render,
  });
  assert.deepEqual(
    original,
    c.generateVisualSemanticTiming({ story: visualStory(), render }),
  );
  assert.equal(
    original.fingerprint,
    c.generateVisualSemanticTiming({
      story: visualStory(),
      render: { ...render, locale: "en-US" },
    }).fingerprint,
  );
  assert.notEqual(
    original.fingerprint,
    c.generateVisualSemanticTiming({
      story: visualStory(),
      render: { ...render, fps: 24 },
    }).fingerprint,
  );
  assert.notEqual(
    original.fingerprint,
    c.generateVisualSemanticTiming({
      story: c.StorySpecSchema.parse({
        ...validStorySpec,
        beats: [visualBeat("opening", 121), visualBeat("conclusion", 90)],
      }),
      render,
    }).fingerprint,
  );
});

test("Visual source and artifact bundle require explicit absence, and reject stale authored timing", () => {
  const story = visualStory();
  const projectSource = { ...validProjectSource, story, narration: null };
  const bundle = {
    projectSource,
    sealedNarration: null,
    semanticTiming: c.generateVisualSemanticTiming({ story, render }),
  };
  assert.equal(c.validateNarrativeArtifactBundle(bundle).sealedNarration, null);
  assert.throws(() =>
    c.NarrativeProjectSourceSchema.parse({
      ...projectSource,
      narration: validNarrationSpec,
    }),
  );
  assert.throws(() =>
    c.NarrativeProjectSourceSchema.parse({
      ...validProjectSource,
      narration: null,
    }),
  );
  assert.throws(() =>
    c.validateNarrativeArtifactBundle({
      ...bundle,
      sealedNarration: buildValidSealedNarrationManifest(),
    }),
  );
  assert.throws(
    () =>
      c.validateNarrativeArtifactBundle({
        ...bundle,
        projectSource: {
          ...projectSource,
          story: c.StorySpecSchema.parse({
            ...story,
            beats: [visualBeat("opening", 121), visualBeat("conclusion", 90)],
          }),
        },
      }),
    /stale/u,
  );
});

test("Visual requirements keep a real null source binding and free the unused caption reservation", () => {
  const source = {
    ...validProjectSource,
    story: visualStory(),
    narration: null,
    projectSound: c.buildProjectSoundPlan({
      storyId: validStorySpec.storyId,
      contributions: [],
    }),
  };
  const requirements = c.buildAuthoringRequirements({
    source,
    sourceChecksums: {
      videoBrief: digest,
      storySpec: digest,
      narrationSpec: digest,
      renderSpec: digest,
      projectSound: digest,
    },
    ...validProjectCreateInput.production,
    readability: { edgeInsetPx: 90 },
  });
  assert.equal(requirements.normalizedSummary.voiceProfileId, null);
  assert.equal(requirements.sourceBindings.narrationSpec.checksum, digest);
  assert.equal(
    requirements.sourceBindings.narrationSpec.fingerprint,
    c.computeNoNarrationFingerprint(),
  );
  assert.equal(requirements.readabilityPolicy.captionMode, "none");
  assert.equal(
    requirements.readabilityPolicy.sceneContentSafeAreaPx.bottom,
    requirements.readabilityPolicy.edgeInsetPx,
  );
  const narratedViewport = c.resolveSceneViewport(
    c.resolveSceneReadabilityPolicy({
      width: render.width,
      height: render.height,
    }),
  );
  const visualViewport = c.resolveSceneViewport(requirements.readabilityPolicy);
  assert.ok(visualViewport.height > narratedViewport.height);
  assert.equal(visualViewport.minFontSizePx, narratedViewport.minFontSizePx);
  assert.deepEqual(
    c.validateStoryCaptionReadability({
      story: source.story,
      policy: requirements.readabilityPolicy,
    }),
    [],
  );
});

test("Visual duration guidance measures authored content rather than budgeting speech", () => {
  const result = c.buildProjectDurationBudget({
    brief: c.VideoBriefSchema.parse(validVideoBrief),
    story: visualStory(),
    render,
  });
  assert.equal(result.measurement, "authored-semantic-timing");
  assert.equal(result.availableNarratedSeconds, 0);
  assert.ok((result.availableVisualSeconds ?? 0) > 0);
  assert.equal(result.actualTotalSeconds, (15 + 120 + 90 + 12) / render.fps);
});

test("Publishing chapters cover visual content while omitting reusable silent boundaries", () => {
  const story = c.StorySpecSchema.parse({
    ...validStorySpec,
    beats: [boundary("intro", 30), visualBeat(), boundary("outro", 45)],
  });
  const intent = c.buildPublishingIntent({
    story,
    authored: validProjectCreateInput.publishing,
    publishingCollections:
      validProjectCreateProducerConfig.publishingCollections,
  });
  assert.deepEqual(intent.chapters, [{ meaningId: "opening", name: "开场" }]);
});

test("Visual Scene tasks bind authored duration and continuous subjects without speech cues", () => {
  const original = createSceneTaskInput();
  const task = c.buildSceneTaskInputV7({
    ...original,
    storyBeat: visualBeat(original.meaningId),
    timingBeat: {
      kind: "visual-scene",
      meaningId: original.meaningId,
      durationInFrames: 120,
      startFrame: 20,
      endFrame: 140,
    },
  });
  assert.equal(task.storyBeat.kind, "visual-scene");
  assert.throws(
    () =>
      c.buildSceneTaskInputV7({
        ...task,
        storyBeat: visualBeat(task.meaningId, 121),
      }),
    /stale/u,
  );
  const contract = c.buildSceneContinuityContract({
    storyId: "story-example",
    beat: visualBeat(),
    brief: {
      meaningId: "opening",
      continuityBrief: "Follow the source ribbon.",
      outgoingHandoff: { subject: "Source ribbon" },
    },
    previous: null,
    next: {
      beat: visualBeat("conclusion"),
      brief: {
        meaningId: "conclusion",
        continuityBrief: "Resolve the source ribbon.",
      },
    },
  });
  assert.equal(contract.outgoing.kind, "continuous");
  const { shots, anchors } = createScenePlans();
  const plan = {
    schemaVersion: 2,
    objects: [{ objectId: "ribbon", meaning: "Source ribbon" }],
    actions: [
      {
        actionId: "separate",
        shotId: "trace-shot",
        kind: "authored-state-change",
        explanatoryPurpose: "Separate evidence from the answer.",
        initialState: "One plausible strip",
        resultingState: "Independent evidence strip",
        objectIds: ["ribbon"],
        frameRange: { startFrame: 0, endFrame: 120 },
        syncAnchorId: "outline-closes",
        readingHoldFrames: 30,
      },
    ],
    handoff: {
      kind: "end",
      reason: "The claim resolves.",
      incoming: [],
      outgoing: [],
    },
  };
  const input = {
    plan,
    shots: shots.shots,
    anchors: anchors.anchors,
    duration: 120,
  };
  assert.doesNotThrow(() => c.validateSceneMotionPlan(input));
  assert.throws(
    () => c.validateSceneMotionPlan({ ...input, narrationCues: [] }),
    /sealed narration cue/u,
  );
});

test("No-narration identity and optional BGM scope are explicit; legacy narration fingerprints remain exact", () => {
  assert.equal(
    c.computeNoNarrationFingerprint(),
    c.computeNoNarrationFingerprint(),
  );
  assert.doesNotThrow(() =>
    c.buildProjectSoundPlan({
      storyId: "story-example",
      contributions: [
        {
          contributionId: "bgm",
          resourceId: "asset.music",
          descriptorFingerprint: digest,
          volume: 0.2,
          loop: true,
          playbackScope: "content",
        },
      ],
    }),
  );
  const story = c.StorySpecSchema.parse(validStorySpec);
  assert.equal(
    c.computeStoryFingerprint(story),
    "sha256:0a5f1ef1a858409b9278f41b24592cb2945e447a6094e97774df349f098596e7",
  );
  assert.equal(
    c.computeProjectCreateInputFingerprint(validProjectCreateInput),
    "sha256:1b9621ee67abb7e765fa6a89a05c6ecdad13947a51eb502e0bbe2eb24ea833a4",
  );
  assert.equal(
    c.generateSemanticTiming({
      story,
      narration: c.NarrationSpecSchema.parse(validNarrationSpec),
      render,
      sealedNarration: buildValidSealedNarrationManifest(),
    }).fingerprint,
    "sha256:d66188d9d527b5b5c85fbcc3b018c686610235afd30f9c64e5427ef3d3fa3b5e",
  );
});

test("Visual final assembly has no sealed audio identity and rejects half-absent identities", () => {
  assert.doesNotThrow(() =>
    c.createFinalAssemblyPlan({
      ...finalAssemblyInput(),
      sealedNarrationChecksum: null,
      sealedNarrationFingerprint: null,
    }),
  );
  assert.throws(
    () =>
      c.createFinalAssemblyPlan({
        ...finalAssemblyInput(),
        sealedNarrationChecksum: null,
      }),
    /absent together/u,
  );
});

test("Visual AutoCheck passes explicit absence without weakening narrated evidence or fabricating baseline review", () => {
  const input = {
    schemaVersion: 2,
    reportVersion: c.NARRATIVE_AUTO_CHECK_VERSION,
    storyId: "story-example",
    level: "narrative",
    aggregateStatus: "pass",
    timingAlgorithmId: "authored-frames-v1",
    inputIdentity: {
      storyFingerprint: digest,
      renderSpecFingerprint: digest,
      generationInputFingerprint: null,
      sealedNarrationFingerprint: null,
      masteredNarrationFingerprint: null,
      semanticTimingFingerprint: digest,
      projectRegistryGeneratorId: c.PROJECT_REGISTRY_GENERATOR_ID,
      generatedRegistryChecksum: digest,
      generatedEntryChecksum: digest,
      projectRegistryEntryFingerprint: digest,
      narrativeCoreVersion: c.NARRATIVE_CORE_VERSION,
      narrativeBaselineFingerprint: digest,
      baselineEvidenceFingerprint: null,
    },
    evidenceRefs: c.createNarrativeAutoCheckEvidenceRefs({
      storyId: "story-example",
      sealedNarrationFingerprint: null,
      masteredNarrationFingerprint: null,
      checksums: {
        "sealed-manifest": digest,
        "complete-wav": null,
        "semantic-timing": digest,
        "project-registry": digest,
        "baseline-receipt": null,
      },
    }),
    checks: c.NARRATIVE_AUTO_CHECK_IDS.map((checkId) => ({
      checkId,
      status: checkId === "baseline-evidence" ? "not-applicable" : "pass",
      evidenceIds:
        checkId === "sealed-narration"
          ? ["sealed-manifest"]
          : checkId === "semantic-timing"
            ? ["semantic-timing"]
            : checkId === "project-registry"
              ? ["project-registry"]
              : [],
      failureReasons: [],
    })),
  };
  assert.equal(c.createNarrativeAutoCheckReport(input).aggregateStatus, "pass");
  const { timingAlgorithmId: _timingAlgorithmId, ...withoutMode } = input;
  void _timingAlgorithmId;
  assert.throws(() => c.createNarrativeAutoCheckReport(withoutMode));
  assert.throws(() =>
    c.createNarrativeAutoCheckReport({
      ...input,
      inputIdentity: {
        ...input.inputIdentity,
        generationInputFingerprint: digest,
      },
    }),
  );
  assert.throws(() =>
    c.createNarrativeAutoCheckReport({
      ...input,
      inputIdentity: {
        ...input.inputIdentity,
        generatedRegistryChecksum: null,
      },
    }),
  );
  assert.throws(() =>
    c.createNarrativeAutoCheckReport({
      ...input,
      checks: input.checks.map((check) =>
        check.checkId === "baseline-evidence"
          ? { ...check, status: "pass" }
          : check,
      ),
    }),
  );
  assert.throws(() =>
    c.createNarrativeAutoCheckReport({
      ...input,
      checks: input.checks.map((check) =>
        check.checkId === "project-registry"
          ? { ...check, status: "not-applicable" }
          : check,
      ),
    }),
  );
});
