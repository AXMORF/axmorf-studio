import {
  COVER_SPEC_FINGERPRINT,
  FIXED_COVER_SPEC,
  buildProducerTaskSpec,
  createFingerprint,
  type ArtifactAttestation,
  type ProducerTaskSpec,
  type ProductionRevisionId,
  type Sha256Digest,
} from "../../../src/contracts";
import { inspectArtifact } from "../adapters/artifact-store";
import { createTaskWorkspace } from "../adapters/task-workspace";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import { createProducerPlan } from "../domain/plan";
import type { ArtifactInspection } from "../domain/invalidation";
import type { ProducerTaskNode } from "../domain/task-graph";
import { loadProjectProductionInputs } from "./load-inputs";
import { buildCurrentProductionRevision } from "./current-revision";
import {
  contextFile,
  buildNarrationChunkTask,
  ensureFixedTaskArtifact,
  prepareNarrationInputs,
  readTemplateSceneFiles,
  type PrepareNarration,
  type PreparedNarrationInputs,
} from "./prepare-fixed-tasks";

const SCENE_OUTPUTS = [
  "src/Renderer.tsx",
  "src/generated/reference-fidelity.generated.json",
  "src/selected-resources.json",
  "src/shot-plan.json",
  "src/shot-recipe-selection.json",
  "src/sound-plan.json",
  "src/sync-anchors.json",
  "src/visual-plan.json",
] as const;
const GLOBAL_OUTPUTS = [
  "project/global-visual-plan.json",
  "src/GlobalVisualLayers.tsx",
  "src/selected-resources.json",
] as const;
const COVER_OUTPUTS = [
  "src/Cover3x4.tsx",
  "src/Cover4x3.tsx",
  "src/Root.tsx",
  "src/index.ts",
] as const;

type LoadedInputs = Awaited<ReturnType<typeof loadProjectProductionInputs>>;

const sortedFingerprints = (
  values: readonly Readonly<{ id: string; fingerprint: Sha256Digest }>[],
) => [...values].sort((left, right) => left.id.localeCompare(right.id));

const sortedDependencies = (
  dependencies: readonly Readonly<{
    taskRevision: ProducerTaskSpec["taskRevision"];
    artifactFingerprint: Sha256Digest;
  }>[],
) =>
  [...dependencies].sort((left, right) =>
    left.taskRevision.localeCompare(right.taskRevision),
  );

const buildContextTask = ({
  taskKind,
  storyId,
  semanticId,
  revisionId,
  dependencies = [],
  inputFingerprints,
  outputs,
  validatorPolicyVersion,
  context,
}: {
  readonly taskKind: ProducerTaskSpec["taskKind"];
  readonly storyId: string;
  readonly semanticId: string | null;
  readonly revisionId: ProductionRevisionId;
  readonly dependencies?: readonly Readonly<{
    taskRevision: ProducerTaskSpec["taskRevision"];
    artifactFingerprint: Sha256Digest;
  }>[];
  readonly inputFingerprints: readonly Readonly<{
    id: string;
    fingerprint: Sha256Digest;
  }>[];
  readonly outputs: readonly string[];
  readonly validatorPolicyVersion: string;
  readonly context: unknown;
}) => {
  const contextSeed = contextFile(context);
  const dependencyArtifacts = sortedDependencies(dependencies);
  const task = buildProducerTaskSpec({
    taskKind,
    storyId,
    semanticId,
    revisionId,
    dependencyArtifacts,
    inputFingerprints: sortedFingerprints([
      ...inputFingerprints,
      {
        id: "read:inputs/context.json",
        fingerprint: contextSeed.fingerprint,
      },
    ]),
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [...outputs].sort(),
    validatorPolicyVersion,
  });
  return {
    task,
    contextBytes: contextSeed.bytes,
    dependencyTaskRevisions: dependencyArtifacts.map(
      ({ taskRevision }) => taskRevision,
    ),
  } as const;
};

const artifactBinding = (
  task: ProducerTaskSpec,
  attestation: ArtifactAttestation | null,
) => ({
  taskRevision: task.taskRevision,
  artifactFingerprint:
    attestation?.artifactFingerprint ??
    createFingerprint({
      namespace: "producer-missing-dependency",
      version: 1,
      value: { taskRevision: task.taskRevision },
    }),
});

export const rebindTemplateTaskOutputs = (
  task: ProducerTaskSpec,
  outputPaths: readonly string[],
) => {
  if (task.taskKind !== "scene-template") {
    throw new Error("Only a Scene template task can bind copied outputs.");
  }
  const { taskRevision, ...identity } = task;
  void taskRevision;
  return buildProducerTaskSpec({
    ...identity,
    declaredOutputSet: [...outputPaths].sort(),
  });
};

const inspect = async ({
  rootDir,
  task,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
}): Promise<ArtifactInspection> => {
  try {
    const attestation = await inspectArtifact({ rootDir, task });
    return {
      attestation,
      valid: attestation !== null,
      ...(attestation === null ? { reason: "artifact-missing" as const } : {}),
    };
  } catch {
    return { attestation: null, valid: false, reason: "checksum-drift" };
  }
};

const commitNarrationTasks = async ({
  rootDir,
  inputs,
  revisionId,
  narration,
}: {
  readonly rootDir: string;
  readonly inputs: LoadedInputs;
  readonly revisionId: ProductionRevisionId;
  readonly narration: PreparedNarrationInputs;
}) => {
  const nodes: ProducerTaskNode[] = [];
  const attestations = new Map<string, ArtifactAttestation>();
  const chunkTasks: ProducerTaskSpec[] = [];
  for (const segment of narration.sealedNarration.segments) {
    if (segment.kind !== "chunk") continue;
    const audio = narration.chunkAudioBytes.get(segment.chunkId);
    if (audio === undefined) {
      throw new Error("Prepared narration chunk bytes are incomplete.");
    }
    const built = buildNarrationChunkTask({
      storyId: inputs.projectId,
      revisionId,
      narrationFingerprint: inputs.fingerprints.narration,
      providerAttemptFingerprint: narration.providerAttemptFingerprint,
      chunk: {
        chunkId: segment.chunkId,
        meaningId: segment.meaningId,
        ttsText: segment.ttsText,
      },
    });
    const attestation = await ensureFixedTaskArtifact({
      rootDir,
      task: built.task,
      files: {
        "inputs/context.json": built.contextBytes,
        "public/chunk.wav": audio,
      },
    });
    chunkTasks.push(built.task);
    attestations.set(built.task.taskRevision, attestation);
    nodes.push({
      task: built.task,
      dependencyTaskRevisions: [],
    });
  }
  const chunkDependencies = chunkTasks.map((task) =>
    artifactBinding(task, attestations.get(task.taskRevision) ?? null),
  );
  const seal = buildContextTask({
    taskKind: "narration-seal",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    dependencies: chunkDependencies,
    inputFingerprints: [
      {
        id: "generation-input",
        fingerprint: narration.sealedNarration.generationInputFingerprint,
      },
    ],
    outputs: [
      "project/generated/sealed-narration.generated.json",
      "public/complete.wav",
    ],
    validatorPolicyVersion: "narration-seal-validator-v1",
    context: {
      story: inputs.story,
      narration: inputs.narration,
      assemblyPolicy: "ordered-pcm-concat-v1",
    },
  });
  const sealAttestation = await ensureFixedTaskArtifact({
    rootDir,
    task: seal.task,
    files: {
      "inputs/context.json": seal.contextBytes,
      "project/generated/sealed-narration.generated.json":
        narration.sealedManifestBytes,
      "public/complete.wav": narration.completeAudioBytes,
    },
  });
  attestations.set(seal.task.taskRevision, sealAttestation);
  nodes.push({
    task: seal.task,
    dependencyTaskRevisions: seal.dependencyTaskRevisions,
  });

  const timing = buildContextTask({
    taskKind: "semantic-timing",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    dependencies: [artifactBinding(seal.task, sealAttestation)],
    inputFingerprints: [
      { id: "render", fingerprint: inputs.fingerprints.render },
      {
        id: "mastering-policy",
        fingerprint: createFingerprint({
          namespace: "producer-narration-mastering-policy",
          version: 1,
          value: narration.masteringPolicy,
        }),
      },
    ],
    outputs: [
      "project/generated/mastered-narration.generated.json",
      "project/generated/semantic-timing.generated.json",
      "public/mastered-complete.wav",
    ],
    validatorPolicyVersion: "semantic-timing-validator-v1",
    context: {
      storyId: inputs.projectId,
      render: inputs.render,
      masteringPolicy: narration.masteringPolicy,
    },
  });
  const timingAttestation = await ensureFixedTaskArtifact({
    rootDir,
    task: timing.task,
    files: {
      "inputs/context.json": timing.contextBytes,
      "project/generated/mastered-narration.generated.json":
        narration.masteredManifestBytes,
      "project/generated/semantic-timing.generated.json":
        narration.semanticTimingBytes,
      "public/mastered-complete.wav": narration.masteredAudioBytes,
    },
  });
  attestations.set(timing.task.taskRevision, timingAttestation);
  nodes.push({
    task: timing.task,
    dependencyTaskRevisions: timing.dependencyTaskRevisions,
  });
  return {
    nodes,
    attestations,
    timingTask: timing.task,
    timingAttestation,
  } as const;
};

export const buildAgentTasks = (
  inputs: LoadedInputs,
  revisionId: ProductionRevisionId,
) => {
  const tasks: Readonly<{
    task: ProducerTaskSpec;
    contextBytes: string;
    dependencyTaskRevisions: readonly ProducerTaskSpec["taskRevision"][];
  }>[] = inputs.sceneInputs.map((scene) => {
    const r = scene.revisionInput;
    const templateCopy =
      scene.beat.kind === "silent-scene" &&
      scene.beat.preset.implementation.kind === "template-copy";
    return buildContextTask({
      taskKind: templateCopy ? "scene-template" : "scene-owner",
      storyId: inputs.projectId,
      semanticId: scene.meaningId,
      revisionId,
      inputFingerprints: [
        { id: "beat", fingerprint: r.beatFingerprint },
        { id: "brief", fingerprint: r.briefFingerprint },
        { id: "readability", fingerprint: r.readabilityFingerprint },
        { id: "requirements", fingerprint: r.requirementsFingerprint },
        { id: "resources", fingerprint: r.selectedResourcesFingerprint },
        { id: "runtime", fingerprint: inputs.taskPolicyFingerprints.scene },
        { id: "timing", fingerprint: r.timingFingerprint },
        ...(r.templateInstanceFingerprint === null
          ? []
          : [
              {
                id: "template-instance",
                fingerprint: r.templateInstanceFingerprint,
              },
            ]),
      ],
      outputs: SCENE_OUTPUTS,
      validatorPolicyVersion: templateCopy
        ? "scene-template-validator-v1"
        : "scene-owner-validator-v1",
      context: {
        requirements: inputs.requirements,
        resourcePool: inputs.resourcePool,
        scene: {
          beat: scene.beat,
          timingBeat: scene.timingBeat,
          brief: scene.brief,
          taskInput: scene.taskInput,
        },
      },
    });
  });
  const global = buildContextTask({
    taskKind: "global-visual-owner",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    inputFingerprints: [
      { id: "brief", fingerprint: inputs.fingerprints.globalVisualBrief },
      {
        id: "readability",
        fingerprint: inputs.requirements.readabilityPolicy.policyFingerprint,
      },
      { id: "resources", fingerprint: inputs.fingerprints.resourcePool },
      {
        id: "runtime",
        fingerprint: inputs.taskPolicyFingerprints.globalVisual,
      },
      { id: "style", fingerprint: inputs.fingerprints.visualStyle },
      { id: "timing", fingerprint: inputs.timing.fingerprint },
    ],
    outputs: GLOBAL_OUTPUTS,
    validatorPolicyVersion: "global-visual-owner-validator-v1",
    context: {
      story: inputs.story,
      timing: inputs.timing,
      requirements: inputs.requirements,
      resourcePool: inputs.resourcePool,
      visualStyle: inputs.visualStyle,
      globalVisualBrief: inputs.globalVisualBrief,
    },
  });
  const cover = buildContextTask({
    taskKind: "cover-owner",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    inputFingerprints: [
      { id: "cover-spec", fingerprint: COVER_SPEC_FINGERPRINT },
      { id: "story", fingerprint: inputs.fingerprints.story },
      { id: "visual-style", fingerprint: inputs.fingerprints.visualStyle },
    ],
    outputs: COVER_OUTPUTS,
    validatorPolicyVersion: "cover-owner-validator-v1",
    context: {
      story: inputs.story,
      visualStyle: inputs.visualStyle,
      coverSpec: FIXED_COVER_SPEC,
    },
  });
  return [...tasks, global, cover];
};

export const buildDownstreamTasks = ({
  inputs,
  revisionId,
  timingTask,
  timingAttestation,
  ownerTasks,
  ownerInspections,
  compositionAttestation = null,
}: {
  readonly inputs: LoadedInputs;
  readonly revisionId: ProductionRevisionId;
  readonly timingTask: ProducerTaskSpec;
  readonly timingAttestation: ArtifactAttestation;
  readonly ownerTasks: readonly ProducerTaskSpec[];
  readonly ownerInspections: ReadonlyMap<string, ArtifactInspection>;
  readonly compositionAttestation?: ArtifactAttestation | null;
}) => {
  const sceneAndGlobal = ownerTasks.filter(({ taskKind }) =>
    ["scene-owner", "scene-template", "global-visual-owner"].includes(taskKind),
  );
  const compositionDependencies = [
    artifactBinding(timingTask, timingAttestation),
    ...sceneAndGlobal.map((task) =>
      artifactBinding(
        task,
        ownerInspections.get(task.taskRevision)?.attestation ?? null,
      ),
    ),
  ];
  const composition = buildContextTask({
    taskKind: "composition-convergence",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    dependencies: compositionDependencies,
    inputFingerprints: [
      { id: "render", fingerprint: inputs.fingerprints.render },
      {
        id: "runtime",
        fingerprint: inputs.taskPolicyFingerprints.composition,
      },
      { id: "sound", fingerprint: inputs.fingerprints.sound },
      { id: "story", fingerprint: inputs.fingerprints.story },
      { id: "style", fingerprint: inputs.fingerprints.visualStyle },
    ],
    outputs: ["project/convergence.json"],
    validatorPolicyVersion: "composition-convergence-validator-v1",
    context: {
      storyId: inputs.projectId,
      revisionId,
      render: inputs.render,
      sound: inputs.sound,
    },
  });
  const cover = ownerTasks.find(({ taskKind }) => taskKind === "cover-owner");
  if (cover === undefined) throw new Error("Producer DAG lost its Cover task.");
  const delivery = buildContextTask({
    taskKind: "delivery-build",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    dependencies: [
      artifactBinding(composition.task, compositionAttestation),
      artifactBinding(
        cover,
        ownerInspections.get(cover.taskRevision)?.attestation ?? null,
      ),
    ],
    inputFingerprints: [
      { id: "publishing", fingerprint: inputs.fingerprints.publishingIntent },
      { id: "render", fingerprint: inputs.fingerprints.render },
      {
        id: "runtime",
        fingerprint: inputs.taskPolicyFingerprints.delivery,
      },
    ],
    outputs: ["project/publish.json"],
    validatorPolicyVersion: "delivery-build-validator-v1",
    context: {
      storyId: inputs.projectId,
      revisionId,
      render: inputs.render,
      publishingIntent: inputs.publishingIntent,
    },
  });
  return { composition, delivery } as const;
};

export type PlanProjectProductionInput = Readonly<{
  rootDir: string;
  projectId: string;
  createWorkspaces?: boolean;
  prepareNarration?: PrepareNarration;
  env?: Readonly<Record<string, string | undefined>>;
}>;

export const planProjectProductionUnlocked = async ({
  rootDir,
  projectId,
  createWorkspaces = true,
  prepareNarration = prepareNarrationInputs,
  env = process.env,
}: PlanProjectProductionInput) => {
  // Fixed prepare owns narration/cache/seal/timing and runs before the Revision
  // loader, so a fresh Project does not require pre-existing generated timing.
  const preparedNarration = await prepareNarration({ rootDir, projectId, env });
  const inputs = await loadProjectProductionInputs({ rootDir, projectId });
  if (
    inputs.timing.fingerprint !== preparedNarration.semanticTiming.fingerprint
  ) {
    throw new Error(
      "Fixed narration prepare and loaded SemanticTiming disagree.",
    );
  }
  const revision = buildCurrentProductionRevision(inputs);
  const fixed = await commitNarrationTasks({
    rootDir,
    inputs,
    revisionId: revision.revisionId,
    narration: preparedNarration,
  });
  const builtOwners = buildAgentTasks(inputs, revision.revisionId);
  const ownerNodes: ProducerTaskNode[] = [];
  const ownerInspections = new Map<string, ArtifactInspection>();
  for (const built of builtOwners) {
    let task = built.task;
    if (task.taskKind === "scene-template") {
      if (task.semanticId === null)
        throw new Error("Template task lost meaningId.");
      const templateFiles = await readTemplateSceneFiles({
        rootDir,
        projectId: inputs.projectId,
        meaningId: task.semanticId,
      });
      task = rebindTemplateTaskOutputs(task, Object.keys(templateFiles));
      const attestation = await ensureFixedTaskArtifact({
        rootDir,
        task,
        files: {
          "inputs/context.json": built.contextBytes,
          ...templateFiles,
        },
      });
      ownerInspections.set(task.taskRevision, {
        attestation,
        valid: true,
      });
    } else {
      ownerInspections.set(task.taskRevision, await inspect({ rootDir, task }));
      if (
        createWorkspaces &&
        ownerInspections.get(task.taskRevision)?.valid !== true
      ) {
        await createTaskWorkspace({
          rootDir,
          task,
          seedFiles: { "inputs/context.json": built.contextBytes },
        });
      }
    }
    ownerNodes.push({
      task,
      dependencyTaskRevisions: task.dependencyArtifacts.map(
        ({ taskRevision }) => taskRevision,
      ),
    });
  }
  const ownerTasks = ownerNodes.map(({ task }) => task);
  const initialDownstream = buildDownstreamTasks({
    inputs,
    revisionId: revision.revisionId,
    timingTask: fixed.timingTask,
    timingAttestation: fixed.timingAttestation,
    ownerTasks,
    ownerInspections,
  });
  const compositionInspection = await inspect({
    rootDir,
    task: initialDownstream.composition.task,
  });
  const downstream = buildDownstreamTasks({
    inputs,
    revisionId: revision.revisionId,
    timingTask: fixed.timingTask,
    timingAttestation: fixed.timingAttestation,
    ownerTasks,
    ownerInspections,
    compositionAttestation: compositionInspection.attestation,
  });
  const downstreamTasks = [downstream.composition, downstream.delivery];
  const downstreamInspections = new Map<string, ArtifactInspection>();
  downstreamInspections.set(
    downstream.composition.task.taskRevision,
    compositionInspection,
  );
  downstreamInspections.set(
    downstream.delivery.task.taskRevision,
    await inspect({ rootDir, task: downstream.delivery.task }),
  );
  const nodes = [
    ...fixed.nodes,
    ...ownerNodes,
    ...downstreamTasks.map(
      ({ task, dependencyTaskRevisions }): ProducerTaskNode => ({
        task,
        dependencyTaskRevisions,
      }),
    ),
  ].sort((left, right) =>
    left.task.taskRevision.localeCompare(right.task.taskRevision),
  );
  const inspections = new Map<string, ArtifactInspection>();
  for (const node of fixed.nodes) {
    inspections.set(node.task.taskRevision, {
      attestation: fixed.attestations.get(node.task.taskRevision) ?? null,
      valid: fixed.attestations.has(node.task.taskRevision),
      ...(fixed.attestations.has(node.task.taskRevision)
        ? {}
        : { reason: "artifact-missing" as const }),
    });
  }
  for (const [taskRevision, inspection] of ownerInspections) {
    inspections.set(taskRevision, inspection);
  }
  for (const [taskRevision, inspection] of downstreamInspections) {
    inspections.set(taskRevision, inspection);
  }
  const plan = createProducerPlan({ revision, nodes, inspections });
  return {
    revision,
    plan,
    tasks: nodes.map(({ task }) => task),
    inputs,
  } as const;
};

export const planProjectProduction = async (
  input: PlanProjectProductionInput,
) => {
  const lock = await acquireRepositoryOperationLock({
    rootDir: input.rootDir,
    ownerId: "project-production-plan",
  });
  try {
    return await planProjectProductionUnlocked(input);
  } finally {
    await lock.release();
  }
};
