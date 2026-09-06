import { pathToFileURL } from "node:url";
import type {
  ProducerTaskSpec,
  Sha256Digest,
  TaskWorkerTransport,
} from "@axmorf/studio/contracts";
import type { RuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import {
  appendExecutionAttemptTaskOutcome,
  createExecutionAttemptForPlan,
  listExecutionAttemptsForStory,
  readExecutionAttemptProgress,
} from "./adapters/attempt-store";
import { inspectArtifactState } from "./adapters/artifact-store";
import { npmScriptProductionCommandFormatter } from "./adapters/npm-script-production-command-formatter";
import {
  createTaskWorkspace,
  reissueTaskWorkspace,
} from "./adapters/task-workspace";

import { commitProducerTaskArtifact } from "./application/commit-task-artifact";
import { continueProjectProduction } from "./application/continue-production";
import { buildCurrentProductionPlan } from "./application/build-current-plan";
import { checkTaskByKind } from "./application/check-task";
import { finalizeAgentTaskWorkspace } from "./application/finalize-agent-task";
import { inspectProjectProduction } from "./application/inspect-production";
import { prepareProjectProduction } from "./application/prepare-production";
import {
  inspectAttemptRecovery,
  reissueAttempt,
  type AttemptRecoveryDependencies,
} from "./application/reissue-attempt";
import { resolveProjectAgentExecution } from "./application/resolve-agent-execution";
import {
  inspectAttemptInterruption,
  interruptAttempt,
} from "./application/interrupt-attempt";
import {
  assertTaskWorkerBinding,
  assertTaskWorkerFailureAuthority,
  bindTaskWorker,
  describeBoundTask,
  readTaskWorkerFile,
  writeTaskWorkerFile,
} from "./application/task-worker-binding";
import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";
import { buildTaskDiagnosticSnapshots } from "./domain/task-explanation";
import {
  resolveProductionScope,
  type ProductionScope,
} from "./application/production-scope";
import { inspectProjectRevisionCandidateDefinition } from "../projects/application/project-revision-candidate-store";

type Context = Readonly<{
  rootDir: string;
  runtimePolicyManifest?: RuntimePolicyManifest;
  stdout: (line: string) => void;
  stdin?: () => Promise<string>;
  commitTaskArtifact?: typeof commitProducerTaskArtifact;
  inspectProduction?: typeof inspectProjectProduction;
  prepareProduction?: typeof prepareProjectProduction;
  resolveAgentExecution?: typeof resolveProjectAgentExecution;
  continueProduction?: typeof continueProjectProduction;
  appendTaskOutcome?: typeof appendExecutionAttemptTaskOutcome;
  bindWorker?: typeof bindTaskWorker;
  describeTask?: typeof describeBoundTask;
  assertTaskBinding?: typeof assertTaskWorkerBinding;
  assertFailureAuthority?: typeof assertTaskWorkerFailureAuthority;
  finalizeTask?: typeof finalizeAgentTaskWorkspace;
  readTaskFile?: typeof readTaskWorkerFile;
  writeTaskFile?: typeof writeTaskWorkerFile;
  attemptRecoveryDependencies?: AttemptRecoveryDependencies;
}>;
const defaultContext = (): Context => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

const readStandardInput = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

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

const workerTransportOption = (
  args: readonly string[],
  name: string,
): TaskWorkerTransport | undefined => {
  const value = optionalOption(args, name);
  if (value === undefined) return undefined;
  if (value !== "shared-workspace" && value !== "controller-io") {
    throw new Error(`${name} must be shared-workspace or controller-io.`);
  }
  return value;
};

const candidateOption = (args: readonly string[]) =>
  optionalOption(args, "--candidate");

const resolveCliProductionScope = async ({
  args,
  rootDir,
  projectId,
}: {
  readonly args: readonly string[];
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const scope = resolveProductionScope({
    rootDir,
    storyId: projectId,
    candidateId: candidateOption(args),
  });
  if (scope.kind === "project-revision-candidate") {
    await inspectProjectRevisionCandidateDefinition({ scope });
  }
  return scope;
};

const boundTaskInput = (args: readonly string[], scope: ProductionScope) => ({
  rootDir: scope.isolatedRoot,
  taskRevision: option(args, "--task"),
  attemptId: option(args, "--attempt"),
  bindingId: option(args, "--binding"),
});

const taskCommandScope = async (
  args: readonly string[],
  repositoryRoot: string,
) => {
  if (candidateOption(args) === undefined) {
    return resolveProductionScope({
      rootDir: repositoryRoot,
      storyId: "task-routing",
    });
  }
  return resolveCliProductionScope({
    args,
    rootDir: repositoryRoot,
    projectId: option(args, "--project"),
  });
};

const attemptRecoveryDependencies = (
  context: Context,
  scope: ProductionScope,
) =>
  context.attemptRecoveryDependencies ??
  ({
    readAttempt: readExecutionAttemptProgress,
    listAttempts: listExecutionAttemptsForStory,
    buildCurrentPlan: ({ projectId }) =>
      buildCurrentProductionPlan({
        rootDir: scope.repositoryRoot,
        projectId,
        scope,
        runtimePolicyManifest: context.runtimePolicyManifest,
      }),
    acquireLock: acquireRepositoryOperationLock,
    createWorkspace: createTaskWorkspace,
    recoverWorkspace: reissueTaskWorkspace,
    inspectArtifact: async ({ task }) =>
      (
        await inspectArtifactState({
          rootDir: scope.shared.runtimeRoot,
          task,
        })
      ).attestation,
    buildTaskSnapshots: buildTaskDiagnosticSnapshots,
    createAttempt: createExecutionAttemptForPlan,
    commandFormatter: npmScriptProductionCommandFormatter,
  } satisfies AttemptRecoveryDependencies);

const recordTaskOutcome = async ({
  rootDir,
  task,
  attemptId,
  outcome,
  appendTaskOutcome,
}: {
  readonly rootDir: string;
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
    rootDir,
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
    const runtimeWorkerTransport = workerTransportOption(
      args,
      "--worker-transport",
    );
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
  if (command === "inspect") {
    const projectId = option(args, "--project");
    const scope = await resolveCliProductionScope({
      args,
      rootDir: context.rootDir,
      projectId,
    });
    const result = await (
      context.inspectProduction ?? inspectProjectProduction
    )({
      rootDir: context.rootDir,
      projectId,
      scope,
      runtimePolicyManifest: context.runtimePolicyManifest,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "prepare") {
    const projectId = option(args, "--project");
    const scope = await resolveCliProductionScope({
      args,
      rootDir: context.rootDir,
      projectId,
    });
    const result = await (
      context.prepareProduction ?? prepareProjectProduction
    )({
      rootDir: context.rootDir,
      projectId,
      scope,
      runtimePolicyManifest: context.runtimePolicyManifest,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-bind") {
    const candidateId = candidateOption(args);
    const projectId =
      candidateId === undefined ? "task-routing" : option(args, "--project");
    const scope =
      candidateId === undefined
        ? resolveProductionScope({
            rootDir: context.rootDir,
            storyId: projectId,
          })
        : await resolveCliProductionScope({
            args,
            rootDir: context.rootDir,
            projectId,
          });
    const input = boundTaskInput(args, scope);
    const transport = workerTransportOption(args, "--transport");
    if (transport === undefined) throw new Error("Missing --transport value.");
    const result = await (context.bindWorker ?? bindTaskWorker)({
      ...input,
      transport,
      repositoryRootDir: scope.repositoryRoot,
      ...(scope.candidateId === null ? {} : { candidateId: scope.candidateId }),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-describe") {
    const scope = await taskCommandScope(args, context.rootDir);
    const result = await (context.describeTask ?? describeBoundTask)(
      boundTaskInput(args, scope),
    );
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-finalize") {
    const scope = await taskCommandScope(args, context.rootDir);
    const input = boundTaskInput(args, scope);
    await (context.assertTaskBinding ?? assertTaskWorkerBinding)(input);
    const result = await (context.finalizeTask ?? finalizeAgentTaskWorkspace)({
      rootDir: scope.isolatedRoot,
      taskRevision: input.taskRevision,
      runtimeRootDir: scope.shared.runtimeRoot,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-check") {
    const scope = await taskCommandScope(args, context.rootDir);
    const input = boundTaskInput(args, scope);
    await (context.assertTaskBinding ?? assertTaskWorkerBinding)(input);
    const result = await checkTaskByKind({
      rootDir: scope.isolatedRoot,
      taskRevision: input.taskRevision,
      runtimeRootDir: scope.shared.runtimeRoot,
    });
    const output = {
      status: result.status,
      taskRevision: result.task.taskRevision,
    };
    context.stdout(JSON.stringify(output));
    return output;
  }
  if (command === "task-commit") {
    const scope = await taskCommandScope(args, context.rootDir);
    const input = boundTaskInput(args, scope);
    const { task } = await (
      context.assertTaskBinding ?? assertTaskWorkerBinding
    )(input);
    const { taskRevision, attemptId } = input;
    const commitTaskArtifact =
      context.commitTaskArtifact ?? commitProducerTaskArtifact;
    let result: Awaited<ReturnType<typeof commitTaskArtifact>>;
    try {
      result = await commitTaskArtifact({
        rootDir: scope.isolatedRoot,
        taskRevision,
        artifactRootDir: scope.shared.runtimeRoot,
        runtimeRootDir: scope.shared.runtimeRoot,
      });
      if (result.attestation === null) {
        throw new Error("Committed artifact attestation is missing.");
      }
    } catch (error) {
      await recordTaskOutcome({
        rootDir: scope.isolatedRoot,
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
      rootDir: scope.isolatedRoot,
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
    const scope = await taskCommandScope(args, context.rootDir);
    const input = boundTaskInput(args, scope);
    const { taskRevision, attemptId } = input;
    const kind = option(args, "--kind");
    if (kind !== "task" && kind !== "host" && kind !== "fixed") {
      throw new Error("Expected --kind task, host, or fixed.");
    }
    const { task } =
      kind === "task"
        ? await (context.assertTaskBinding ?? assertTaskWorkerBinding)(input)
        : await (
            context.assertFailureAuthority ?? assertTaskWorkerFailureAuthority
          )(input);
    await recordTaskOutcome({
      rootDir: scope.isolatedRoot,
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
    const scope = await taskCommandScope(args, context.rootDir);
    const result = await (context.readTaskFile ?? readTaskWorkerFile)({
      ...boundTaskInput(args, scope),
      logicalPath: option(args, "--path"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-file-write") {
    const scope = await taskCommandScope(args, context.rootDir);
    const raw = await (context.stdin ?? readStandardInput)();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch (error) {
      throw new Error("Task file write stdin must be one JSON document.", {
        cause: error,
      });
    }
    if (
      body === null ||
      typeof body !== "object" ||
      !("contentBase64" in body) ||
      typeof body.contentBase64 !== "string" ||
      Object.keys(body).length !== 1
    ) {
      throw new Error("Task file write stdin must contain contentBase64.");
    }
    const result = await (context.writeTaskFile ?? writeTaskWorkerFile)({
      ...boundTaskInput(args, scope),
      logicalPath: option(args, "--path"),
      contentBase64: body.contentBase64,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "attempt-recover-inspect") {
    const projectId = option(args, "--project");
    const scope = await resolveCliProductionScope({
      args,
      rootDir: context.rootDir,
      projectId,
    });
    const result = await inspectAttemptRecovery({
      rootDir: scope.repositoryRoot,
      projectId,
      failedAttemptId: option(args, "--attempt"),
      scope,
      dependencies: attemptRecoveryDependencies(context, scope),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (
    command === "attempt-interrupt-inspect" ||
    command === "attempt-interrupt"
  ) {
    const projectId = option(args, "--project");
    const scope = await resolveCliProductionScope({
      args,
      rootDir: context.rootDir,
      projectId,
    });
    const input = {
      rootDir: context.rootDir,
      projectId,
      attemptId: option(args, "--attempt"),
      scope,
    };
    const result = await (
      command === "attempt-interrupt-inspect"
        ? inspectAttemptInterruption
        : interruptAttempt
    )(input);
    const candidate =
      scope.kind === "project-revision-candidate"
        ? ` --candidate ${scope.candidateId}`
        : "";
    const next =
      command === "attempt-interrupt-inspect" ? "interrupt" : "recover-inspect";
    const report = {
      ...result,
      nextCommand: `npm run project:attempt:${next} -- --project ${projectId} --attempt ${input.attemptId}${candidate}`,
    };
    context.stdout(JSON.stringify(report));
    return report;
  }
  if (command === "attempt-reissue") {
    const projectId = option(args, "--project");
    const scope = await resolveCliProductionScope({
      args,
      rootDir: context.rootDir,
      projectId,
    });
    const result = await reissueAttempt({
      rootDir: scope.repositoryRoot,
      projectId,
      failedAttemptId: option(args, "--attempt"),
      scope,
      dependencies: attemptRecoveryDependencies(context, scope),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "continue") {
    const projectId = option(args, "--project");
    const scope = await resolveCliProductionScope({
      args,
      rootDir: context.rootDir,
      projectId,
    });
    const result = await (
      context.continueProduction ?? continueProjectProduction
    )({
      rootDir: context.rootDir,
      projectId,
      scope,
      revisionId: option(args, "--revision"),
      attemptId: option(args, "--attempt"),
      runtimePolicyManifest: context.runtimePolicyManifest,
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  throw new Error(
    "Expected execution-resolve, inspect, prepare, a task command, an attempt recovery command, or continue.",
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
