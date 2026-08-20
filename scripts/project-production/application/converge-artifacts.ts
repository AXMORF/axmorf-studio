import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  DeliveryPublishSchema,
  ProjectSoundPlanSchema,
  PublishingIntentSchema,
  RenderSpecSchema,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
} from "../../../src/contracts";
import {
  commitTaskArtifact,
  inspectArtifact as inspectArtifactFromStore,
} from "../adapters/artifact-store";
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
import { buildCurrentProductionPlan, contextFile } from "./build-current-plan";
import { prepareProjectAuthoringBuild } from "./prepare-delivery";

type PlannedProduction = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;
type MaterializedArtifact = Readonly<{
  task: ProducerTaskSpec;
  attestation: ArtifactAttestation;
}>;

export type ConvergenceDependencies = Readonly<{
  buildCurrentPlan?: typeof buildCurrentProductionPlan;
  inspectArtifact?: typeof inspectArtifactFromStore;
  materializeOwnerArtifacts?: typeof materializeArtifacts;
  verifyMaterializedOwnerArtifacts?: typeof verifyMaterializedArtifacts;
  buildDelivery?: typeof buildSynchronousDelivery;
  appendAttempt?: typeof appendExecutionAttemptDeliveryResult;
  acquireLock?: typeof acquireRepositoryOperationLock;
  prepareProject?: typeof prepareProjectAuthoringBuild;
  commitFixedArtifact?: typeof commitConvergenceFixedArtifact;
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

const selectPreConvergenceTasks = (planned: PlannedProduction) =>
  planned.tasks.filter(
    ({ taskKind }) =>
      taskKind !== "composition-convergence" && taskKind !== "delivery-build",
  );

const same = (left: unknown, right: unknown) =>
  serializeCanonicalJson(left) === serializeCanonicalJson(right);

const asBytes = (value: Uint8Array | string) =>
  typeof value === "string" ? new TextEncoder().encode(value) : value;

const parseCanonical = <T>(
  bytes: Uint8Array | string,
  schema: { readonly parse: (value: unknown) => T },
  label: string,
) => {
  const text = new TextDecoder().decode(asBytes(bytes));
  const parsed = schema.parse(JSON.parse(text));
  if (text !== `${serializeCanonicalJson(parsed)}\n`) {
    throw new Error(`${label} must use canonical JSON bytes.`);
  }
  return parsed;
};

const assertFixedTaskShape = (
  task: ProducerTaskSpec,
  kind: "composition-convergence" | "delivery-build",
) => {
  const expected = {
    "composition-convergence": {
      output: "project/convergence.json",
      policy: "composition-convergence-validator-v1",
      inputs: [
        "read:inputs/context.json",
        "render",
        "runtime",
        "sound",
        "story",
        "style",
      ],
    },
    "delivery-build": {
      output: "project/publish.json",
      policy: "delivery-build-validator-v1",
      inputs: ["publishing", "read:inputs/context.json", "render", "runtime"],
    },
  } as const;
  const shape = expected[kind];
  if (
    task.taskKind !== kind ||
    task.semanticId !== null ||
    task.validatorPolicyVersion !== shape.policy ||
    !same(task.declaredReadSet, ["inputs/context.json"]) ||
    !same(task.declaredOutputSet, [shape.output]) ||
    !same(
      task.inputFingerprints.map(({ id }) => id),
      [...shape.inputs].sort(),
    )
  ) {
    throw new Error("Convergence fixed task shape is invalid.");
  }
  if (
    (kind === "delivery-build" && task.dependencyArtifacts.length !== 2) ||
    (kind === "composition-convergence" && task.dependencyArtifacts.length < 2)
  ) {
    throw new Error("Convergence fixed task dependencies are incomplete.");
  }
};

const assertCandidateFileSet = (
  task: ProducerTaskSpec,
  files: Readonly<Record<string, Uint8Array | string>>,
) => {
  const expectedPaths = [
    ...task.declaredReadSet,
    ...task.declaredOutputSet,
  ].sort();
  if (!same(Object.keys(files).sort(), expectedPaths)) {
    throw new Error(
      "Convergence fixed artifact candidate has an invalid file set.",
    );
  }
  const context = files["inputs/context.json"];
  const binding = task.inputFingerprints.find(
    ({ id }) => id === "read:inputs/context.json",
  );
  if (
    context === undefined ||
    binding === undefined ||
    checksumBytes(asBytes(context)) !== binding.fingerprint
  ) {
    throw new Error("Convergence fixed artifact context is stale.");
  }
};

const validateCompositionCandidate = ({
  task,
  files,
}: {
  readonly task: ProducerTaskSpec;
  readonly files: Readonly<Record<string, Uint8Array | string>>;
}) => {
  assertFixedTaskShape(task, "composition-convergence");
  assertCandidateFileSet(task, files);
  const context = parseCanonical(
    files["inputs/context.json"]!,
    {
      parse: (raw: unknown) => {
        const value = raw as Record<string, unknown>;
        if (
          !same(Object.keys(value).sort(), [
            "render",
            "revisionId",
            "sound",
            "storyId",
          ])
        ) {
          throw new Error("Composition convergence context is invalid.");
        }
        return {
          storyId: String(value.storyId),
          revisionId: String(value.revisionId),
          render: RenderSpecSchema.parse(value.render),
          sound: ProjectSoundPlanSchema.parse(value.sound),
        };
      },
    },
    "Composition convergence context",
  );
  const result = parseCanonical(
    files["project/convergence.json"]!,
    {
      parse: (raw: unknown) => {
        const value = raw as Record<string, unknown>;
        if (
          !same(Object.keys(value).sort(), [
            "contractVersion",
            "dependencyArtifacts",
            "revisionId",
            "schemaVersion",
            "storyId",
            "taskRevision",
          ]) ||
          value.schemaVersion !== 1 ||
          value.contractVersion !== "composition-convergence-result-v1" ||
          !Array.isArray(value.dependencyArtifacts)
        ) {
          throw new Error("Composition convergence result is invalid.");
        }
        return value;
      },
    },
    "Composition convergence result",
  );
  if (
    context.storyId !== task.storyId ||
    context.revisionId !== task.revisionId ||
    context.sound.storyId !== task.storyId ||
    result.storyId !== task.storyId ||
    result.revisionId !== task.revisionId ||
    result.taskRevision !== task.taskRevision ||
    !same(result.dependencyArtifacts, task.dependencyArtifacts)
  ) {
    throw new Error("Composition convergence output is cross-bound.");
  }
};

const validateDeliveryCandidate = ({
  task,
  files,
}: {
  readonly task: ProducerTaskSpec;
  readonly files: Readonly<Record<string, Uint8Array | string>>;
}) => {
  assertFixedTaskShape(task, "delivery-build");
  assertCandidateFileSet(task, files);
  const context = parseCanonical(
    files["inputs/context.json"]!,
    {
      parse: (raw: unknown) => {
        const value = raw as Record<string, unknown>;
        if (
          !same(Object.keys(value).sort(), [
            "publishingIntent",
            "render",
            "revisionId",
            "storyId",
          ])
        ) {
          throw new Error("Delivery context is invalid.");
        }
        return {
          storyId: String(value.storyId),
          revisionId: String(value.revisionId),
          render: RenderSpecSchema.parse(value.render),
          publishingIntent: PublishingIntentSchema.parse(
            value.publishingIntent,
          ),
        };
      },
    },
    "Delivery context",
  );
  const publish = parseCanonical(
    files["project/publish.json"]!,
    DeliveryPublishSchema,
    "Delivery publish",
  );
  if (
    context.storyId !== task.storyId ||
    context.revisionId !== task.revisionId ||
    context.publishingIntent.storyId !== task.storyId ||
    publish.storyId !== task.storyId ||
    publish.revisionId !== task.revisionId ||
    publish.compositionId !== context.render.compositionId ||
    publish.fps !== context.render.fps ||
    publish.width !== context.render.width ||
    publish.height !== context.render.height ||
    publish.publishing.description !== context.publishingIntent.description ||
    publish.publishing.collection !==
      context.publishingIntent.collection.name ||
    !same(publish.publishing.topics, context.publishingIntent.topics) ||
    !same(
      publish.publishing.chapters.map(({ meaningId, name }) => ({
        meaningId,
        name,
      })),
      context.publishingIntent.chapters,
    )
  ) {
    throw new Error("Delivery publish output is cross-bound.");
  }
};

export const commitConvergenceFixedArtifact = async ({
  rootDir,
  task,
  files,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly files: Readonly<Record<string, Uint8Array | string>>;
}): Promise<ArtifactAttestation> => {
  if (task.taskKind === "composition-convergence") {
    validateCompositionCandidate({ task, files });
  } else if (task.taskKind === "delivery-build") {
    validateDeliveryCandidate({ task, files });
  } else {
    throw new Error("Only converge-owned fixed tasks can be committed here.");
  }
  const staging = await mkdtemp(join(tmpdir(), "rsp-converge-fixed-"));
  try {
    for (const [logicalPath, bytes] of Object.entries(files).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const path = join(staging, logicalPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: "wx" });
    }
    const committed = await commitTaskArtifact({
      rootDir,
      task,
      workspace: staging,
    });
    if (committed.attestation === null) {
      throw new Error(
        "Convergence fixed artifact commit produced no attestation.",
      );
    }
    return committed.attestation;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};

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
  const buildCurrentPlan =
    dependencies.buildCurrentPlan ?? buildCurrentProductionPlan;
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
    dependencies.commitFixedArtifact ?? commitConvergenceFixedArtifact;
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
  const planned = await buildCurrentPlan({
    rootDir,
    projectId,
  });
  let terminalPlan = planned;
  const appendTerminal = async (
    result:
      | Readonly<{
          status: "verified";
          deliveryBuildId: string;
          diagnosticCode: null;
          deliveryMedia: readonly ("video" | "cover-4x3" | "cover-3x4")[];
        }>
      | Readonly<{
          status: "failed";
          deliveryBuildId: null;
          diagnosticCode: string;
          deliveryMedia: readonly [];
        }>,
    attemptRevisionId = revisionId,
  ) => {
    try {
      await appendAttempt({
        rootDir,
        storyId: terminalPlan.revision.storyId,
        revisionId: attemptRevisionId,
        result,
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
        deliveryMedia: [],
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
  const materializedTaskRevisions = new Set(
    selectMaterializedTasks(planned).map(({ taskRevision }) => taskRevision),
  );
  for (const task of selectPreConvergenceTasks(planned)) {
    let attestation: ArtifactAttestation | null;
    try {
      attestation = await inspectArtifact({ rootDir, task });
    } catch (error) {
      await appendTerminal({
        status: "failed",
        deliveryBuildId: null,
        diagnosticCode: "producer-artifact-invalid",
        deliveryMedia: [],
      });
      throw error;
    }
    if (attestation === null) {
      const attemptRecorded = await appendTerminal({
        status: "failed",
        deliveryBuildId: null,
        diagnosticCode: "producer-artifacts-incomplete",
        deliveryMedia: [],
      });
      return {
        status: "producer-artifacts-incomplete" as const,
        revisionId,
        missingTaskRevision: task.taskRevision,
        attemptRecorded,
      };
    }
    if (materializedTaskRevisions.has(task.taskRevision)) {
      artifacts.push({ task, attestation });
    }
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

    const withComposition = await buildCurrentPlan({
      rootDir,
      projectId,
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
    const completed = await buildCurrentPlan({
      rootDir,
      projectId,
    });
    terminalPlan = completed;
    if (
      completed.revision.revisionId !== revisionId ||
      completed.plan.artifactSetFingerprint !==
        withComposition.plan.artifactSetFingerprint ||
      completed.plan.tasks.some(({ action }) => action !== "reuse")
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
      deliveryMedia: delivery.noOp
        ? []
        : [
            ...(delivery.reused.video ? [] : ["video" as const]),
            ...(delivery.reused.cover4x3 ? [] : ["cover-4x3" as const]),
            ...(delivery.reused.cover3x4 ? [] : ["cover-3x4" as const]),
          ],
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
      deliveryMedia: [],
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
