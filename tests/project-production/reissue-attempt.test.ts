import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerPlan,
  buildProducerTaskSpec,
  serializeCanonicalJson,
  type TaskDiagnosticSnapshot,
} from "../../src/contracts";
import {
  appendExecutionAttemptTaskOutcome,
  appendExecutionAttemptTerminalResult,
  createExecutionAttemptForPlan,
  readExecutionAttempt,
} from "../../scripts/project-production/adapters/attempt-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { repositoryProductionCommandFormatter } from "../../scripts/project-production/adapters/repository-production-command-formatter";
import {
  inspectAttemptRecovery,
  reissueAttempt,
} from "../../scripts/project-production/application/reissue-attempt";
import { createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("failed first production can reissue without a current Delivery", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-reissue-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const contextBytes = "{}\n";
  const contractBytes = `${serializeCanonicalJson({
    schemaVersion: 2,
    contractVersion: "agent-task-execution-contract-v2",
    taskKind: "cover-owner",
    purpose: "Exercise recovery.",
    workflow: ["Bind before writing outputs."],
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    immutableInputs: ["inputs/context.json", "inputs/task-contract.json"],
    outputs: [
      {
        path: "src/Root.tsx",
        owner: "agent",
        format: "tsx",
        instructions: ["Write the Cover root."],
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
    taskKind: "cover-owner",
    storyId: "story-reissue",
    semanticId: null,
    revisionId: `revision-${"8".repeat(64)}`,
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
    declaredOutputSet: ["src/Root.tsx"],
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const decision = {
    taskRevision: task.taskRevision,
    baselineTaskRevision: null,
    taskKind: task.taskKind,
    subject: { kind: "project", id: task.storyId },
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
    artifactSetFingerprint: sha("9"),
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
  await createTaskWorkspace({
    locations,
    task,
    seedFiles: {
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": contractBytes,
    },
  });
  const failed = await createExecutionAttemptForPlan({
    locations,
    plan,
    taskSnapshots: [snapshot],
    estimatedCost: {
      providerRequests: 1,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: null,
    },
    actualCost: {
      providerRequests: 1,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: [],
    },
    state: "waiting-for-agent",
  });
  await appendExecutionAttemptTaskOutcome({
    locations,
    attemptId: failed.attemptId,
    task,
    outcome: {
      outcome: "failed",
      artifactFingerprint: null,
      diagnosticCode: "producer-agent-task-failed",
    },
  });
  await appendExecutionAttemptTerminalResult({
    locations,
    storyId: task.storyId,
    revisionId: task.revisionId,
    attemptId: failed.attemptId,
    result: {
      status: "failed",
      sourceCurrentId: null,
      deliveryBuildId: null,
      diagnosticCode: "producer-agent-task-failed",
      deliveryMedia: [],
    },
  });
  const current = {
    revision: { storyId: task.storyId, revisionId: task.revisionId },
    plan,
    nodes: [],
    subjects: new Map(),
    taskSeeds: new Map([
      [
        task.taskRevision,
        { task, contextBytes, taskContractBytes: contractBytes },
      ],
    ]),
  } as never;
  const dependencies = {
    commandFormatter: repositoryProductionCommandFormatter,
    buildCurrentPlan: async () => current,
    buildTaskSnapshots: () => [snapshot],
  } as const;

  const inspection = await inspectAttemptRecovery({
    locations,
    projectId: task.storyId,
    failedAttemptId: failed.attemptId,
    dependencies,
  });
  assert.equal(inspection.status, "attempt-recovery-ready");
  assert.equal(inspection.currentDeliveryRequired, false);
  assert.equal(inspection.providerRequests, 0);

  const reissued = await reissueAttempt({
    locations,
    projectId: task.storyId,
    failedAttemptId: failed.attemptId,
    deliveryPolicy: "automatic",
    dependencies,
  });
  assert.equal(reissued.status, "project-production-reissued");
  assert.notEqual(reissued.attemptId, failed.attemptId);
  assert.equal(reissued.currentDeliveryRequired, false);
  assert.equal(reissued.providerRequests, 0);
  assert.match(reissued.dirtyAgentTasks[0]?.bindCommands.controllerIo ?? "", /task:bind/u);

  const oldAttempt = await readExecutionAttempt({
    locations,
    storyId: task.storyId,
    attemptId: failed.attemptId,
  });
  const newAttempt = await readExecutionAttempt({
    locations,
    storyId: task.storyId,
    attemptId: reissued.attemptId,
  });
  assert.equal(oldAttempt.state, "failed");
  assert.equal(oldAttempt.terminalResult.status, "failed");
  assert.equal(newAttempt.state, "waiting-for-agent");
  assert.equal(newAttempt.terminalResult.status, "pending");
});
