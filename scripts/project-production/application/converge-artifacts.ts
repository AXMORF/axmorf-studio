import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  ProjectSoundPlanSchema,
  RenderSpecSchema,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type DeliveryPolicy,
  type ProducerConfig,
  type ProducerTaskSpec,
} from "../../../src/contracts";
import {
  commitTaskArtifact,
  inspectArtifact as inspectArtifactFromStore,
  resolveArtifactPath,
} from "../adapters/artifact-store";
import { appendExecutionAttemptTerminalResult } from "../adapters/attempt-store";
import {
  materializeOwnerArtifacts as materializeArtifacts,
  verifyMaterializedOwnerArtifacts as verifyMaterializedArtifacts,
  type AdditionalSceneFileManifest,
} from "../adapters/project-materializer";
import { acquireProductionOperationLock } from "../adapters/production-operation-lock";
import {
  checksumBytes,
  readRegularBytes,
} from "../adapters/project-input-snapshot";
import {
  createSourceCurrentAttestation as createCurrentAttestation,
  inspectSourceCurrent as inspectCurrentSource,
  writeSourceCurrent as writeCurrentSource,
} from "../adapters/source-current-store";
import type { DeliveryBuildPort } from "./build-delivery";
import { buildCurrentProductionPlan, contextFile } from "./build-current-plan";
import type { prepareProjectAuthoringBuild } from "./prepare-delivery";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";
import { fingerprintSceneRendererSource } from "../domain/scene-originality";

type PlannedProduction = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;
type BoundArtifact = Readonly<{
  task: ProducerTaskSpec;
  attestation: ArtifactAttestation;
}>;

export type ConvergenceDependencies = Readonly<{
  buildDelivery: DeliveryBuildPort;
  buildCurrentPlan?: typeof buildCurrentProductionPlan;
  inspectArtifact?: typeof inspectArtifactFromStore;
  materializeOwnerArtifacts?: typeof materializeArtifacts;
  verifyMaterializedOwnerArtifacts?: typeof verifyMaterializedArtifacts;
  appendAttempt?: typeof appendExecutionAttemptTerminalResult;
  acquireLock?: typeof acquireProductionOperationLock;
  prepareProject: (
    input: Omit<Parameters<typeof prepareProjectAuthoringBuild>[0], "storage">,
  ) => ReturnType<typeof prepareProjectAuthoringBuild>;
  commitFixedArtifact?: typeof commitConvergenceFixedArtifact;
  createSourceCurrent?: typeof createCurrentAttestation;
  writeSourceCurrent?: typeof writeCurrentSource;
  inspectSourceCurrent?: typeof inspectCurrentSource;
  readPreparedScenePackage?: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
    readonly meaningId: string;
  }) => Promise<Uint8Array>;
  readSceneRendererSource?: (input: {
    readonly locations: ProductionLocations;
    readonly task: ProducerTaskSpec;
  }) => Promise<string>;
}>;

const MATERIALIZED_TASK_KINDS = new Set<ProducerTaskSpec["taskKind"]>([
  "scene-owner",
  "scene-template",
  "global-visual-owner",
  "cover-owner",
]);

export const assertMeaningLocalSceneRenderers = (
  artifacts: readonly BoundArtifact[],
) => {
  const rendererOwners = new Map<string, string>();
  for (const { task, attestation } of artifacts.filter(
    ({ task }) => task.taskKind === "scene-owner",
  )) {
    const rendererChecksum = attestation.outputManifest.find(
      ({ logicalPath }) => logicalPath === "src/Renderer.tsx",
    )?.checksum;
    if (rendererChecksum === undefined) {
      throw new Error("Scene Renderer attestation is missing.");
    }
    const existingMeaningId = rendererOwners.get(rendererChecksum);
    if (existingMeaningId !== undefined) {
      throw new Error(
        `Scene Renderers must be meaning-local; ${existingMeaningId} and ${task.semanticId} are duplicates.`,
      );
    }
    rendererOwners.set(rendererChecksum, String(task.semanticId));
  }
};

const readAttestedSceneRendererSource = async ({
  locations,
  task,
}: {
  readonly locations: ProductionLocations;
  readonly task: ProducerTaskSpec;
}) =>
  readFile(
    join(
      resolveArtifactPath({
        locations,
        storyId: task.storyId,
        taskKind: task.taskKind,
        taskRevision: task.taskRevision,
      }),
      "files/src/Renderer.tsx",
    ),
    "utf8",
  );

export const assertNormalizedMeaningLocalSceneRenderers = async ({
  locations,
  artifacts,
  readSource,
}: {
  readonly locations: ProductionLocations;
  readonly artifacts: readonly BoundArtifact[];
  readonly readSource: NonNullable<
    ConvergenceDependencies["readSceneRendererSource"]
  >;
}) => {
  const rendererOwners = new Map<string, string>();
  for (const { task } of artifacts.filter(
    ({ task }) => task.taskKind === "scene-owner",
  )) {
    const fingerprint = fingerprintSceneRendererSource(
      await readSource({ locations, task }),
    );
    const existingMeaningId = rendererOwners.get(fingerprint);
    if (existingMeaningId !== undefined) {
      throw new Error(
        `Scene Renderers must be meaning-local; ${existingMeaningId} and ${task.semanticId} normalize to duplicates.`,
      );
    }
    rendererOwners.set(fingerprint, String(task.semanticId));
  }
};

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

const validateCompositionCandidate = ({
  task,
  files,
}: {
  readonly task: ProducerTaskSpec;
  readonly files: Readonly<Record<string, Uint8Array | string>>;
}) => {
  if (
    task.taskKind !== "composition-convergence" ||
    task.semanticId !== null ||
    task.validatorPolicyVersion !== "composition-convergence-validator-v1" ||
    !same(task.declaredReadSet, ["inputs/context.json"]) ||
    !same(task.declaredOutputSet, ["project/convergence.json"]) ||
    !same(Object.keys(files).sort(), [
      "inputs/context.json",
      "project/convergence.json",
    ])
  ) {
    throw new Error("Composition convergence task shape is invalid.");
  }
  const contextBytes = files["inputs/context.json"];
  const contextBinding = task.inputFingerprints.find(
    ({ id }) => id === "read:inputs/context.json",
  );
  if (
    contextBytes === undefined ||
    contextBinding === undefined ||
    checksumBytes(asBytes(contextBytes)) !== contextBinding.fingerprint
  ) {
    throw new Error("Composition convergence context is stale.");
  }
  const context = parseCanonical(
    contextBytes,
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

export const commitConvergenceFixedArtifact = async ({
  locations,
  task,
  files,
}: {
  readonly locations: ProductionLocations;
  readonly task: ProducerTaskSpec;
  readonly files: Readonly<Record<string, Uint8Array | string>>;
}): Promise<ArtifactAttestation> => {
  validateCompositionCandidate({ task, files });
  await mkdir(locations.disposableBuildRoot, { recursive: true });
  const disposableRoot = await lstat(locations.disposableBuildRoot);
  if (!disposableRoot.isDirectory() || disposableRoot.isSymbolicLink()) {
    throw new Error("Convergence disposable build root is unsafe.");
  }
  const staging = await mkdtemp(
    join(locations.disposableBuildRoot, "rsp-converge-fixed-"),
  );
  try {
    for (const [logicalPath, bytes] of Object.entries(files).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const path = join(staging, logicalPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: "wx" });
    }
    const committed = await commitTaskArtifact({
      locations,
      task,
      workspace: staging,
    });
    if (committed.attestation === null) {
      throw new Error(
        "Composition convergence commit produced no attestation.",
      );
    }
    return committed.attestation;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};

const requireCompositionTask = (planned: PlannedProduction) => {
  const matches = planned.tasks.filter(
    ({ taskKind }) => taskKind === "composition-convergence",
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error("Producer DAG requires exactly one composition task.");
  }
  return matches[0];
};

const convergeProjectProductionUnlocked = async ({
  locations,
  projectId,
  revisionId,
  attemptId,
  deliveryPolicy,
  config,
  runtime,
  dependencies,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly revisionId: string;
  readonly attemptId: string;
  readonly deliveryPolicy: DeliveryPolicy;
  readonly config: ProducerConfig;
  readonly runtime?: RuntimeExecutionResources;
  readonly dependencies: ConvergenceDependencies;
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
  const appendAttempt =
    dependencies.appendAttempt ?? appendExecutionAttemptTerminalResult;
  const prepareProject = dependencies.prepareProject;
  const commitFixedArtifact =
    dependencies.commitFixedArtifact ?? commitConvergenceFixedArtifact;
  const createSourceCurrent =
    dependencies.createSourceCurrent ?? createCurrentAttestation;
  const writeSourceCurrent =
    dependencies.writeSourceCurrent ?? writeCurrentSource;
  const inspectSourceCurrent =
    dependencies.inspectSourceCurrent ?? inspectCurrentSource;
  const readPreparedScenePackage =
    dependencies.readPreparedScenePackage ??
    (async ({ locations: boundLocations, projectId: storyId, meaningId }) =>
      readRegularBytes(
        join(
          boundLocations.projectSourceRoot,
          storyId,
          "scenes",
          meaningId,
          "generated/scene-package.generated.json",
        ),
        `ScenePackage ${meaningId}`,
      ));

  const planned = await buildCurrentPlan({ locations, projectId, config });
  const appendTerminal = async (
    result: Parameters<typeof appendAttempt>[0]["result"],
    attemptRevisionId = revisionId,
  ) => {
    await appendAttempt({
      locations,
      storyId: planned.revision.storyId,
      revisionId: attemptRevisionId,
      attemptId,
      result,
    });
    return true;
  };
  const failed = (diagnosticCode: string) => ({
    status: "failed" as const,
    sourceCurrentId: null,
    deliveryBuildId: null,
    diagnosticCode,
    deliveryMedia: [] as const,
  });

  if (planned.revision.revisionId !== revisionId) {
    const attemptRecorded = await appendTerminal(
      failed("producer-revision-stale"),
      revisionId,
    );
    return {
      status: "producer-revision-stale" as const,
      currentRevisionId: planned.revision.revisionId,
      attemptRecorded,
    };
  }

  const allArtifacts: BoundArtifact[] = [];
  for (const task of planned.tasks.filter(
    ({ taskKind }) => taskKind !== "composition-convergence",
  )) {
    let attestation: ArtifactAttestation | null;
    try {
      attestation = await inspectArtifact({ locations, task });
    } catch (error) {
      await appendTerminal(failed("producer-artifact-invalid"));
      throw error;
    }
    if (attestation === null) {
      const attemptRecorded = await appendTerminal(
        failed("producer-artifacts-incomplete"),
      );
      return {
        status: "producer-artifacts-incomplete" as const,
        revisionId,
        missingTaskRevision: task.taskRevision,
        attemptRecorded,
      };
    }
    allArtifacts.push({ task, attestation });
  }
  const materializedArtifacts = allArtifacts.filter(({ task }) =>
    MATERIALIZED_TASK_KINDS.has(task.taskKind),
  );
  const sceneTaskInputs = new Map(
    planned.inputs.sceneInputs.map(({ meaningId, taskInput }) => [
      meaningId,
      taskInput,
    ]),
  );

  try {
    if (runtime === undefined) {
      throw new Error("Source convergence requires a verified runtime.");
    }
    assertMeaningLocalSceneRenderers(allArtifacts);
    await assertNormalizedMeaningLocalSceneRenderers({
      locations,
      artifacts: allArtifacts,
      readSource:
        dependencies.readSceneRendererSource ??
        readAttestedSceneRendererSource,
    });
    await materializeOwnerArtifacts({
      locations,
      projectId,
      artifacts: materializedArtifacts,
      sceneTaskInputs,
    });
    const verifyOwnerMaterialized = () =>
      verifyMaterializedOwnerArtifacts({
        locations,
        projectId,
        artifacts: materializedArtifacts,
        sceneTaskInputs,
      });
    await verifyOwnerMaterialized();
    const prepared = await prepareProject({
      locations,
      runtime,
      projectId,
      mode: "write",
    });
    const additionalSceneEntries: Array<
      readonly [
        string,
        ReadonlyMap<string, { checksum: string; sizeBytes: number }>,
      ]
    > = [];
    for (const { task } of materializedArtifacts) {
      if (
        (task.taskKind !== "scene-owner" &&
          task.taskKind !== "scene-template") ||
        task.semanticId === null
      ) {
        continue;
      }
      const bytes = await readPreparedScenePackage({
        locations,
        projectId,
        meaningId: task.semanticId,
      });
      additionalSceneEntries.push([
        task.semanticId,
        new Map([
          [
            "generated/scene-package.generated.json",
            { checksum: checksumBytes(bytes), sizeBytes: bytes.byteLength },
          ],
        ]),
      ]);
    }
    const additionalSceneFiles: AdditionalSceneFileManifest = new Map(
      additionalSceneEntries,
    );
    const verifyPreparedMaterialized = () =>
      verifyMaterializedOwnerArtifacts({
        locations,
        projectId,
        artifacts: materializedArtifacts,
        sceneTaskInputs,
        additionalSceneFiles,
      });
    await verifyPreparedMaterialized();

    const compositionTask = requireCompositionTask(planned);
    const compositionContext = contextFile({
      storyId: planned.inputs.projectId,
      revisionId,
      render: planned.inputs.render,
      sound: planned.inputs.sound,
    });
    const compositionAttestation = await commitFixedArtifact({
      locations,
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
    const completed = await buildCurrentPlan({ locations, projectId, config });
    if (
      completed.revision.revisionId !== revisionId ||
      completed.plan.tasks.some(({ action }) => action !== "reuse")
    ) {
      throw new Error(
        "Source production DAG did not converge to a reused plan.",
      );
    }
    await verifyPreparedMaterialized();
    const sourceCurrent = await createSourceCurrent({
      locations,
      storyId: projectId,
      revisionId,
      artifacts: [
        ...allArtifacts.map(({ attestation }) => attestation),
        compositionAttestation,
      ],
    });
    await writeSourceCurrent({ locations, attestation: sourceCurrent });
    if (
      (await inspectSourceCurrent({ locations, expected: sourceCurrent })) ===
      null
    ) {
      throw new Error("Source current write was not durable.");
    }
    await verifyPreparedMaterialized();

    if (deliveryPolicy === "manual") {
      const attemptRecorded = await appendTerminal({
        status: "source-current",
        sourceCurrentId: sourceCurrent.sourceCurrentId,
        deliveryBuildId: null,
        diagnosticCode: null,
        deliveryMedia: [],
      });
      return {
        status: "project-production-source-current" as const,
        revisionId,
        sourceCurrent,
        attemptRecorded,
      };
    }
    const delivery = await dependencies.buildDelivery({
      locations,
      runtime,
      config,
      projectId,
      revisionId,
      sourceCurrentId: sourceCurrent.sourceCurrentId,
      dependencies: {
        verifyMaterialized: verifyPreparedMaterialized,
        prepare: async () => prepared,
      },
    });
    await verifyPreparedMaterialized();
    const attemptRecorded = await appendTerminal({
      status: "delivery-current",
      sourceCurrentId: sourceCurrent.sourceCurrentId,
      deliveryBuildId: delivery.deliveryBuildId,
      diagnosticCode: null,
      deliveryMedia:
        delivery.reused !== undefined
          ? [
              ...(delivery.reused.video ? [] : ["video" as const]),
              ...(delivery.reused.cover4x3 ? [] : ["cover-4x3" as const]),
              ...(delivery.reused.cover3x4 ? [] : ["cover-3x4" as const]),
            ]
          : [],
    });
    return {
      status: delivery.status,
      revisionId,
      sourceCurrent,
      delivery,
      attemptRecorded,
    } as const;
  } catch (error) {
    await appendTerminal(failed("project-production-convergence-failed"));
    throw error;
  }
};

export const convergeProjectProduction = async (
  input: Parameters<typeof convergeProjectProductionUnlocked>[0],
) => {
  const acquireLock =
    input.dependencies?.acquireLock ?? acquireProductionOperationLock;
  const lock = await acquireLock({
    locations: input.locations,
    ownerId: "project-production-converge",
  });
  try {
    return await convergeProjectProductionUnlocked(input);
  } finally {
    await lock.release();
  }
};

export type ProductionConvergencePort = (
  input: Omit<Parameters<typeof convergeProjectProduction>[0], "dependencies">,
) => ReturnType<typeof convergeProjectProduction>;
