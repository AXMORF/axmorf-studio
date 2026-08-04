import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionRequirementsFreeze,
  computeProductionRequirementsFingerprint,
  ProductionRequirementsFreezeSchema,
  resolveCurrentProductionRequirements,
} from "../../src/contracts/production-requirements";
import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
} from "../../src/contracts/generation-input";
import { NarrationSpecSchema } from "../../src/contracts/narration";
import { RenderSpecSchema } from "../../src/contracts/render";
import {
  STORY_CHECK_IDS,
  StoryCheckReportSchema,
} from "../../src/contracts/story-check";
import { StorySpecSchema } from "../../src/contracts/story";
import {
  validNarrationSpec,
  validProjectSource,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const story = StorySpecSchema.parse(validStorySpec);
const narration = NarrationSpecSchema.parse(validNarrationSpec);
const render = RenderSpecSchema.parse(validRenderSpec);
const storyCheck = StoryCheckReportSchema.parse({
  schemaVersion: 1,
  storyId: story.storyId,
  storyFingerprint: computeStoryFingerprint(story),
  generationInputFingerprint: computeGenerationInputFingerprint(
    story,
    narration,
  ),
  voiceProfileId: narration.voiceProfileId,
  decision: "proceed",
  checks: STORY_CHECK_IDS.map((checkId) => ({
    checkId,
    status: "pass",
    note: `Checked ${checkId}.`,
  })),
});

const source = {
  ...validProjectSource,
  storyCheck,
} as const;

const sourceChecksums = {
  videoBrief: sha("1"),
  storySpec: sha("2"),
  narrationSpec: sha("3"),
  renderSpec: sha("4"),
  storyCheck: sha("5"),
} as const;

const additionalRequirements = [
  {
    requirementId: "keep-claims-sourced",
    scope: "production",
    targetMeaningIds: [],
    category: "content",
    statement:
      "Every factual claim must stay within the supplied source material.",
    owner: "main-agent",
    verification: "contract",
    severity: "error",
  },
  {
    requirementId: "mechanical-caption-safe-area",
    scope: "narrative",
    targetMeaningIds: [],
    category: "caption",
    statement:
      "The generated caption layout must respect the frozen safe area.",
    owner: "script",
    verification: "mechanical",
    severity: "error",
  },
  {
    requirementId: "opening-visual-focus",
    scope: "scene",
    targetMeaningIds: ["opening"],
    category: "visual",
    statement: "The opening Scene must keep one readable visual focus.",
    owner: "scene-agent",
    verification: "contract",
    severity: "warning",
  },
  {
    requirementId: "final-preview-decision",
    scope: "final-preview",
    targetMeaningIds: [],
    category: "other",
    statement:
      "The user decides whether the complete preview communicates clearly.",
    owner: "user-preview",
    verification: "user-preview",
    severity: "warning",
  },
] as const;

const buildValidFreeze = () =>
  buildProductionRequirementsFreeze({
    source,
    sourceChecksums,
    enhancementSelection: {
      storyVisual: "required",
      sceneLocalSound: "allowed",
      globalSound: "none",
      globalVisual: "none",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements,
  });

const withCurrentFingerprint = (value: Record<string, unknown>) => ({
  ...value,
  requirementsFingerprint: computeProductionRequirementsFingerprint(value),
});

test("builds and resolves a current production requirements freeze", () => {
  const freeze = buildValidFreeze();

  assert.deepEqual(freeze.normalizedSummary, {
    locale: render.locale,
    fps: render.fps,
    width: render.width,
    height: render.height,
    voiceProfileId: narration.voiceProfileId,
    captionSafeArea: render.captionSafeAreaPx,
  });
  assert.equal(
    freeze.sourceBindings.storySpec.fingerprint,
    computeStoryFingerprint(story),
  );
  assert.equal(
    resolveCurrentProductionRequirements({
      requirements: freeze,
      source,
      sourceChecksums,
    }).requirementsFingerprint,
    freeze.requirementsFingerprint,
  );
  assert.deepEqual(buildValidFreeze(), freeze);
});

test("rejects normalized render and voice summaries that disagree with source contracts", () => {
  const freeze = buildValidFreeze();
  for (const normalizedSummary of [
    { ...freeze.normalizedSummary, width: freeze.normalizedSummary.width + 2 },
    {
      ...freeze.normalizedSummary,
      height: freeze.normalizedSummary.height + 2,
    },
    { ...freeze.normalizedSummary, fps: freeze.normalizedSummary.fps + 1 },
    { ...freeze.normalizedSummary, voiceProfileId: "different-voice" },
    {
      ...freeze.normalizedSummary,
      captionSafeArea: {
        ...freeze.normalizedSummary.captionSafeArea,
        bottom: 99,
      },
    },
  ]) {
    const { requirementsFingerprint: _fingerprint, ...input } = freeze;
    assert.throws(
      () =>
        resolveCurrentProductionRequirements({
          requirements: withCurrentFingerprint({ ...input, normalizedSummary }),
          source,
          sourceChecksums,
        }),
      /normalized summary/i,
    );
  }
});

test("rejects duplicate requirements and invalid scope-owner-verification combinations", () => {
  const valid = buildValidFreeze();
  const invalidRequirements = [
    [...valid.additionalRequirements, valid.additionalRequirements[0]],
    [
      {
        ...valid.additionalRequirements[0],
        requirementId: "scene-without-target",
        scope: "scene",
        targetMeaningIds: [],
        owner: "scene-agent",
      },
    ],
    [
      {
        ...valid.additionalRequirements[0],
        requirementId: "scene-with-unknown-target",
        scope: "scene",
        targetMeaningIds: ["missing-beat"],
        owner: "scene-agent",
      },
    ],
    [
      {
        ...valid.additionalRequirements[0],
        requirementId: "mechanical-main-agent",
        verification: "mechanical",
        owner: "main-agent",
      },
    ],
    [
      {
        ...valid.additionalRequirements[0],
        requirementId: "fake-user-preview",
        verification: "user-preview",
        owner: "script",
      },
    ],
  ];

  for (const candidate of invalidRequirements) {
    assert.throws(() =>
      buildProductionRequirementsFreeze({
        source,
        sourceChecksums,
        enhancementSelection: valid.enhancementSelection,
        resourcePolicy: valid.resourcePolicy,
        additionalRequirements: candidate,
      }),
    );
  }
});

test("requires explicit absence of global sound and global visual enhancements", () => {
  const freeze = buildValidFreeze();
  for (const enhancementSelection of [
    { ...freeze.enhancementSelection, globalSound: "required" },
    { ...freeze.enhancementSelection, globalVisual: "required" },
    (() => {
      const { globalSound: _globalSound, ...selection } =
        freeze.enhancementSelection;
      return selection;
    })(),
  ]) {
    assert.throws(() =>
      buildProductionRequirementsFreeze({
        source,
        sourceChecksums,
        enhancementSelection,
        resourcePolicy: freeze.resourcePolicy,
        additionalRequirements,
      }),
    );
  }
});

test("fails closed on source drift and stale artifact bindings", () => {
  const freeze = buildValidFreeze();
  const changedNarration = NarrationSpecSchema.parse({
    ...narration,
    voiceProfileId: "different-voice",
  });

  assert.throws(
    () =>
      resolveCurrentProductionRequirements({
        requirements: freeze,
        source: { ...source, narration: changedNarration },
        sourceChecksums,
      }),
    /source binding|story.?check|normalized summary/i,
  );
  assert.throws(
    () =>
      resolveCurrentProductionRequirements({
        requirements: freeze,
        source,
        sourceChecksums: { ...sourceChecksums, renderSpec: sha("9") },
      }),
    /source binding/i,
  );
});

test("rejects unknown fields, absolute paths, secret-shaped fields, and unsafe statements", () => {
  const freeze = buildValidFreeze();
  assert.throws(() =>
    ProductionRequirementsFreezeSchema.parse({ ...freeze, token: "secret" }),
  );
  assert.throws(() =>
    ProductionRequirementsFreezeSchema.parse({
      ...freeze,
      sourceBindings: {
        ...freeze.sourceBindings,
        videoBrief: {
          ...freeze.sourceBindings.videoBrief,
          repositoryPath: "/tmp/brief.json",
        },
      },
    }),
  );
  assert.throws(() =>
    buildProductionRequirementsFreeze({
      source,
      sourceChecksums,
      enhancementSelection: freeze.enhancementSelection,
      resourcePolicy: freeze.resourcePolicy,
      additionalRequirements: [
        {
          ...additionalRequirements[0],
          statement: "Read the provider token from /home/private/config.json.",
        },
      ],
    }),
  );
});
