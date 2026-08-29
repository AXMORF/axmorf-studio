import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerPlan,
  buildProducerTaskSpec,
  buildTaskWorkerBindingId,
  serializeCanonicalJson,
  type TaskDiagnosticSnapshot,
} from "../../src/contracts";
import { createExecutionAttemptForPlan } from "../../scripts/project-production/adapters/attempt-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { repositoryProductionCommandFormatter } from "../../scripts/project-production/adapters/repository-production-command-formatter";
import {
  bindTaskWorker,
  readTaskWorkerFile,
  writeTaskWorkerFile,
} from "../../scripts/project-production/application/task-worker-binding";
import { createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const fixture = async (rootDir: string) => {
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const contextBytes = "{}\n";
  const contractBytes = `${serializeCanonicalJson({
    schemaVersion: 2,
    contractVersion: "agent-task-execution-contract-v2",
    taskKind: "scene-owner",
    purpose: "Exercise a portable task worker binding.",
    workflow: ["Bind before any task write."],
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    immutableInputs: ["inputs/context.json", "inputs/task-contract.json"],
    outputs: [
      {
        path: "src/Renderer.tsx",
        owner: "agent",
        format: "tsx",
        instructions: ["Write a Renderer component."],
        derivedFields: [],
      },
    ],
    componentSignatures: [],
    constraints: ["Write only declared outputs."],
    commands: {
      bind: "./.rsp/bin/rsp task bind --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport <shared-workspace|controller-io>",
      finalize:
        "./.rsp/bin/rsp task finalize --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
      check:
        "./.rsp/bin/rsp task check --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
    },
  })}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-worker-binding",
    semanticId: "opening",
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: `sha256:${createHash("sha256")
          .update(contextBytes)
          .digest("hex")}`,
      },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: `sha256:${createHash("sha256")
          .update(contractBytes)
          .digest("hex")}`,
      },
    ],
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-owner-validator-v3",
  });
  const decision = {
    taskRevision: task.taskRevision,
    baselineTaskRevision: null,
    taskKind: task.taskKind,
    subject: { kind: "meaning", id: task.semanticId! },
    action: "dispatch-agent",
    artifactState: "missing",
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable",
  } as const;
  const plan = buildProducerPlan({
    storyId: task.storyId,
    revisionId: task.revisionId,
    artifactSetFingerprint: sha("4"),
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
  const workspace = await createTaskWorkspace({
    locations,
    task,
    seedFiles: {
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": contractBytes,
    },
  });
  const attempt = await createExecutionAttemptForPlan({
    locations,
    plan,
    taskSnapshots: [snapshot],
    estimatedCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: null,
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
  return { locations, task, workspace, attempt, bindingId } as const;
};

test("task worker bind is an immutable zero-write gate and controller IO stays declared", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-task-worker-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const value = await fixture(rootDir);
  const outputPath = join(value.workspace, "src/Renderer.tsx");

  await assert.rejects(
    bindTaskWorker({
      locations: value.locations,
      taskRevision: value.task.taskRevision,
      attemptId: value.attempt.attemptId,
      bindingId: `binding-${"0".repeat(64)}`,
      transport: "controller-io",
      commandFormatter: repositoryProductionCommandFormatter,
    }),
    /binding identity is stale/u,
  );
  await assert.rejects(access(outputPath));

  const bound = await bindTaskWorker({
    locations: value.locations,
    taskRevision: value.task.taskRevision,
    attemptId: value.attempt.attemptId,
    bindingId: value.bindingId,
    transport: "controller-io",
    commandFormatter: repositoryProductionCommandFormatter,
  });
  assert.equal(bound.status, "task-worker-bound");
  assert.equal(bound.workspace.directFilesystemAccess, false);
  assert.match(bound.workspace.relativePath, /^\.producer-work\//u);

  const source = "export const Renderer = () => null;\n";
  await writeTaskWorkerFile({
    locations: value.locations,
    taskRevision: value.task.taskRevision,
    attemptId: value.attempt.attemptId,
    bindingId: value.bindingId,
    logicalPath: "src/Renderer.tsx",
    contentBase64: Buffer.from(source).toString("base64"),
  });
  assert.equal(await readFile(outputPath, "utf8"), source);
  const read = await readTaskWorkerFile({
    locations: value.locations,
    taskRevision: value.task.taskRevision,
    attemptId: value.attempt.attemptId,
    bindingId: value.bindingId,
    logicalPath: "src/Renderer.tsx",
  });
  assert.equal(Buffer.from(read.contentBase64, "base64").toString(), source);
  await assert.rejects(
    writeTaskWorkerFile({
      locations: value.locations,
      taskRevision: value.task.taskRevision,
      attemptId: value.attempt.attemptId,
      bindingId: value.bindingId,
      logicalPath: "src/guessed.tsx",
      contentBase64: Buffer.from("unsafe").toString("base64"),
    }),
    /declared outputs/u,
  );
  await assert.rejects(access(join(value.workspace, "src/guessed.tsx")));
});
