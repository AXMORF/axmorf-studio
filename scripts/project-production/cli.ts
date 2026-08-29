import { pathToFileURL } from "node:url";
import {
  TaskWorkerFileWriteInputSchema,
  type TaskWorkerTransport,
  type ProducerConfig,
  type ProducerTaskSpec,
  type Sha256Digest,
} from "../../src/contracts";
import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../config/producer-config";
import {
  appendExecutionAttemptTaskOutcome,
  assertExecutionAttemptTaskAuthority,
} from "./adapters/attempt-store";

import { commitProducerTaskArtifact } from "./application/commit-task-artifact";
import { continueProjectProduction } from "./application/continue-production";
import { convergeProjectProduction } from "./application/converge-artifacts";
import { checkTaskByKind } from "./application/check-task";
import {
  finalizeAgentTaskWorkspace,
  readAgentTaskExecutionContract,
} from "./application/finalize-agent-task";
import { inspectProjectProduction } from "./application/inspect-production";
import { prepareProjectProduction } from "./application/prepare-production";
import { resolveProjectAgentExecution } from "./application/resolve-agent-execution";
import { createRepositoryProductionLocations } from "./application/production-locations";
import {
  buildCurrentRepositoryDelivery,
  buildRepositoryDeliveryUnlocked,
} from "./application/repository-delivery";
import { resolveRepositoryRuntimeExecutionResources } from "./adapters/repository-runtime-resources";
import { repositoryProductionCommandFormatter } from "./adapters/repository-production-command-formatter";
import { prepareProjectAuthoringBuild } from "./application/prepare-delivery";
import { createRepositoryProjectStorageFromProductionLocations } from "../projects/repository-project-locations";
import { generateRepositoryProjectCatalog } from "./adapters/repository-project-catalog";
import { projectPendingSceneAuthoring } from "../projects/application/project-pending-authoring";
import { loadProjectProductionInputs } from "./application/load-inputs";
import { buildCurrentProductionPlan } from "./application/build-current-plan";
import {
  captureProductionInspectionSnapshot,
  inspectProductionSourceReadiness,
} from "./adapters/production-inspection";
import {
  assertTaskWorkerBinding,
  assertTaskWorkerBindingIdentity,
  bindTaskWorker,
  readTaskWorkerFile,
  writeTaskWorkerFile,
} from "./application/task-worker-binding";
import { readTaskWorkspaceIdentity } from "./adapters/task-workspace";
import {
  inspectAttemptRecovery,
  reissueAttempt,
} from "./application/reissue-attempt";

const repositoryLoadInputs = (
  input: Parameters<typeof loadProjectProductionInputs>[0],
) => loadProjectProductionInputs(input, generateRepositoryProjectCatalog);

const repositoryBuildCurrentPlan = (
  input: Parameters<typeof buildCurrentProductionPlan>[0],
) => buildCurrentProductionPlan({ ...input, loadInputs: repositoryLoadInputs });

const repositoryInspectProduction = (
  input: Parameters<typeof inspectProjectProduction>[0],
) =>
  inspectProjectProduction(input, {
    captureSnapshot: ({ locations, projectId }) =>
      captureProductionInspectionSnapshot({
        locations,
        projectId,
        catalogProjectionPath:
          createRepositoryProjectStorageFromProductionLocations(locations)
            .catalogProjectionPath,
      }),
    inspectReadiness: (readinessInput) =>
      inspectProductionSourceReadiness(
        readinessInput,
        generateRepositoryProjectCatalog,
      ),
    buildCurrentPlan: repositoryBuildCurrentPlan,
  });

const repositoryProjectPendingAuthoring = (
  input: Parameters<typeof projectPendingSceneAuthoring>[0],
) => projectPendingSceneAuthoring(input, generateRepositoryProjectCatalog);

type Context = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  stdin?: () => Promise<string>;
  commitTaskArtifact?: typeof commitProducerTaskArtifact;
  inspectProduction?: typeof repositoryInspectProduction;
  prepareProduction?: typeof prepareProjectProduction;
  resolveAgentExecution?: typeof resolveProjectAgentExecution;
  continueProduction?: typeof continueProjectProduction;
  buildDelivery?: typeof buildCurrentRepositoryDelivery;
  appendTaskOutcome?: typeof appendExecutionAttemptTaskOutcome;
  assertTaskBinding?: typeof assertTaskWorkerBinding;
  resolveRuntime?: typeof resolveRepositoryRuntimeExecutionResources;
  finalizeTask?: typeof finalizeAgentTaskWorkspace;
  loadProducerConfig?: (input: {
    readonly repositoryRoot: string;
  }) => Promise<ProducerConfig>;
}>;
const defaultContext = (): Context => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
  stdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  },
});

const option = (args: readonly string[], name: string) => {
  const index = args.indexOf(name);
  if (
    index < 0 ||
    index + 1 >= args.length ||
    args[index + 1]?.startsWith("--")
  )
    throw new Error(`Missing ${name} value.`);
  return args[index + 1] ?? "";
};

const optionalOption = (args: readonly string[], name: string) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (index + 1 >= args.length || args[index + 1]?.startsWith("--")) {
    throw new Error(`Missing ${name} value.`);
  }
  return args[index + 1] ?? "";
};

const positiveIntegerOption = (args: readonly string[], name: string) => {
  const value = optionalOption(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
};

const nonnegativeIntegerOption = (args: readonly string[], name: string) => {
  const value = optionalOption(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
};

const recordTaskOutcome = async ({
  locations,
  task,
  attemptId,
  outcome,
  appendTaskOutcome,
}: {
  readonly locations: ReturnType<typeof createRepositoryProductionLocations>;
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
          | "producer-agent-host-failed"
          | "producer-agent-fixed-failed";
      }>;
  readonly appendTaskOutcome?: typeof appendExecutionAttemptTaskOutcome;
}) =>
  (appendTaskOutcome ?? appendExecutionAttemptTaskOutcome)({
    locations,
    attemptId,
    task,
    outcome,
  });

export const runProjectProductionCli = async (
  args: readonly string[],
  context: Context = defaultContext(),
) => {
  const command = args[0];
  if (command === "execution-resolve") {
    const rawMode = optionalOption(args, "--mode");
    if (
      rawMode !== undefined &&
      rawMode !== "inline" &&
      rawMode !== "subagents"
    ) {
      throw new Error("Expected --mode inline or subagents.");
    }
    const maxConcurrency = positiveIntegerOption(args, "--max-concurrency");
    const requireExactConcurrency = args.includes(
      "--require-exact-concurrency",
    );
    if (rawMode === "inline" && maxConcurrency !== undefined) {
      throw new Error("Inline execution does not accept --max-concurrency.");
    }
    if (rawMode === "inline" && requireExactConcurrency) {
      throw new Error(
        "Inline execution does not accept --require-exact-concurrency.",
      );
    }
    if (requireExactConcurrency && rawMode !== "subagents") {
      throw new Error("Exact concurrency requires an explicit subagents mode.");
    }
    const override =
      rawMode === "inline"
        ? ({ mode: "inline" } as const)
        : rawMode === "subagents" || maxConcurrency !== undefined
          ? ({
              mode: "subagents" as const,
              ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
              ...(requireExactConcurrency
                ? { requireExactConcurrency: true }
                : {}),
            } as const)
          : undefined;
    const runtimeMaxConcurrency = nonnegativeIntegerOption(
      args,
      "--runtime-max-concurrency",
    );
    const rawWorkerTransport = optionalOption(args, "--worker-transport");
    if (
      rawWorkerTransport !== undefined &&
      rawWorkerTransport !== "shared-workspace" &&
      rawWorkerTransport !== "controller-io"
    ) {
      throw new Error(
        "Expected --worker-transport shared-workspace or controller-io.",
      );
    }
    const runtimeWorkerTransport = rawWorkerTransport as
      | TaskWorkerTransport
      | undefined;
    const result = await (
      context.resolveAgentExecution ?? resolveProjectAgentExecution
    )({
      rootDir: context.rootDir,
      ...(override === undefined ? {} : { override }),
      ...(runtimeMaxConcurrency === undefined ? {} : { runtimeMaxConcurrency }),
      ...(runtimeWorkerTransport === undefined
        ? {}
        : { runtimeWorkerTransport }),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  const locations = createRepositoryProductionLocations({
    repositoryRoot: context.rootDir,
  });
  const assertBinding = context.assertTaskBinding ?? assertTaskWorkerBinding;
  const loadConfig = async () =>
    context.loadProducerConfig?.({ repositoryRoot: context.rootDir }) ??
    readProducerConfig({
      configPath: await resolveProducerConfigPathFromEnvironment({
        rootDir: context.rootDir,
        env: process.env,
      }),
    });
  if (command === "inspect") {
    const config = await loadConfig();
    const runtime = await (
      context.resolveRuntime ?? resolveRepositoryRuntimeExecutionResources
    )({ mode: "read-only" });
    const result = await (
      context.inspectProduction ?? repositoryInspectProduction
    )({
      locations,
      runtime,
      config,
      projectId: option(args, "--project"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "prepare") {
    const config = await loadConfig();
    const runtime = await (
      context.resolveRuntime ?? resolveRepositoryRuntimeExecutionResources
    )({ mode: "ensure" });
    const result = await (
      context.prepareProduction ?? prepareProjectProduction
    )(
      {
        locations,
        runtime,
        config,
        projectId: option(args, "--project"),
        deliveryPolicy: "automatic",
      },
      {
        commandFormatter: repositoryProductionCommandFormatter,
        inspect: repositoryInspectProduction,
        projectPendingAuthoring: repositoryProjectPendingAuthoring,
        loadInputs: repositoryLoadInputs,
        buildCurrentPlan: repositoryBuildCurrentPlan,
      },
    );
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-bind") {
    const transport = option(args, "--transport");
    if (transport !== "shared-workspace" && transport !== "controller-io") {
      throw new Error(
        "Expected --transport shared-workspace or controller-io.",
      );
    }
    const result = await bindTaskWorker({
      locations,
      taskRevision: option(args, "--task"),
      attemptId: option(args, "--attempt"),
      bindingId: option(args, "--binding"),
      transport,
      commandFormatter: repositoryProductionCommandFormatter,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-check") {
    const taskRevision = option(args, "--task");
    await assertBinding({
      locations,
      taskRevision,
      attemptId: option(args, "--attempt"),
      bindingId: option(args, "--binding"),
    });
    const result = await checkTaskByKind({
      locations,
      taskRevision,
    });
    const output = {
      status: result.status,
      taskRevision: result.task.taskRevision,
    };
    context.stdout(JSON.stringify(output));
    return output;
  }
  if (command === "task-describe") {
    const taskRevision = option(args, "--task");
    await assertBinding({
      locations,
      taskRevision,
      attemptId: option(args, "--attempt"),
      bindingId: option(args, "--binding"),
    });
    const result = await readAgentTaskExecutionContract({
      locations,
      taskRevision,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-finalize") {
    const taskRevision = option(args, "--task");
    await assertBinding({
      locations,
      taskRevision,
      attemptId: option(args, "--attempt"),
      bindingId: option(args, "--binding"),
    });
    const result = await (
      context.finalizeTask ?? finalizeAgentTaskWorkspace
    )({
      locations,
      taskRevision,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-commit") {
    const taskRevision = option(args, "--task");
    const attemptId = option(args, "--attempt");
    const bindingId = option(args, "--binding");
    const commitTaskArtifact =
      context.commitTaskArtifact ?? commitProducerTaskArtifact;
    const { task } = await assertBinding({
      locations,
      taskRevision,
      attemptId,
      bindingId,
    });
    let result: Awaited<ReturnType<typeof commitTaskArtifact>>;
    try {
      result = await commitTaskArtifact({
        locations,
        taskRevision,
      });
      if (result.attestation === null) {
        throw new Error("Committed artifact attestation is missing.");
      }
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
        appendTaskOutcome: context.appendTaskOutcome,
      });
      throw error;
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
      appendTaskOutcome: context.appendTaskOutcome,
    });
    const output = {
      status: result.reused
        ? ("producer-artifact-current" as const)
        : ("producer-artifact-committed" as const),
      artifact: result.attestation,
      attemptRecorded: true,
    };
    context.stdout(JSON.stringify(output));
    return output;
  }
  if (command === "task-fail") {
    const taskRevision = option(args, "--task");
    const attemptId = option(args, "--attempt");
    const bindingId = option(args, "--binding");
    const kind = option(args, "--kind");
    if (kind !== "task" && kind !== "host" && kind !== "fixed") {
      throw new Error("Expected --kind task, host, or fixed.");
    }
    const { task } =
      kind === "task"
        ? await assertBinding({
            locations,
            taskRevision,
            attemptId,
            bindingId,
          })
        : await (async () => {
            assertTaskWorkerBindingIdentity({
              taskRevision,
              attemptId,
              bindingId,
            });
            if (context.assertTaskBinding !== undefined) {
              return assertBinding({
                locations,
                taskRevision,
                attemptId,
                bindingId,
              });
            }
            const identity = await readTaskWorkspaceIdentity({
              locations,
              taskRevision,
            });
            await assertExecutionAttemptTaskAuthority({
              locations,
              attemptId,
              task: identity.task,
            });
            return identity;
          })();
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
            : kind === "host"
              ? "producer-agent-host-failed"
              : "producer-agent-fixed-failed",
      },
      appendTaskOutcome: context.appendTaskOutcome,
    });
    const output = {
      status: "producer-task-failure-recorded" as const,
      taskRevision,
      attemptId,
      kind,
    };
    context.stdout(JSON.stringify(output));
    return output;
  }
  if (command === "task-file-read") {
    const result = await readTaskWorkerFile({
      locations,
      taskRevision: option(args, "--task"),
      attemptId: option(args, "--attempt"),
      bindingId: option(args, "--binding"),
      logicalPath: option(args, "--path"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-file-write") {
    const raw = await (context.stdin ?? defaultContext().stdin!)();
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new Error("task-file-write stdin must contain valid JSON.");
    }
    const parsed = TaskWorkerFileWriteInputSchema.parse(input);
    const result = await writeTaskWorkerFile({
      locations,
      taskRevision: option(args, "--task"),
      attemptId: option(args, "--attempt"),
      bindingId: option(args, "--binding"),
      logicalPath: option(args, "--path"),
      contentBase64: parsed.contentBase64,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "attempt-recover-inspect" || command === "attempt-reissue") {
    const config = await loadConfig();
    const dependencies = {
      commandFormatter: repositoryProductionCommandFormatter,
      buildCurrentPlan: ({
        locations: productionLocations,
        projectId,
      }: {
        readonly locations: ReturnType<
          typeof createRepositoryProductionLocations
        >;
        readonly projectId: string;
      }) =>
        repositoryBuildCurrentPlan({
          locations: productionLocations,
          projectId,
          config,
        }),
    };
    const recoveryInput = {
      locations,
      projectId: option(args, "--project"),
      failedAttemptId: option(args, "--attempt"),
      dependencies,
    } as const;
    const result =
      command === "attempt-recover-inspect"
        ? await inspectAttemptRecovery(recoveryInput)
        : await reissueAttempt({
            ...recoveryInput,
            deliveryPolicy: "automatic",
          });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "continue") {
    const config = await loadConfig();
    const runtime = await (
      context.resolveRuntime ?? resolveRepositoryRuntimeExecutionResources
    )({ mode: "ensure" });
    const result = await (
      context.continueProduction ?? continueProjectProduction
    )(
      {
        projectId: option(args, "--project"),
        revisionId: option(args, "--revision"),
        attemptId: option(args, "--attempt"),
        locations,
        deliveryPolicy: "automatic",
        runtime,
        config,
      },
      {
        converge: (input) =>
          convergeProjectProduction({
            ...input,
            dependencies: {
              buildDelivery: buildRepositoryDeliveryUnlocked,
              buildCurrentPlan: repositoryBuildCurrentPlan,
              prepareProject: (prepareInput) =>
                prepareProjectAuthoringBuild({
                  ...prepareInput,
                  storage:
                    createRepositoryProjectStorageFromProductionLocations(
                      prepareInput.locations,
                    ),
                }),
            },
          }),
      },
    );
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "delivery-build") {
    const config = await loadConfig();
    const runtime = await (
      context.resolveRuntime ?? resolveRepositoryRuntimeExecutionResources
    )({ mode: "ensure" });
    const result = await (
      context.buildDelivery ?? buildCurrentRepositoryDelivery
    )({
      locations,
      runtime,
      config,
      projectId: option(args, "--project"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  throw new Error(
    "Expected execution-resolve, inspect, prepare, a task command, attempt recovery, continue, or delivery-build.",
  );
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectProductionCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Project production failed."}\n`,
    );
    process.exitCode = 1;
  });
}
