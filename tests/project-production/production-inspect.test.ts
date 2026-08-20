import assert from "node:assert/strict";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { inspectProjectProduction } from "../../scripts/project-production/application/inspect-production";
import { createProject } from "../../scripts/projects/application/create-project";
import {
  NARRATION_MASTERING_POLICY,
  computeGenerationInputFingerprint,
} from "../../src/contracts";
import { inspectNarrationCache } from "../../scripts/project-production/adapters/production-inspection";
import { loadNarrationProjectFiles } from "../../scripts/narration/project-files";
import {
  prepareProjectCreateFixture,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const sameSnapshot = {
  source: "source-a",
  catalog: "catalog-a",
  narrationCache: "cache-a",
  artifacts: "artifacts-a",
  workspaces: "workspaces-a",
  attempts: "attempts-a",
  delivery: "delivery-a",
} as const;

test("configured authoring inspection reports narration cost without building a fake Revision", async () => {
  let planCalls = 0;
  const result = await inspectProjectProduction(
    { rootDir: "/fixture", projectId: "story-example" },
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
    { rootDir: "/fixture", projectId: "story-example" },
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
    { rootDir: "/fixture", projectId: "story-example" },
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
        deliveryBuildId: null,
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
    { rootDir: "/fixture", projectId: "story-example" },
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
        deliveryBuildId: null,
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

test("inspection rejects a mixed-time snapshot without retrying", async () => {
  let snapshots = 0;
  await assert.rejects(
    inspectProjectProduction(
      { rootDir: "/fixture", projectId: "story-example" },
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
  const result = await inspectProjectProduction({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
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
    rootDir: fixture.rootDir,
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
    rootDir: fixture.rootDir,
    projectId: "story-example",
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
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
