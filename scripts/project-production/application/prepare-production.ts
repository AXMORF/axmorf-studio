import type {
  DeliveryPolicy,
  ArtifactAttestation,
  ProducerPlan,
  ProducerTaskKind,
  ProducerTaskSpec,
  ProducerConfig,
} from "../../../src/contracts";
import type {
  ProductionInspection,
  TaskDecisionExplanation,
} from "../../../src/contracts/production-inspection";
import { isAbsolute, relative } from "node:path";
import type { projectPendingSceneAuthoring } from "../../projects/application/project-pending-authoring";
import { createExecutionAttemptForPlan } from "../adapters/attempt-store";
import { acquireProductionOperationLock } from "../adapters/production-operation-lock";
import { createTaskWorkspace } from "../adapters/task-workspace";
import { buildTaskDiagnosticSnapshots } from "../domain/task-explanation";
import {
  artifactBinding,
  buildAgentTasks,
  buildCurrentProductionPlan,
  buildNarrationChunkTask,
  buildNarrationSealTask,
  buildSemanticTimingTask,
} from "./build-current-plan";
import type { inspectProjectProduction } from "./inspect-production";
import type { loadProjectProductionInputs } from "./load-inputs";
import {
  ensureFixedTaskArtifact,
  prepareNarrationInputs,
  type PreparedNarrationInputs,
} from "./prepare-fixed-tasks";
import { buildCurrentProductionRevision } from "./current-revision";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";
import type { ProductionCommandFormatter } from "../domain/production-command-formatter";
import { ensureTemplateSceneArtifact } from "./template-scene-artifacts";

type LoadedInputs = Awaited<ReturnType<typeof loadProjectProductionInputs>>;
type CurrentPlan = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;
type InspectProductionPort = (
  input: Parameters<typeof inspectProjectProduction>[0],
) => ReturnType<typeof inspectProjectProduction>;
type ProjectPendingAuthoringPort = (
  input: Parameters<typeof projectPendingSceneAuthoring>[0],
) => ReturnType<typeof projectPendingSceneAuthoring>;
type LoadInputsPort = (
  input: Parameters<typeof loadProjectProductionInputs>[0],
) => ReturnType<typeof loadProjectProductionInputs>;

type PrepareProductionDependencies = Readonly<{
  commandFormatter: ProductionCommandFormatter;
  inspect: InspectProductionPort;
  projectPendingAuthoring: ProjectPendingAuthoringPort;
  loadInputs: LoadInputsPort;
  buildCurrentPlan: typeof buildCurrentProductionPlan;
  acquireLock?: typeof acquireProductionOperationLock;
  prepareNarration?: typeof prepareNarrationInputs;
  prepareFixedTasks?: (input: {
    readonly locations: ProductionLocations;
    readonly inputs: LoadedInputs;
    readonly narration: PreparedNarrationInputs;
  }) => Promise<void>;
  createWorkspace?: typeof createTaskWorkspace;
  buildTaskSnapshots?: typeof buildTaskDiagnosticSnapshots;
  createAttempt?: typeof createExecutionAttemptForPlan;
}>;

const prepareFixedTaskArtifacts = async ({
  locations,
  inputs,
  narration,
}: {
  readonly locations: ProductionLocations;
  readonly inputs: LoadedInputs;
  readonly narration: PreparedNarrationInputs;
}) => {
  if (inputs.timing.fingerprint !== narration.semanticTiming.fingerprint) {
    throw new Error(
      "Fixed narration prepare and loaded SemanticTiming disagree.",
    );
  }
  const revision = buildCurrentProductionRevision(inputs);
  const chunkArtifacts: Array<{
    task: ProducerTaskSpec;
    attestation: ArtifactAttestation;
  }> = [];
  for (const segment of narration.sealedNarration.segments) {
    if (segment.kind !== "chunk") continue;
    const audio = narration.chunkAudioBytes.get(segment.chunkId);
    if (audio === undefined) {
      throw new Error("Prepared narration chunk bytes are incomplete.");
    }
    const built = buildNarrationChunkTask({
      storyId: inputs.projectId,
      revisionId: revision.revisionId,
      narrationFingerprint: inputs.fingerprints.narration,
      providerAttemptFingerprint: narration.providerAttemptFingerprint,
      chunk: segment,
    });
    chunkArtifacts.push({
      task: built.task,
      attestation: await ensureFixedTaskArtifact({
        locations,
        task: built.task,
        files: {
          "inputs/context.json": built.contextBytes,
          "public/chunk.wav": audio,
        },
      }),
    });
  }
  const seal = buildNarrationSealTask({
    inputs,
    revisionId: revision.revisionId,
    dependencies: chunkArtifacts.map(({ task, attestation }) =>
      artifactBinding(task, attestation),
    ),
    generationInputFingerprint:
      narration.sealedNarration.generationInputFingerprint,
  });
  const sealAttestation = await ensureFixedTaskArtifact({
    locations,
    task: seal.task,
    files: {
      "inputs/context.json": seal.contextBytes,
      "project/generated/sealed-narration.generated.json":
        narration.sealedManifestBytes,
      "public/complete.wav": narration.completeAudioBytes,
    },
  });
  const timing = buildSemanticTimingTask({
    inputs,
    revisionId: revision.revisionId,
    sealTask: seal.task,
    sealAttestation,
    masteringPolicy: narration.masteringPolicy,
  });
  await ensureFixedTaskArtifact({
    locations,
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

  for (const built of buildAgentTasks(inputs, revision.revisionId)) {
    if (built.task.taskKind !== "scene-template") continue;
    if (built.task.semanticId === null) {
      throw new Error("Template task lost meaningId.");
    }
    const sceneInput = inputs.sceneInputs.find(
      ({ meaningId }) => meaningId === built.task.semanticId,
    );
    if (sceneInput === undefined) {
      throw new Error("Template task Scene input is unavailable.");
    }
    await ensureTemplateSceneArtifact({
      locations,
      task: built.task,
      contextBytes: built.contextBytes,
      taskInput: sceneInput.taskInput,
      catalog: inputs.catalog,
    });
  }
};

const reusedByTaskKind = (tasks: readonly TaskDecisionExplanation[]) => {
  const counts = new Map<ProducerTaskKind, number>();
  for (const task of tasks) {
    if (task.action === "reuse") {
      counts.set(task.taskKind, (counts.get(task.taskKind) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([taskKind, reusedTaskCount]) => ({ taskKind, reusedTaskCount }))
    .sort((left, right) => left.taskKind.localeCompare(right.taskKind));
};

const dirtyAgentTasks = async ({
  locations,
  current,
  createWorkspace,
  commandFormatter,
}: {
  readonly locations: ProductionLocations;
  readonly current: CurrentPlan;
  readonly createWorkspace: typeof createTaskWorkspace;
  readonly commandFormatter: ProductionCommandFormatter;
}) => {
  const dirty: Array<
    Readonly<{
      taskKind: ProducerTaskKind;
      subject: TaskDecisionExplanation["subject"];
      taskRevision: NonNullable<TaskDecisionExplanation["taskRevision"]>;
      workspace: string;
      changedInputs: readonly string[];
      blockedBy: TaskDecisionExplanation["blockedBy"];
      finalizeCommand: string;
      checkCommand: string;
    }>
  > = [];
  for (const explanation of current.plan.tasks) {
    if (
      explanation.action !== "dispatch-agent" ||
      explanation.taskRevision === null
    ) {
      continue;
    }
    const seed = current.taskSeeds.get(explanation.taskRevision);
    if (seed === undefined) {
      throw new Error("Dirty Agent task seed is unavailable.");
    }
    const workspace = await createWorkspace({
      locations,
      task: seed.task,
      seedFiles: {
        "inputs/context.json": seed.contextBytes,
        ...(seed.taskContractBytes === undefined
          ? {}
          : { "inputs/task-contract.json": seed.taskContractBytes }),
      },
    });
    if (!isAbsolute(workspace)) {
      throw new Error("Dirty Agent workspace must be absolute.");
    }
    const logicalWorkspace = relative(
      locations.taskWorkspaceRoot,
      workspace,
    ).replaceAll("\\", "/");
    const expectedWorkspace = `${seed.task.storyId}/${seed.task.taskRevision}`;
    if (logicalWorkspace !== expectedWorkspace) {
      throw new Error("Dirty Agent workspace is outside its task authority.");
    }
    dirty.push({
      taskKind: explanation.taskKind,
      subject: explanation.subject,
      taskRevision: explanation.taskRevision,
      workspace: logicalWorkspace,
      changedInputs: explanation.directChanges
        .filter(({ kind }) => kind === "input")
        .map(({ id }) => id),
      blockedBy: explanation.blockedBy,
      finalizeCommand: commandFormatter.finalizeTask({
        taskRevision: explanation.taskRevision,
      }),
      checkCommand: commandFormatter.checkTask({
        taskRevision: explanation.taskRevision,
      }),
    });
  }
  return dirty;
};

const missingAuthoringResult = ({
  projectId,
  estimated,
  narration,
  missingAuthoringInputs,
}: {
  readonly projectId: string;
  readonly estimated: ProductionInspection["estimatedCost"];
  readonly narration: PreparedNarrationInputs | null;
  readonly missingAuthoringInputs: readonly string[];
}) => ({
  status: "project-authoring-required" as const,
  storyId: projectId,
  sourceState: "timing-ready" as const,
  missingAuthoringInputs: [...missingAuthoringInputs].sort(),
  estimatedCost: estimated,
  actualCost: {
    providerRequests: narration?.actualCost.providerRequests ?? 0,
    providerCacheHits: narration?.actualCost.providerCacheHits ?? 0,
    agentTasks: 0,
    deliveryMedia: [] as const,
  },
  reusedByTaskKind: [],
  taskExplanations: [],
  dirtyAgentTasks: [],
  nextAction: "complete-authoring" as const,
});

export const prepareProjectProduction = async (
  {
    locations,
    runtime,
    config,
    projectId,
    deliveryPolicy,
  }: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly projectId: string;
    readonly deliveryPolicy: DeliveryPolicy;
  },
  dependencies: PrepareProductionDependencies,
) => {
  const commandFormatter = dependencies.commandFormatter;
  const acquireLock =
    dependencies.acquireLock ?? acquireProductionOperationLock;
  const inspect = dependencies.inspect;
  const prepareNarration =
    dependencies.prepareNarration ?? prepareNarrationInputs;
  const projectAuthoring = dependencies.projectPendingAuthoring;
  const loadInputs = dependencies.loadInputs;
  const prepareFixed =
    dependencies.prepareFixedTasks ?? prepareFixedTaskArtifacts;
  const buildCurrentPlan = dependencies.buildCurrentPlan;
  const createWorkspace = dependencies.createWorkspace ?? createTaskWorkspace;
  const buildTaskSnapshots =
    dependencies.buildTaskSnapshots ?? buildTaskDiagnosticSnapshots;
  const createAttempt =
    dependencies.createAttempt ?? createExecutionAttemptForPlan;
  const lock = await acquireLock({
    locations,
    ownerId: "project-production-prepare",
  });
  try {
    // This check-only phase validates every fact available before a provider
    // request. It also proves the cost estimate was obtained without mutation.
    const estimated = await inspect({ locations, runtime, projectId, config });
    let narration: PreparedNarrationInputs | null = null;
    if (estimated.sourceState !== "timing-ready") {
      narration = await prepareNarration({
        locations,
        runtime,
        config,
        projectId,
      });
    }
    await projectAuthoring({ locations, projectId });
    const ready = await inspect({ locations, runtime, projectId, config });
    if (ready.sourceState !== "production-inputs-ready") {
      return missingAuthoringResult({
        projectId,
        estimated: estimated.estimatedCost,
        narration,
        missingAuthoringInputs: ["production/scene-production-brief.json"],
      });
    }
    narration ??= await prepareNarration({
      locations,
      runtime,
      config,
      projectId,
    });
    const inputs = await loadInputs({
      locations,
      projectId,
    });
    await prepareFixed({ locations, inputs, narration });
    const current = await buildCurrentPlan({
      locations,
      projectId,
      config,
      inputs,
      narration,
    });
    const dirty = await dirtyAgentTasks({
      locations,
      current,
      createWorkspace,
      commandFormatter,
    });
    const taskSnapshots = buildTaskSnapshots({
      nodes: current.nodes,
      subjects: current.subjects,
      decisions: current.plan.tasks,
    });
    const attempt = await createAttempt({
      locations,
      plan: current.plan as ProducerPlan,
      taskSnapshots,
      estimatedCost: estimated.estimatedCost,
      actualCost: {
        providerRequests: narration.actualCost.providerRequests,
        providerCacheHits: narration.actualCost.providerCacheHits,
        agentTasks: dirty.length,
        deliveryMedia: [],
      },
      state: dirty.length === 0 ? "converging" : "waiting-for-agent",
    });
    return {
      status: "project-production-prepared" as const,
      storyId: projectId,
      attemptId: attempt.attemptId,
      revisionId: current.revision.revisionId,
      summary: current.plan.summary,
      reusedByTaskKind: reusedByTaskKind(current.plan.tasks),
      estimatedCost: estimated.estimatedCost,
      actualCost: {
        providerRequests: narration.actualCost.providerRequests,
        providerCacheHits: narration.actualCost.providerCacheHits,
        agentTasks: dirty.length,
        deliveryMedia: [],
      },
      taskExplanations: current.plan.tasks,
      dirtyAgentTasks: dirty.map((task) => ({
        ...task,
        commitCommand: commandFormatter.commitTask({
          taskRevision: task.taskRevision,
          attemptId: attempt.attemptId,
        }),
        taskFailureCommand: commandFormatter.failTask({
          taskRevision: task.taskRevision,
          attemptId: attempt.attemptId,
          kind: "task",
        }),
        hostFailureCommand: commandFormatter.failTask({
          taskRevision: task.taskRevision,
          attemptId: attempt.attemptId,
          kind: "host",
        }),
      })),
      continuationCommand: commandFormatter.continueProduction({
        projectId,
        revisionId: current.revision.revisionId,
        attemptId: attempt.attemptId,
        deliveryPolicy,
      }),
      nextAction:
        dirty.length === 0
          ? ("start-fixed-continuation" as const)
          : ("dispatch-agent-tasks-then-start-fixed-continuation" as const),
    };
  } finally {
    await lock.release();
  }
};
