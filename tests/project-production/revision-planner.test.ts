import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  NarrationSpecSchema,
  ProductionRevisionIdSchema,
  RenderSpecSchema,
  SCENE_ORIGINALITY_INPUT_ID,
  StorySpecSchema,
  buildSceneTaskInputV7,
  buildSceneOriginalityBaseline,
  buildProducerTaskSpec,
  deriveGlobalVisualLayerPolicy,
  generateSemanticTiming,
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import {
  buildAgentTasks,
  buildDownstreamTasks,
  rebindTemplateTaskOutputs,
} from "../../scripts/project-production/application/build-current-plan";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;
const revisionId = ProductionRevisionIdSchema.parse(
  `revision-${"1".repeat(64)}`,
);
const canonicalTiming = generateSemanticTiming({
  story: StorySpecSchema.parse(validStorySpec),
  narration: NarrationSpecSchema.parse(validNarrationSpec),
  render: RenderSpecSchema.parse(validRenderSpec),
  sealedNarration: buildValidSealedNarrationManifest(),
});
const originalityBaseline = buildSceneOriginalityBaseline({
  subjectStoryId: "story-example",
  entries: [],
});

const sceneInput = ({
  meaningId,
  kind,
  marker,
  timingMarker = "2",
}: {
  readonly meaningId: string;
  readonly kind: "narrated" | "silent-template" | "silent-owner";
  readonly marker: string;
  readonly timingMarker?: string;
}) => {
  const implementation =
    kind === "silent-template"
      ? {
          kind: "template-copy" as const,
          instanceFingerprint: sha("a"),
        }
      : { kind: "scene-owner" as const };
  const beat =
    kind === "narrated"
      ? { kind: "narrated-scene" as const, meaningId, ttsChunks: [] }
      : {
          kind: "silent-scene" as const,
          meaningId,
          preset: { implementation },
        };
  const validTaskBeat = {
    kind: "narrated-scene" as const,
    meaningId,
    narrativePurpose: `Explain ${meaningId}.`,
    ttsChunks: [
      { chunkId: `${meaningId}-01`, ttsText: `Narrate ${meaningId}.` },
    ],
    explicitPauses: [],
  };
  const startFrame = Number.parseInt(timingMarker, 16) * 10;
  const readability = resolveSceneReadabilityPolicy({
    width: validRenderSpec.width,
    height: validRenderSpec.height,
  });
  return {
    meaningId,
    beat,
    timingBeat: { meaningId, marker: timingMarker },
    brief: { meaningId, marker },
    taskInput: buildSceneTaskInputV7({
      storyId: "story-example",
      meaningId,
      storyBeat: validTaskBeat,
      sourceReferences: [],
      timingBeat: {
        kind: "narrated-scene",
        meaningId,
        startFrame,
        endFrame: startFrame + 120,
      },
      storyFingerprint: sha("e"),
      renderFingerprint: sha("1"),
      visualStyleFingerprint: sha(marker),
      resourceCatalogFingerprint: sha("c"),
      allowedSnapshots: [],
      allowedResourceIds: [],
      continuity: {
        previousMeaningId: null,
        previousSummary: null,
        nextMeaningId: null,
        nextSummary: null,
        continuityBrief: "Keep this fixture self-contained.",
      },
      allowedDirectories: {
        sceneRoot: `src/projects/story-example/scenes/${meaningId}`,
        publicAssetRoot: `public/projects/story-example/scenes/${meaningId}`,
      },
      sceneRequirements: [],
      sceneViewport: resolveSceneViewport(readability),
      sceneCompositionBoundaryVersion: "scene-composition-boundary-v2",
    }),
    revisionInput: {
      meaningId,
      beatFingerprint: sha(marker),
      timingFingerprint: sha(timingMarker),
      readabilityFingerprint: sha("3"),
      briefFingerprint: sha("4"),
      requirementsFingerprint: sha("5"),
      resourcePoolFingerprint: sha("6"),
      selectedResourcesFingerprint: sha("7"),
      templateInstanceFingerprint: kind === "silent-template" ? sha("a") : null,
    },
  };
};

const inputs = ({
  marker = "8",
  globalTimingMarker = "9",
  outroTimingMarker = "2",
}: {
  readonly marker?: string;
  readonly globalTimingMarker?: string;
  readonly outroTimingMarker?: string;
} = {}) =>
  ({
    projectId: "story-example",
    story: {
      ...StorySpecSchema.parse(validStorySpec),
      storyId: "story-example",
    },
    timing: {
      ...canonicalTiming,
      fingerprint: sha(globalTimingMarker),
    },
    render: RenderSpecSchema.parse(validRenderSpec),
    sound: { storyId: "story-example" },
    visualStyle: { storyId: "story-example", marker },
    publishingIntent: { storyId: "story-example" },
    requirements: {
      readabilityPolicy: resolveSceneReadabilityPolicy({
        width: validRenderSpec.width,
        height: validRenderSpec.height,
      }),
    },
    resourcePool: {
      poolFingerprint: sha("c"),
      resourceCatalogFingerprint: sha("c"),
    },
    globalVisualBrief: { storyId: "story-example" },
    runtimePolicyFingerprint: sha("d"),
    taskPolicyFingerprints: {
      scene: sha("1"),
      globalVisual: sha("2"),
      composition: sha("3"),
      delivery: sha("4"),
    },
    originalityBaseline,
    fingerprints: {
      story: sha("e"),
      narration: sha("f"),
      render: sha("1"),
      visualStyle: sha(marker),
      publishingIntent: sha("2"),
      sound: sha("3"),
      requirements: sha("4"),
      globalVisualBrief: sha("5"),
      resourcePool: sha("6"),
      assetManifest: sha("7"),
      originalityBaseline: originalityBaseline.baselineFingerprint,
      narrationGeneration: sha("8"),
    },
    sceneInputs: [
      sceneInput({ meaningId: "intro", kind: "silent-template", marker: "a" }),
      sceneInput({ meaningId: "body", kind: "narrated", marker: "b" }),
      sceneInput({
        meaningId: "outro",
        kind: "silent-owner",
        marker: "c",
        timingMarker: outroTimingMarker,
      }),
    ],
  }) as unknown as Parameters<typeof buildAgentTasks>[0];

test("planner dispatches only template-copy silent Scenes as fixed template tasks", () => {
  const built = buildAgentTasks(inputs(), revisionId);
  const scenes = built
    .filter(({ task }) => task.semanticId !== null)
    .map(({ task }) => [task.semanticId, task.taskKind]);
  assert.deepEqual(scenes, [
    ["intro", "scene-template"],
    ["body", "scene-owner"],
    ["outro", "scene-owner"],
  ]);
});

test("originality baseline binds only Agent-owned Scene tasks and template-copy is exempt", () => {
  const built = buildAgentTasks(inputs(), revisionId);
  const template = built.find(({ task }) => task.taskKind === "scene-template");
  const sceneOwners = built.filter(
    ({ task }) => task.taskKind === "scene-owner",
  );
  assert.ok(template !== undefined);
  assert.equal(
    template.task.inputFingerprints.some(
      ({ id }) => id === SCENE_ORIGINALITY_INPUT_ID,
    ),
    false,
  );
  assert.equal(
    Object.hasOwn(JSON.parse(template.contextBytes), "originalityBaseline"),
    false,
  );
  for (const owner of sceneOwners) {
    assert.equal(owner.task.validatorPolicyVersion, "scene-owner-validator-v4");
    assert.equal(
      owner.task.inputFingerprints.find(
        ({ id }) => id === SCENE_ORIGINALITY_INPUT_ID,
      )?.fingerprint,
      originalityBaseline.baselineFingerprint,
    );
    assert.deepEqual(
      JSON.parse(owner.contextBytes).originalityBaseline,
      originalityBaseline,
    );
  }
});

test("originality baseline changes invalidate Scene owners without invalidating fixed templates or other owners", () => {
  const currentInputs = inputs();
  const changedBaseline = buildSceneOriginalityBaseline({
    subjectStoryId: "story-example",
    entries: [
      {
        owner: { storyId: "historical-story", meaningId: "opening" },
        sourceGraphFingerprint: sha("9"),
      },
    ],
  });
  const changedInputs = {
    ...currentInputs,
    originalityBaseline: changedBaseline,
    fingerprints: {
      ...currentInputs.fingerprints,
      originalityBaseline: changedBaseline.baselineFingerprint,
    },
  } as Parameters<typeof buildAgentTasks>[0];
  const revisionMap = (loaded: Parameters<typeof buildAgentTasks>[0]) =>
    Object.fromEntries(
      buildAgentTasks(loaded, revisionId).map(({ task }) => [
        task.semanticId === null ? task.taskKind : task.semanticId,
        task.taskRevision,
      ]),
    );
  const before = revisionMap(currentInputs);
  const after = revisionMap(changedInputs);
  assert.equal(before.intro, after.intro);
  assert.notEqual(before.body, after.body);
  assert.notEqual(before.outro, after.outro);
  assert.equal(before["global-visual-owner"], after["global-visual-owner"]);
  assert.equal(before["cover-owner"], after["cover-owner"]);
});

test("template-copy task rebinds the copied and derived file set without losing context identity", () => {
  const built = buildAgentTasks(inputs(), revisionId).find(
    ({ task }) => task.taskKind === "scene-template",
  );
  assert.ok(built !== undefined);
  const rebound = rebindTemplateTaskOutputs(built.task, [
    "src/scene-template-instance.json",
    "src/Renderer.tsx",
    "public/texture.bin",
  ]);
  assert.deepEqual(rebound.declaredOutputSet, [
    "public/texture.bin",
    "src/Renderer.tsx",
    "src/generated/reference-fidelity.generated.json",
    "src/scene-template-instance.json",
    "src/selected-resources.json",
    "src/shot-plan.json",
    "src/shot-recipe-selection.json",
    "src/sound-plan.json",
    "src/sync-anchors.json",
    "src/visual-plan.json",
  ]);
  assert.deepEqual(rebound.declaredReadSet, built.task.declaredReadSet);
  assert.equal(
    built.task.validatorPolicyVersion,
    "scene-template-validator-v3",
  );
  assert.equal(rebound.validatorPolicyVersion, "scene-template-validator-v3");
  assert.deepEqual(rebound.inputFingerprints, built.task.inputFingerprints);
  assert.deepEqual(rebound.dependencyArtifacts, built.task.dependencyArtifacts);
  assert.notEqual(rebound.taskRevision, built.task.taskRevision);

  const materializedReplan = rebindTemplateTaskOutputs(built.task, [
    ...rebound.declaredOutputSet,
    "src/generated/scene-package.generated.json",
    "src/task-input.generated.json",
  ]);
  assert.deepEqual(
    materializedReplan.declaredOutputSet,
    rebound.declaredOutputSet,
  );
  assert.equal(materializedReplan.taskRevision, rebound.taskRevision);
});

test("every Agent task binds the exact canonical context bytes it declares", () => {
  for (const built of buildAgentTasks(inputs(), revisionId)) {
    const agentAuthored = built.task.taskKind !== "scene-template";
    assert.deepEqual(
      built.task.declaredReadSet,
      agentAuthored
        ? ["inputs/context.json", "inputs/task-contract.json"]
        : ["inputs/context.json"],
    );
    const binding = built.task.inputFingerprints.find(
      ({ id }) => id === "read:inputs/context.json",
    );
    assert.equal(
      binding?.fingerprint,
      `sha256:${createHash("sha256").update(built.contextBytes).digest("hex")}`,
    );
    assert.equal(built.taskContractBytes !== null, agentAuthored);
    if (built.taskContractBytes !== null) {
      const contractBinding = built.task.inputFingerprints.find(
        ({ id }) => id === "read:inputs/task-contract.json",
      );
      assert.equal(
        contractBinding?.fingerprint,
        `sha256:${createHash("sha256")
          .update(built.taskContractBytes)
          .digest("hex")}`,
      );
    }
  }
});

test("GlobalVisual task freezes the derived layer policy under validator v2", () => {
  const built = buildAgentTasks(inputs(), revisionId).find(
    ({ task }) => task.taskKind === "global-visual-owner",
  );
  assert.ok(built !== undefined);
  const context = JSON.parse(built.contextBytes) as { layerPolicy?: unknown };

  assert.equal(
    built.task.validatorPolicyVersion,
    "global-visual-owner-validator-v2",
  );
  assert.deepEqual(
    context.layerPolicy,
    deriveGlobalVisualLayerPolicy(canonicalTiming),
  );
});

test("full Project revision identity does not enter taskRevision", () => {
  const first = buildAgentTasks(inputs(), revisionId);
  const second = buildAgentTasks(
    inputs(),
    ProductionRevisionIdSchema.parse(`revision-${"2".repeat(64)}`),
  );
  assert.deepEqual(
    first.map(({ task }) => task.taskRevision),
    second.map(({ task }) => task.taskRevision),
  );
});

test("Scene task revision binds only its meaning-local timing slice", () => {
  const first = buildAgentTasks(inputs(), revisionId);
  const second = buildAgentTasks(
    inputs({ globalTimingMarker: "a", outroTimingMarker: "e" }),
    revisionId,
  );
  const revisionFor = (
    tasks: ReturnType<typeof buildAgentTasks>,
    meaningId: string,
  ) =>
    tasks.find(({ task }) => task.semanticId === meaningId)?.task.taskRevision;

  assert.equal(revisionFor(first, "body"), revisionFor(second, "body"));
  assert.notEqual(revisionFor(first, "outro"), revisionFor(second, "outro"));
});

test("GlobalVisual task revision binds RenderSpec identity", () => {
  const currentInputs = inputs();
  const changedInputs = {
    ...currentInputs,
    render: { ...currentInputs.render, compositionId: "ChangedComposition" },
    fingerprints: { ...currentInputs.fingerprints, render: sha("9") },
  } as Parameters<typeof buildAgentTasks>[0];
  const revisionFor = (loaded: Parameters<typeof buildAgentTasks>[0]) =>
    buildAgentTasks(loaded, revisionId).find(
      ({ task }) => task.taskKind === "global-visual-owner",
    )?.task.taskRevision;

  assert.notEqual(revisionFor(currentInputs), revisionFor(changedInputs));
});

test("task-local runtime policies invalidate only the owning branch", () => {
  const currentInputs = inputs();
  const currentOwners = buildAgentTasks(currentInputs, revisionId);
  const sceneChangedInputs = {
    ...currentInputs,
    taskPolicyFingerprints: {
      ...currentInputs.taskPolicyFingerprints,
      scene: sha("5"),
    },
  } as Parameters<typeof buildAgentTasks>[0];
  const sceneChangedOwners = buildAgentTasks(sceneChangedInputs, revisionId);
  const revisions = (built: ReturnType<typeof buildAgentTasks>) =>
    Object.fromEntries(
      built.map(({ task }) => [
        task.taskKind === "scene-owner" || task.taskKind === "scene-template"
          ? `scene:${task.semanticId}`
          : task.taskKind,
        task.taskRevision,
      ]),
    );
  const before = revisions(currentOwners);
  const afterSceneChange = revisions(sceneChangedOwners);
  assert.notEqual(before["scene:body"], afterSceneChange["scene:body"]);
  assert.notEqual(before["scene:intro"], afterSceneChange["scene:intro"]);
  assert.equal(
    before["global-visual-owner"],
    afterSceneChange["global-visual-owner"],
  );
  assert.equal(before["cover-owner"], afterSceneChange["cover-owner"]);

  const timingTask = buildProducerTaskSpec({
    taskKind: "semantic-timing",
    storyId: "story-example",
    semanticId: null,
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "timing", fingerprint: sha("8") }],
    declaredReadSet: [],
    declaredOutputSet: ["project/timing.json"],
    validatorPolicyVersion: "semantic-timing-validator-v1",
  });
  const timingAttestation = {
    artifactFingerprint: sha("6"),
  } as Parameters<typeof buildDownstreamTasks>[0]["timingAttestation"];
  const downstream = (loaded: typeof currentInputs) =>
    buildDownstreamTasks({
      inputs: loaded,
      revisionId,
      timingTask,
      timingAttestation,
      ownerTasks: currentOwners.map(({ task }) => task),
      ownerInspections: new Map(),
    });
  const currentDownstream = downstream(currentInputs);
  const deliveryChanged = downstream({
    ...currentInputs,
    taskPolicyFingerprints: {
      ...currentInputs.taskPolicyFingerprints,
      delivery: sha("7"),
    },
  });
  assert.equal(
    currentDownstream.composition.task.taskRevision,
    deliveryChanged.composition.task.taskRevision,
  );
  assert.notEqual(
    currentDownstream.delivery.task.taskRevision,
    deliveryChanged.delivery.task.taskRevision,
  );
  assert.deepEqual(
    buildAgentTasks(currentInputs, revisionId).map(
      ({ task }) => task.taskRevision,
    ),
    buildAgentTasks(
      {
        ...currentInputs,
        taskPolicyFingerprints: {
          ...currentInputs.taskPolicyFingerprints,
          delivery: sha("7"),
        },
      },
      revisionId,
    ).map(({ task }) => task.taskRevision),
  );
});
