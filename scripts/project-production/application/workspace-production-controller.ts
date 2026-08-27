import {
  DeliveryPolicySchema,
  ProjectRevisionInputSchema,
  ProducerConfigSchema,
  resolveDeliveryPolicy,
  type DeliveryPolicy,
  type ProducerConfig,
  type ProducerTaskSpec,
  type Sha256Digest,
} from "../../../src/contracts";
import {
  resolveAgentExecution,
  type AgentExecutionOverride,
  type ExecutionPreferenceSource,
  type ExecutionPreferences,
} from "../../../settings/contracts/execution-preferences";
import {
  loadWorkspaceExecutionPreferences,
  loadWorkspaceProjectControlSettings,
} from "../../../desktop/adapters/workspace-context-settings";
import { WorkspaceContextProjectionSchema } from "../../../desktop/contracts/workspace-context";
import { importWorkspaceProjectAsset } from "../../projects/workspace-project";
import {
  createWorkspaceProject,
  deleteWorkspaceProject,
  listWorkspaceProjects,
  readWorkspaceProjectContext,
} from "../../projects/workspace-project";
import {
  appendExecutionAttemptTaskOutcome,
  assertExecutionAttemptTaskAuthority,
  readExecutionAttemptProgress,
} from "../adapters/attempt-store";
import { readLatestExecutionAttempt } from "../adapters/progress";
import {
  createRspLocalProductionCommandFormatter,
  rspLocalProductionCommandFormatter,
} from "../adapters/rsp-local-command-formatter";
import { readTaskWorkspace } from "../adapters/task-workspace";
import {
  inspectSourceCurrent,
  readSourceCurrent,
} from "../adapters/source-current-store";
import { commitProducerTaskArtifact } from "./commit-task-artifact";
import { continueProjectProduction } from "./continue-production";
import { convergeProjectProduction } from "./converge-artifacts";
import { checkTaskByKind } from "./check-task";
import { inspectProjectProduction } from "./inspect-production";
import { prepareProjectProduction } from "./prepare-production";
import {
  createProjectProductionController,
  type ProductionControllerCommandPorts,
} from "./production-controller";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";
import {
  prepareWorkspaceNarration,
  type WorkspacePrepareNarration,
} from "./workspace-narration-port";
import { prepareProjectAuthoringBuild } from "./prepare-delivery";
import { createWorkspaceProjectStorageLocations } from "../../projects/project-locations";
import { generateWorkspaceProjectResourceCatalog } from "../../catalog/generate";
import { generateProjectRegistry } from "../../registry/generate";
import { projectPendingSceneAuthoring } from "../../projects/application/project-pending-authoring";
import {
  createProjectRevisionCandidate,
  promoteProjectRevisionCandidate,
  readProjectRevisionCandidateRecord,
  readProjectRevisionContext,
  validateProjectRevisionAuthoring,
} from "../../projects/application/project-revision";
import { createProjectRevisionCandidateLocations } from "./project-revision-locations";
import { loadProjectProductionInputs } from "./load-inputs";
import { buildCurrentProductionPlan } from "./build-current-plan";
import { buildCurrentDelivery, type DeliveryBuildPort } from "./build-delivery";
import {
  captureProductionInspectionSnapshot,
  inspectCurrentDelivery,
  inspectProductionSourceReadiness,
  readProductionDiagnosticBaseline,
} from "../adapters/production-inspection";
import { createRuntimeDeliveryInspectionDependencies } from "../adapters/current-delivery-inspection";
import {
  finalizeAgentTaskWorkspace,
  readAgentTaskExecutionContract,
} from "./finalize-agent-task";
import {
  buildRspProjectCreateContext,
  validateRspProjectCreate,
} from "../../../desktop/application/project-create-contract";
import { rspCaptionReadabilityIssues } from "../../../desktop/application/caption-readability-contract";
import { RspPublicCommandError } from "../../../desktop/contracts/issues";
import { rspZodIssues } from "../../../desktop/contracts/issues";
import {
  publicPrepareCommandError,
  publicTaskCommandError,
} from "../../../desktop/application/public-command-errors";

const workspaceLoadInputs = (
  input: Parameters<typeof loadProjectProductionInputs>[0],
) =>
  loadProjectProductionInputs(input, generateWorkspaceProjectResourceCatalog);

const workspaceBuildCurrentPlan = async (
  input: Parameters<typeof buildCurrentProductionPlan>[0],
  runtime: RuntimeExecutionResources,
) =>
  buildCurrentProductionPlan({
    ...input,
    loadInputs: workspaceLoadInputs,
    baseline:
      input.baseline === undefined
        ? await readProductionDiagnosticBaseline({
            locations: input.locations,
            projectId: input.projectId,
            dependencies: createRuntimeDeliveryInspectionDependencies(runtime),
          })
        : input.baseline,
  });

const workspaceInspectProduction = (
  input: Parameters<typeof inspectProjectProduction>[0],
) =>
  inspectProjectProduction(input, {
    captureSnapshot: ({ locations, projectId }) =>
      captureProductionInspectionSnapshot({
        locations,
        projectId,
        catalogProjectionPath:
          createWorkspaceProjectStorageLocations(locations)
            .catalogProjectionPath,
      }),
    inspectReadiness: (readinessInput) =>
      inspectProductionSourceReadiness(
        readinessInput,
        generateWorkspaceProjectResourceCatalog,
      ),
    inspectDelivery: ({ locations, projectId }) =>
      inspectCurrentDelivery({
        locations,
        projectId,
        dependencies: createRuntimeDeliveryInspectionDependencies(
          input.runtime,
        ),
      }),
    buildCurrentPlan: (planInput) =>
      workspaceBuildCurrentPlan(planInput, input.runtime),
  });

const workspaceProjectPendingAuthoring = (
  input: Parameters<typeof projectPendingSceneAuthoring>[0],
) =>
  projectPendingSceneAuthoring(input, generateWorkspaceProjectResourceCatalog);

export const DESKTOP_PRODUCER_CONFIG_REQUIRED =
  "desktop-producer-config-required" as const;

export type WorkspaceProductionDeliveryPort = Readonly<{
  build: DeliveryBuildPort;
  buildUnlocked: DeliveryBuildPort;
  shutdown: () => Promise<void>;
}>;

const recordTaskOutcome = async ({
  locations,
  attemptId,
  task,
  outcome,
}: {
  readonly locations: ProductionLocations;
  readonly attemptId: string;
  readonly task: ProducerTaskSpec;
  readonly outcome:
    | Readonly<{
        outcome: "artifact-committed" | "artifact-current";
        artifactFingerprint: Sha256Digest;
        diagnosticCode: null;
      }>
    | Readonly<{
        outcome: "failed";
        artifactFingerprint: null;
        diagnosticCode:
          | "producer-task-commit-failed"
          | "producer-agent-task-failed"
          | "producer-agent-host-failed";
      }>;
}) =>
  appendExecutionAttemptTaskOutcome({ locations, attemptId, task, outcome });

const createWorkspaceCommands = (
  delivery: WorkspaceProductionDeliveryPort,
  prepareNarration: WorkspacePrepareNarration,
  commandFormatter = rspLocalProductionCommandFormatter,
): ProductionControllerCommandPorts => ({
  context: ({ locations, projectId }) =>
    readWorkspaceProjectContext({ locations, projectId }),
  createProject: ({ locations, runtime, config, request }) =>
    createWorkspaceProject({ locations, runtime, config, input: request }),
  importAsset: ({ locations, request }) => {
    const input = request as Readonly<Record<string, unknown>>;
    const role = input.role;
    const candidateBase64 = input.candidateBase64;
    if (
      (role !== "scene-visual" && role !== "global-visual") ||
      typeof candidateBase64 !== "string"
    ) {
      throw new Error("Workspace asset import request is invalid.");
    }
    return importWorkspaceProjectAsset({
      locations,
      projectId: String(input.storyId),
      role,
      receipt: input.receipt,
      candidateBase64,
    });
  },
  inspect: ({ locations, runtime, config, projectId }) =>
    workspaceInspectProduction({ locations, runtime, config, projectId }),
  prepare: ({ locations, runtime, config, projectId, deliveryPolicy }) =>
    prepareProjectProduction(
      { locations, runtime, config, projectId, deliveryPolicy },
      {
        commandFormatter,
        inspect: workspaceInspectProduction,
        prepareNarration,
        projectPendingAuthoring: workspaceProjectPendingAuthoring,
        loadInputs: workspaceLoadInputs,
        buildCurrentPlan: (planInput) =>
          workspaceBuildCurrentPlan(planInput, runtime),
      },
    ),
  checkTask: ({ locations, taskRevision }) =>
    checkTaskByKind({ locations, taskRevision }),
  commitTask: async ({ locations, taskRevision, attemptId }) => {
    const { task } = await readTaskWorkspace({ locations, taskRevision });
    await assertExecutionAttemptTaskAuthority({ locations, attemptId, task });
    try {
      const result = await commitProducerTaskArtifact({
        locations,
        taskRevision,
      });
      if (result.attestation === null) {
        throw new Error("Committed artifact attestation is missing.");
      }
      await recordTaskOutcome({
        locations,
        attemptId,
        task,
        outcome: {
          outcome: result.reused ? "artifact-current" : "artifact-committed",
          artifactFingerprint: result.attestation.artifactFingerprint,
          diagnosticCode: null,
        },
      });
      return {
        status: result.reused
          ? ("producer-artifact-current" as const)
          : ("producer-artifact-committed" as const),
        artifact: result.attestation,
        attemptRecorded: true,
      };
    } catch (error) {
      await recordTaskOutcome({
        locations,
        attemptId,
        task,
        outcome: {
          outcome: "failed",
          artifactFingerprint: null,
          diagnosticCode: "producer-task-commit-failed",
        },
      });
      throw error;
    }
  },
  failTask: async ({ locations, taskRevision, attemptId, kind }) => {
    const { task } = await readTaskWorkspace({ locations, taskRevision });
    await assertExecutionAttemptTaskAuthority({ locations, attemptId, task });
    await recordTaskOutcome({
      locations,
      attemptId,
      task,
      outcome: {
        outcome: "failed",
        artifactFingerprint: null,
        diagnosticCode:
          kind === "task"
            ? "producer-agent-task-failed"
            : "producer-agent-host-failed",
      },
    });
    return {
      status: "producer-task-failure-recorded" as const,
      taskRevision,
      attemptId,
      kind,
    };
  },
  continueProduction: (input) =>
    continueProjectProduction(input, {
      converge: (convergeInput) =>
        convergeProjectProduction({
          ...convergeInput,
          dependencies: {
            buildDelivery: delivery.buildUnlocked,
            buildCurrentPlan: (planInput) =>
              workspaceBuildCurrentPlan(planInput, input.runtime),
            prepareProject: (input) =>
              prepareProjectAuthoringBuild({
                ...input,
                storage: createWorkspaceProjectStorageLocations(
                  input.locations,
                ),
              }),
          },
        }),
    }),
  buildDelivery: (input) =>
    buildCurrentDelivery(input, {
      buildCurrentPlan: (planInput) =>
        workspaceBuildCurrentPlan(planInput, input.runtime),
      build: delivery.build,
    }),
});

export const createWorkspaceProductionController = async ({
  locations,
  runtime,
  delivery,
  loadProducerConfig,
  providerReadiness,
  appDefaultDeliveryPolicy = "manual",
  runtimeMaxConcurrency,
  loadExecutionPreferences,
  prepareNarration = prepareWorkspaceNarration,
}: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly delivery: WorkspaceProductionDeliveryPort;
  readonly loadProducerConfig: () => Promise<ProducerConfig | null>;
  readonly providerReadiness?: "ready" | "not-configured" | "unavailable";
  readonly appDefaultDeliveryPolicy?: DeliveryPolicy;
  readonly runtimeMaxConcurrency?: number;
  readonly loadExecutionPreferences?: () => Promise<
    Readonly<{
      preferences: ExecutionPreferences;
      source: ExecutionPreferenceSource;
    }>
  >;
  readonly prepareNarration?: WorkspacePrepareNarration;
}) => {
  if (locations.layoutKind !== "workspace") {
    throw new Error(
      "Workspace production controller requires Workspace locations.",
    );
  }
  const workspaceCommands = createWorkspaceCommands(delivery, prepareNarration);
  const readConfig = async () => {
    const config = await loadProducerConfig();
    return config === null ? null : ProducerConfigSchema.parse(config);
  };
  const appDefault = DeliveryPolicySchema.parse(appDefaultDeliveryPolicy);
  const readExecutionPreferences =
    loadExecutionPreferences ??
    (() =>
      loadWorkspaceExecutionPreferences({
        privateConfigRoot: locations.privateConfigRoot,
      }));
  const resolveProjectDeliveryPolicy = async ({
    projectId,
    override,
  }: {
    readonly projectId: string;
    readonly override?: DeliveryPolicy;
  }) => {
    const projectSettings = await loadWorkspaceProjectControlSettings({
      privateConfigRoot: locations.privateConfigRoot,
      storyId: projectId,
    });
    return {
      value: resolveDeliveryPolicy({
        override,
        project: projectSettings?.deliveryPolicy,
        appDefault,
      }),
      source:
        override !== undefined
          ? ("command-override" as const)
          : projectSettings !== null
            ? ("project-setting" as const)
            : ("app-default" as const),
    };
  };
  const context = async ({
    projectId,
    productionLocations = locations,
    deliveryPolicy,
    execution,
    commandRuntimeMaxConcurrency,
  }: {
    readonly projectId: string;
    readonly productionLocations?: ProductionLocations;
    readonly deliveryPolicy?: DeliveryPolicy;
    readonly execution?: AgentExecutionOverride;
    readonly commandRuntimeMaxConcurrency?: number;
  }) => {
    const [project, config, resolvedDeliveryPolicy, executionPreferences] =
      await Promise.all([
        workspaceCommands.context({
          locations: productionLocations,
          projectId,
        }),
        readConfig(),
        resolveProjectDeliveryPolicy({ projectId, override: deliveryPolicy }),
        readExecutionPreferences(),
      ]);
    const readiness =
      providerReadiness ?? (config === null ? "not-configured" : "ready");
    if ((readiness === "ready") !== (config !== null)) {
      throw new Error("Workspace provider readiness and config disagree.");
    }
    const defaultProvider =
      config === null
        ? null
        : (config.tts.providers.find(
            ({ id }) => id === config.tts.defaultProviderId,
          ) ?? null);
    if (config !== null && defaultProvider === null) {
      throw new Error("Workspace default provider config is stale.");
    }
    return WorkspaceContextProjectionSchema.parse({
      schemaVersion: 1,
      contractVersion: "rsp-workspace-context-v1",
      ...(project as Readonly<Record<string, unknown>>),
      controlPlane: {
        provider: {
          readiness,
          configState: config === null ? "not-configured" : "configured",
          defaultProviderKind: defaultProvider?.kind ?? null,
          defaultVoiceProfileId: config?.tts.defaultVoiceProfileId ?? null,
        },
        deliveryPolicy: resolvedDeliveryPolicy,
        execution: resolveAgentExecution({
          preferences: executionPreferences.preferences,
          preferenceSource: executionPreferences.source,
          ...(execution === undefined ? {} : { override: execution }),
          ...((commandRuntimeMaxConcurrency ?? runtimeMaxConcurrency) ===
          undefined
            ? {}
            : {
                runtimeMaxConcurrency:
                  commandRuntimeMaxConcurrency ?? runtimeMaxConcurrency,
              }),
        }),
      },
    });
  };
  const requireConfig = async () => {
    const config = await readConfig();
    if (config !== null) return config;
    const error = new Error(DESKTOP_PRODUCER_CONFIG_REQUIRED) as Error & {
      code: typeof DESKTOP_PRODUCER_CONFIG_REQUIRED;
    };
    error.code = DESKTOP_PRODUCER_CONFIG_REQUIRED;
    throw error;
  };
  const requireCurrentDelivery = async ({
    projectId,
    productionLocations = locations,
  }: {
    readonly projectId: string;
    readonly productionLocations?: ProductionLocations;
  }) => {
    const delivery = await inspectCurrentDelivery({
      locations: productionLocations,
      projectId,
      dependencies: createRuntimeDeliveryInspectionDependencies(runtime),
    });
    const sourceCurrent = await readSourceCurrent({
      locations: productionLocations,
      storyId: projectId,
    });
    if (
      !delivery.current ||
      delivery.revisionId === null ||
      delivery.sourceCurrentId === null ||
      delivery.deliveryBuildId === null ||
      sourceCurrent === null ||
      sourceCurrent.revisionId !== delivery.revisionId ||
      sourceCurrent.sourceCurrentId !== delivery.sourceCurrentId ||
      (await inspectSourceCurrent({
        locations: productionLocations,
        expected: sourceCurrent,
      })) === null
    ) {
      throw new RspPublicCommandError(
        "rsp-command-failed",
        "Project revision requires an exact current Delivery.",
        [
          {
            path: "$.storyId",
            code: "rsp-project-revision-current-delivery-required",
            message:
              "The selected Project does not have a verified current four-file Delivery.",
            ownerAction:
              "Finish the current Project production before starting a revision.",
          },
        ],
      );
    }
    return {
      currentRevisionId: delivery.revisionId,
      sourceCurrentId: delivery.sourceCurrentId,
      deliveryBuildId: delivery.deliveryBuildId,
    };
  };
  const candidateScope = async ({
    projectId,
    candidateId,
  }: {
    readonly projectId: string;
    readonly candidateId: string;
  }) => {
    const record = await readProjectRevisionCandidateRecord({
      locations,
      storyId: projectId,
      candidateId,
    });
    if (record.input.storyId !== projectId) {
      throw new Error("Project revision candidate Project binding is stale.");
    }
    return createProjectRevisionCandidateLocations({
      locations,
      storyId: projectId,
      candidateId,
    });
  };
  const promoteCandidate = async ({
    projectId,
    candidateId,
  }: {
    readonly projectId: string;
    readonly candidateId: string;
  }) =>
    promoteProjectRevisionCandidate({
      locations,
      storyId: projectId,
      candidateId,
      readCurrent: () => requireCurrentDelivery({ projectId }),
      regenerate: async () => {
        await generateWorkspaceProjectResourceCatalog({
          locations,
          projectId,
          mode: "write",
        });
        await generateProjectRegistry({
          storage: createWorkspaceProjectStorageLocations(locations),
          mode: "write",
        });
      },
      verify: () => requireCurrentDelivery({ projectId }),
    });
  const projectCreateContext = async () => {
    const config = await readConfig();
    return buildRspProjectCreateContext({
      locations,
      config,
      providerReadiness:
        providerReadiness ?? (config === null ? "not-configured" : "ready"),
    });
  };
  const validateProjectCreate = async (input: unknown) =>
    validateRspProjectCreate({
      locations,
      config: await readConfig(),
      input,
    });
  const createProjectPublic = async (input: unknown) => {
    const validation = await validateProjectCreate(input);
    if (validation.status === "project-create-invalid") {
      throw new RspPublicCommandError(
        "rsp-command-failed",
        "Project create input failed operational validation.",
        validation.issues,
      );
    }
    return (await withConfig()).createProject(input);
  };
  const projectRevisionContext = async (projectId: string) => {
    return readProjectRevisionContext({
      locations,
      projectId,
      current: await requireCurrentDelivery({ projectId }),
    });
  };
  const validateProjectRevision = async (input: unknown) => {
    const parsed = ProjectRevisionInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        schemaVersion: 1,
        contractVersion: "rsp-project-revision-validation-v1",
        status: "project-revision-invalid" as const,
        storyId: null,
        issues: rspZodIssues({
          error: parsed.error,
          codePrefix: "rsp-project-revision",
          ownerAction:
            "Use the exact raw contract returned by rsp schema project-revision.",
        }),
      };
    }
    if (parsed.data.patch.story !== undefined) {
      const readabilityIssues = rspCaptionReadabilityIssues({
        story: parsed.data.patch.story,
        pathPrefix: "$.patch.story",
      });
      if (readabilityIssues.length > 0) {
        return {
          schemaVersion: 1,
          contractVersion: "rsp-project-revision-validation-v1",
          status: "project-revision-invalid" as const,
          storyId: parsed.data.storyId,
          issues: readabilityIssues,
        };
      }
    }
    try {
      const current = await requireCurrentDelivery({
        projectId: parsed.data.storyId,
      });
      if (current.currentRevisionId !== parsed.data.baseRevisionId) {
        return {
          schemaVersion: 1,
          contractVersion: "rsp-project-revision-validation-v1",
          status: "project-revision-invalid" as const,
          storyId: parsed.data.storyId,
          issues: [
            {
              path: "$.baseRevisionId",
              code: "rsp-project-revision-base-stale",
              message:
                "baseRevisionId does not match the exact current Project revision.",
              ownerAction:
                "Read a fresh revise-context and rebuild the raw revision input.",
            },
          ],
        };
      }
      try {
        await validateProjectRevisionAuthoring({
          locations,
          input: parsed.data,
        });
      } catch {
        return {
          schemaVersion: 1,
          contractVersion: "rsp-project-revision-validation-v1",
          status: "project-revision-invalid" as const,
          storyId: parsed.data.storyId,
          issues: [
            {
              path: "$.patch",
              code: "rsp-project-revision-authoring-invalid",
              message:
                "Project revision patch does not preserve current authored Project constraints or does not change current authoring.",
              ownerAction:
                "Preserve narrated meaningIds and order, and change at least one authored section from revise-context.",
            },
          ],
        };
      }
      return {
        schemaVersion: 1,
        contractVersion: "rsp-project-revision-validation-v1",
        status: "project-revision-valid" as const,
        storyId: parsed.data.storyId,
        issues: [] as const,
      };
    } catch (error) {
      if (error instanceof RspPublicCommandError) {
        return {
          schemaVersion: 1,
          contractVersion: "rsp-project-revision-validation-v1",
          status: "project-revision-invalid" as const,
          storyId: parsed.data.storyId,
          issues: error.issues,
        };
      }
      throw error;
    }
  };
  const createProjectRevisionPublic = async (input: unknown) => {
    const validation = await validateProjectRevision(input);
    if (validation.status === "project-revision-invalid") {
      throw new RspPublicCommandError(
        "rsp-command-failed",
        "Project revision input failed operational validation.",
        validation.issues,
      );
    }
    const parsed = ProjectRevisionInputSchema.parse(input);
    const config = await requireConfig();
    try {
      return await createProjectRevisionCandidate({
        locations,
        config,
        input: parsed,
        current: await requireCurrentDelivery({
          projectId: parsed.storyId,
        }),
        verifyCurrent: () =>
          requireCurrentDelivery({
            projectId: parsed.storyId,
          }),
      });
    } catch (error) {
      if (error instanceof RspPublicCommandError) throw error;
      throw new RspPublicCommandError(
        "rsp-command-failed",
        "Project revision candidate could not be created.",
        [
          {
            path: "$.patch",
            code: "rsp-project-revision-candidate-invalid",
            message:
              "Project revision candidate does not satisfy current Project, Catalog, or ProducerConfig constraints.",
            ownerAction:
              "Read a fresh revise-context, run revise-validate, then retry with corrected authored fields.",
          },
        ],
      );
    }
  };
  const withConfig = async () =>
    createProjectProductionController({
      locations,
      runtime,
      config: await requireConfig(),
      commands: workspaceCommands,
    });
  const inspect = async (projectId: string, candidateId?: string) => {
    const config = await readConfig();
    const productionLocations =
      candidateId === undefined
        ? locations
        : await candidateScope({ projectId, candidateId });
    return config === null
      ? {
          status: DESKTOP_PRODUCER_CONFIG_REQUIRED,
          storyId: projectId,
          nextAction: "configure-provider" as const,
        }
      : workspaceCommands.inspect({
          locations: productionLocations,
          runtime,
          config,
          projectId,
        });
  };
  const prepare = async (
    projectId: string,
    deliveryPolicy?: DeliveryPolicy,
    candidateId?: string,
  ) => {
    try {
      if (candidateId !== undefined && deliveryPolicy === "manual") {
        throw new RspPublicCommandError(
          "rsp-command-failed",
          "Project revision candidates require automatic Delivery.",
          [
            {
              path: "$.deliveryPolicy",
              code: "rsp-project-revision-automatic-delivery-required",
              message:
                "A candidate may replace current only after its complete Delivery is verified.",
              ownerAction: "Use --delivery-policy automatic or omit the option.",
            },
          ],
        );
      }
      if (candidateId !== undefined) {
        const config = await requireConfig();
        const productionLocations = await candidateScope({
          projectId,
          candidateId,
        });
        const candidateCommands = createWorkspaceCommands(
          delivery,
          prepareNarration,
          createRspLocalProductionCommandFormatter(candidateId),
        );
        return await candidateCommands.prepare({
          locations: productionLocations,
          runtime,
          config,
          projectId,
          deliveryPolicy: "automatic",
        });
      }
      const resolved = await resolveProjectDeliveryPolicy({
        projectId,
        override: deliveryPolicy,
      });
      return await (await withConfig()).prepare(projectId, resolved.value);
    } catch (error) {
      if (error instanceof RspPublicCommandError) throw error;
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === DESKTOP_PRODUCER_CONFIG_REQUIRED
      ) {
        throw error;
      }
      throw publicPrepareCommandError(error);
    }
  };
  const continueCandidate = async ({
    projectId,
    revisionId,
    attemptId,
    candidateId,
    deliveryPolicy,
  }: {
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly candidateId: string;
    readonly deliveryPolicy: DeliveryPolicy;
  }) => {
    if (deliveryPolicy !== "automatic") {
      throw new RspPublicCommandError(
        "rsp-command-failed",
        "Project revision candidates require automatic Delivery.",
      );
    }
    const config = await requireConfig();
    const productionLocations = await candidateScope({
      projectId,
      candidateId,
    });
    const candidateCommands = createWorkspaceCommands(
      delivery,
      prepareNarration,
      createRspLocalProductionCommandFormatter(candidateId),
    );
    const production = await candidateCommands.continueProduction({
      locations: productionLocations,
      runtime,
      config,
      projectId,
      revisionId,
      attemptId,
      deliveryPolicy: "automatic",
    });
    const promotion = await promoteCandidate({
      projectId,
      candidateId,
    });
    return {
      status: "project-revision-complete" as const,
      storyId: projectId,
      candidateId,
      production,
      promotion,
    };
  };
  const buildCandidateDelivery = async ({
    projectId,
    candidateId,
  }: {
    readonly projectId: string;
    readonly candidateId: string;
  }) => {
    const config = await requireConfig();
    const productionLocations = await candidateScope({
      projectId,
      candidateId,
    });
    const candidateCommands = createWorkspaceCommands(
      delivery,
      prepareNarration,
      createRspLocalProductionCommandFormatter(candidateId),
    );
    const production = await candidateCommands.buildDelivery({
      locations: productionLocations,
      runtime,
      config,
      projectId,
    });
    const promotion = await promoteCandidate({
      projectId,
      candidateId,
    });
    return {
      status: "project-revision-complete" as const,
      storyId: projectId,
      candidateId,
      production,
      promotion,
    };
  };
  const publicTaskOperation = async <Result>(
    operation: "describe" | "finalize" | "check" | "commit",
    run: () => Promise<Result>,
  ) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof RspPublicCommandError) throw error;
      throw publicTaskCommandError({ operation, error });
    }
  };
  const execute = async (request: Readonly<Record<string, unknown>>) => {
    switch (request.command) {
      case "project-create-context":
        return projectCreateContext();
      case "project-validate":
        return validateProjectCreate(request.input);
      case "project-revise-context":
        return projectRevisionContext(String(request.storyId));
      case "project-revise-validate":
        return validateProjectRevision(request.input);
      case "project-revise":
        return createProjectRevisionPublic(request.input);
      case "project-list":
        return listWorkspaceProjects({ locations });
      case "project-delete":
        return deleteWorkspaceProject({
          locations,
          projectId: String(request.storyId),
        });
      case "context":
        return context({
          projectId: String(request.storyId),
          ...(request.candidateId === undefined
            ? {}
            : {
                productionLocations: await candidateScope({
                  projectId: String(request.storyId),
                  candidateId: String(request.candidateId),
                }),
              }),
          deliveryPolicy:
            request.candidateId === undefined
              ? (request.deliveryPolicy as DeliveryPolicy | undefined)
              : "automatic",
          execution: request.execution as AgentExecutionOverride | undefined,
          commandRuntimeMaxConcurrency: request.runtimeMaxConcurrency as
            | number
            | undefined,
        });
      case "asset-import":
        return workspaceCommands.importAsset({ locations, request });
      case "inspect":
        return inspect(
          String(request.storyId),
          request.candidateId === undefined
            ? undefined
            : String(request.candidateId),
        );
      case "project-create":
        return createProjectPublic(request.input);
      case "prepare":
        return prepare(
          String(request.storyId),
          request.deliveryPolicy as DeliveryPolicy | undefined,
          request.candidateId === undefined
            ? undefined
            : String(request.candidateId),
        );
      case "task-check":
        return publicTaskOperation("check", () =>
          workspaceCommands.checkTask({
            locations,
            taskRevision: String(request.taskRevision),
          }),
        );
      case "task-describe":
        return publicTaskOperation("describe", () =>
          readAgentTaskExecutionContract({
            locations,
            taskRevision: String(request.taskRevision),
          }),
        );
      case "task-finalize":
        return publicTaskOperation("finalize", () =>
          finalizeAgentTaskWorkspace({
            locations,
            taskRevision: String(request.taskRevision),
          }),
        );
      case "task-commit":
        return publicTaskOperation("commit", () =>
          workspaceCommands.commitTask({
            locations,
            taskRevision: String(request.taskRevision),
            attemptId: String(request.attemptId),
          }),
        );
      case "task-fail":
        return workspaceCommands.failTask({
          locations,
          taskRevision: String(request.taskRevision),
          attemptId: String(request.attemptId),
          kind: request.kind as "task" | "host",
        });
      case "continue":
        return request.candidateId === undefined
          ? (await withConfig()).continueProduction({
              projectId: String(request.storyId),
              revisionId: String(request.revisionId),
              attemptId: String(request.attemptId),
              deliveryPolicy: request.deliveryPolicy as DeliveryPolicy,
            })
          : continueCandidate({
              projectId: String(request.storyId),
              revisionId: String(request.revisionId),
              attemptId: String(request.attemptId),
              candidateId: String(request.candidateId),
              deliveryPolicy: request.deliveryPolicy as DeliveryPolicy,
            });
      case "attempt-status": {
        const attempt = await readExecutionAttemptProgress({
          locations,
          storyId: String(request.storyId),
          attemptId: String(request.attemptId),
        });
        if (attempt === null) {
          throw new RspPublicCommandError(
            "rsp-command-failed",
            "Execution attempt was not found.",
            [
              {
                path: "$.attemptId",
                code: "rsp-attempt-not-found",
                message:
                  "No execution attempt exists for this Project and attemptId.",
                ownerAction: "Use the exact attemptId returned by rsp prepare.",
              },
            ],
          );
        }
        return {
          status: "execution-attempt-status" as const,
          storyId: attempt.storyId,
          revisionId: attempt.revisionId,
          attemptId: attempt.attemptId,
          state: attempt.state,
          createdAt: attempt.createdAt,
          updatedAt: attempt.updatedAt,
          dirtyTaskRevisions: attempt.dirtyTaskRevisions,
          taskSummary: attempt.taskSummary,
          taskOutcomeSummary: attempt.taskOutcomeSummary,
          eventCount: attempt.eventCount,
          taskOutcomes: attempt.taskOutcomes,
          terminalResult: attempt.terminalResult,
          diagnosticCode: attempt.diagnosticCode,
        };
      }
      case "delivery-build":
        return request.candidateId === undefined
          ? (await withConfig()).buildDelivery(String(request.storyId))
          : buildCandidateDelivery({
              projectId: String(request.storyId),
              candidateId: String(request.candidateId),
            });
      default:
        throw new Error("Unsupported Workspace production command.");
    }
  };
  return Object.freeze({
    context: (
      projectId: string,
      overrides: Readonly<{
        deliveryPolicy?: DeliveryPolicy;
        execution?: AgentExecutionOverride;
        runtimeMaxConcurrency?: number;
      }> = {},
    ) =>
      context({
        projectId,
        deliveryPolicy: overrides.deliveryPolicy,
        execution: overrides.execution,
        commandRuntimeMaxConcurrency: overrides.runtimeMaxConcurrency,
      }),
    createProject: async (request: unknown) =>
      (await withConfig()).createProject(request),
    projectCreateContext,
    validateProjectCreate,
    listProjects: () => listWorkspaceProjects({ locations }),
    deleteProject: (projectId: string) =>
      deleteWorkspaceProject({ locations, projectId }),
    importAsset: (request: unknown) =>
      workspaceCommands.importAsset({ locations, request }),
    inspect,
    prepare,
    checkTask: (taskRevision: string) =>
      workspaceCommands.checkTask({ locations, taskRevision }),
    describeTask: (taskRevision: string) =>
      readAgentTaskExecutionContract({ locations, taskRevision }),
    finalizeTask: (taskRevision: string) =>
      finalizeAgentTaskWorkspace({ locations, taskRevision }),
    commitTask: (taskRevision: string, attemptId: string) =>
      workspaceCommands.commitTask({ locations, taskRevision, attemptId }),
    failTask: (
      taskRevision: string,
      attemptId: string,
      kind: "task" | "host",
    ) =>
      workspaceCommands.failTask({ locations, taskRevision, attemptId, kind }),
    continueProduction: async (input: {
      readonly projectId: string;
      readonly revisionId: string;
      readonly attemptId: string;
      readonly deliveryPolicy: "manual" | "automatic";
    }) => (await withConfig()).continueProduction(input),
    buildDelivery: async (projectId: string) =>
      (await withConfig()).buildDelivery(projectId),
    attemptStatus: (projectId: string, attemptId: string) =>
      readExecutionAttemptProgress({
        locations,
        storyId: projectId,
        attemptId,
      }),
    latestAttempt: (projectId: string) =>
      readLatestExecutionAttempt({ locations, storyId: projectId }),
    shutdown: delivery.shutdown,
    execute,
  });
};

export type WorkspaceProductionController = Awaited<
  ReturnType<typeof createWorkspaceProductionController>
>;
