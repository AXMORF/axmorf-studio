import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runProjectProductionCli } from "../../scripts/project-production/cli";
import { readLatestExecutionAttempt } from "../../scripts/project-production/adapters/progress";
import {
  buildArtifactAttestation,
  buildProducerTaskSpec,
} from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("project production CLI exposes the fixed continuation and task terminal surface", async () => {
  const context = {
    rootDir: process.cwd(),
    stdout: () => undefined,
  };
  for (const args of [
    [],
    ["production:start"],
    ["production:finalize"],
    ["delivery:build"],
    ["project:build"],
    ["plan"],
    ["inspect"],
    ["prepare"],
    ["task-check"],
    ["task-commit"],
    ["task-fail"],
    ["continue"],
    ["converge"],
  ]) {
    await assert.rejects(() => runProjectProductionCli(args, context));
  }
  await assert.rejects(
    () =>
      runProjectProductionCli(["task-check", "--task", "../escape"], context),
    /Invalid|string|task/iu,
  );
});

test("package scripts have one honest create/inspect/prepare production surface and no compatibility shims", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.deepEqual(
    {
      create: packageJson.scripts["project:create"],
      inspect: packageJson.scripts["project:produce:inspect"],
      prepare: packageJson.scripts["project:produce:prepare"],
      check: packageJson.scripts["project:task:check"],
      commit: packageJson.scripts["project:task:commit"],
      fail: packageJson.scripts["project:task:fail"],
      continue: packageJson.scripts["project:produce:continue"],
    },
    {
      create: "node --import tsx scripts/projects/create.ts",
      inspect: "node --import tsx scripts/project-production/cli.ts inspect",
      prepare: "node --import tsx scripts/project-production/cli.ts prepare",
      check: "node --import tsx scripts/project-production/cli.ts task-check",
      commit: "node --import tsx scripts/project-production/cli.ts task-commit",
      fail: "node --import tsx scripts/project-production/cli.ts task-fail",
      continue: "node --import tsx scripts/project-production/cli.ts continue",
    },
  );
  for (const removed of [
    ["project", "configure"].join(":"),
    ["project", "produce", "plan"].join(":"),
    "production:preflight",
    "production:start",
    "production:status",
    "production:narrative",
    "production:scene:freeze",
    "production:scene:check",
    "production:global-visual:check",
    "production:owner:ready",
    "production:owner:failed",
    "production:finalize",
    "production:render-ready:check",
    "delivery:cover:freeze",
    "delivery:cover:check",
    "delivery:build",
    "delivery:check",
    "project:build",
    "project:produce:converge",
  ]) {
    assert.equal(packageJson.scripts[removed], undefined, removed);
  }
});

test("inspect and prepare each emit one stable structured JSON document", async () => {
  const taskRevision = `task-${"1".repeat(64)}` as const;
  const revisionId = `revision-${"2".repeat(64)}` as const;
  const taskExplanation = {
    taskKind: "scene-owner" as const,
    subject: { kind: "meaning" as const, id: "opening" },
    taskRevision,
    baselineTaskRevision: null,
    action: "dispatch-agent" as const,
    artifactState: "missing" as const,
    directChanges: [{ kind: "input" as const, id: "brief" as const }],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "complete" as const,
  };
  const estimatedCost = {
    providerRequests: 1,
    providerCacheHits: 2,
    agentTasks: 1,
    deliveryMedia: ["video", "cover-4x3", "cover-3x4"] as const,
  };
  const inspection = {
    schemaVersion: 1,
    contractVersion: "production-inspection-v1",
    storyId: "story-example",
    sourceState: "production-inputs-ready",
    currentRevisionId: revisionId,
    baseline: { kind: "none", revisionId: null },
    estimatedCost,
    tasks: [taskExplanation],
    nextAction: "prepare-production",
  } as const;
  const inspectLines: string[] = [];
  const inspectContext = {
    rootDir: "/fixture",
    stdout: (line: string) => inspectLines.push(line),
    inspectProduction: (async () => inspection) as never,
  };
  await runProjectProductionCli(
    ["inspect", "--project", "story-example"],
    inspectContext,
  );
  await runProjectProductionCli(
    ["inspect", "--project", "story-example"],
    inspectContext,
  );
  assert.equal(inspectLines.length, 2);
  assert.equal(inspectLines[0], inspectLines[1]);
  assert.deepEqual(JSON.parse(inspectLines[0] ?? "null"), inspection);

  const prepared = {
    status: "project-production-prepared",
    storyId: "story-example",
    attemptId: "00000000-0000-4000-8000-000000000001",
    revisionId,
    summary: {
      reusedTaskCount: 2,
      dirtyAgentTaskCount: 1,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
    reusedByTaskKind: [{ taskKind: "narration-chunk", reusedTaskCount: 2 }],
    estimatedCost,
    actualCost: {
      providerRequests: 1,
      providerCacheHits: 2,
      agentTasks: 1,
      deliveryMedia: [],
    },
    taskExplanations: [taskExplanation],
    dirtyAgentTasks: [
      {
        taskKind: "scene-owner",
        subject: taskExplanation.subject,
        taskRevision,
        workspace: `.producer-work/story-example/${taskRevision}`,
        changedInputs: ["brief"],
        blockedBy: [],
        checkCommand: `npm run project:task:check -- --task ${taskRevision}`,
        commitCommand: `npm run project:task:commit -- --task ${taskRevision} --attempt 00000000-0000-4000-8000-000000000001`,
        taskFailureCommand: `npm run project:task:fail -- --task ${taskRevision} --attempt 00000000-0000-4000-8000-000000000001 --kind task`,
        hostFailureCommand: `npm run project:task:fail -- --task ${taskRevision} --attempt 00000000-0000-4000-8000-000000000001 --kind host`,
      },
    ],
    continuationCommand: `npm run project:produce:continue -- --project story-example --revision ${revisionId} --attempt 00000000-0000-4000-8000-000000000001`,
    nextAction: "dispatch-agent-tasks-then-start-fixed-continuation",
  } as const;
  const prepareLines: string[] = [];
  const output = await runProjectProductionCli(
    ["prepare", "--project", "story-example"],
    {
      rootDir: "/fixture",
      stdout: (line) => prepareLines.push(line),
      prepareProduction: (async () => prepared) as never,
    },
  );
  assert.deepEqual(output, prepared);
  assert.deepEqual(prepareLines, [JSON.stringify(prepared)]);
  assert.deepEqual(prepared.reusedByTaskKind, [
    { taskKind: "narration-chunk", reusedTaskCount: 2 },
  ]);
  assert.deepEqual(prepared.dirtyAgentTasks[0]?.changedInputs, ["brief"]);
  assert.deepEqual(prepared.dirtyAgentTasks[0]?.blockedBy, []);
  assert.equal(
    prepared.nextAction,
    "dispatch-agent-tasks-then-start-fixed-continuation",
  );
  assert.doesNotMatch(
    JSON.stringify(prepared),
    /ttsText|provider error|\/private\/|\/fixture\//iu,
  );
});

test("task-commit binds terminal outcomes to the explicit attempt", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-task-commit-attempt-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: sha("2") },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-owner-validator-v1",
  });
  const artifact = buildArtifactAttestation({
    storyId: task.storyId,
    taskKind: task.taskKind,
    semanticId: task.semanticId,
    taskRevision: task.taskRevision,
    validatorPolicyVersion: task.validatorPolicyVersion,
    dependencyArtifacts: task.dependencyArtifacts,
    outputManifest: [
      {
        logicalPath: "src/Renderer.tsx",
        checksum: sha("3"),
        sizeBytes: 1,
        kind: "file",
      },
    ],
  });
  const readWorkspace = async () => ({ task, workspace: "/unused" });
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const outcomes: unknown[] = [];
  const appendTaskOutcome = async (input: unknown) => {
    outcomes.push(input);
    return {} as never;
  };
  await assert.rejects(
    runProjectProductionCli(
      ["task-commit", "--task", task.taskRevision, "--attempt", attemptId],
      {
        rootDir,
        stdout: () => undefined,
        readWorkspace,
        appendTaskOutcome: appendTaskOutcome as never,
        commitTaskArtifact: async () => {
          throw new Error("validator rejected output");
        },
      },
    ),
    /validator rejected/u,
  );
  const failed = await readLatestExecutionAttempt({
    rootDir,
    storyId: task.storyId,
  });
  assert.equal(failed, null);

  const output = await runProjectProductionCli(
    ["task-commit", "--task", task.taskRevision, "--attempt", attemptId],
    {
      rootDir,
      stdout: () => undefined,
      readWorkspace,
      appendTaskOutcome: appendTaskOutcome as never,
      commitTaskArtifact: async () => ({
        attestation: artifact,
        reused: false,
      }),
    },
  );
  assert.ok("attemptRecorded" in output);
  assert.equal(output.status, "producer-artifact-committed");
  assert.equal(output.attemptRecorded, true);
  assert.equal(outcomes.length, 2);
  const committed = await readLatestExecutionAttempt({
    rootDir,
    storyId: task.storyId,
  });
  assert.equal(committed, null);
});

test("task-fail records a safe attempt-bound terminal and continue delegates to fixed code", async () => {
  const task = buildProducerTaskSpec({
    taskKind: "cover-owner",
    storyId: "story-example",
    semanticId: null,
    revisionId: `revision-${"5".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: sha("6") },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["public/cover-4x3.png"],
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const attemptId = "00000000-0000-4000-8000-000000000002";
  const recorded: unknown[] = [];
  const failed = await runProjectProductionCli(
    [
      "task-fail",
      "--task",
      task.taskRevision,
      "--attempt",
      attemptId,
      "--kind",
      "host",
    ],
    {
      rootDir: "/fixture",
      stdout: () => undefined,
      readWorkspace: (async () => ({ task, workspace: "/unused" })) as never,
      appendTaskOutcome: (async (input: unknown) => {
        recorded.push(input);
        return {} as never;
      }) as never,
    },
  );
  assert.equal(
    (failed as { status: string }).status,
    "producer-task-failure-recorded",
  );
  assert.match(JSON.stringify(recorded), /producer-agent-host-failed/u);

  const continued = await runProjectProductionCli(
    [
      "continue",
      "--project",
      task.storyId,
      "--revision",
      task.revisionId,
      "--attempt",
      attemptId,
    ],
    {
      rootDir: "/fixture",
      stdout: () => undefined,
      continueProduction: (async (input: unknown) => ({
        status: "project-production-current",
        ...(input as object),
      })) as never,
    },
  );
  const continuedOutput = continued as {
    status: string;
    attemptId: string;
  };
  assert.equal(continuedOutput.status, "project-production-current");
  assert.equal(continuedOutput.attemptId, attemptId);
});
