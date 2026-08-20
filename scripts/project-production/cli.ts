import { pathToFileURL } from "node:url";
import type {
  ProducerPlan,
  ProducerTaskSpec,
  Sha256Digest,
} from "../../src/contracts";
import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";
import {
  appendExecutionAttemptTaskOutcome,
  createExecutionAttemptForPlan,
} from "./adapters/attempt-store";
import { readTaskWorkspace } from "./adapters/task-workspace";

import { commitProducerTaskArtifact } from "./application/commit-task-artifact";
import { convergeProjectProduction } from "./application/converge-artifacts";
import { planProjectProductionUnlocked } from "./application/plan-production";
import { checkTaskByKind } from "./application/check-task";

type Context = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  commitTaskArtifact?: typeof commitProducerTaskArtifact;
  readWorkspace?: typeof readTaskWorkspace;
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

const AGENT_TASK_KINDS = new Set([
  "scene-owner",
  "global-visual-owner",
  "cover-owner",
]);

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

export const selectDirtyAgentTasks = (plan: ProducerPlan) =>
  plan.tasks.filter(
    ({ status, taskKind }) =>
      status !== "reused" &&
      status !== "blocked" &&
      AGENT_TASK_KINDS.has(taskKind),
  );

export const runProjectProductionCli = async (
  args: readonly string[],
  context: Context = defaultContext(),
) => {
  const command = args[0];
  if (command === "plan") {
    const lock = await acquireRepositoryOperationLock({
      rootDir: context.rootDir,
      ownerId: "project-production-plan",
    });
    try {
      const result = await planProjectProductionUnlocked({
        rootDir: context.rootDir,
        projectId: option(args, "--project"),
      });
      const dirtyAgentTasks = selectDirtyAgentTasks(result.plan);
      let attemptRecorded = true;
      try {
        await createExecutionAttemptForPlan({
          rootDir: context.rootDir,
          plan: result.plan,
          state:
            dirtyAgentTasks.length === 0 ? "converging" : "waiting-for-agent",
        });
      } catch {
        // Plan and workspace authority never depends on diagnostic persistence.
        attemptRecorded = false;
      }
      const output = {
        status: "producer-plan-ready" as const,
        revisionId: result.revision.revisionId,
        artifactSetFingerprint: result.plan.artifactSetFingerprint,
        summary: result.plan.summary,
        dirtyAgentTasks,
        attemptRecorded,
      };
      context.stdout(JSON.stringify(output));
      return output;
    } finally {
      await lock.release();
    }
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
    const result = await convergeProjectProduction({
      rootDir: context.rootDir,
      projectId: option(args, "--project"),
      revisionId: option(args, "--revision"),
    });
    context.stdout(JSON.stringify(result));
    return result;
  }
  throw new Error("Expected plan, task-check, task-commit, or converge.");
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
