import assert from "node:assert/strict";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { inspectProjectProduction } from "../../scripts/project-production/application/inspect-production";
import { createProject } from "../../scripts/projects/application/create-project";
import {
  NARRATION_MASTERING_POLICY,
  buildProducerConfig,
  computeGenerationInputFingerprint,
} from "../../src/contracts";
import {
  captureProductionInspectionSnapshot,
  inspectNarrationCache,
  inspectProductionSourceReadiness,
} from "../../scripts/project-production/adapters/production-inspection";
import { generateRepositoryProjectCatalog } from "../../scripts/project-production/adapters/repository-project-catalog";
import { loadNarrationProjectFiles } from "../../scripts/narration/project-files";
import {
  createRepositoryProductionLocations,
  createRuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import { createRepositoryProjectStorageFromProductionLocations } from "../../scripts/projects/repository-project-locations";
import {
  prepareProjectCreateFixture,
  validProjectCreateProducerConfig,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const sameSnapshot = {
  source: "source-a",
  public: "public-a",
  generated: "generated-a",
  catalog: "catalog-a",
  narrationCache: "cache-a",
  artifacts: "artifacts-a",
  workspaces: "workspaces-a",
  attempts: "attempts-a",
  sourceCurrent: "source-current-a",
  delivery: "delivery-a",
} as const;
const fixtureLocations = createRepositoryProductionLocations({
  repositoryRoot: "/fixture",
});
const producerConfig = buildProducerConfig(validProjectCreateProducerConfig);
const fixtureRuntime = createRuntimeExecutionResources({
  rendererRuntimeFingerprint: `sha256:${"f".repeat(64)}`,
  browserExecutable: "/fixture/runtime/browser",
  binariesDirectory: "/fixture/runtime/bin",
  ffmpegExecutable: "/fixture/runtime/bin/ffmpeg",
  ffprobeExecutable: "/fixture/runtime/bin/ffprobe",
});

test("configured authoring inspection reports narration cost without building a fake Revision", async () => {
  let planCalls = 0;
  const result = await inspectProjectProduction(
    {
      locations: fixtureLocations,
      projectId: "story-example",
      config: producerConfig,
      runtime: fixtureRuntime,
    },
    {
      captureSnapshot: async () => sameSnapshot,
      inspectReadiness: async () => ({
        sourceState: "configured-authoring",
        missingAuthoringInputs: [],
      }),
      inspectNarrationCache: async () => ({
        providerRequests: 1,
        providerCacheHits: 2,
      }),
      buildCurrentPlan: async () => {
        planCalls += 1;
        throw new Error("a configured Project has no current DAG");
      },
    },
  );

  assert.equal(planCalls, 0);
  assert.equal(result.sourceState, "configured-authoring");
  assert.equal(result.currentRevisionId, null);
  assert.deepEqual(result.estimatedCost, {
    providerRequests: 1,
    providerCacheHits: 2,
    agentTasks: null,
    deliveryMedia: null,
  });
  assert.equal(result.nextAction, "prepare-narration");
});

test("timing-ready inspection reports incomplete timing-bound authoring", async () => {
  const result = await inspectProjectProduction(
    {
      locations: fixtureLocations,
      projectId: "story-example",
      config: producerConfig,
      runtime: fixtureRuntime,
    },
    {
      captureSnapshot: async () => sameSnapshot,
      inspectReadiness: async () => ({
        sourceState: "timing-ready",
        missingAuthoringInputs: ["production/scene-production-brief.json"],
      }),
      inspectNarrationCache: async () => ({
        providerRequests: 0,
        providerCacheHits: 3,
      }),
      buildCurrentPlan: async () => {
        throw new Error("timing-ready inspection must not build a plan");
      },
    },
  );

  assert.equal(result.currentRevisionId, null);
  assert.equal(result.estimatedCost.agentTasks, null);
  assert.equal(result.nextAction, "complete-authoring");
});

test("production-ready inspection exposes the read-only plan and explicit unknown estimates", async () => {
  const task = {
    taskKind: "scene-owner",
    subject: { kind: "meaning", id: "scene-one" },
    taskRevision: `task-${"1".repeat(64)}`,
    baselineTaskRevision: null,
    action: "dispatch-agent",
    artifactState: "missing",
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable",
  } as const;
  const result = await inspectProjectProduction(
    {
      locations: fixtureLocations,
      projectId: "story-example",
      config: producerConfig,
      runtime: fixtureRuntime,
    },
    {
      captureSnapshot: async () => sameSnapshot,
      inspectReadiness: async () => ({
        sourceState: "production-inputs-ready",
        missingAuthoringInputs: [],
      }),
      inspectNarrationCache: async () => ({
        providerRequests: null,
        providerCacheHits: 0,
      }),
      buildCurrentPlan: (async () => ({
        revision: {
          storyId: "story-example",
          revisionId: `revision-${"2".repeat(64)}`,
        },
        plan: {
          tasks: [task],
          summary: { dirtyAgentTaskCount: 1 },
        },
      })) as never,
      inspectDelivery: async () => ({
        current: false,
        revisionId: null,
        sourceCurrentId: null,
        deliveryBuildId: null,
        rendererRuntimeFingerprint: null,
      }),
    },
  );

  assert.equal(result.currentRevisionId, `revision-${"2".repeat(64)}`);
  assert.equal(result.estimatedCost.providerRequests, null);
  assert.equal(result.estimatedCost.agentTasks, null);
  assert.equal(result.estimatedCost.deliveryMedia, null);
  assert.deepEqual(result.tasks, [task]);
  assert.equal(result.nextAction, "prepare-production");
});

test("production-ready inspection reports known cache, Agent, and delivery estimates", async () => {
  const result = await inspectProjectProduction(
    {
      locations: fixtureLocations,
      projectId: "story-example",
      config: producerConfig,
      runtime: fixtureRuntime,
    },
    {
      captureSnapshot: async () => sameSnapshot,
      inspectReadiness: async () => ({
        sourceState: "production-inputs-ready",
        missingAuthoringInputs: [],
      }),
      inspectNarrationCache: async () => ({
        providerRequests: 0,
        providerCacheHits: 3,
        narrationReady: true,
      }),
      buildCurrentPlan: (async () => ({
        revision: {
          storyId: "story-example",
          revisionId: `revision-${"5".repeat(64)}`,
        },
        plan: {
          tasks: [],
          summary: { dirtyAgentTaskCount: 0 },
        },
      })) as never,
      inspectDelivery: async () => ({
        current: false,
        revisionId: null,
        sourceCurrentId: null,
        deliveryBuildId: null,
        rendererRuntimeFingerprint: null,
      }),
    },
  );

  assert.deepEqual(result.estimatedCost, {
    providerRequests: 0,
    providerCacheHits: 3,
    agentTasks: 0,
    deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
  });
});

test("a verified Source Current rejects a Delivery built by another renderer runtime", async () => {
  const sourceCurrentId = `source-current-${"a".repeat(64)}` as const;
  const result = await inspectProjectProduction(
    {
      locations: fixtureLocations,
      projectId: "story-example",
      config: producerConfig,
      runtime: fixtureRuntime,
    },
    {
      captureSnapshot: async () => sameSnapshot,
      inspectReadiness: async () => ({
        sourceState: "production-inputs-ready",
        missingAuthoringInputs: [],
      }),
      inspectNarrationCache: async () => ({
        providerRequests: 0,
        providerCacheHits: 3,
        narrationReady: true,
      }),
      buildCurrentPlan: (async () => ({
        revision: {
          storyId: "story-example",
          revisionId: `revision-${"6".repeat(64)}`,
        },
        plan: {
          tasks: [],
          summary: { dirtyAgentTaskCount: 0 },
        },
      })) as never,
      inspectCurrentSource: (async () => ({ sourceCurrentId })) as never,
      inspectDelivery: (async () => ({
        current: true,
        revisionId: `revision-${"6".repeat(64)}` as const,
        sourceCurrentId,
        deliveryBuildId: `delivery-${"b".repeat(64)}` as const,
        rendererRuntimeFingerprint: `sha256:${"e".repeat(64)}` as const,
      })) as never,
    },
  );

  assert.equal(result.sourceCurrentId, sourceCurrentId);
  assert.equal(result.deliveryBuildId, null);
  assert.equal(result.nextAction, "build-delivery");
  assert.deepEqual(result.estimatedCost.deliveryMedia, [
    "video",
    "cover-4x3",
    "cover-3x4",
  ]);
});

test("inspection rejects a mixed-time snapshot without retrying", async () => {
  let snapshots = 0;
  await assert.rejects(
    inspectProjectProduction(
      {
        locations: fixtureLocations,
        projectId: "story-example",
        config: producerConfig,
        runtime: fixtureRuntime,
      },
      {
        captureSnapshot: async () => ({
          ...sameSnapshot,
          source: snapshots++ === 0 ? "source-before" : "source-after",
        }),
        inspectReadiness: async () => ({
          sourceState: "configured-authoring",
          missingAuthoringInputs: [],
        }),
        inspectNarrationCache: async () => ({
          providerRequests: null,
          providerCacheHits: 0,
        }),
        buildCurrentPlan: async () => {
          throw new Error("configured inspection must not build a plan");
        },
      },
    ),
    /inspection-source-drift/u,
  );
  assert.equal(snapshots, 2);
});

test("a freshly created Project is inspected from real source and Catalog bytes with zero production writes", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await createProject({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  const locations = createRepositoryProductionLocations({
    repositoryRoot: fixture.rootDir,
  });
  const result = await inspectProjectProduction(
    {
      locations,
      projectId: "story-example",
      config: producerConfig,
      runtime: fixtureRuntime,
    },
    {
      captureSnapshot: ({ locations: currentLocations, projectId }) =>
        captureProductionInspectionSnapshot({
          locations: currentLocations,
          projectId,
          catalogProjectionPath:
            createRepositoryProjectStorageFromProductionLocations(
              currentLocations,
            ).catalogProjectionPath,
        }),
      inspectReadiness: (input) =>
        inspectProductionSourceReadiness(
          input,
          generateRepositoryProjectCatalog,
        ),
      buildCurrentPlan: async () => {
        throw new Error("configured inspection must not build a plan");
      },
    },
  );
  assert.equal(result.sourceState, "configured-authoring");
  assert.equal(result.nextAction, "prepare-narration");
  assert.equal(result.estimatedCost.providerRequests, null);
  assert.equal(result.estimatedCost.providerCacheHits, 0);
  for (const forbidden of [
    ".narration-work/story-example",
    ".producer-work/story-example",
    ".producer-artifacts/story-example",
    ".producer-attempts/story-example",
    "deliveries/story-example",
  ]) {
    await assert.rejects(stat(join(fixture.rootDir, forbidden)), {
      code: "ENOENT",
    });
  }
});

test("VoxCPM inspection reuses the prepared provider identity without reading protected voice material", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await createProject({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  const { projectSource } = await loadNarrationProjectFiles({
    locations: createRepositoryProductionLocations({
      repositoryRoot: fixture.rootDir,
    }),
    projectId: "story-example",
  });
  const generatedRoot = join(
    fixture.rootDir,
    "src/projects/story-example/generated",
  );
  await mkdir(generatedRoot, { recursive: true });
  const providerAttemptFingerprint = `sha256:${"7".repeat(64)}`;
  await writeProjectCreateJson(
    join(generatedRoot, "narration-preparation.generated.json"),
    {
      schemaVersion: 1,
      contractVersion: "narration-preparation-v1",
      storyId: "story-example",
      generationInputFingerprint: computeGenerationInputFingerprint(
        projectSource.story,
        projectSource.narration,
      ),
      providerAttemptFingerprint,
      sealedNarrationFingerprint: `sha256:${"8".repeat(64)}`,
      masteringPolicy: NARRATION_MASTERING_POLICY,
    },
  );

  const result = await inspectNarrationCache({
    locations: createRepositoryProductionLocations({
      repositoryRoot: fixture.rootDir,
    }),
    projectId: "story-example",
    config: producerConfig,
  });
  assert.equal(result.providerRequests, null);
  assert.equal(result.providerAttemptFingerprint, providerAttemptFingerprint);
  assert.equal(
    result.preparationReceipt?.providerAttemptFingerprint,
    providerAttemptFingerprint,
  );
  await assert.rejects(
    stat(join(fixture.rootDir, "voxcpm/voice_profile/my-voice.wav")),
    { code: "ENOENT" },
  );
});
