import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
} from "../../../src/contracts";
import { inspectArtifact as inspectArtifactFromStore } from "../adapters/artifact-store";
import { appendExecutionAttemptDeliveryResult } from "../adapters/attempt-store";
import {
  materializeOwnerArtifacts as materializeArtifacts,
  verifyMaterializedOwnerArtifacts as verifyMaterializedArtifacts,
  type AdditionalSceneFileManifest,
} from "../adapters/project-materializer";
import {
  checksumBytes,
  readRegularBytes,
} from "../adapters/project-input-snapshot";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import { buildDeliveryUnlocked as buildSynchronousDelivery } from "./build-delivery";
import { planProjectProductionUnlocked as planCurrentProduction } from "./plan-production";
import { prepareProjectAuthoringBuild } from "./prepare-delivery";
import { contextFile, ensureFixedTaskArtifact } from "./prepare-fixed-tasks";

type PlannedProduction = Awaited<ReturnType<typeof planCurrentProduction>>;
type MaterializedArtifact = Readonly<{
  task: ProducerTaskSpec;
  attestation: ArtifactAttestation;
}>;

export type ConvergenceDependencies = Readonly<{
  plan?: typeof planCurrentProduction;
  inspectArtifact?: typeof inspectArtifactFromStore;
  materializeOwnerArtifacts?: typeof materializeArtifacts;
  verifyMaterializedOwnerArtifacts?: typeof verifyMaterializedArtifacts;
  buildDelivery?: typeof buildSynchronousDelivery;
  appendAttempt?: typeof appendExecutionAttemptDeliveryResult;
  acquireLock?: typeof acquireRepositoryOperationLock;
  prepareProject?: typeof prepareProjectAuthoringBuild;
  commitFixedArtifact?: typeof ensureFixedTaskArtifact;
  readDeliveryPublish?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<Uint8Array>;
  readPreparedScenePackage?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly meaningId: string;
  }) => Promise<Uint8Array>;
}>;

const MATERIALIZED_TASK_KINDS = new Set<ProducerTaskSpec["taskKind"]>([
  "scene-owner",
  "scene-template",
  "global-visual-owner",
  "cover-owner",
]);

const selectMaterializedTasks = (planned: PlannedProduction) =>
  planned.tasks.filter(({ taskKind }) => MATERIALIZED_TASK_KINDS.has(taskKind));

const requireTask = (
  planned: PlannedProduction,
  taskKind: "composition-convergence" | "delivery-build",
) => {
  const matches = planned.tasks.filter((task) => task.taskKind === taskKind);
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(`Producer DAG requires exactly one ${taskKind} task.`);
  }
  return matches[0];
};

const convergeProjectProductionUnlocked = async ({
  rootDir,
  projectId,
  revisionId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly dependencies?: ConvergenceDependencies;
}) => {
  const plan = dependencies.plan ?? planCurrentProduction;
  const inspectArtifact =
    dependencies.inspectArtifact ?? inspectArtifactFromStore;
  const materializeOwnerArtifacts =
    dependencies.materializeOwnerArtifacts ?? materializeArtifacts;
  const verifyMaterializedOwnerArtifacts =
    dependencies.verifyMaterializedOwnerArtifacts ??
    verifyMaterializedArtifacts;
  const buildDelivery = dependencies.buildDelivery ?? buildSynchronousDelivery;
  const appendAttempt =
    dependencies.appendAttempt ?? appendExecutionAttemptDeliveryResult;
  const prepareProject =
    dependencies.prepareProject ?? prepareProjectAuthoringBuild;
  const commitFixedArtifact =
    dependencies.commitFixedArtifact ?? ensureFixedTaskArtifact;
  const readDeliveryPublish =
    dependencies.readDeliveryPublish ??
    (async ({ rootDir: repositoryRoot, projectId: storyId }) =>
      Uint8Array.from(
        await readFile(
          join(repositoryRoot, "deliveries", storyId, "publish.json"),
        ),
      ));
  const readPreparedScenePackage =
    dependencies.readPreparedScenePackage ??
    (async ({ rootDir: repositoryRoot, projectId: storyId, meaningId }) =>
      readRegularBytes(
        join(
          repositoryRoot,
          "src/projects",
          storyId,
          "scenes",
          meaningId,
          "generated/scene-package.generated.json",
        ),
        `ScenePackage ${meaningId}`,
      ));

  // Convergence never trusts the plan emitted by an earlier command. This is the
  // authority check that prevents an old revision from materializing current paths.
  const planned = await plan({
    rootDir,
    projectId,
    createWorkspaces: false,
  });
  let terminalPlan = planned;
  const appendTerminal = async (
    result:
      | Readonly<{
          status: "verified";
          deliveryBuildId: string;
          diagnosticCode: null;
        }>
      | Readonly<{
          status: "failed";
          deliveryBuildId: null;
          diagnosticCode: string;
        }>,
    attemptRevisionId = revisionId,
  ) => {
    try {
      await appendAttempt({
        rootDir,
        storyId: terminalPlan.revision.storyId,
        revisionId: attemptRevisionId,
        result,
        plan:
          terminalPlan.plan.revisionId === attemptRevisionId
            ? terminalPlan.plan
            : undefined,
      });
      return true;
    } catch {
      // ExecutionAttempt is diagnostic-only. A lost diagnostic write cannot
      // alter revision, artifact, materialization, or delivery authority.
      return false;
    }
  };

  if (planned.revision.revisionId !== revisionId) {
    const attemptRecorded = await appendTerminal(
      {
        status: "failed",
        deliveryBuildId: null,
        diagnosticCode: "producer-revision-stale",
      },
      revisionId,
    );
    return {
      status: "producer-revision-stale" as const,
      currentRevisionId: planned.revision.revisionId,
      attemptRecorded,
    };
  }

  // Complete the full read phase before touching a live owner root. A single
  // missing or invalid attestation therefore guarantees zero materialization and
  // zero delivery work.
  const artifacts: MaterializedArtifact[] = [];
  for (const task of selectMaterializedTasks(planned)) {
    let attestation: ArtifactAttestation | null;
    try {
      attestation = await inspectArtifact({ rootDir, task });
    } catch (error) {
      await appendTerminal({
        status: "failed",
        deliveryBuildId: null,
        diagnosticCode: "producer-artifact-invalid",
      });
      throw error;
    }
    if (attestation === null) {
      const attemptRecorded = await appendTerminal({
        status: "failed",
        deliveryBuildId: null,
        diagnosticCode: "producer-artifacts-incomplete",
      });
      return {
        status: "producer-artifacts-incomplete" as const,
        revisionId,
        missingTaskRevision: task.taskRevision,
        attemptRecorded,
      };
    }
    artifacts.push({ task, attestation });
  }

  const sceneTaskInputs = new Map(
    planned.inputs.sceneInputs.map(({ meaningId, taskInput }) => [
      meaningId,
      taskInput,
    ]),
  );
  try {
    await materializeOwnerArtifacts({
      rootDir,
      projectId,
      artifacts,
      sceneTaskInputs,
    });
    const verifyOwnerMaterialized = () =>
      verifyMaterializedOwnerArtifacts({
        rootDir,
        projectId,
        artifacts,
        sceneTaskInputs,
      });
    await verifyOwnerMaterialized();
    const prepared = await prepareProject({ rootDir, projectId });
    const additionalSceneEntries: Array<
      readonly [
        string,
        ReadonlyMap<string, { checksum: string; sizeBytes: number }>,
      ]
    > = [];
    for (const { task } of artifacts) {
      if (
        (task.taskKind !== "scene-owner" &&
          task.taskKind !== "scene-template") ||
        task.semanticId === null
      ) {
        continue;
      }
      const bytes = await readPreparedScenePackage({
        rootDir,
        projectId,
        meaningId: task.semanticId,
      });
      additionalSceneEntries.push([
        task.semanticId,
        new Map([
          [
            "generated/scene-package.generated.json",
            {
              checksum: checksumBytes(bytes),
              sizeBytes: bytes.byteLength,
            },
          ],
        ]),
      ]);
    }
    const additionalSceneFiles: AdditionalSceneFileManifest = new Map(
      additionalSceneEntries,
    );
    const verifyPreparedMaterialized = () =>
      verifyMaterializedOwnerArtifacts({
        rootDir,
        projectId,
        artifacts,
        sceneTaskInputs,
        additionalSceneFiles,
      });
    await verifyPreparedMaterialized();

    const compositionTask = requireTask(planned, "composition-convergence");
    const compositionContext = contextFile({
      storyId: planned.inputs.projectId,
      revisionId,
      render: planned.inputs.render,
      sound: planned.inputs.sound,
    });
    const compositionAttestation = await commitFixedArtifact({
      rootDir,
      task: compositionTask,
      files: {
        "inputs/context.json": compositionContext.bytes,
        "project/convergence.json": `${serializeCanonicalJson({
          schemaVersion: 1,
          contractVersion: "composition-convergence-result-v1",
          storyId: planned.inputs.projectId,
          revisionId,
          taskRevision: compositionTask.taskRevision,
          dependencyArtifacts: compositionTask.dependencyArtifacts,
        })}\n`,
      },
    });

    const withComposition = await plan({
      rootDir,
      projectId,
      createWorkspaces: false,
    });
    terminalPlan = withComposition;
    if (withComposition.revision.revisionId !== revisionId) {
      throw new Error("Production revision changed during locked convergence.");
    }
    const deliveryTask = requireTask(withComposition, "delivery-build");
    if (
      !deliveryTask.dependencyArtifacts.some(
        ({ taskRevision, artifactFingerprint }) =>
          taskRevision === compositionTask.taskRevision &&
          artifactFingerprint === compositionAttestation.artifactFingerprint,
      )
    ) {
      throw new Error(
        "Delivery task is not bound to the committed convergence artifact.",
      );
    }
    const delivery = await buildDelivery({
      rootDir,
      projectId,
      revisionId,
      artifactSetFingerprint: withComposition.plan.artifactSetFingerprint,
      dependencies: {
        verifyMaterialized: verifyPreparedMaterialized,
        prepare: async () => prepared,
      },
    });
    // The delivery builder verifies live materialized bytes before and after
    // rendering. A final check also binds the terminal result to the promoted
    // current owner roots.
    await verifyPreparedMaterialized();
    const deliveryContext = contextFile({
      storyId: withComposition.inputs.projectId,
      revisionId,
      render: withComposition.inputs.render,
      publishingIntent: withComposition.inputs.publishingIntent,
    });
    await commitFixedArtifact({
      rootDir,
      task: deliveryTask,
      files: {
        "inputs/context.json": deliveryContext.bytes,
        "project/publish.json": await readDeliveryPublish({
          rootDir,
          projectId,
        }),
      },
    });
    const completed = await plan({
      rootDir,
      projectId,
      createWorkspaces: false,
    });
    terminalPlan = completed;
    if (
      completed.revision.revisionId !== revisionId ||
      completed.plan.artifactSetFingerprint !==
        withComposition.plan.artifactSetFingerprint ||
      completed.plan.tasks.some(({ status }) => status !== "reused")
    ) {
      throw new Error(
        "Completed production DAG did not converge to a stable reused plan.",
      );
    }
    await verifyPreparedMaterialized();
    const attemptRecorded = await appendTerminal({
      status: "verified",
      deliveryBuildId: delivery.deliveryBuildId,
      diagnosticCode: null,
    });
    return {
      status: delivery.status,
      revisionId,
      delivery,
      attemptRecorded,
    } as const;
  } catch (error) {
    await appendTerminal({
      status: "failed",
      deliveryBuildId: null,
      diagnosticCode: "project-production-convergence-failed",
    });
    throw error;
  }
};

export const convergeProjectProduction = async ({
  rootDir,
  projectId,
  revisionId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly dependencies?: ConvergenceDependencies;
}) => {
  const acquireLock =
    dependencies.acquireLock ?? acquireRepositoryOperationLock;
  const lock = await acquireLock({
    rootDir,
    ownerId: "project-production-convergence",
  });
  try {
    return await convergeProjectProductionUnlocked({
      rootDir,
      projectId,
      revisionId,
      dependencies,
    });
  } finally {
    await lock.release();
  }
};
