import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildProducerConfig,
  buildProducerPlan,
  buildProducerTaskSpec,
  buildProjectAssetManifest,
  serializeCanonicalJson,
  type Sha256Digest,
} from "../../src/contracts";
import type { TaskDiagnosticSnapshot } from "../../src/contracts/execution-attempt";
import {
  createExecutionAttemptForPlan,
  readExecutionAttemptProgress,
} from "../../scripts/project-production/adapters/attempt-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { rspLocalProductionCommandFormatter } from "../../scripts/project-production/adapters/rsp-local-command-formatter";
import { prepareProjectProduction } from "../../scripts/project-production/application/prepare-production";
import {
  createRuntimeExecutionResources,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import {
  createWorkspaceProductionController,
  DESKTOP_PRODUCER_CONFIG_REQUIRED,
} from "../../scripts/project-production/application/workspace-production-controller";
import { createWorkspaceProject } from "../../scripts/projects/workspace-project";
import {
  validProjectCreateInput,
  validProjectCreateProducerConfig,
} from "../fixtures/project-create";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const fixture = async (context: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "workspace-controller-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const runtimeRoot = join(root, "runtime-pack");
  const support = join(root, "support");
  const cache = join(root, "cache");
  await Promise.all([
    mkdir(join(workspace, "projects"), { recursive: true }),
    mkdir(join(workspace, "media"), { recursive: true }),
    mkdir(join(workspace, ".rsp/current"), { recursive: true }),
    mkdir(join(runtimeRoot, "bin"), { recursive: true }),
    mkdir(join(runtimeRoot, "browser"), { recursive: true }),
    mkdir(support, { recursive: true }),
    mkdir(cache, { recursive: true }),
    cp(
      join(import.meta.dirname, "../../src"),
      join(runtimeRoot, "source/src"),
      {
        recursive: true,
      },
    ),
    cp(
      join(
        import.meta.dirname,
        "../../desktop/resources/workspace-integration/assets",
      ),
      join(runtimeRoot, "shared-assets"),
      { recursive: true },
    ),
  ]);
  for (const path of [
    "bin/remotion",
    "browser/headless",
    "bin/ffmpeg",
    "bin/ffprobe",
  ]) {
    await writeFile(join(runtimeRoot, path), "runtime\n");
  }
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: workspace,
    applicationSupportRoot: support,
    runtimeResources: runtimeRoot,
    cacheRoot: cache,
  });
  const runtime = createRuntimeExecutionResources({
    rendererRuntimeFingerprint: sha("a"),
    browserExecutable: join(runtimeRoot, "browser/headless"),
    binariesDirectory: join(runtimeRoot, "bin"),
    ffmpegExecutable: join(runtimeRoot, "bin/ffmpeg"),
    ffprobeExecutable: join(runtimeRoot, "bin/ffprobe"),
  });
  return {
    root,
    workspace,
    locations,
    runtime,
    config: buildProducerConfig(validProjectCreateProducerConfig),
  } as const;
};

const errorCode = (expected: string) => (error: unknown) =>
  error instanceof Error &&
  "code" in error &&
  (error as Error & { code: unknown }).code === expected;

const deliveryRuntime = () => ({
  build: async () => {
    throw new Error("fixture-workspace-delivery-build-invoked");
  },
  buildUnlocked: async () => {
    throw new Error("fixture-workspace-delivery-build-unlocked-invoked");
  },
  shutdown: async () => undefined,
});

test("Workspace controller constructs without config and keeps context plus inspect config-safe", async (context) => {
  const value = await fixture(context);
  await createWorkspaceProject({
    locations: value.locations,
    runtime: value.runtime,
    config: value.config,
    input: validProjectCreateInput,
  });
  let configLoads = 0;
  const controller = await createWorkspaceProductionController({
    locations: value.locations,
    runtime: value.runtime,
    delivery: deliveryRuntime(),
    loadProducerConfig: async () => {
      configLoads += 1;
      return null;
    },
  });

  assert.equal(configLoads, 0);
  const project = (await controller.context("story-example")) as {
    storyId: string;
    controlPlane: {
      provider: { readiness: string; configState: string };
      deliveryPolicy: { value: string; source: string };
      execution: { mode: string; source: { mode: string } };
    };
  };
  assert.equal(project.storyId, "story-example");
  assert.deepEqual(project.controlPlane.provider, {
    readiness: "not-configured",
    configState: "not-configured",
    defaultProviderKind: null,
    defaultVoiceProfileId: null,
  });
  assert.deepEqual(project.controlPlane.deliveryPolicy, {
    value: "manual",
    source: "app-default",
  });
  assert.equal(project.controlPlane.execution.mode, "inline");
  assert.equal(project.controlPlane.execution.source.mode, "builtin-default");
  assert.equal(configLoads, 1);
  assert.deepEqual(await controller.inspect("story-example"), {
    status: DESKTOP_PRODUCER_CONFIG_REQUIRED,
    storyId: "story-example",
    nextAction: "configure-provider",
  });
  assert.equal(configLoads, 2);

  await assert.rejects(
    controller.createProject(validProjectCreateInput),
    errorCode(DESKTOP_PRODUCER_CONFIG_REQUIRED),
  );
  await assert.rejects(
    controller.prepare("story-example"),
    errorCode(DESKTOP_PRODUCER_CONFIG_REQUIRED),
  );
  assert.equal(configLoads, 4);
});

test("Workspace context resolves command over Project over manual App default and projects saved execution", async (context) => {
  const value = await fixture(context);
  await createWorkspaceProject({
    locations: value.locations,
    runtime: value.runtime,
    config: value.config,
    input: validProjectCreateInput,
  });
  const projectSettingsRoot = join(
    value.locations.privateConfigRoot,
    "project-settings",
  );
  await mkdir(projectSettingsRoot, { recursive: true });
  await writeFile(
    join(projectSettingsRoot, "story-example.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      contractVersion: "desktop-project-control-settings-v1",
      storyId: "story-example",
      deliveryPolicy: "automatic",
    })}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(value.locations.privateConfigRoot, "execution-preferences.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      contractVersion: "execution-preferences-v1",
      creativeTaskExecution: { mode: "subagents", maxConcurrency: 3 },
    })}\n`,
    { mode: 0o600 },
  );
  let configLoads = 0;
  const controller = await createWorkspaceProductionController({
    locations: value.locations,
    runtime: value.runtime,
    delivery: deliveryRuntime(),
    loadProducerConfig: async () => {
      configLoads += 1;
      return value.config;
    },
    providerReadiness: "ready",
  });

  const saved = await controller.context("story-example");
  assert.deepEqual(saved.controlPlane.deliveryPolicy, {
    value: "automatic",
    source: "project-setting",
  });
  assert.equal(saved.controlPlane.execution.mode, "subagents");
  assert.equal(saved.controlPlane.execution.requestedMaxConcurrency, 3);
  assert.equal(saved.controlPlane.execution.effectiveMaxConcurrency, 1);
  assert.deepEqual(saved.controlPlane.execution.limitedBy, [
    "runtime-unknown-default",
  ]);
  assert.equal(saved.controlPlane.execution.source.mode, "settings");
  assert.equal(saved.controlPlane.provider.readiness, "ready");
  assert.equal(saved.controlPlane.provider.configState, "configured");
  assert.equal(saved.controlPlane.provider.defaultProviderKind, "voxcpm");
  assert.doesNotMatch(
    serializeCanonicalJson(saved.controlPlane),
    /connection|endpoint|credential|token|private|absolute|path/iu,
  );

  const overridden = await controller.context("story-example", {
    deliveryPolicy: "manual",
    execution: { mode: "inline" },
  });
  assert.deepEqual(overridden.controlPlane.deliveryPolicy, {
    value: "manual",
    source: "command-override",
  });
  assert.equal(overridden.controlPlane.execution.mode, "inline");
  assert.equal(overridden.controlPlane.execution.source.mode, "user-prompt");

  assert.equal(configLoads, 2);
});

test("automatic production and explicit Delivery cross the injected Workspace port instead of a blocker", async (context) => {
  const value = await fixture(context);
  let configLoads = 0;
  const controller = await createWorkspaceProductionController({
    locations: value.locations,
    runtime: value.runtime,
    delivery: deliveryRuntime(),
    loadProducerConfig: async () => {
      configLoads += 1;
      return value.config;
    },
  });
  const routed = [
    () => controller.prepare("story-example", "automatic"),
    () =>
      controller.execute({
        command: "prepare",
        storyId: "story-example",
        deliveryPolicy: "automatic",
      }),
    () => controller.buildDelivery("story-example"),
    () =>
      controller.execute({
        command: "delivery-build",
        storyId: "story-example",
      }),
    () =>
      controller.continueProduction({
        projectId: "story-example",
        revisionId: `revision-${"1".repeat(64)}`,
        attemptId: "00000000-0000-4000-8000-000000000001",
        deliveryPolicy: "automatic",
      }),
  ];
  for (const invoke of routed) {
    await assert.rejects(invoke, (error: unknown) => {
      assert.equal(
        errorCode("desktop-remotion-zero-tcp-unavailable")(error),
        false,
      );
      return true;
    });
  }
  assert.equal(configLoads > 0, true);
});

const acquisition = () => ({
  schemaVersion: 1,
  acquisitionId: "pexels:2014422",
  provider: "pexels",
  providerAssetId: "2014422",
  sourcePageUrl: "https://www.pexels.com/photo/granite-2014422/",
  creator: {
    name: "Fixture Photographer",
    profileUrl: "https://www.pexels.com/@fixture-photographer",
  },
  license: {
    name: "Pexels License",
    url: "https://www.pexels.com/license/",
  },
  providerPolicy: {
    attributionRequired: true,
    attributionText: "Photo by Fixture Photographer on Pexels",
  },
  acquiredAt: "2026-08-12T00:00:00.000Z",
  file: {
    relativePath: "original.png",
    mimeType: "image/png",
    width: 1,
    height: 1,
    sizeInBytes: PNG.byteLength,
    sha256: createHash("sha256").update(PNG).digest("hex"),
  },
});

test("asset route preserves the exact Workspace authority and request payload", async (context) => {
  const value = await fixture(context);
  const projectId = "story-example";
  await Promise.all([
    mkdir(join(value.locations.projectSourceRoot, projectId, "generated"), {
      recursive: true,
    }),
    mkdir(join(value.locations.projectMediaRoot, projectId), {
      recursive: true,
    }),
  ]);
  await writeFile(
    join(value.locations.projectSourceRoot, projectId, "assets.manifest.json"),
    `${serializeCanonicalJson(
      buildProjectAssetManifest({
        projectId,
        assets: [],
        externalAssets: [],
      }),
    )}\n`,
  );
  let configLoads = 0;
  const controller = await createWorkspaceProductionController({
    locations: value.locations,
    runtime: value.runtime,
    delivery: deliveryRuntime(),
    loadProducerConfig: async () => {
      configLoads += 1;
      return null;
    },
  });
  const imported = (await controller.execute({
    command: "asset-import",
    storyId: projectId,
    role: "global-visual",
    receipt: acquisition(),
    candidateBase64: PNG.toString("base64"),
  })) as { publicPath: string; resourceId: string };
  const mediaPath = join(
    value.locations.projectMediaRoot,
    projectId,
    "assets",
    `${imported.resourceId}.png`,
  );
  assert.equal(
    imported.publicPath.endsWith(`${imported.resourceId}.png`),
    true,
  );
  assert.deepEqual(await readFile(mediaPath), PNG);
  await access(
    join(
      value.locations.projectSourceRoot,
      projectId,
      "sources/assets",
      imported.resourceId,
      "provider-receipt.json",
    ),
  );
  await assert.rejects(access(join(value.workspace, "public/projects")));
  assert.equal(configLoads, 0);
});

const taskFixture = () => {
  const contextBytes = "{}\n";
  const revisionId = `revision-${"1".repeat(64)}` as const;
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "brief", fingerprint: sha("2") },
      {
        id: "read:inputs/context.json",
        fingerprint: `sha256:${createHash("sha256")
          .update(contextBytes)
          .digest("hex")}`,
      },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-owner-validator-v2",
  });
  if (task.semanticId === null)
    throw new Error("Scene fixture lost meaningId.");
  const decision = {
    taskRevision: task.taskRevision,
    baselineTaskRevision: null,
    taskKind: task.taskKind,
    subject: { kind: "meaning", id: task.semanticId },
    action: "dispatch-agent",
    artifactState: "missing",
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable",
  } as const;
  const plan = buildProducerPlan({
    storyId: task.storyId,
    revisionId,
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
    inputFingerprints: [{ id: "brief", fingerprint: sha("2") }],
    validatorPolicyVersion: task.validatorPolicyVersion,
    declaredReadSet: task.declaredReadSet,
    declaredOutputSet: task.declaredOutputSet,
    dependencies: [],
    decision,
  };
  return { contextBytes, revisionId, task, decision, plan, snapshot } as const;
};

test("Workspace prepare returns rsp-only task and continuation commands", async (context) => {
  const value = await fixture(context);
  const built = taskFixture();
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const result = await prepareProjectProduction(
    {
      locations: value.locations,
      runtime: value.runtime,
      config: value.config,
      projectId: built.task.storyId,
      deliveryPolicy: "manual",
    },
    {
      commandFormatter: rspLocalProductionCommandFormatter,
      acquireLock: async () => ({ release: async () => undefined }),
      inspect: async () =>
        ({
          storyId: built.task.storyId,
          sourceState: "production-inputs-ready",
          currentRevisionId: null,
          baseline: { kind: "none", revisionId: null },
          estimatedCost: {
            providerRequests: 0,
            providerCacheHits: 0,
            agentTasks: 1,
            deliveryMedia: null,
          },
          tasks: [],
          nextAction: "prepare-production",
        }) as never,
      prepareNarration: async () =>
        ({
          actualCost: { providerRequests: 0, providerCacheHits: 0 },
        }) as never,
      projectPendingAuthoring: async () => ({}) as never,
      loadInputs: async () => ({ projectId: built.task.storyId }) as never,
      prepareFixedTasks: async () => undefined,
      buildCurrentPlan: async () =>
        ({
          revision: {
            storyId: built.task.storyId,
            revisionId: built.revisionId,
          },
          plan: built.plan,
          nodes: [],
          subjects: new Map(),
          taskSeeds: new Map([
            [
              built.task.taskRevision,
              { task: built.task, contextBytes: built.contextBytes },
            ],
          ]),
        }) as never,
      createWorkspace: async () =>
        join(
          value.locations.taskWorkspaceRoot,
          built.task.storyId,
          built.task.taskRevision,
        ),
      buildTaskSnapshots: () => [built.snapshot],
      createAttempt: async () => ({ attemptId }) as never,
    },
  );
  assert.equal(result.status, "project-production-prepared");
  const commands = [
    result.dirtyAgentTasks[0]?.checkCommand,
    result.dirtyAgentTasks[0]?.commitCommand,
    result.dirtyAgentTasks[0]?.taskFailureCommand,
    result.dirtyAgentTasks[0]?.hostFailureCommand,
    result.continuationCommand,
  ];
  for (const command of commands) {
    assert.equal(command?.startsWith("./.rsp/bin/rsp "), true);
    assert.doesNotMatch(command ?? "", /\bnpm\b/u);
  }
  assert.match(result.continuationCommand, /--delivery-policy manual$/u);
});

test("task commit and fail routes preserve the caller's exact attempt binding", async (context) => {
  const value = await fixture(context);
  const built = taskFixture();
  await createTaskWorkspace({
    locations: value.locations,
    task: built.task,
    seedFiles: { "inputs/context.json": built.contextBytes },
  });
  const attempt = await createExecutionAttemptForPlan({
    locations: value.locations,
    plan: built.plan,
    taskSnapshots: [built.snapshot],
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
  const controller = await createWorkspaceProductionController({
    locations: value.locations,
    runtime: value.runtime,
    delivery: deliveryRuntime(),
    loadProducerConfig: async () => null,
  });
  const wrongAttemptId = "00000000-0000-4000-8000-000000000002";
  await assert.rejects(
    controller.execute({
      command: "task-commit",
      taskRevision: built.task.taskRevision,
      attemptId: wrongAttemptId,
    }),
    /Execution attempt is missing/u,
  );
  const failed = (await controller.execute({
    command: "task-fail",
    taskRevision: built.task.taskRevision,
    attemptId: attempt.attemptId,
    kind: "host",
  })) as { attemptId: string; taskRevision: string };
  assert.equal(failed.attemptId, attempt.attemptId);
  assert.equal(failed.taskRevision, built.task.taskRevision);
  const progress = await readExecutionAttemptProgress({
    locations: value.locations,
    storyId: built.task.storyId,
    attemptId: attempt.attemptId,
  });
  assert.deepEqual(progress?.taskOutcomes, [
    {
      taskRevision: built.task.taskRevision,
      taskKind: built.task.taskKind,
      outcome: "failed",
      artifactFingerprint: null,
      diagnosticCode: "producer-agent-host-failed",
    },
  ]);
});
