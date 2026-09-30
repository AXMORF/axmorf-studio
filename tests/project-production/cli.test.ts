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
  buildTaskWorkerBindingId,
} from "@axmorf/studio/contracts";

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
    /Invalid|string|task|attempt/iu,
  );
  for (const command of ["task-check", "task-commit"] as const) {
    await assert.rejects(
      runProjectProductionCli(
        [
          command,
          "--task",
          `task-${"1".repeat(64)}`,
          "--attempt",
          "00000000-0000-4000-8000-000000000001",
        ],
        context,
      ),
      /Missing --binding value/u,
    );
  }
});

test("task file-write accepts exactly one bound base64 JSON document", async () => {
  const calls: unknown[] = [];
  const args = [
    "task-file-write",
    "--task",
    `task-${"1".repeat(64)}`,
    "--attempt",
    "00000000-0000-4000-8000-000000000001",
    "--binding",
    `binding-${"2".repeat(64)}`,
    "--path",
    "src/Renderer.tsx",
  ] as const;
  const result = await runProjectProductionCli(args, {
    rootDir: "/fixture",
    stdout: () => undefined,
    stdin: async () => JSON.stringify({ contentBase64: "YWJj" }),
    writeTaskFile: (async (input: unknown) => {
      calls.push(input);
      return { status: "task-worker-file-written" };
    }) as never,
  });
  assert.deepEqual(calls, [
    {
      rootDir: "/fixture",
      taskRevision: `task-${"1".repeat(64)}`,
      attemptId: "00000000-0000-4000-8000-000000000001",
      bindingId: `binding-${"2".repeat(64)}`,
      logicalPath: "src/Renderer.tsx",
      contentBase64: "YWJj",
    },
  ]);
  assert.deepEqual(result, { status: "task-worker-file-written" });

  await assert.rejects(
    runProjectProductionCli(args, {
      rootDir: "/fixture",
      stdout: () => undefined,
      stdin: async () => JSON.stringify({ contentBase64: "YWJj", extra: true }),
      writeTaskFile: (async () => {
        throw new Error("unreachable");
      }) as never,
    }),
    /must contain contentBase64/u,
  );
});

test("package scripts have one honest resolve/inspect/prepare production surface and no compatibility shims", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.deepEqual(
    {
      create: packageJson.scripts["project:create"],
      resolve: packageJson.scripts["project:execution:resolve"],
      inspect: packageJson.scripts["project:produce:inspect"],
      prepare: packageJson.scripts["project:produce:prepare"],
      bind: packageJson.scripts["project:task:bind"],
      describe: packageJson.scripts["project:task:describe"],
      finalize: packageJson.scripts["project:task:finalize"],
      check: packageJson.scripts["project:task:check"],
      commit: packageJson.scripts["project:task:commit"],
      fail: packageJson.scripts["project:task:fail"],
      fileRead: packageJson.scripts["project:task:file-read"],
      fileWrite: packageJson.scripts["project:task:file-write"],
      recoverInspect: packageJson.scripts["project:attempt:recover-inspect"],
      reissue: packageJson.scripts["project:attempt:reissue"],
      continue: packageJson.scripts["project:produce:continue"],
    },
    {
      create: "node --import tsx scripts/projects/create.ts",
      resolve:
        "node --import tsx scripts/project-production/cli.ts execution-resolve",
      inspect: "node --import tsx scripts/project-production/cli.ts inspect",
      prepare: "node --import tsx scripts/project-production/cli.ts prepare",
      bind: "node --import tsx scripts/project-production/cli.ts task-bind",
      describe:
        "node --import tsx scripts/project-production/cli.ts task-describe",
      finalize:
        "node --import tsx scripts/project-production/cli.ts task-finalize",
      check: "node --import tsx scripts/project-production/cli.ts task-check",
      commit: "node --import tsx scripts/project-production/cli.ts task-commit",
      fail: "node --import tsx scripts/project-production/cli.ts task-fail",
      fileRead:
        "node --import tsx scripts/project-production/cli.ts task-file-read",
      fileWrite:
        "node --import tsx scripts/project-production/cli.ts task-file-write",
      recoverInspect:
        "node --import tsx scripts/project-production/cli.ts attempt-recover-inspect",
      reissue:
        "node --import tsx scripts/project-production/cli.ts attempt-reissue",
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

test("execution-resolve passes explicit user fields and runtime capacity once", async () => {
  const lines: string[] = [];
  const calls: unknown[] = [];
  const result = await runProjectProductionCli(
    [
      "execution-resolve",
      "--mode",
      "subagents",
      "--max-concurrency",
      "8",
      "--require-exact-concurrency",
      "--runtime-max-concurrency",
      "6",
      "--worker-transport",
      "controller-io",
    ],
    {
      rootDir: "/fixture",
      stdout: (line) => lines.push(line),
      resolveAgentExecution: (async (input: unknown) => {
        calls.push(input);
        return { status: "blocked", effectiveMaxConcurrency: 4 };
      }) as never,
    },
  );
  assert.deepEqual(calls, [
    {
      rootDir: "/fixture",
      override: {
        mode: "subagents",
        maxConcurrency: 8,
        requireExactConcurrency: true,
      },
      runtimeMaxConcurrency: 6,
      runtimeWorkerTransport: "controller-io",
    },
  ]);
  assert.deepEqual(result, {
    status: "blocked",
    effectiveMaxConcurrency: 4,
  });
  assert.deepEqual(lines, [JSON.stringify(result)]);
  await assert.rejects(
    runProjectProductionCli(
      ["execution-resolve", "--mode", "inline", "--max-concurrency", "2"],
      {
        rootDir: "/fixture",
        stdout: () => undefined,
      },
    ),
    /does not accept/u,
  );
  const zeroCapacityCalls: unknown[] = [];
  await runProjectProductionCli(
    ["execution-resolve", "--runtime-max-concurrency", "0"],
    {
      rootDir: "/fixture",
      stdout: () => undefined,
      resolveAgentExecution: (async (input: unknown) => {
        zeroCapacityCalls.push(input);
        return { status: "blocked", effectiveMaxConcurrency: 0 };
      }) as never,
    },
  );
  assert.deepEqual(zeroCapacityCalls, [
    { rootDir: "/fixture", runtimeMaxConcurrency: 0 },
  ]);
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
  const handoff = JSON.parse(inspectLines[0]!).agentHandoff;
  assert.match(handoff.instruction, /intermediate progress message/u);
  assert.match(handoff.instruction, /not a final answer/u);
  assert.match(handoff.instruction, /same turn/u);
  assert.match(handoff.instruction, /blocker/u);
  assert.deepEqual(JSON.parse(inspectLines[0] ?? "null"), {
    agentHandoff: {
      nextAction: "report-to-user-before-prepare-production",
      summary:
        "sourceState=production-inputs-ready; estimatedProviderRequests=1; providerCacheHits=2; estimatedAgentTasks=1; artifactReuse=0; nonReusableTasks=1; actualDurationSeconds=not-measured.",
      instruction:
        "After this tool returns, report these read-only facts and the task invalidation explanations in an intermediate progress message, not a final answer. Then continue the authorized next production action with tools in the same turn. Do not stop after the report or wait for a user reply unless an actual blocker requires it. CLI output is not that report. Existing production authorization needs no new confirmation; this handoff is diagnostic only.",
    },
    ...inspection,
  });

  for (const value of [0, null]) {
    const lines: string[] = [];
    await runProjectProductionCli(["inspect", "--project", "story-example"], {
      ...inspectContext,
      stdout: (line) => lines.push(line),
      inspectProduction: (async () => ({
        ...inspection,
        sourceState: "configured-authoring",
        currentRevisionId: null,
        tasks: [],
        estimatedCost: {
          providerRequests: value,
          providerCacheHits: value,
          agentTasks: value,
          deliveryMedia: null,
        },
        nextAction: "prepare-narration",
      })) as never,
    });
    const result = JSON.parse(lines[0]!);
    assert.equal(
      result.agentHandoff.summary,
      `sourceState=configured-authoring; estimatedProviderRequests=${value === null ? "unknown" : 0}; providerCacheHits=${value === null ? "unknown" : 0}; estimatedAgentTasks=${value === null ? "unknown" : 0}; artifactReuse=not-planned; nonReusableTasks=not-planned; actualDurationSeconds=not-measured.`,
    );
    assert.equal(
      result.agentHandoff.nextAction,
      "report-to-user-before-prepare-narration",
    );
    assert.equal(result.nextAction, "prepare-narration");
  }

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
        bindingId: buildTaskWorkerBindingId({
          taskRevision,
          attemptId: "00000000-0000-4000-8000-000000000001",
        }),
        bindCommands: {
          sharedWorkspace: "npm run project:task:bind -- shared-workspace",
          controllerIo: "npm run project:task:bind -- controller-io",
        },
        describeCommand: "npm run project:task:describe -- bound",
        finalizeCommand: "npm run project:task:finalize -- bound",
        checkCommand: "npm run project:task:check -- bound",
        commitCommand: "npm run project:task:commit -- bound",
        taskFailureCommand: "npm run project:task:fail -- bound --kind task",
        fixedFailureCommand: "npm run project:task:fail -- bound --kind fixed",
        spawnFailureCommand: "npm run project:task:fail -- bound --kind host",
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
    validatorPolicyVersion: "scene-owner-validator-v2",
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
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const bindingId = `binding-${"a".repeat(64)}`;
  const outcomes: unknown[] = [];
  const appendTaskOutcome = async (input: unknown) => {
    outcomes.push(input);
    return {} as never;
  };
  await assert.rejects(
    runProjectProductionCli(
      [
        "task-commit",
        "--task",
        task.taskRevision,
        "--attempt",
        attemptId,
        "--binding",
        bindingId,
      ],
      {
        rootDir,
        stdout: () => undefined,
        assertTaskBinding: (async () => ({
          task,
          workspace: "/unused",
        })) as never,
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
    [
      "task-commit",
      "--task",
      task.taskRevision,
      "--attempt",
      attemptId,
      "--binding",
      bindingId,
    ],
    {
      rootDir,
      stdout: () => undefined,
      assertTaskBinding: (async () => ({
        task,
        workspace: "/unused",
      })) as never,
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
  const bindingId = `binding-${"b".repeat(64)}`;
  const recorded: unknown[] = [];
  const failed = await runProjectProductionCli(
    [
      "task-fail",
      "--task",
      task.taskRevision,
      "--attempt",
      attemptId,
      "--binding",
      bindingId,
      "--kind",
      "host",
    ],
    {
      rootDir: "/fixture",
      stdout: () => undefined,
      assertFailureAuthority: (async () => ({
        task,
        workspace: "/unused",
      })) as never,
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
