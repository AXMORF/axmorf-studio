import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthoringRequirementsSchema,
  SceneReadabilityPolicySchema,
  StorySpecSchema,
  buildAuthoringRequirements,
  buildProjectSoundPlan,
  buildSilentScenePreset,
  computeAuthoringRequirementsFingerprint,
  computeSceneReadabilityPolicyFingerprint,
  resolveCurrentAuthoringRequirements,
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
  validateStoryCaptionReadability,
} from "@axmorf/studio/contracts";
import { validProjectCreateInput } from "../fixtures/project-create";
import { validNarrationSpec, validRenderSpec } from "../fixtures/narrative";

const legacyLandscapePolicy = {
  schemaVersion: 1,
  policyId: "production-readability-v2",
  policyVersion: 1,
  width: 1280,
  height: 720,
  scale: { numerator: 1080, denominator: 1080 },
  baseEdgeInsetPx: 90,
  edgeInsetPx: 90,
  sceneBottomInsetPx: 360,
  typographyPolicy: { minFontSizePx: 36 },
  captionPolicy: {
    displayUnitAlgorithmId: "caption-display-unit-v1",
    recommendedDisplayUnitsPerChunk: 32,
    maxDisplayUnitsPerChunk: 36,
    recommendedDisplayHalfUnits: 64,
    maxDisplayHalfUnits: 72,
    maxCaptionLines: 2,
    captionFontSizePx: 40,
    captionBottomInsetPx: 180,
    captionGapPx: 30,
    captionVerticalPaddingPx: 38,
    captionBoxHeightPx: 146,
    lineHeight: { numerator: 135, denominator: 100 },
  },
  sceneContentSafeAreaPx: { top: 90, right: 90, bottom: 360, left: 90 },
  captionSafeAreaPx: { top: 90, right: 90, bottom: 180, left: 90 },
  policyFingerprint:
    "sha256:8ee65ca1acf648b75f27dfa95e4340d3378967a34c3bb25c4cfa9987ec642baa",
} as const;

const authoredStory = StorySpecSchema.parse({
  ...validProjectCreateInput.story,
  timingSource: "authored-frames",
  beats: [
    {
      kind: "silent-scene",
      meaningId: "opening",
      narrativePurpose: "Express the measured motion visually.",
      preset: buildSilentScenePreset({
        presetId: "opening",
        durationInFrames: 120,
        visualIntent: "Move one subject through one continuous world.",
        soundIntent: "No narration or captions.",
        resourceIds: [],
        implementation: { kind: "scene-owner" },
      }),
    },
  ],
});

const freezeInput = {
  source: {
    brief: validProjectCreateInput.brief,
    story: authoredStory,
    narration: validNarrationSpec,
    render: { ...validRenderSpec, width: 1280, height: 720 },
    projectSound: buildProjectSoundPlan({
      storyId: authoredStory.storyId,
      contributions: [],
    }),
  },
  sourceChecksums: {
    videoBrief: `sha256:${"1".repeat(64)}`,
    storySpec: `sha256:${"2".repeat(64)}`,
    narrationSpec: `sha256:${"3".repeat(64)}`,
    renderSpec: `sha256:${"4".repeat(64)}`,
    projectSound: `sha256:${"5".repeat(64)}`,
  },
  ...validProjectCreateInput.production,
  readability: { edgeInsetPx: 90 },
};

test("narrated defaults and legacy immutable policy retain exact bytes and fingerprint", () => {
  assert.deepEqual(
    SceneReadabilityPolicySchema.parse(legacyLandscapePolicy),
    legacyLandscapePolicy,
  );
  for (const timingSource of [undefined, "sealed-narration"] as const) {
    assert.deepEqual(
      resolveSceneReadabilityPolicy({ width: 1280, height: 720, timingSource }),
      legacyLandscapePolicy,
    );
  }
  assert.equal(
    computeSceneReadabilityPolicyFingerprint(legacyLandscapePolicy),
    legacyLandscapePolicy.policyFingerprint,
  );
  const viewport = resolveSceneViewport(legacyLandscapePolicy);
  assert.equal(viewport.width, 1100);
  assert.equal(viewport.height, 270);
});

test("authored-frame landscape and portrait policies reserve only frame-safe edges", () => {
  for (const dimensions of [
    { width: 1280, height: 720, viewportWidth: 1100, viewportHeight: 540 },
    { width: 1080, height: 1920, viewportWidth: 900, viewportHeight: 1740 },
    { width: 2160, height: 3840, viewportWidth: 1800, viewportHeight: 3480 },
  ]) {
    const policy = resolveSceneReadabilityPolicy({
      ...dimensions,
      timingSource: "authored-frames",
    });
    const narrated = resolveSceneReadabilityPolicy(dimensions);
    assert.ok(policy.policyVersion === 2);
    assert.equal(policy.captionBand, "none");
    assert.deepEqual(policy.sceneContentSafeAreaPx, {
      top: policy.edgeInsetPx,
      right: policy.edgeInsetPx,
      bottom: policy.edgeInsetPx,
      left: policy.edgeInsetPx,
    });
    assert.equal(policy.sceneBottomInsetPx, policy.edgeInsetPx);
    assert.deepEqual(policy.typographyPolicy, narrated.typographyPolicy);
    assert.equal(resolveSceneViewport(policy).width, dimensions.viewportWidth);
    assert.equal(
      resolveSceneViewport(policy).height,
      dimensions.viewportHeight,
    );
    assert.notEqual(policy.policyFingerprint, narrated.policyFingerprint);
  }
});

test("authored policy rejects altered derived geometry even with a recomputed fingerprint", () => {
  const policy = resolveSceneReadabilityPolicy({
    width: 1280,
    height: 720,
    timingSource: "authored-frames",
  });
  for (const patch of [
    { sceneBottomInsetPx: 89 },
    {
      sceneContentSafeAreaPx: { ...policy.sceneContentSafeAreaPx, bottom: 89 },
    },
    { typographyPolicy: { minFontSizePx: 35 } },
  ]) {
    const tampered = { ...policy, ...patch };
    assert.equal(
      SceneReadabilityPolicySchema.safeParse({
        ...tampered,
        policyFingerprint: computeSceneReadabilityPolicyFingerprint(tampered),
      }).success,
      false,
    );
  }
  assert.equal(
    SceneReadabilityPolicySchema.safeParse({
      ...policy,
      captionBand: undefined,
    }).success,
    false,
  );
  assert.equal(
    SceneReadabilityPolicySchema.safeParse({ ...policy, policyVersion: 1 })
      .success,
    false,
  );
});

test("an authored policy cannot remove caption reservation from a narrated Story", () => {
  const policy = resolveSceneReadabilityPolicy({
    width: 1280,
    height: 720,
    timingSource: "authored-frames",
  });
  assert.throws(
    () =>
      validateStoryCaptionReadability({
        story: validProjectCreateInput.story,
        policy,
      }),
    /authored-frame.*Story/iu,
  );
  assert.deepEqual(
    validateStoryCaptionReadability({ story: authoredStory, policy }),
    [],
  );
});

test("new authored freeze selects v2 and current-source verification retains the exact freeze", () => {
  const requirements = buildAuthoringRequirements(freezeInput);
  assert.equal(requirements.readabilityPolicy.policyVersion, 2);
  assert.deepEqual(
    resolveCurrentAuthoringRequirements({
      requirements,
      source: freezeInput.source,
      sourceChecksums: freezeInput.sourceChecksums,
    }),
    requirements,
  );
  assert.throws(() =>
    buildAuthoringRequirements({
      ...freezeInput,
      source: { ...freezeInput.source, story: validProjectCreateInput.story },
      readability: { frozenPolicy: requirements.readabilityPolicy },
    }),
  );
});

test("old authored freeze and revision retain the original caption-band policy without migration", () => {
  const requirements = buildAuthoringRequirements(freezeInput);
  const legacyInput = {
    ...requirements,
    readabilityPolicy: legacyLandscapePolicy,
  };
  const legacy = AuthoringRequirementsSchema.parse({
    ...legacyInput,
    requirementsFingerprint:
      computeAuthoringRequirementsFingerprint(legacyInput),
  });
  assert.deepEqual(
    resolveCurrentAuthoringRequirements({
      requirements: legacy,
      source: freezeInput.source,
      sourceChecksums: freezeInput.sourceChecksums,
    }),
    legacy,
  );
  const revised = buildAuthoringRequirements({
    ...freezeInput,
    source: {
      ...freezeInput.source,
      story: { ...authoredStory, title: "A revised visual story" },
    },
    sourceChecksums: {
      ...freezeInput.sourceChecksums,
      storySpec: `sha256:${"6".repeat(64)}`,
    },
    readability: { frozenPolicy: legacy.readabilityPolicy },
  });
  assert.deepEqual(revised.readabilityPolicy, legacy.readabilityPolicy);
  assert.notEqual(
    revised.requirementsFingerprint,
    legacy.requirementsFingerprint,
  );
});
