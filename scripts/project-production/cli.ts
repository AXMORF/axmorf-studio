import { pathToFileURL } from "node:url";
import type { ProducerTaskSpec, Sha256Digest } from "../../src/contracts";
import { appendExecutionAttemptTaskOutcome } from "./adapters/attempt-store";
import { readTaskWorkspace } from "./adapters/task-workspace";

import { commitProducerTaskArtifact } from "./application/commit-task-artifact";
import { convergeProjectProduction } from "./application/converge-artifacts";
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
  convergeProduction?: typeof convergeProjectProduction;
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
  outcome,
}: {
  readonly rootDir: string;
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
        diagnosticCode: "producer-task-commit-failed";
      }>;
}) => {
  try {
    await appendExecutionAttemptTaskOutcome({ rootDir, task, outcome });
    return true;
  } catch {
    // Attempt diagnostics never own or roll back a validated artifact.
    return false;
  }
};

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
    } catch (error) {
      await recordTaskOutcome({
        rootDir: context.rootDir,
        task,
        outcome: {
          outcome: "failed",
          artifactFingerprint: null,
          diagnosticCode: "producer-task-commit-failed",
        },
      });
      throw error;
    }
    if (result.attestation === null) {
      throw new Error("Committed artifact attestation is missing.");
    }
    const attemptRecorded = await recordTaskOutcome({
      rootDir: context.rootDir,
      task,
      outcome: {
        outcome: result.reused ? "artifact-current" : "artifact-committed",
        artifactFingerprint: result.attestation.artifactFingerprint,
        diagnosticCode: null,
      },
    });
    const output = {
      status: result.reused
        ? ("producer-artifact-current" as const)
        : ("producer-artifact-committed" as const),
      artifact: result.attestation,
      attemptRecorded,
    };
    context.stdout(JSON.stringify(output));
    return output;
  }
  if (command === "converge") {
    const result = await (
      context.convergeProduction ?? convergeProjectProduction
    )({
      rootDir: context.rootDir,
      projectId: option(args, "--project"),
      revisionId: option(args, "--revision"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  throw new Error(
    "Expected inspect, prepare, task-check, task-commit, or converge.",
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
