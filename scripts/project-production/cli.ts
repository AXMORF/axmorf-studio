import { pathToFileURL } from "node:url";
import type { ProducerTaskSpec, Sha256Digest } from "../../src/contracts";
import { appendExecutionAttemptTaskOutcome } from "./adapters/attempt-store";
import { readTaskWorkspace } from "./adapters/task-workspace";

import { commitProducerTaskArtifact } from "./application/commit-task-artifact";
import { continueProjectProduction } from "./application/continue-production";
import { checkTaskByKind } from "./application/check-task";
import { inspectProjectProduction } from "./application/inspect-production";
import { prepareProjectProduction } from "./application/prepare-production";

type Context = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  commitTaskArtifact?: typeof commitProducerTaskArtifact;
  readWorkspace?: typeof readTaskWorkspace;
  inspectProduction?: typeof inspectProjectProduction;
  prepareProduction?: typeof prepareProjectProduction;
  continueProduction?: typeof continueProjectProduction;
  appendTaskOutcome?: typeof appendExecutionAttemptTaskOutcome;
}>;
const defaultContext = (): Context => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
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
          | "producer-agent-host-failed";
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
  if (command === "inspect") {
    const result = await (
      context.inspectProduction ?? inspectProjectProduction
    )({
      rootDir: context.rootDir,
      projectId: option(args, "--project"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "prepare") {
    const result = await (
      context.prepareProduction ?? prepareProjectProduction
    )({
      rootDir: context.rootDir,
      projectId: option(args, "--project"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (command === "task-check") {
    const result = await checkTaskByKind({
      rootDir: context.rootDir,
      taskRevision: option(args, "--task"),
    });
    const output = {
      status: result.status,
      taskRevision: result.task.taskRevision,
    };
    context.stdout(JSON.stringify(output));
    return output;
  }
  if (command === "task-commit") {
    const taskRevision = option(args, "--task");
    const attemptId = option(args, "--attempt");
    const readWorkspace = context.readWorkspace ?? readTaskWorkspace;
    const commitTaskArtifact =
      context.commitTaskArtifact ?? commitProducerTaskArtifact;
    const { task } = await readWorkspace({
      rootDir: context.rootDir,
      taskRevision,
    });
    let result: Awaited<ReturnType<typeof commitTaskArtifact>>;
    try {
      result = await commitTaskArtifact({
        rootDir: context.rootDir,
        taskRevision,
      });
      if (result.attestation === null) {
        throw new Error("Committed artifact attestation is missing.");
      }
    } catch (error) {
      await recordTaskOutcome({
        rootDir: context.rootDir,
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
      rootDir: context.rootDir,
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
    const kind = option(args, "--kind");
    if (kind !== "task" && kind !== "host") {
      throw new Error("Expected --kind task or host.");
    }
    const { task } = await (context.readWorkspace ?? readTaskWorkspace)({
      rootDir: context.rootDir,
      taskRevision,
    });
    await recordTaskOutcome({
      rootDir: context.rootDir,
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
  if (command === "continue") {
    const result = await (
      context.continueProduction ?? continueProjectProduction
    )({
      rootDir: context.rootDir,
      projectId: option(args, "--project"),
      revisionId: option(args, "--revision"),
      attemptId: option(args, "--attempt"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  throw new Error(
    "Expected inspect, prepare, task-check, task-commit, task-fail, or continue.",
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
