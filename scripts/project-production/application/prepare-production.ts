import type {
  ArtifactAttestation,
  ProducerPlan,
  ProducerTaskKind,
  ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import type {
  ProductionInspection,
  TaskDecisionExplanation,
} from "@axmorf/studio/contracts";
import { isAbsolute, relative } from "node:path";
import { projectPendingSceneAuthoring } from "../../projects/application/create-project";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import { createExecutionAttemptForPlan } from "../adapters/attempt-store";
import { npmScriptProductionCommandFormatter } from "../adapters/npm-script-production-command-formatter";
import { createTaskWorkspace } from "../adapters/task-workspace";
import type { ProductionCommandFormatter } from "../domain/production-command-formatter";
import { buildTaskDiagnosticSnapshots } from "../domain/task-explanation";
import {
  artifactBinding,
  buildAgentTasks,
  buildCurrentProductionPlan,
  buildNarrationChunkTask,
  buildNarrationSealTask,
  buildSemanticTimingTask,
} from "./build-current-plan";
import { inspectProjectProduction } from "./inspect-production";
import { loadProjectProductionInputs } from "./load-inputs";
import {
  ensureFixedTaskArtifact,
  prepareNarrationInputs,
  type PreparedNarrationInputs,
} from "./prepare-fixed-tasks";
import { buildCurrentProductionRevision } from "./current-revision";
import { ensureTemplateSceneArtifact } from "./template-scene-artifacts";
import { buildTaskDispatch } from "./task-dispatch";
import type { RuntimePolicyManifest } from "../../../packages/studio/src/runtime/policy-manifest";
import { loadScopedProjectCatalogAuthorityDescriptors } from "../../catalog/project-files";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";

type LoadedInputs = Awaited<ReturnType<typeof loadProjectProductionInputs>>;
type CurrentPlan = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;

type PrepareProductionDependencies = Readonly<{
  acquireLock?: typeof acquireRepositoryOperationLock;
  inspect?: typeof inspectProjectProduction;
  prepareNarration?: typeof prepareNarrationInputs;
  projectPendingAuthoring?: typeof projectPendingSceneAuthoring;
  loadInputs?: typeof loadProjectProductionInputs;
  prepareFixedTasks?: (input: {
    readonly rootDir: string;
    readonly inputs: LoadedInputs;
    readonly narration: PreparedNarrationInputs;
    readonly scope: ProductionScope;
  }) => Promise<void>;
  buildCurrentPlan?: typeof buildCurrentProductionPlan;
  createWorkspace?: typeof createTaskWorkspace;
  buildTaskSnapshots?: typeof buildTaskDiagnosticSnapshots;
  createAttempt?: typeof createExecutionAttemptForPlan;
  commandFormatter?: ProductionCommandFormatter;
}>;

const prepareFixedTaskArtifacts = async ({
  rootDir,
  inputs,
  narration,
  scope,
}: {
  readonly rootDir: string;
  readonly inputs: LoadedInputs;
  readonly narration: PreparedNarrationInputs;
  readonly scope: ProductionScope;
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
        rootDir,
        task: built.task,
        workspaceRootDir: scope.isolatedRoot,
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
    rootDir,
    task: seal.task,
    workspaceRootDir: scope.isolatedRoot,
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
    rootDir,
    task: timing.task,
    workspaceRootDir: scope.isolatedRoot,
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
      rootDir,
      sourceRootDir: scope.isolatedRoot,
      workspaceRootDir: scope.isolatedRoot,
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
  rootDir,
  repositoryRootDir,
  current,
  createWorkspace,
}: {
  readonly rootDir: string;
  readonly repositoryRootDir: string;
  readonly current: CurrentPlan;
  readonly createWorkspace: typeof createTaskWorkspace;
}) => {
  const dirty: Array<
    Readonly<{
      taskKind: ProducerTaskKind;
      task: ProducerTaskSpec;
      subject: TaskDecisionExplanation["subject"];
      taskRevision: NonNullable<TaskDecisionExplanation["taskRevision"]>;
      workspace: string;
      changedInputs: readonly string[];
      blockedBy: TaskDecisionExplanation["blockedBy"];
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
    if (typeof seed.taskContractBytes !== "string") {
      throw new Error("Dirty Agent task execution contract is unavailable.");
    }
    const workspace = await createWorkspace({
      rootDir,
      task: seed.task,
      seedFiles: {
        "inputs/context.json": seed.contextBytes,
        "inputs/task-contract.json": seed.taskContractBytes,
      },
    });
    const authorityWorkspace = isAbsolute(workspace)
      ? relative(rootDir, workspace).replaceAll("\\", "/")
      : workspace.replaceAll("\\", "/");
    const expectedWorkspace = `.producer-work/${seed.task.storyId}/${seed.task.taskRevision}`;
    if (authorityWorkspace !== expectedWorkspace) {
      throw new Error("Dirty Agent workspace is outside its task authority.");
    }
    const logicalWorkspace = isAbsolute(workspace)
      ? relative(repositoryRootDir, workspace).replaceAll("\\", "/")
      : workspace.replaceAll("\\", "/");
    if (
      logicalWorkspace === ".." ||
      logicalWorkspace.startsWith("../") ||
      logicalWorkspace.startsWith("/")
    ) {
      throw new Error("Dirty Agent workspace escapes the repository.");
    }
    dirty.push({
      taskKind: explanation.taskKind,
      task: seed.task,
      subject: explanation.subject,
      taskRevision: explanation.taskRevision,
      workspace: logicalWorkspace,
      changedInputs: explanation.directChanges
        .filter(({ kind }) => kind === "input")
        .map(({ id }) => id),
      blockedBy: explanation.blockedBy,
    });
  }
  return dirty;
};

const missingAuthoringResult = ({
  projectId,
  estimated,
  narration,
  missingAuthoringInputs,
  durationBudget,
}: {
  readonly projectId: string;
  readonly estimated: ProductionInspection["estimatedCost"];
  readonly durationBudget: ProductionInspection["durationBudget"];
  readonly narration: PreparedNarrationInputs | null;
  readonly missingAuthoringInputs: readonly string[];
}) => ({
  status: "project-authoring-required" as const,
  durationBudget,
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
    rootDir,
    projectId,
    env = process.env,
    runtimePolicyManifest,
    scope: suppliedScope,
  }: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly runtimePolicyManifest?: RuntimePolicyManifest;
    readonly scope?: ProductionScope;
  },
  dependencies: PrepareProductionDependencies = {},
) => {
  const acquireLock =
    dependencies.acquireLock ?? acquireRepositoryOperationLock;
  const inspect = dependencies.inspect ?? inspectProjectProduction;
  const prepareNarration =
    dependencies.prepareNarration ?? prepareNarrationInputs;
  const projectAuthoring =
    dependencies.projectPendingAuthoring ?? projectPendingSceneAuthoring;
  const loadInputs = dependencies.loadInputs ?? loadProjectProductionInputs;
  const prepareFixed =
    dependencies.prepareFixedTasks ?? prepareFixedTaskArtifacts;
  const buildCurrentPlan =
    dependencies.buildCurrentPlan ?? buildCurrentProductionPlan;
  const createWorkspace = dependencies.createWorkspace ?? createTaskWorkspace;
  const buildTaskSnapshots =
    dependencies.buildTaskSnapshots ?? buildTaskDiagnosticSnapshots;
  const createAttempt =
    dependencies.createAttempt ?? createExecutionAttemptForPlan;
  const commandFormatter =
    dependencies.commandFormatter ?? npmScriptProductionCommandFormatter;
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  if (scope.repositoryRoot !== rootDir || scope.storyId !== projectId) {
    throw new Error("Production preparation scope is cross-bound.");
  }
  const lock = await acquireLock({
    rootDir,
    ownerId: "project-production-prepare",
  });
  try {
    // This check-only phase validates every fact available before a provider
    // request. It also proves the cost estimate was obtained without mutation.
    const estimated = await inspect({
      rootDir,
      projectId,
      env,
      runtimePolicyManifest,
      scope,
    });
    let narration: PreparedNarrationInputs | null = null;
    if (estimated.sourceState !== "timing-ready") {
      narration = await prepareNarration({ rootDir, projectId, env, scope });
    }
    await projectAuthoring({
      rootDir: scope.isolatedRoot,
      projectId,
      ...(scope.kind === "live-project"
        ? {}
        : {
            loadCatalogDescriptors: () =>
              loadScopedProjectCatalogAuthorityDescriptors({
                runtimeRoot: scope.shared.runtimeRoot,
                projectRoot: scope.isolatedRoot,
                projectId,
              }),
          }),
    });
    const ready = await inspect({
      rootDir,
      projectId,
      env,
      runtimePolicyManifest,
      scope,
    });
    if (ready.sourceState !== "production-inputs-ready") {
      return missingAuthoringResult({
        projectId,
        estimated: estimated.estimatedCost,
        durationBudget: ready.durationBudget,
        narration,
        missingAuthoringInputs: ["production/scene-production-brief.json"],
      });
    }
    narration ??= await prepareNarration({ rootDir, projectId, env, scope });
    const inputs = await loadInputs({
      rootDir,
      projectId,
      runtimePolicyManifest,
      scope,
    });
    await prepareFixed({ rootDir, inputs, narration, scope });
    const current = await buildCurrentPlan({
      rootDir,
      projectId,
      env,
      inputs,
      narration,
      runtimePolicyManifest,
      scope,
    });
    const dirty = await dirtyAgentTasks({
      rootDir: scope.isolatedRoot,
      repositoryRootDir: scope.repositoryRoot,
      current,
      createWorkspace,
    });
    const taskSnapshots = buildTaskSnapshots({
      nodes: current.nodes,
      subjects: current.subjects,
      decisions: current.plan.tasks,
    });
    const attempt = await createAttempt({
      rootDir: scope.isolatedRoot,
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
      durationBudget: ready.durationBudget,
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
      dirtyAgentTasks: dirty.map(({ task: taskSpec, ...task }) => ({
        ...task,
        ...buildTaskDispatch({
          task: taskSpec,
          attemptId: attempt.attemptId,
          workspace: task.workspace,
          ...(scope.candidateId === null
            ? {}
            : { candidateId: scope.candidateId }),
          commandFormatter,
        }),
      })),
      continuationCommand: commandFormatter.continueProduction({
        projectId,
        revisionId: current.revision.revisionId,
        attemptId: attempt.attemptId,
        ...(scope.candidateId === null
          ? {}
          : { candidateId: scope.candidateId }),
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
