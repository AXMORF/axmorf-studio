import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ProductionRevisionIdSchema,
  buildProducerTaskSpec,
  type Sha256Digest,
} from "../../src/contracts";
import {
  buildAgentTasks,
  buildDownstreamTasks,
  rebindTemplateTaskOutputs,
} from "../../scripts/project-production/application/plan-production";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;
const revisionId = ProductionRevisionIdSchema.parse(
  `revision-${"1".repeat(64)}`,
);

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
      storyId: "story-example",
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
      delivery: sha("4"),
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

test("template-copy task rebinds the exact copied file set without losing context identity", () => {
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
    "src/scene-template-instance.json",
  ]);
  assert.deepEqual(rebound.declaredReadSet, built.task.declaredReadSet);
  assert.deepEqual(rebound.inputFingerprints, built.task.inputFingerprints);
  assert.deepEqual(rebound.dependencyArtifacts, built.task.dependencyArtifacts);
  assert.notEqual(rebound.taskRevision, built.task.taskRevision);
});

test("every Agent task binds the exact canonical context bytes it declares", () => {
  for (const built of buildAgentTasks(inputs(), revisionId)) {
    assert.deepEqual(built.task.declaredReadSet, ["inputs/context.json"]);
    const binding = built.task.inputFingerprints.find(
      ({ id }) => id === "read:inputs/context.json",
    );
    assert.equal(
      binding?.fingerprint,
      `sha256:${createHash("sha256").update(built.contextBytes).digest("hex")}`,
    );
  }
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
