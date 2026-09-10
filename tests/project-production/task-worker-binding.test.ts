import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAX_TASK_WORKER_FILE_BYTES,
  TaskExecutionContractSchema,
  buildProducerPlan,
  buildProducerTaskSpec,
  buildTaskWorkerBindingId,
  serializeCanonicalJson,
  type Sha256Digest,
  type TaskDiagnosticSnapshot,
} from "@axmorf/studio/contracts";
import {
  appendExecutionAttemptTaskOutcome,
  createExecutionAttemptForPlan,
} from "../../scripts/project-production/adapters/attempt-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  TaskWorkerBindingError,
  assertTaskWorkerBinding,
  assertTaskWorkerFailureAuthority,
  bindTaskWorker,
  readTaskWorkerFile,
  writeTaskWorkerFile,
} from "../../scripts/project-production/application/task-worker-binding";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";
import {
  resolveTaskAssignment,
  selectTaskAssignment,
} from "../../scripts/project-production/application/task-assignment";
import { runProjectProductionCli } from "../../scripts/project-production/cli";

const digest = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;
const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;

const fixture = async (rootDir: string) => {
  const contextBytes = "{}\n";
  const contract = TaskExecutionContractSchema.parse({
    schemaVersion: 1,
    contractVersion: "agent-task-execution-contract-v1",
    taskKind: "cover-owner",
    purpose: "Author one fixture output.",
    workflow: ["Bind, author, finalize, check, and commit."],
    immutableInputs: [
      "task.json",
      "inputs/context.json",
      "inputs/task-contract.json",
    ],
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    outputs: [
      {
        path: "src/index.ts",
        owner: "agent",
        format: "ts",
        instructions: ["Export the fixture value."],
        derivedFields: [],
        example: "export const value = 1;\n",
      },
    ],
    componentSignatures: [],
    constraints: ["Do not access the network."],
  });
  const contractBytes = `${serializeCanonicalJson(contract)}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "cover-owner",
    storyId: "story-binding",
    semanticId: null,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: digest(contextBytes),
      },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: digest(contractBytes),
      },
    ],
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: ["src/index.ts"],
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: {
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": contractBytes,
      "src/index.ts": "export const value = 1;\n",
    },
  });
  const decision = {
    taskRevision: task.taskRevision,
    baselineTaskRevision: null,
    taskKind: task.taskKind,
    subject: { kind: "project" as const, id: task.storyId },
    action: "dispatch-agent" as const,
    artifactState: "missing" as const,
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable" as const,
  };
  const plan = buildProducerPlan({
    storyId: task.storyId,
    revisionId: task.revisionId,
    artifactSetFingerprint: sha("2"),
    tasks: [decision],
    summary: {
      reusedTaskCount: 0,
      dirtyAgentTaskCount: 1,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
  });
  const snapshot: TaskDiagnosticSnapshot = {
    taskKind: task.taskKind,
    subject: decision.subject,
    taskRevision: task.taskRevision,
    inputFingerprints: [],
    validatorPolicyVersion: task.validatorPolicyVersion,
    declaredReadSet: task.declaredReadSet,
    declaredOutputSet: task.declaredOutputSet,
    dependencies: [],
    decision,
  };
  const attempt = await createExecutionAttemptForPlan({
    rootDir,
    plan,
    taskSnapshots: [snapshot],
    estimatedCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
    actualCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: [],
    },
    state: "waiting-for-agent",
  });
  const bindingId = buildTaskWorkerBindingId({
    taskRevision: task.taskRevision,
    attemptId: attempt.attemptId,
  });
  return { attempt, bindingId, contract, contextBytes, task, workspace };
};

test("task bind is zero-write, attempt-bound, and exposes transport-specific authority", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-bind-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const current = await fixture(rootDir);
  const before = await readdir(current.workspace, { recursive: true });

  const shared = await bindTaskWorker({
    rootDir,
    taskRevision: current.task.taskRevision,
    attemptId: current.attempt.attemptId,
    bindingId: current.bindingId,
    transport: "shared-workspace",
  });
  assert.equal(shared.status, "task-worker-bound");
  assert.equal(shared.workspace.directFilesystemAccess, true);
  assert.match(shared.commands.finalize, /project:task:finalize/u);
  assert.match(shared.commands.finalize, /--binding binding-/u);
  assert.deepEqual(
    await readdir(current.workspace, { recursive: true }),
    before,
  );

  const controller = await bindTaskWorker({
    rootDir,
    taskRevision: current.task.taskRevision,
    attemptId: current.attempt.attemptId,
    bindingId: current.bindingId,
    transport: "controller-io",
  });
  assert.equal(controller.workspace.directFilesystemAccess, false);
  assert.deepEqual(
    await readdir(current.workspace, { recursive: true }),
    before,
  );

  await assert.rejects(
    bindTaskWorker({
      rootDir,
      taskRevision: current.task.taskRevision,
      attemptId: current.attempt.attemptId,
      bindingId: `binding-${"f".repeat(64)}`,
      transport: "controller-io",
    }),
    TaskWorkerBindingError,
  );
});

test("short task assignment resolves the immutable attempt snapshot", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-assignment-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const current = await fixture(rootDir);
  const before = await readdir(current.workspace, { recursive: true });
  const resolved = await resolveTaskAssignment({
    rootDir,
    storyId: current.task.storyId,
    attemptId: current.attempt.attemptId,
    assignment: 1,
  });
  assert.equal(resolved.taskRevision, current.task.taskRevision);
  assert.equal(resolved.bindingId, current.bindingId);
  await assert.rejects(
    resolveTaskAssignment({
      rootDir,
      storyId: current.task.storyId,
      attemptId: current.attempt.attemptId,
      assignment: 0,
    }),
    /positive integer/u,
  );
  assert.deepEqual(
    await readdir(current.workspace, { recursive: true }),
    before,
  );
});

test("assignment ordinal filters reuse and fixed snapshots in sorted revision order", () => {
  const snapshots = [
    {
      taskRevision: "task-a",
      decision: { action: "dispatch-agent", taskRevision: "task-a" },
    },
    {
      taskRevision: "task-b",
      decision: { action: "reuse", taskRevision: "task-b" },
    },
    {
      taskRevision: "task-c",
      decision: { action: "dispatch-agent", taskRevision: "task-c" },
    },
    {
      taskRevision: "task-d",
      decision: { action: "dispatch-fixed", taskRevision: "task-d" },
    },
  ] as const;
  assert.equal(selectTaskAssignment(snapshots, 1).taskRevision, "task-a");
  assert.equal(selectTaskAssignment(snapshots, 2).taskRevision, "task-c");
  assert.throws(() => selectTaskAssignment(snapshots, 3), /out of range/u);
  assert.throws(() => selectTaskAssignment([], 1), /out of range/u);
});

test("CLI short bind preserves assignment commands and rejects unsafe forms", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-assignment-cli-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const current = await fixture(rootDir);
  const base = [
    "task-bind",
    "--project",
    current.task.storyId,
    "--attempt",
    current.attempt.attemptId,
    "--assignment",
    "1",
    "--transport",
    "shared-workspace",
  ] as const;
  const before = await readdir(current.workspace, { recursive: true });
  const bound = (await runProjectProductionCli(base, {
    rootDir,
    stdout: () => undefined,
  })) as Awaited<ReturnType<typeof bindTaskWorker>>;
  assert.equal(bound.status, "task-worker-bound");
  assert.match(bound.commands.finalize, /--assignment 1/u);
  assert.doesNotMatch(bound.commands.finalize, /--task|--binding/u);
  assert.deepEqual(
    await readdir(current.workspace, { recursive: true }),
    before,
  );
  for (const value of ["0", "1e0", "0x1", " 1", "1 "])
    await assert.rejects(
      runProjectProductionCli([...base.slice(0, 6), value, ...base.slice(7)], {
        rootDir,
        stdout: () => undefined,
      }),
      /canonical decimal|positive integer/u,
    );
  await assert.rejects(
    runProjectProductionCli([...base, "--task", current.task.taskRevision], {
      rootDir,
      stdout: () => undefined,
    }),
    /cannot be combined/u,
  );
  await assert.rejects(
    runProjectProductionCli(
      [
        "task-bind",
        "--attempt",
        current.attempt.attemptId,
        "--assignment",
        "1",
        "--transport",
        "shared-workspace",
      ],
      { rootDir, stdout: () => undefined },
    ),
    /Missing --project value/u,
  );
  await rm(join(current.workspace, "inputs/context.json"));
  await assert.rejects(
    runProjectProductionCli(base, { rootDir, stdout: () => undefined }),
    TaskWorkerBindingError,
  );
  assert.deepEqual(
    await readdir(current.workspace, { recursive: true }),
    before.filter((path) => path !== "inputs/context.json"),
  );
  await writeFile(
    join(current.workspace, "inputs/context.json"),
    current.contextBytes,
  );
  await appendExecutionAttemptTaskOutcome({
    rootDir,
    attemptId: current.attempt.attemptId,
    task: current.task,
    outcome: {
      outcome: "failed",
      artifactFingerprint: null,
      diagnosticCode: "producer-agent-task-failed",
    },
  });
  await assert.rejects(
    runProjectProductionCli(base, { rootDir, stdout: () => undefined }),
    TaskWorkerBindingError,
  );
});

test("controller IO reads task.json and atomically limits writes to declared outputs", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-io-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const current = await fixture(rootDir);
  const authority = {
    rootDir,
    taskRevision: current.task.taskRevision,
    attemptId: current.attempt.attemptId,
    bindingId: current.bindingId,
  };

  const identity = await readTaskWorkerFile({
    ...authority,
    logicalPath: "task.json",
  });
  assert.equal(
    JSON.parse(Buffer.from(identity.contentBase64, "base64").toString("utf8"))
      .taskRevision,
    current.task.taskRevision,
  );

  const written = await writeTaskWorkerFile({
    ...authority,
    logicalPath: "src/index.ts",
    contentBase64: Buffer.from("export const value = 2;\n").toString("base64"),
  });
  assert.equal(written.status, "task-worker-file-written");
  assert.equal(
    await readFile(join(current.workspace, "src/index.ts"), "utf8"),
    "export const value = 2;\n",
  );
  await assert.rejects(
    writeTaskWorkerFile({
      ...authority,
      logicalPath: "inputs/context.json",
      contentBase64: Buffer.from("drift").toString("base64"),
    }),
    TaskWorkerBindingError,
  );
  await assert.rejects(
    readTaskWorkerFile({ ...authority, logicalPath: "../private.json" }),
    TaskWorkerBindingError,
  );

  await rm(join(current.workspace, "src/index.ts"));
  await symlink("../task.json", join(current.workspace, "src/index.ts"));
  await assert.rejects(
    readTaskWorkerFile({ ...authority, logicalPath: "src/index.ts" }),
    TaskWorkerBindingError,
  );
  const taskIdentityBefore = await readFile(
    join(current.workspace, "task.json"),
  );
  await assert.rejects(
    writeTaskWorkerFile({
      ...authority,
      logicalPath: "src/index.ts",
      contentBase64: Buffer.from("unsafe").toString("base64"),
    }),
    TaskWorkerBindingError,
  );
  assert.deepEqual(
    await readFile(join(current.workspace, "task.json")),
    taskIdentityBefore,
  );
  await assert.rejects(
    writeTaskWorkerFile({
      ...authority,
      logicalPath: "src/index.ts",
      contentBase64: "not-base64",
    }),
    TaskWorkerBindingError,
  );
  await assert.rejects(
    writeTaskWorkerFile({
      ...authority,
      logicalPath: "src/index.ts",
      contentBase64: Buffer.alloc(MAX_TASK_WORKER_FILE_BYTES + 1).toString(
        "base64",
      ),
    }),
    TaskWorkerBindingError,
  );
});

test("full binding rejects immutable drift while narrow failure authority can terminate it once", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-failure-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const current = await fixture(rootDir);
  const authority = {
    rootDir,
    taskRevision: current.task.taskRevision,
    attemptId: current.attempt.attemptId,
    bindingId: current.bindingId,
  };
  await writeFile(join(current.workspace, "inputs/context.json"), "drift\n");

  await assert.rejects(assertTaskWorkerBinding(authority));
  const narrow = await assertTaskWorkerFailureAuthority(authority);
  assert.equal(narrow.task.taskRevision, current.task.taskRevision);
  await appendExecutionAttemptTaskOutcome({
    rootDir,
    attemptId: current.attempt.attemptId,
    task: current.task,
    outcome: {
      outcome: "failed",
      artifactFingerprint: null,
      diagnosticCode: "producer-agent-host-failed",
    },
  });
  await assert.rejects(
    assertTaskWorkerFailureAuthority(authority),
    TaskWorkerBindingError,
  );
});

test("task binding rejects a candidate id routed to another candidate workspace", async (context) => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "axmorf-cross-candidate-bind-"),
  );
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const candidateA = createProjectRevisionProductionScope({
    rootDir: repositoryRoot,
    storyId: "story-binding",
    candidateId: `revision-candidate-${"a".repeat(64)}`,
  });
  const candidateB = createProjectRevisionProductionScope({
    rootDir: repositoryRoot,
    storyId: "story-binding",
    candidateId: `revision-candidate-${"b".repeat(64)}`,
  });
  const current = await fixture(candidateA.isolatedRoot);

  await assert.rejects(
    bindTaskWorker({
      rootDir: candidateA.isolatedRoot,
      repositoryRootDir: repositoryRoot,
      taskRevision: current.task.taskRevision,
      attemptId: current.attempt.attemptId,
      bindingId: current.bindingId,
      transport: "shared-workspace",
      candidateId: candidateB.candidateId,
    }),
    /candidate routing is cross-bound/u,
  );
});
