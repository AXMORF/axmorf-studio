import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildProducerPlan,
  buildProducerTaskSpec,
  buildTaskWorkerBindingId,
  computeUtf8Checksum,
  serializeCanonicalJson,
  type TaskDiagnosticSnapshot,
} from "@axmorf/studio/contracts";
import {
  appendExecutionAttemptTaskOutcome,
  createExecutionAttemptForPlan,
  listExecutionAttemptsForStory,
  readExecutionAttemptProgress,
} from "../../scripts/project-production/adapters/attempt-store";
import {
  commitTaskArtifact,
  inspectArtifact,
} from "../../scripts/project-production/adapters/artifact-store";
import { npmScriptProductionCommandFormatter } from "../../scripts/project-production/adapters/npm-script-production-command-formatter";
import {
  createTaskWorkspace,
  reissueTaskWorkspace,
} from "../../scripts/project-production/adapters/task-workspace";
import { continueProjectProduction } from "../../scripts/project-production/application/continue-production";
import {
  reissueAttempt,
  type AttemptRecoveryDependencies,
} from "../../scripts/project-production/application/reissue-attempt";
import { buildTaskExecutionContract } from "../../scripts/project-production/application/task-execution-contract";
import { bindTaskWorker } from "../../scripts/project-production/application/task-worker-binding";
import { runProjectProductionCli } from "../../scripts/project-production/cli";
import { acquireRepositoryOperationLock } from "../../scripts/shared/repository-operation-lock";
import { checkProducerTaskWorkspace } from "../../scripts/project-production/application/task-check";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";

const fixture = async (rootDir: string) => {
  const storyId = "story-output-recovery";
  const revisionId = `revision-${"1".repeat(64)}` as const;
  const contextBytes = `${serializeCanonicalJson({ story: { storyId } })}\n`;
  const contract = buildTaskExecutionContract({
    taskKind: "cover-owner",
    context: JSON.parse(contextBytes),
  });
  const taskContractBytes = `${serializeCanonicalJson(contract)}\n`;
  const cover = buildProducerTaskSpec({
    taskKind: "cover-owner",
    storyId,
    revisionId,
    semanticId: null,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: computeUtf8Checksum(contextBytes),
      },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: computeUtf8Checksum(taskContractBytes),
      },
    ],
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: contract.outputs.map(({ path }) => path),
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const completed = ["scene-owner", "global-visual-owner"].map((taskKind) =>
    buildProducerTaskSpec({
      taskKind,
      storyId,
      revisionId,
      semanticId: taskKind === "scene-owner" ? "body" : null,
      dependencyArtifacts: [],
      inputFingerprints: [
        {
          id: "read:inputs/context.json",
          fingerprint: computeUtf8Checksum(contextBytes),
        },
      ],
      declaredReadSet: ["inputs/context.json"],
      declaredOutputSet: ["src/Renderer.tsx"],
      validatorPolicyVersion: "fixture-validator-v1",
    }),
  );
  const tasks = [cover, ...completed].sort((a, b) =>
    a.taskRevision.localeCompare(b.taskRevision),
  );
  const decisions = tasks.map((task) => ({
    taskRevision: task.taskRevision,
    baselineTaskRevision: null,
    taskKind: task.taskKind,
    subject:
      task.semanticId === null
        ? { kind: "project" as const, id: storyId }
        : { kind: "meaning" as const, id: task.semanticId },
    action: "dispatch-agent" as const,
    artifactState: "missing" as const,
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable" as const,
  }));
  const snapshots = (
    plan: ReturnType<typeof buildProducerPlan>,
  ): TaskDiagnosticSnapshot[] =>
    tasks.map((task) => {
      const decision = plan.tasks.find(
        ({ taskRevision }) => taskRevision === task.taskRevision,
      )!;
      return {
        taskKind: task.taskKind,
        taskRevision: task.taskRevision,
        subject: decision.subject,
        inputFingerprints: [],
        declaredReadSet: task.declaredReadSet,
        declaredOutputSet: task.declaredOutputSet,
        dependencies: [],
        decision,
        validatorPolicyVersion: task.validatorPolicyVersion,
      };
    });
  const plan = buildProducerPlan({
    storyId,
    revisionId,
    artifactSetFingerprint: `sha256:${"2".repeat(64)}`,
    tasks: decisions,
    summary: {
      reusedTaskCount: 0,
      dirtyAgentTaskCount: 3,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task: cover,
    seedFiles: {
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": taskContractBytes,
    },
  });
  const attempt = await createExecutionAttemptForPlan({
    rootDir,
    plan,
    taskSnapshots: snapshots(plan),
    state: "waiting-for-agent",
    estimatedCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 3,
      deliveryMedia: null,
    },
    actualCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 3,
      deliveryMedia: [],
    },
  });
  for (const task of completed) {
    const source = await createTaskWorkspace({
      rootDir,
      task,
      seedFiles: {
        "inputs/context.json": contextBytes,
        "src/Renderer.tsx": "export const Renderer = () => null;\n",
      },
    });
    const artifact = await commitTaskArtifact({
      rootDir,
      task,
      workspace: source,
    });
    assert.ok(artifact.attestation);
    await appendExecutionAttemptTaskOutcome({
      rootDir,
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "artifact-committed",
        artifactFingerprint: artifact.attestation.artifactFingerprint,
        diagnosticCode: null,
      },
    });
  }
  const bindingId = buildTaskWorkerBindingId({
    taskRevision: cover.taskRevision,
    attemptId: attempt.attemptId,
  });
  await bindTaskWorker({
    rootDir,
    taskRevision: cover.taskRevision,
    attemptId: attempt.attemptId,
    bindingId,
    transport: "shared-workspace",
  });
  const boundArgs = [
    "--task",
    cover.taskRevision,
    "--attempt",
    attempt.attemptId,
    "--binding",
    bindingId,
  ];
  const currentPlan = buildProducerPlan({
    ...plan,
    tasks: decisions.map((decision) =>
      decision.taskRevision === cover.taskRevision
        ? decision
        : {
            ...decision,
            action: "reuse" as const,
            artifactState: "valid" as const,
          },
    ),
    summary: { ...plan.summary, reusedTaskCount: 2, dirtyAgentTaskCount: 1 },
  });
  const dependencies: AttemptRecoveryDependencies = {
    readAttempt: readExecutionAttemptProgress,
    listAttempts: listExecutionAttemptsForStory,
    acquireLock: acquireRepositoryOperationLock,
    createWorkspace: createTaskWorkspace,
    recoverWorkspace: reissueTaskWorkspace,
    inspectArtifact,
    createAttempt: createExecutionAttemptForPlan,
    buildTaskSnapshots: () => snapshots(currentPlan),
    commandFormatter: npmScriptProductionCommandFormatter,
    buildCurrentPlan: (async () => {
      for (const task of completed)
        assert.ok(await inspectArtifact({ rootDir, task }));
      return {
        revision: { storyId, revisionId },
        plan: currentPlan,
        nodes: [],
        subjects: new Map(),
        taskSeeds: new Map([
          [
            cover.taskRevision,
            { task: cover, contextBytes, taskContractBytes },
          ],
        ]),
      };
    }) as unknown as AttemptRecoveryDependencies["buildCurrentPlan"],
  };
  return {
    cover,
    contract,
    completed,
    workspace,
    attempt,
    boundArgs,
    dependencies,
    bindingId,
  };
};

const readTree = async (rootDir: string) => {
  const result: Record<string, string> = {};
  for (const name of await readdir(rootDir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (name.isFile()) {
      const path = join(name.parentPath, name.name);
      result[path.slice(rootDir.length)] = (await readFile(path)).toString(
        "base64",
      );
    }
  }
  return result;
};

for (const variant of [
  "missing-directory",
  "missing-file",
  "invalid-typescript",
] as const) {
  test(`${variant} commit failure recovers to a fresh bound attempt, preserving artifacts and the old attempt`, async (context) => {
    const rootDir = await mkdtemp(join(tmpdir(), "axmorf-output-recovery-"));
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const f = await fixture(rootDir);
    if (variant !== "missing-directory") {
      for (const output of f.contract.outputs) {
        if (variant === "missing-file" && output.path === "src/Root.tsx")
          continue;
        await mkdir(dirname(join(f.workspace, output.path)), {
          recursive: true,
        });
        await writeFile(
          join(f.workspace, output.path),
          variant === "invalid-typescript" && output.path === "src/Root.tsx"
            ? "export const Root = <;"
            : String(output.example),
        );
      }
    }
    const cliContext = { rootDir, stdout: () => undefined };
    if (variant === "missing-directory") {
      await assert.rejects(
        runProjectProductionCli(["task-finalize", ...f.boundArgs], cliContext),
        /parent.*missing/u,
      );
    }
    await assert.rejects(
      runProjectProductionCli(["task-commit", ...f.boundArgs], cliContext),
    );
    const progress = await readExecutionAttemptProgress({
      rootDir,
      storyId: f.cover.storyId,
      attemptId: f.attempt.attemptId,
    });
    const outputFailure = progress?.taskOutcomes.find(
      ({ taskRevision }) => taskRevision === f.cover.taskRevision,
    )?.outputFailure;
    assert.deepEqual(outputFailure, {
      failureOwner: "agent-output",
      code:
        variant === "invalid-typescript"
          ? "invalid-typescript"
          : "missing-output",
      outputPaths:
        variant === "missing-directory"
          ? f.cover.declaredOutputSet
          : ["src/Root.tsx"],
    });
    await assert.rejects(
      continueProjectProduction(
        {
          rootDir,
          projectId: f.cover.storyId,
          revisionId: f.cover.revisionId,
          attemptId: f.attempt.attemptId,
        },
        {
          converge: async () => {
            throw new Error("Must not converge a failed attempt.");
          },
        },
      ),
      /Agent task failed/u,
    );
    const oldRoot = join(
      rootDir,
      ".producer-attempts",
      f.cover.storyId,
      f.attempt.attemptId,
    );
    const before = await readTree(oldRoot);
    const artifactsBefore = await readTree(
      join(rootDir, ".producer-artifacts"),
    );
    const recoveryArgs = [
      "--project",
      f.cover.storyId,
      "--attempt",
      f.attempt.attemptId,
    ];
    const recoveryContext = {
      ...cliContext,
      attemptRecoveryDependencies: f.dependencies,
    };
    const inspection = await runProjectProductionCli(
      ["attempt-recover-inspect", ...recoveryArgs],
      recoveryContext,
    );
    assert.ok(
      "status" in inspection && inspection.status === "attempt-recovery-ready",
    );
    assert.equal(inspection.reusedTaskCount, 2);
    assert.deepEqual(await readTree(oldRoot), before);
    const reissued = await runProjectProductionCli(
      ["attempt-reissue", ...recoveryArgs],
      recoveryContext,
    );
    assert.ok(
      "status" in reissued && reissued.status === "project-production-reissued",
    );
    assert.notEqual(reissued.attemptId, f.attempt.attemptId);
    assert.equal(reissued.providerRequests, 0);
    assert.equal(reissued.dirtyAgentTasks.length, 1);
    const dirty = reissued.dirtyAgentTasks[0]!;
    assert.equal(dirty.taskKind, "cover-owner");
    assert.notEqual(dirty.bindingId, f.bindingId);
    const bound = {
      rootDir,
      taskRevision: f.cover.taskRevision,
      attemptId: reissued.attemptId,
      bindingId: dirty.bindingId,
      transport: "shared-workspace" as const,
    };
    assert.equal((await bindTaskWorker(bound)).status, "task-worker-bound");
    for (const output of f.contract.outputs) {
      await mkdir(dirname(join(f.workspace, output.path)), { recursive: true });
      await writeFile(join(f.workspace, output.path), String(output.example));
    }
    const freshArgs = [
      "--task",
      bound.taskRevision,
      "--attempt",
      bound.attemptId,
      "--binding",
      bound.bindingId,
    ];
    await runProjectProductionCli(["task-finalize", ...freshArgs], cliContext);
    await runProjectProductionCli(["task-commit", ...freshArgs], cliContext);
    await assert.rejects(
      runProjectProductionCli(["task-finalize", ...f.boundArgs], cliContext),
      /not active|terminal/u,
    );
    assert.deepEqual(await readTree(oldRoot), before);
    const artifactsAfter = await readTree(join(rootDir, ".producer-artifacts"));
    for (const [path, bytes] of Object.entries(artifactsBefore))
      assert.equal(artifactsAfter[path], bytes);
  });
}

for (const variant of [
  "unknown-file",
  "symlink",
  "non-file-output",
  "authority-drift",
  "artifact-conflict",
  "host",
  "system",
  "unknown",
] as const) {
  test(`${variant} failures cannot acquire output-fault recovery authority`, async (context) => {
    const rootDir = await mkdtemp(join(tmpdir(), "axmorf-output-blocked-"));
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const f = await fixture(rootDir);
    if (variant === "unknown-file")
      await writeFile(join(f.workspace, "unexpected.txt"), "unknown");
    if (variant === "symlink")
      await symlink(join(f.workspace, "inputs"), join(f.workspace, "src"));
    if (variant === "non-file-output")
      await mkdir(join(f.workspace, "src/Root.tsx"), { recursive: true });
    if (variant === "authority-drift")
      await writeFile(join(f.workspace, "inputs/context.json"), "{}\n");
    if (variant === "artifact-conflict") {
      for (const output of f.contract.outputs) {
        await mkdir(dirname(join(f.workspace, output.path)), {
          recursive: true,
        });
        await writeFile(join(f.workspace, output.path), String(output.example));
      }
      await commitTaskArtifact({
        rootDir,
        task: f.cover,
        workspace: f.workspace,
      });
      const path = join(f.workspace, "src/Cover3x4.tsx");
      await writeFile(
        path,
        (await readFile(path, "utf8")).replace("STORY", "CHANGED"),
      );
    }
    const commitOverride = ["host", "system", "unknown"].includes(variant)
      ? async () => {
          throw variant === "unknown"
            ? new Error("unclassified fault")
            : Object.assign(new Error("external or fixed failure"), {
                code: variant === "host" ? "EACCES" : "EIO",
              });
        }
      : undefined;
    await assert.rejects(
      runProjectProductionCli(["task-commit", ...f.boundArgs], {
        rootDir,
        stdout: () => undefined,
        ...(commitOverride === undefined
          ? {}
          : { commitTaskArtifact: commitOverride }),
      }),
    );
    const progress = await readExecutionAttemptProgress({
      rootDir,
      storyId: f.cover.storyId,
      attemptId: f.attempt.attemptId,
    });
    assert.equal(
      progress?.taskOutcomes.find(
        ({ taskRevision }) => taskRevision === f.cover.taskRevision,
      )?.outputFailure,
      undefined,
    );
    if (variant === "authority-drift") {
      assert.equal(progress?.taskOutcomeSummary.failedTaskCount, 0);
      return;
    }
    await assert.rejects(
      continueProjectProduction({
        rootDir,
        projectId: f.cover.storyId,
        revisionId: f.cover.revisionId,
        attemptId: f.attempt.attemptId,
      }),
      /Agent task failed/u,
    );
    await assert.rejects(
      reissueAttempt({
        rootDir,
        projectId: f.cover.storyId,
        failedAttemptId: f.attempt.attemptId,
        dependencies: f.dependencies,
      }),
      /fixed, host, or unsupported/u,
    );
    assert.equal(
      (
        await listExecutionAttemptsForStory({
          rootDir,
          storyId: f.cover.storyId,
        })
      ).length,
      1,
    );
  });
}

test("malformed authored JSON retains a safe structured diagnostic in CLI failure output", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-json-output-fault-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-json-fault",
    semanticId: "body",
    revisionId: `revision-${"3".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: computeUtf8Checksum("{}\n"),
      },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["src/draft.json"],
    validatorPolicyVersion: "fixture-validator-v1",
  });
  await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": "{}\n", "src/draft.json": "{broken" },
  });
  await assert.rejects(
    checkProducerTaskWorkspace({ rootDir, taskRevision: task.taskRevision }),
    (error: unknown) => {
      const failure = reportCliFailure(error);
      assert.deepEqual(JSON.parse(failure.serialized), {
        status: "error",
        code: "task-output-invalid",
        message: "Task output JSON is malformed.",
        diagnostic: {
          failureOwner: "agent-output",
          code: "invalid-json",
          outputPaths: ["src/draft.json"],
        },
      });
      assert.equal(failure.exitCode, 2);
      return true;
    },
  );
});
