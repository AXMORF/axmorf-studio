import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  NarrationSpecSchema,
  ProductionRevisionIdSchema,
  RenderSpecSchema,
  StorySpecSchema,
  TaskExecutionContractSchema,
  buildProducerTaskSpec,
  generateSemanticTiming,
  type Sha256Digest,
} from "../../src/contracts";
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
const semanticTiming = generateSemanticTiming({
  story: StorySpecSchema.parse(validStorySpec),
  narration: NarrationSpecSchema.parse(validNarrationSpec),
  render: RenderSpecSchema.parse(validRenderSpec),
  sealedNarration: buildValidSealedNarrationManifest(),
});

const taskOutputs = {
  "scene-owner": [
    "src/Renderer.tsx",
    "src/generated/reference-fidelity.generated.json",
    "src/selected-resources.json",
    "src/shot-plan.json",
    "src/shot-recipe-selection.json",
    "src/sound-plan.json",
    "src/sync-anchors.json",
    "src/visual-plan.json",
  ],
  "global-visual-owner": [
    "project/global-visual-plan.json",
    "src/GlobalVisualLayers.tsx",
    "src/selected-resources.json",
  ],
  "cover-owner": [
    "src/Cover3x4.tsx",
    "src/Cover4x3.tsx",
    "src/Root.tsx",
    "src/index.ts",
  ],
} as const;

const buildTestTaskExecutionContract = ({
  taskKind,
}: {
  readonly taskKind: keyof typeof taskOutputs;
  readonly context: unknown;
}) =>
  TaskExecutionContractSchema.parse({
    schemaVersion: 2,
    contractVersion: "agent-task-execution-contract-v2",
    taskKind,
    purpose: "Planner identity fixture.",
    workflow: ["Use the immutable planner fixture."],
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    immutableInputs: ["inputs/context.json", "inputs/task-contract.json"],
    outputs: taskOutputs[taskKind].map((path) => ({
      path,
      owner: "agent",
      format: path.endsWith(".json")
        ? "json"
        : path.endsWith(".ts")
          ? "ts"
          : "tsx",
      instructions: ["Write the declared fixture output."],
      derivedFields: [],
    })),
    componentSignatures: [],
    constraints: ["Stay inside the task workspace."],
    commands: {
      bind: "./.rsp/bin/rsp task bind --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport <shared-workspace|controller-io>",
      finalize:
        "./.rsp/bin/rsp task finalize --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
      check:
        "./.rsp/bin/rsp task check --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
    },
  });

const buildTasks = (
  loaded: Parameters<typeof buildAgentTasks>[0],
  revision: Parameters<typeof buildAgentTasks>[1] = revisionId,
) =>
  buildAgentTasks(loaded, revision, {
    buildTaskExecutionContract: buildTestTaskExecutionContract,
  });

test("planner refuses to synthesize an Agent task contract from malformed context", () => {
  assert.throws(() => buildAgentTasks(inputs(), revisionId));
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
  return {
    meaningId,
    beat,
    timingBeat: { meaningId, marker: timingMarker },
    brief: { meaningId, marker },
    taskInput: {
      storyId: "story-example",
      meaningId,
      marker,
      timingBeat: { meaningId, marker: timingMarker },
    },
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
    story: { storyId: "story-example", title: "Story" },
    timing: {
      ...semanticTiming,
      fingerprint: sha(globalTimingMarker),
    },
    render: { fps: 30 },
    sound: { storyId: "story-example" },
    visualStyle: { storyId: "story-example", marker },
    publishingIntent: { storyId: "story-example" },
    requirements: {
      readabilityPolicy: { policyFingerprint: sha("b") },
    },
    resourcePool: { poolFingerprint: sha("c") },
    globalVisualBrief: { storyId: "story-example" },
    runtimePolicyFingerprint: sha("d"),
    taskPolicyFingerprints: {
      scene: sha("1"),
      globalVisual: sha("2"),
      composition: sha("3"),
    },
    originalityBaseline: {
      schemaVersion: 1,
      contractVersion: "scene-originality-baseline-v1",
      storyId: "story-example",
      rendererFingerprints: [],
      baselineFingerprint: sha("a"),
    },
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
      originalityBaseline: sha("a"),
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
  const built = buildTasks(inputs());
  const scenes = built
    .filter(({ task }) => task.semanticId !== null)
    .map(({ task }) => [task.semanticId, task.taskKind]);
  assert.deepEqual(scenes, [
    ["intro", "scene-template"],
    ["body", "scene-owner"],
    ["outro", "scene-owner"],
  ]);
});

test("template-copy task rebinds the copied and derived file set without losing context identity", () => {
  const built = buildTasks(inputs()).find(
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
  for (const built of buildTasks(inputs())) {
    const agentOwned = built.task.taskKind !== "scene-template";
    assert.deepEqual(
      built.task.declaredReadSet,
      agentOwned
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
    if (agentOwned) {
      assert.ok(built.taskContractBytes !== undefined);
      const contractBinding = built.task.inputFingerprints.find(
        ({ id }) => id === "read:inputs/task-contract.json",
      );
      assert.equal(
        contractBinding?.fingerprint,
        `sha256:${createHash("sha256").update(built.taskContractBytes).digest("hex")}`,
      );
    } else {
      assert.equal(built.taskContractBytes, undefined);
    }
  }
});

test("full Project revision identity does not enter taskRevision", () => {
  const first = buildTasks(inputs());
  const second = buildTasks(
    inputs(),
    ProductionRevisionIdSchema.parse(`revision-${"2".repeat(64)}`),
  );
  assert.deepEqual(
    first.map(({ task }) => task.taskRevision),
    second.map(({ task }) => task.taskRevision),
  );
});

test("Scene task revision binds only its meaning-local timing slice", () => {
  const first = buildTasks(inputs());
  const second = buildTasks(
    inputs({ globalTimingMarker: "a", outroTimingMarker: "e" }),
    revisionId,
  );
  const revisionFor = (
    tasks: ReturnType<typeof buildTasks>,
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
    buildTasks(loaded).find(
      ({ task }) => task.taskKind === "global-visual-owner",
    )?.task.taskRevision;

  assert.notEqual(revisionFor(currentInputs), revisionFor(changedInputs));
});

test("task-local runtime policies invalidate only the owning branch", () => {
  const currentInputs = inputs();
  const currentOwners = buildTasks(currentInputs);
  const sceneChangedInputs = {
    ...currentInputs,
    taskPolicyFingerprints: {
      ...currentInputs.taskPolicyFingerprints,
      scene: sha("5"),
    },
  } as Parameters<typeof buildAgentTasks>[0];
  const sceneChangedOwners = buildTasks(sceneChangedInputs);
  const revisions = (built: ReturnType<typeof buildTasks>) =>
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
  assert.deepEqual(Object.keys(currentDownstream), ["composition"]);
  assert.deepEqual(Object.keys(currentInputs.taskPolicyFingerprints).sort(), [
    "composition",
    "globalVisual",
    "scene",
  ]);
  assert.deepEqual(
    buildTasks(currentInputs).map(({ task }) => task.taskRevision),
    buildTasks(currentInputs).map(({ task }) => task.taskRevision),
  );
});
