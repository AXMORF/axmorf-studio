import {
  DeliveryPolicySchema,
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
} from "../../../settings/contracts/execution-preferences";
import {
  loadWorkspaceExecutionPreferences,
  loadWorkspaceProjectControlSettings,
} from "../../../desktop/adapters/workspace-context-settings";
import { WorkspaceContextProjectionSchema } from "../../../desktop/contracts/workspace-context";
import { importWorkspaceProjectAsset } from "../../projects/workspace-project";
import {
  createWorkspaceProject,
  readWorkspaceProjectContext,
} from "../../projects/workspace-project";
import {
  appendExecutionAttemptTaskOutcome,
  assertExecutionAttemptTaskAuthority,
} from "../adapters/attempt-store";
import { rspLocalProductionCommandFormatter } from "../adapters/rsp-local-command-formatter";
import { readTaskWorkspace } from "../adapters/task-workspace";
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
import { prepareWorkspaceNarration } from "./workspace-narration-port";
import { prepareProjectAuthoringBuild } from "./prepare-delivery";
import { createWorkspaceProjectStorageLocations } from "../../projects/project-locations";
import { generateWorkspaceProjectResourceCatalog } from "../../catalog/generate";
import { projectPendingSceneAuthoring } from "../../projects/application/project-pending-authoring";
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
            dependencies:
              createRuntimeDeliveryInspectionDependencies(runtime),
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
        commandFormatter: rspLocalProductionCommandFormatter,
        inspect: workspaceInspectProduction,
        prepareNarration: prepareWorkspaceNarration,
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
}: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly delivery: WorkspaceProductionDeliveryPort;
  readonly loadProducerConfig: () => Promise<ProducerConfig | null>;
  readonly providerReadiness?: "ready" | "not-configured" | "unavailable";
  readonly appDefaultDeliveryPolicy?: DeliveryPolicy;
  readonly runtimeMaxConcurrency?: number;
}) => {
  if (locations.layoutKind !== "workspace") {
    throw new Error(
      "Workspace production controller requires Workspace locations.",
    );
  }
  const workspaceCommands = createWorkspaceCommands(delivery);
  const readConfig = async () => {
    const config = await loadProducerConfig();
    return config === null ? null : ProducerConfigSchema.parse(config);
  };
  const appDefault = DeliveryPolicySchema.parse(appDefaultDeliveryPolicy);
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
    deliveryPolicy,
    execution,
  }: {
    readonly projectId: string;
    readonly deliveryPolicy?: DeliveryPolicy;
    readonly execution?: AgentExecutionOverride;
  }) => {
    const [project, config, resolvedDeliveryPolicy, executionPreferences] =
      await Promise.all([
        workspaceCommands.context({ locations, projectId }),
        readConfig(),
        resolveProjectDeliveryPolicy({ projectId, override: deliveryPolicy }),
        loadWorkspaceExecutionPreferences({
          privateConfigRoot: locations.privateConfigRoot,
        }),
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
          ...(runtimeMaxConcurrency === undefined
            ? {}
            : { runtimeMaxConcurrency }),
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
  const withConfig = async () =>
    createProjectProductionController({
      locations,
      runtime,
      config: await requireConfig(),
      commands: workspaceCommands,
    });
  const inspect = async (projectId: string) => {
    const config = await readConfig();
    return config === null
      ? {
          status: DESKTOP_PRODUCER_CONFIG_REQUIRED,
          storyId: projectId,
          nextAction: "configure-provider" as const,
        }
      : workspaceCommands.inspect({ locations, runtime, config, projectId });
  };
  const prepare = async (
    projectId: string,
    deliveryPolicy?: DeliveryPolicy,
  ) => {
    const resolved = await resolveProjectDeliveryPolicy({
      projectId,
      override: deliveryPolicy,
    });
    return (await withConfig()).prepare(projectId, resolved.value);
  };
  const execute = async (request: Readonly<Record<string, unknown>>) => {
    switch (request.command) {
      case "context":
        return context({
          projectId: String(request.storyId),
          deliveryPolicy: request.deliveryPolicy as DeliveryPolicy | undefined,
          execution: request.execution as AgentExecutionOverride | undefined,
        });
      case "asset-import":
        return workspaceCommands.importAsset({ locations, request });
      case "inspect":
        return inspect(String(request.storyId));
      case "project-create":
        return (await withConfig()).createProject(request.input);
      case "prepare":
        return prepare(
          String(request.storyId),
          request.deliveryPolicy as DeliveryPolicy | undefined,
        );
      case "task-check":
        return workspaceCommands.checkTask({
          locations,
          taskRevision: String(request.taskRevision),
        });
      case "task-commit":
        return workspaceCommands.commitTask({
          locations,
          taskRevision: String(request.taskRevision),
          attemptId: String(request.attemptId),
        });
      case "task-fail":
        return workspaceCommands.failTask({
          locations,
          taskRevision: String(request.taskRevision),
          attemptId: String(request.attemptId),
          kind: request.kind as "task" | "host",
        });
      case "continue":
        return (await withConfig()).continueProduction({
          projectId: String(request.storyId),
          revisionId: String(request.revisionId),
          attemptId: String(request.attemptId),
          deliveryPolicy: request.deliveryPolicy as DeliveryPolicy,
        });
      case "delivery-build":
        return (await withConfig()).buildDelivery(String(request.storyId));
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
      }> = {},
    ) =>
      context({
        projectId,
        ...overrides,
      }),
    createProject: async (request: unknown) =>
      (await withConfig()).createProject(request),
    importAsset: (request: unknown) =>
      workspaceCommands.importAsset({ locations, request }),
    inspect,
    prepare,
    checkTask: (taskRevision: string) =>
      workspaceCommands.checkTask({ locations, taskRevision }),
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
    shutdown: delivery.shutdown,
    execute,
  });
};

export type WorkspaceProductionController = Awaited<
  ReturnType<typeof createWorkspaceProductionController>
>;
