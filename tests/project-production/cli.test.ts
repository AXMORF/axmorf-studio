import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runProjectProductionCli } from "../../scripts/project-production/cli";
import { readLatestExecutionAttempt } from "../../scripts/project-production/adapters/progress";
import {
  createRepositoryProductionLocations,
  createRuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import {
  buildArtifactAttestation,
  buildProducerConfig,
  buildProducerTaskSpec,
} from "../../src/contracts";
import { validProjectCreateProducerConfig } from "../fixtures/project-create";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const producerConfig = buildProducerConfig(validProjectCreateProducerConfig);
const runtime = createRuntimeExecutionResources({
  rendererRuntimeFingerprint: sha("f"),
  browserExecutable: "/runtime/browser",
  binariesDirectory: "/runtime/bin",
  ffmpegExecutable: "/runtime/bin/ffmpeg",
  ffprobeExecutable: "/runtime/bin/ffprobe",
});
const loadProducerConfig = async () => producerConfig;
const resolveRuntime = async () => runtime;

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
      check: packageJson.scripts["project:task:check"],
      commit: packageJson.scripts["project:task:commit"],
      fail: packageJson.scripts["project:task:fail"],
      continue: packageJson.scripts["project:produce:continue"],
    },
    {
      create: "node --import tsx scripts/projects/create.ts",
      resolve:
        "node --import tsx scripts/project-production/cli.ts execution-resolve",
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

test("application production orchestration has no repository command or Delivery default", async () => {
  const [
    prepareSource,
    continueSource,
    convergeSource,
    deliverySource,
    repositoryDeliverySource,
    cliSource,
    repositoryCommands,
  ] = await Promise.all([
    readFile(
      "scripts/project-production/application/prepare-production.ts",
      "utf8",
    ),
    readFile(
      "scripts/project-production/application/continue-production.ts",
      "utf8",
    ),
    readFile(
      "scripts/project-production/application/converge-artifacts.ts",
      "utf8",
    ),
    readFile(
      "scripts/project-production/application/build-delivery.ts",
      "utf8",
    ),
    readFile(
      "scripts/project-production/application/repository-delivery.ts",
      "utf8",
    ),
    readFile("scripts/project-production/cli.ts", "utf8"),
    readFile(
      "scripts/project-production/adapters/repository-production-command-formatter.ts",
      "utf8",
    ),
  ]);
  const applicationSource = `${prepareSource}\n${continueSource}\n${convergeSource}`;
  assert.doesNotMatch(applicationSource, /npm run project:/u);
  assert.doesNotMatch(convergeSource, /import\s*\{[^}]*buildDeliveryUnlocked/u);
  assert.match(convergeSource, /import type \{ DeliveryBuildPort \}/u);
  assert.doesNotMatch(convergeSource, /node:os|tmpdir\(/u);
  assert.match(convergeSource, /locations\.disposableBuildRoot/u);
  assert.match(continueSource, /converge: ProductionConvergencePort/u);
  assert.match(prepareSource, /commandFormatter: ProductionCommandFormatter/u);
  assert.doesNotMatch(
    deliverySource,
    /createRepositoryProjectStorage|\?\?\s*(?:render|inspect)Project/u,
  );
  assert.match(
    repositoryDeliverySource,
    /createRepositoryProjectStorageFromProductionLocations/u,
  );
  assert.match(repositoryDeliverySource, /renderProjectVideo/u);
  assert.match(repositoryDeliverySource, /inspectProjectCover/u);
  assert.match(cliSource, /buildRepositoryDeliveryUnlocked/u);
  assert.match(cliSource, /buildCurrentRepositoryDelivery/u);
  assert.match(repositoryCommands, /npm run project:task:check/u);
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
  const runtimeModes: string[] = [];
  const resolveCommandRuntime = async (input: { readonly mode: string }) => {
    runtimeModes.push(input.mode);
    return runtime;
  };
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
    sourceCurrentId: null,
    deliveryBuildId: null,
    baseline: { kind: "none", revisionId: null },
    estimatedCost,
    tasks: [taskExplanation],
    nextAction: "prepare-production",
  } as const;
  const inspectLines: string[] = [];
  const inspectContext = {
    rootDir: "/fixture",
    stdout: (line: string) => inspectLines.push(line),
    loadProducerConfig,
    resolveRuntime: resolveCommandRuntime,
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
      loadProducerConfig,
      resolveRuntime: resolveCommandRuntime,
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
  assert.deepEqual(runtimeModes, ["read-only", "read-only", "ensure"]);
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
  const readWorkspace = async () => ({ task, workspace: "/unused" });
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const outcomes: unknown[] = [];
  let authorityChecks = 0;
  let commitCalls = 0;
  const assertTaskAuthority = async () => {
    authorityChecks += 1;
    return {} as never;
  };
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
        assertTaskAuthority,
        appendTaskOutcome: appendTaskOutcome as never,
        commitTaskArtifact: async () => {
          commitCalls += 1;
          throw new Error("validator rejected output");
        },
      },
    ),
    /validator rejected/u,
  );
  const failed = await readLatestExecutionAttempt({
    locations: createRepositoryProductionLocations({
      repositoryRoot: rootDir,
    }),
    storyId: task.storyId,
  });
  assert.equal(failed, null);

  const output = await runProjectProductionCli(
    ["task-commit", "--task", task.taskRevision, "--attempt", attemptId],
    {
      rootDir,
      stdout: () => undefined,
      readWorkspace,
      assertTaskAuthority,
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
  assert.equal(authorityChecks, 2);
  assert.equal(commitCalls, 1);
  assert.equal(outcomes.length, 2);
  const committed = await readLatestExecutionAttempt({
    locations: createRepositoryProductionLocations({
      repositoryRoot: rootDir,
    }),
    storyId: task.storyId,
  });
  assert.equal(committed, null);

  let unauthorizedCommitCalls = 0;
  let unauthorizedOutcomeCalls = 0;
  await assert.rejects(
    runProjectProductionCli(
      ["task-commit", "--task", task.taskRevision, "--attempt", attemptId],
      {
        rootDir,
        stdout: () => undefined,
        readWorkspace,
        assertTaskAuthority: async () => {
          throw new Error(
            "Execution attempt is not the active task authority.",
          );
        },
        commitTaskArtifact: async () => {
          unauthorizedCommitCalls += 1;
          return { attestation: artifact, reused: false };
        },
        appendTaskOutcome: (async () => {
          unauthorizedOutcomeCalls += 1;
          return {} as never;
        }) as never,
      },
    ),
    /not the active task authority/u,
  );
  assert.equal(unauthorizedCommitCalls, 0);
  assert.equal(unauthorizedOutcomeCalls, 0);
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
      assertTaskAuthority: (async () => ({})) as never,
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

  let unauthorizedOutcomeCalls = 0;
  await assert.rejects(
    runProjectProductionCli(
      [
        "task-fail",
        "--task",
        task.taskRevision,
        "--attempt",
        attemptId,
        "--kind",
        "task",
      ],
      {
        rootDir: "/fixture",
        stdout: () => undefined,
        readWorkspace: (async () => ({ task, workspace: "/unused" })) as never,
        assertTaskAuthority: async () => {
          throw new Error(
            "Execution attempt is not the active task authority.",
          );
        },
        appendTaskOutcome: (async () => {
          unauthorizedOutcomeCalls += 1;
          return {} as never;
        }) as never,
      },
    ),
    /not the active task authority/u,
  );
  assert.equal(unauthorizedOutcomeCalls, 0);

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
      loadProducerConfig,
      resolveRuntime,
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

  const deliveryCalls: unknown[] = [];
  const delivery = await runProjectProductionCli(
    ["delivery-build", "--project", task.storyId],
    {
      rootDir: "/fixture",
      stdout: () => undefined,
      loadProducerConfig,
      resolveRuntime,
      buildDelivery: (async (input: unknown) => {
        deliveryCalls.push(input);
        return { status: "project-production-current" };
      }) as never,
    },
  );
  assert.deepEqual(delivery, { status: "project-production-current" });
  assert.deepEqual(deliveryCalls, [
    {
      locations: createRepositoryProductionLocations({
        repositoryRoot: "/fixture",
      }),
      runtime,
      config: producerConfig,
      projectId: task.storyId,
    },
  ]);
});
