import { createHash } from "node:crypto";

import {
  COVER_SPEC_FINGERPRINT,
  FIXED_COVER_SPEC,
  buildProducerTaskSpec,
  createFingerprint,
  deriveGlobalVisualLayerPolicy,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
  type ProductionRevisionId,
  type Sha256Digest,
  type NarrationPreparationReceipt,
  type ProducerConfig,
  type TaskExecutionContract,
} from "../../../src/contracts";
import type { DiagnosticSubject } from "../../../src/contracts/production-inspection";

import { inspectArtifactState } from "../adapters/artifact-store";
import {
  inspectNarrationCache,
  readProductionDiagnosticBaseline,
  readTemplateSceneFilesForInspection,
} from "../adapters/production-inspection";
import { createProducerPlan } from "../domain/plan";
import type { ArtifactInspection } from "../domain/invalidation";
import type { ProducerTaskNode } from "../domain/task-graph";
import {
  bindTemplateTaskOutputSet,
  expectedTemplateSceneOutputSetFromPreparedFiles,
} from "../domain/template-scene-output";
import type { loadProjectProductionInputs } from "./load-inputs";
import { buildCurrentProductionRevision } from "./current-revision";
import type { ProductionLocations } from "./production-locations";
import { buildTaskExecutionContract } from "./task-execution-contract";

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

export const contextFile = (value: unknown) => {
  const bytes = `${serializeCanonicalJson(value)}\n`;
  return {
    bytes,
    fingerprint:
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest,
  } as const;
};

export const buildNarrationChunkTask = ({
  storyId,
  revisionId,
  narrationFingerprint,
  providerAttemptFingerprint,
  chunk,
}: {
  readonly storyId: string;
  readonly revisionId: ProductionRevisionId;
  readonly narrationFingerprint: Sha256Digest;
  readonly providerAttemptFingerprint: Sha256Digest;
  readonly chunk: Readonly<{
    chunkId: string;
    meaningId: string;
    ttsText: string;
  }>;
}) => {
  const chunkInput = {
    chunkId: chunk.chunkId,
    meaningId: chunk.meaningId,
    ttsText: chunk.ttsText,
  };
  const context = contextFile({
    ...chunkInput,
    normalizationPolicy: "pcm-s16le-normalize-v1",
  });
  return {
    task: buildProducerTaskSpec({
      taskKind: "narration-chunk",
      storyId,
      semanticId: null,
      revisionId,
      dependencyArtifacts: [],
      inputFingerprints: [
        { id: "narration", fingerprint: narrationFingerprint },
        { id: "provider-attempt", fingerprint: providerAttemptFingerprint },
        { id: "read:inputs/context.json", fingerprint: context.fingerprint },
        {
          id: "tts-chunk",
          fingerprint: createFingerprint({
            namespace: "producer-narration-chunk-input",
            version: 1,
            value: chunkInput,
          }),
        },
      ].sort((left, right) => left.id.localeCompare(right.id)),
      declaredReadSet: ["inputs/context.json"],
      declaredOutputSet: ["public/chunk.wav"],
      validatorPolicyVersion: "narration-chunk-validator-v1",
    }),
    contextBytes: context.bytes,
  } as const;
};

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
  taskContract,
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
  readonly taskContract?: TaskExecutionContract;
}) => {
  if (
    taskContract !== undefined &&
    serializeCanonicalJson(
      taskContract.outputs.map(({ path }) => path).sort(),
    ) !== serializeCanonicalJson([...outputs].sort())
  ) {
    throw new Error(
      "Task execution contract output set does not match task authority.",
    );
  }
  const contextSeed = contextFile(context);
  const taskContractSeed =
    taskContract === undefined ? null : contextFile(taskContract);
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
      ...(taskContractSeed === null
        ? []
        : [
            {
              id: "read:inputs/task-contract.json",
              fingerprint: taskContractSeed.fingerprint,
            },
          ]),
    ]),
    declaredReadSet:
      taskContractSeed === null
        ? ["inputs/context.json"]
        : ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: [...outputs].sort(),
    validatorPolicyVersion,
  });
  return {
    task,
    contextBytes: contextSeed.bytes,
    ...(taskContractSeed === null
      ? {}
      : { taskContractBytes: taskContractSeed.bytes }),
    dependencyTaskRevisions: dependencyArtifacts.map(
      ({ taskRevision }) => taskRevision,
    ),
  } as const;
};

export const artifactBinding = (
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
  preparedWorkspacePaths: readonly string[],
) => {
  return bindTemplateTaskOutputSet(
    task,
    expectedTemplateSceneOutputSetFromPreparedFiles(preparedWorkspacePaths),
  );
};

const inspect = async ({
  locations,
  task,
}: {
  readonly locations: ProductionLocations;
  readonly task: ProducerTaskSpec;
}): Promise<ArtifactInspection> => {
  return inspectArtifactState({ locations, task });
};

export const buildNarrationTasks = async ({
  locations,
  inputs,
  revisionId,
  narration,
}: {
  readonly locations: ProductionLocations;
  readonly inputs: LoadedInputs;
  readonly revisionId: ProductionRevisionId;
  readonly narration: Readonly<{
    providerAttemptFingerprint: Sha256Digest;
    masteringPolicy: LoadedInputs["masteredNarration"]["masteringPolicy"];
    sealedNarration: LoadedInputs["sealedNarration"];
  }>;
}) => {
  const nodes: ProducerTaskNode[] = [];
  const attestations = new Map<string, ArtifactAttestation>();
  const chunkTasks: ProducerTaskSpec[] = [];
  const subjects = new Map<string, DiagnosticSubject>();
  for (const segment of narration.sealedNarration.segments) {
    if (segment.kind !== "chunk") continue;
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
    const inspection = await inspect({ locations, task: built.task });
    const attestation = inspection.attestation;
    chunkTasks.push(built.task);
    subjects.set(built.task.taskRevision, {
      kind: "tts-chunk",
      id: segment.chunkId,
    });
    if (attestation !== null) {
      attestations.set(built.task.taskRevision, attestation);
    }
    nodes.push({
      task: built.task,
      dependencyTaskRevisions: [],
    });
  }
  const chunkDependencies = chunkTasks.map((task) =>
    artifactBinding(task, attestations.get(task.taskRevision) ?? null),
  );
  const seal = buildNarrationSealTask({
    inputs,
    revisionId,
    dependencies: chunkDependencies,
    generationInputFingerprint:
      narration.sealedNarration.generationInputFingerprint,
  });
  const sealInspection = await inspect({ locations, task: seal.task });
  const sealAttestation = sealInspection.attestation;
  if (sealAttestation !== null) {
    attestations.set(seal.task.taskRevision, sealAttestation);
  }
  nodes.push({
    task: seal.task,
    dependencyTaskRevisions: seal.dependencyTaskRevisions,
  });

  const timing = buildSemanticTimingTask({
    inputs,
    revisionId,
    sealTask: seal.task,
    sealAttestation,
    masteringPolicy: narration.masteringPolicy,
  });
  const timingInspection = await inspect({ locations, task: timing.task });
  const timingAttestation = timingInspection.attestation;
  if (timingAttestation !== null) {
    attestations.set(timing.task.taskRevision, timingAttestation);
  }
  nodes.push({
    task: timing.task,
    dependencyTaskRevisions: timing.dependencyTaskRevisions,
  });
  return {
    nodes,
    attestations,
    timingTask: timing.task,
    timingAttestation,
    inspections: new Map([
      ...chunkTasks.map(
        (task) =>
          [
            task.taskRevision,
            attestations.has(task.taskRevision)
              ? {
                  artifactState: "valid" as const,
                  attestation: attestations.get(task.taskRevision)!,
                }
              : { artifactState: "missing" as const, attestation: null },
          ] as const,
      ),
      [seal.task.taskRevision, sealInspection],
      [timing.task.taskRevision, timingInspection],
    ]),
    subjects,
  } as const;
};

export const buildNarrationSealTask = ({
  inputs,
  revisionId,
  dependencies,
  generationInputFingerprint,
}: {
  readonly inputs: LoadedInputs;
  readonly revisionId: ProductionRevisionId;
  readonly dependencies: readonly ReturnType<typeof artifactBinding>[];
  readonly generationInputFingerprint: Sha256Digest;
}) =>
  buildContextTask({
    taskKind: "narration-seal",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    dependencies,
    inputFingerprints: [
      {
        id: "generation-input",
        fingerprint: generationInputFingerprint,
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

export const buildSemanticTimingTask = ({
  inputs,
  revisionId,
  sealTask,
  sealAttestation,
  masteringPolicy,
}: {
  readonly inputs: LoadedInputs;
  readonly revisionId: ProductionRevisionId;
  readonly sealTask: ProducerTaskSpec;
  readonly sealAttestation: ArtifactAttestation | null;
  readonly masteringPolicy: LoadedInputs["masteredNarration"]["masteringPolicy"];
}) =>
  buildContextTask({
    taskKind: "semantic-timing",
    storyId: inputs.projectId,
    semanticId: null,
    revisionId,
    dependencies: [artifactBinding(sealTask, sealAttestation)],
    inputFingerprints: [
      { id: "render", fingerprint: inputs.fingerprints.render },
      {
        id: "mastering-policy",
        fingerprint: createFingerprint({
          namespace: "producer-narration-mastering-policy",
          version: 1,
          value: masteringPolicy,
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
      masteringPolicy,
    },
  });

export const buildAgentTasks = (
  inputs: LoadedInputs,
  revisionId: ProductionRevisionId,
  dependencies: Readonly<{
    buildTaskExecutionContract?: typeof buildTaskExecutionContract;
  }> = {},
) => {
  const buildExecutionContract =
    dependencies.buildTaskExecutionContract ?? buildTaskExecutionContract;
  const tasks: Readonly<{
    task: ProducerTaskSpec;
    contextBytes: string;
    taskContractBytes?: string;
    dependencyTaskRevisions: readonly ProducerTaskSpec["taskRevision"][];
  }>[] = inputs.sceneInputs.map((scene) => {
    const r = scene.revisionInput;
    const templateCopy =
      scene.beat.kind === "silent-scene" &&
      scene.beat.preset.implementation.kind === "template-copy";
    const context = {
      resourcePool: inputs.resourcePool,
      scene: {
        beat: scene.beat,
        timingBeat: scene.timingBeat,
        brief: scene.brief,
        taskInput: scene.taskInput,
      },
      ...(templateCopy
        ? {}
        : { originalityBaseline: inputs.originalityBaseline }),
    };
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
        ...(templateCopy
          ? []
          : [
              {
                id: "originality-baseline",
                fingerprint: inputs.fingerprints.originalityBaseline,
              },
            ]),
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
        ? "scene-template-validator-v2"
        : "scene-owner-validator-v3",
      context,
      ...(templateCopy
        ? {}
        : {
            taskContract: buildExecutionContract({
              taskKind: "scene-owner",
              context,
            }),
          }),
    });
  });
  const globalContext = {
    story: inputs.story,
    render: inputs.render,
    timing: inputs.timing,
    layerPolicy: deriveGlobalVisualLayerPolicy(inputs.timing),
    requirements: inputs.requirements,
    resourcePool: inputs.resourcePool,
    visualStyle: inputs.visualStyle,
    globalVisualBrief: inputs.globalVisualBrief,
  };
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
      { id: "render", fingerprint: inputs.fingerprints.render },
      {
        id: "runtime",
        fingerprint: inputs.taskPolicyFingerprints.globalVisual,
      },
      { id: "style", fingerprint: inputs.fingerprints.visualStyle },
      { id: "timing", fingerprint: inputs.timing.fingerprint },
    ],
    outputs: GLOBAL_OUTPUTS,
    validatorPolicyVersion: "global-visual-owner-validator-v2",
    context: globalContext,
    taskContract: buildExecutionContract({
      taskKind: "global-visual-owner",
      context: globalContext,
    }),
  });
  const coverContext = {
    story: inputs.story,
    visualStyle: inputs.visualStyle,
    coverSpec: FIXED_COVER_SPEC,
  };
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
    context: coverContext,
    taskContract: buildExecutionContract({
      taskKind: "cover-owner",
      context: coverContext,
    }),
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
}: {
  readonly inputs: LoadedInputs;
  readonly revisionId: ProductionRevisionId;
  readonly timingTask: ProducerTaskSpec;
  readonly timingAttestation: ArtifactAttestation | null;
  readonly ownerTasks: readonly ProducerTaskSpec[];
  readonly ownerInspections: ReadonlyMap<string, ArtifactInspection>;
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
  return { composition } as const;
};

export type BuildCurrentProductionPlanInput = Readonly<{
  locations: ProductionLocations;
  projectId: string;
  config: ProducerConfig;
  inputs?: LoadedInputs;
  loadInputs?: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
  }) => Promise<LoadedInputs>;
  narration?: Readonly<{
    providerAttemptFingerprint?: string;
    masteringPolicy?: LoadedInputs["masteredNarration"]["masteringPolicy"];
    preparationReceipt?: NarrationPreparationReceipt;
  }>;
  baseline?: Awaited<ReturnType<typeof readProductionDiagnosticBaseline>>;
}>;

/**
 * Rebuilds the current Revision and Task DAG using check-only readers. It does
 * not prepare narration, commit fixed artifacts, create workspaces, acquire a
 * mutation lock, or record an ExecutionAttempt.
 */
export const buildCurrentProductionPlan = async ({
  locations,
  projectId,
  config,
  inputs: suppliedInputs,
  loadInputs,
  narration: suppliedNarration,
  baseline: suppliedBaseline,
}: BuildCurrentProductionPlanInput) => {
  let inputs: LoadedInputs;
  if (suppliedInputs !== undefined) {
    inputs = suppliedInputs;
  } else {
    if (loadInputs === undefined) {
      throw new Error("Project production input port is required.");
    }
    inputs = await loadInputs({ locations, projectId });
  }
  const narration =
    suppliedNarration ??
    (await inspectNarrationCache({ locations, projectId, config }));
  if (narration.providerAttemptFingerprint === undefined) {
    throw new Error("Narration preparation identity is unavailable.");
  }
  if (
    narration.preparationReceipt !== undefined &&
    (narration.preparationReceipt.storyId !== inputs.projectId ||
      narration.preparationReceipt.generationInputFingerprint !==
        inputs.sealedNarration.generationInputFingerprint ||
      narration.preparationReceipt.providerAttemptFingerprint !==
        narration.providerAttemptFingerprint ||
      narration.preparationReceipt.sealedNarrationFingerprint !==
        inputs.sealedNarration.sealedNarrationFingerprint ||
      serializeCanonicalJson(narration.preparationReceipt.masteringPolicy) !==
        serializeCanonicalJson(inputs.masteredNarration.masteringPolicy))
  ) {
    throw new Error("Narration preparation receipt is stale.");
  }
  const revision = buildCurrentProductionRevision(inputs);
  const baseline =
    suppliedBaseline ??
    (await readProductionDiagnosticBaseline({ locations, projectId }));
  const fixed = await buildNarrationTasks({
    locations,
    inputs,
    revisionId: revision.revisionId,
    narration: {
      providerAttemptFingerprint:
        narration.providerAttemptFingerprint as Sha256Digest,
      masteringPolicy:
        narration.masteringPolicy ?? inputs.masteredNarration.masteringPolicy,
      sealedNarration: inputs.sealedNarration,
    },
  });
  const builtOwners = buildAgentTasks(inputs, revision.revisionId);
  const ownerNodes: ProducerTaskNode[] = [];
  const ownerInspections = new Map<string, ArtifactInspection>();
  const taskSeeds = new Map<
    string,
    Readonly<{
      task: ProducerTaskSpec;
      contextBytes: string;
      taskContractBytes?: string;
    }>
  >();
  for (const built of builtOwners) {
    let task = built.task;
    if (task.taskKind === "scene-template") {
      if (task.semanticId === null)
        throw new Error("Template task lost meaningId.");
      const templateFiles = await readTemplateSceneFilesForInspection({
        locations,
        projectId: inputs.projectId,
        meaningId: task.semanticId,
      });
      task = rebindTemplateTaskOutputs(task, Object.keys(templateFiles));
    }
    ownerInspections.set(task.taskRevision, await inspect({ locations, task }));
    taskSeeds.set(task.taskRevision, {
      task,
      contextBytes: built.contextBytes,
      ...(built.taskContractBytes === undefined
        ? {}
        : { taskContractBytes: built.taskContractBytes }),
    });
    ownerNodes.push({
      task,
      dependencyTaskRevisions: task.dependencyArtifacts.map(
        ({ taskRevision }) => taskRevision,
      ),
    });
  }
  const ownerTasks = ownerNodes.map(({ task }) => task);
  const downstream = buildDownstreamTasks({
    inputs,
    revisionId: revision.revisionId,
    timingTask: fixed.timingTask,
    timingAttestation: fixed.timingAttestation,
    ownerTasks,
    ownerInspections,
  });
  const compositionInspection = await inspect({
    locations,
    task: downstream.composition.task,
  });
  const downstreamTasks = [downstream.composition];
  const downstreamInspections = new Map<string, ArtifactInspection>();
  downstreamInspections.set(
    downstream.composition.task.taskRevision,
    compositionInspection,
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
  const subjects = new Map<string, DiagnosticSubject>(fixed.subjects);
  for (const { task } of nodes) {
    if (subjects.has(task.taskRevision)) continue;
    if (task.taskKind === "scene-owner" || task.taskKind === "scene-template") {
      if (task.semanticId === null) {
        throw new Error("Scene diagnostic subject lost meaningId.");
      }
      subjects.set(task.taskRevision, {
        kind: "meaning",
        id: task.semanticId,
      });
      continue;
    }
    subjects.set(task.taskRevision, {
      kind: "project",
      id: task.storyId,
    });
  }
  for (const [taskRevision, inspection] of fixed.inspections) {
    inspections.set(taskRevision, inspection);
  }
  for (const [taskRevision, inspection] of ownerInspections) {
    inspections.set(taskRevision, inspection);
  }
  for (const [taskRevision, inspection] of downstreamInspections) {
    inspections.set(taskRevision, inspection);
  }
  const plan = createProducerPlan({
    revision,
    nodes,
    inspections,
    subjects,
    baselineSnapshots: baseline?.taskSnapshots ?? [],
  });
  return {
    revision,
    plan,
    tasks: nodes.map(({ task }) => task),
    inputs,
    nodes,
    inspections,
    taskSeeds,
    subjects,
    baseline:
      baseline === null
        ? undefined
        : { kind: baseline.kind, revisionId: baseline.revisionId },
  } as const;
};
