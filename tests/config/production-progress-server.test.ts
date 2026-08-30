import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { readProjectProductionProgress } from "../../settings/server/production-progress";
import { readCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import { inspectProjectProduction } from "../../scripts/project-production/application/inspect-production";
import { readCurrentProjectDelivery } from "../../scripts/project-production/application/progress-query";
import type { CurrentDeliveryInspectionDependencies } from "../../scripts/project-production/adapters/current-delivery-inspection";
import {
  DELIVERY_BUILD_POLICY_VERSION,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  createDeliveryBuildId,
  ExecutionAttemptSchema,
  StoryIdSchema,
  type ExecutionAttempt,
} from "@axmorf/studio/contracts";
import { buildRuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"a".repeat(64)}` as const;
const changedRevisionId = `revision-${"c".repeat(64)}` as const;
const taskRevision = `task-${"1".repeat(64)}` as const;
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

const readProgress = (
  rootDir: string,
  currentRevisionId: string = revisionId,
) =>
  readProjectProductionProgress({
    rootDir,
    dependencies: {
      readCurrentRevision: (async () => ({
        revisionId: currentRevisionId,
      })) as unknown as typeof readCurrentProductionRevision,
      readCurrentDelivery: readFixtureDelivery,
    },
  });

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-progress-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const writeProject = async (rootDir: string, projectId: string) => {
  await mkdir(join(rootDir, "src/projects", projectId), { recursive: true });
};

const writeAttempt = async (
  rootDir: string,
  overrides: Partial<ExecutionAttempt> = {},
) => {
  const attempt = ExecutionAttemptSchema.parse({
    schemaVersion: 3,
    contractVersion: "execution-attempt-v3",
    attemptId: "00000000-0000-4000-8000-000000000001",
    storyId: "story-example",
    revisionId,
    planFingerprint: sha("d"),
    artifactSetFingerprint: sha("e"),
    taskExplanations: [taskExplanation],
    taskSnapshots: [
      {
        taskKind: taskExplanation.taskKind,
        subject: taskExplanation.subject,
        taskRevision,
        inputFingerprints: [{ id: "brief", fingerprint: sha("f") }],
        validatorPolicyVersion: "scene-owner-validator-v2",
        declaredReadSet: ["inputs/context.json"],
        declaredOutputSet: ["src/Renderer.tsx"],
        dependencies: [],
        decision: taskExplanation,
      },
    ],
    estimatedCost: {
      providerRequests: 0,
      providerCacheHits: 3,
      agentTasks: 1,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
    actualCost: {
      providerRequests: 0,
      providerCacheHits: 3,
      agentTasks: 1,
      deliveryMedia: [],
    },
    state: "waiting-for-agent",
    createdAt: "2026-08-20T01:00:00.000Z",
    updatedAt: "2026-08-20T01:00:01.000Z",
    dirtyTaskRevisions: [taskRevision],
    taskSummary: {
      reusedTaskCount: 0,
      dirtyAgentTaskCount: 1,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
    diagnosticCode: null,
    ...overrides,
  });
  const directory = join(
    rootDir,
    ".producer-attempts/story-example",
    attempt.attemptId,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "attempt.json"), JSON.stringify(attempt));
};

const checksum = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const acceptFixtureMedia: CurrentDeliveryInspectionDependencies = {
  inspectVideo: async ({ expected }) => ({
    codec: "h264",
    audioCodec: "aac",
    audioChannels: expected.audioChannels,
    width: expected.width,
    height: expected.height,
    fps: expected.fps,
    frameCount: expected.frameCount,
    decodedToEof: true,
  }),
  inspectCover: async ({ expected }) => ({
    imageFormat: "png",
    width: expected.width,
    height: expected.height,
    decodedToEof: true,
  }),
};

const readFixtureDelivery = (
  input: Parameters<typeof readCurrentProjectDelivery>[0],
) =>
  readCurrentProjectDelivery({
    ...input,
    dependencies: acceptFixtureMedia,
  });

const writeDelivery = async (rootDir: string) => {
  const video = "verified-video";
  const cover4x3 = "verified-cover-4x3";
  const cover3x4 = "verified-cover-3x4";
  const identity = {
    storyId: "story-example",
    revisionId,
    artifactSetFingerprint: sha("b"),
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const deliveryBuildId = createDeliveryBuildId(identity);
  const publishing = buildDeliveryPublishing({
    storyId: identity.storyId,
    title: "测试视频",
    description: "用于验证同步四文件交付。",
    topics: ["测试", "视频", "工作流", "Remotion", "AI", "工程"],
    collection: "测试合集",
    outputFileName: "video.mp4",
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
    fps: identity.fps,
    frameCount: identity.frameCount,
    plannedDurationSeconds: 4,
    chapters: [
      {
        meaningId: "opening",
        name: "开场",
        startFrame: 0,
        timecode: "00:00:00",
      },
    ],
  });
  const publish = buildDeliveryPublish({
    ...identity,
    deliveryBuildId,
    artifacts: {
      video: {
        repositoryPath: "deliveries/story-example/video.mp4",
        checksum: checksum(video),
        sizeBytes: Buffer.byteLength(video),
        media: {
          codec: "h264",
          audioCodec: "aac",
          audioChannels: 2,
          width: identity.width,
          height: identity.height,
          fps: identity.fps,
          frameCount: identity.frameCount,
          decodedToEof: true,
        },
      },
      cover4x3: {
        repositoryPath: "deliveries/story-example/cover-4x3.png",
        checksum: checksum(cover4x3),
        sizeBytes: Buffer.byteLength(cover4x3),
        media: {
          imageFormat: "png",
          width: 1600,
          height: 1200,
          decodedToEof: true,
        },
      },
      cover3x4: {
        repositoryPath: "deliveries/story-example/cover-3x4.png",
        checksum: checksum(cover3x4),
        sizeBytes: Buffer.byteLength(cover3x4),
        media: {
          imageFormat: "png",
          width: 1200,
          height: 1600,
          decodedToEof: true,
        },
      },
    },
    publishing,
  });
  const directory = join(rootDir, "deliveries/story-example");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "video.mp4"), video),
    writeFile(join(directory, "cover-4x3.png"), cover4x3),
    writeFile(join(directory, "cover-3x4.png"), cover3x4),
    writeFile(join(directory, "publish.json"), JSON.stringify(publish)),
  ]);
  return { deliveryBuildId };
};

test("production progress is zero-safe and excludes output-only roots", async (context) => {
  const rootDir = await createRoot(context);
  await mkdir(join(rootDir, "out/output-only-story"), { recursive: true });
  await mkdir(join(rootDir, "deliveries/output-only-story"), {
    recursive: true,
  });

  assert.deepEqual(await readProgress(rootDir), {
    schemaVersion: 5,
    projects: [],
  });
});

test("malformed historical runs never affect current Project progress", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  await mkdir(join(rootDir, ".producer-runs/arbitrary-history"), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, ".producer-runs/arbitrary-history/run.json"),
    "{ definitely-not-json",
  );
  await mkdir(join(rootDir, ".producer-attempts/story-example/malformed"), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, ".producer-attempts/story-example/malformed/attempt.json"),
    "{}",
  );

  const progress = await readProgress(rootDir);
  assert.deepEqual(progress.projects, [
    {
      projectId: "story-example",
      status: "not-produced",
      revisionId,
      tasks: {
        reusedTaskCount: 0,
        dirtyAgentTaskCount: 0,
        dirtyFixedTaskCount: 0,
        blockedTaskCount: 0,
      },
      inspection: null,
      attempt: null,
      delivery: null,
      error: null,
    },
  ]);
});

test("progress projects the shared read-only inspection without recomputing task causes", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  const inspection = {
    schemaVersion: 1,
    contractVersion: "production-inspection-v1",
    storyId: "story-example",
    sourceState: "configured-authoring",
    currentRevisionId: null,
    baseline: { kind: "none", revisionId: null },
    estimatedCost: {
      providerRequests: 1,
      providerCacheHits: 2,
      agentTasks: null,
      deliveryMedia: null,
    },
    tasks: [],
    nextAction: "prepare-narration",
  } as const;
  const progress = await readProjectProductionProgress({
    rootDir,
    dependencies: {
      readCurrentRevision: (async () => ({
        revisionId,
      })) as unknown as typeof readCurrentProductionRevision,
      inspectProduction: (async () =>
        inspection) as unknown as typeof inspectProjectProduction,
    },
  });

  assert.deepEqual(progress.projects[0]?.inspection, inspection);
  assert.equal(progress.projects[0]?.attempt, null);
});

test("packed Web progress forwards the runtime policy manifest to read-only production inputs", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  const runtimePolicyManifest = buildRuntimePolicyManifest({
    packageVersion: "0.1.0",
    files: [
      {
        logicalPath: "dist/runtime.js",
        bytes: Buffer.from("runtime-policy", "utf8"),
        scopes: ["composition", "delivery", "global-visual", "scene"],
      },
    ],
  });
  let inspectManifest: unknown;
  let revisionManifest: unknown;

  const progress = await readProjectProductionProgress({
    rootDir,
    runtimePolicyManifest,
    dependencies: {
      inspectProduction: (async (
        input: Parameters<typeof inspectProjectProduction>[0],
      ) => {
        inspectManifest = input.runtimePolicyManifest;
        return {
          schemaVersion: 1,
          contractVersion: "production-inspection-v1",
          storyId: StoryIdSchema.parse("story-example"),
          sourceState: "configured-authoring",
          currentRevisionId: revisionId,
          baseline: { kind: "none", revisionId: null },
          estimatedCost: {
            providerRequests: 0,
            providerCacheHits: 0,
            agentTasks: 0,
            deliveryMedia: [],
          },
          tasks: [],
          nextAction: "prepare-narration",
        };
      }) as unknown as typeof inspectProjectProduction,
      readCurrentRevision: (async (
        input: Parameters<typeof readCurrentProductionRevision>[0],
      ) => {
        revisionManifest = input.runtimePolicyManifest;
        return { revisionId };
      }) as typeof readCurrentProductionRevision,
    },
  });

  assert.strictEqual(inspectManifest, runtimePolicyManifest);
  assert.strictEqual(revisionManifest, runtimePolicyManifest);
  assert.equal(progress.projects[0]?.status, "not-produced");
  assert.equal(progress.projects[0]?.error, null);
});

test("progress exposes latest attempt task summary and current four-file delivery", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  await writeAttempt(rootDir);

  const waiting = await readProgress(rootDir);
  assert.equal(waiting.projects[0]?.status, "needs-agent");
  assert.deepEqual(waiting.projects[0]?.tasks, {
    reusedTaskCount: 0,
    dirtyAgentTaskCount: 1,
    dirtyFixedTaskCount: 0,
    blockedTaskCount: 0,
  });
  assert.deepEqual(waiting.projects[0]?.attempt?.taskExplanations, [
    taskExplanation,
  ]);
  assert.equal(waiting.projects[0]?.attempt?.actualCost.providerRequests, 0);
  assert.doesNotMatch(JSON.stringify(waiting), /sha256:|ttsText|private/iu);
  assert.equal(
    waiting.projects[0]?.attempt?.attemptId,
    "00000000-0000-4000-8000-000000000001",
  );

  const { deliveryBuildId } = await writeDelivery(rootDir);
  const delivered = await readProgress(rootDir);
  assert.equal(delivered.projects[0]?.status, "current");
  assert.deepEqual(delivered.projects[0]?.delivery, {
    deliveryBuildId,
    revisionId,
    frameCount: 120,
    current: true,
    files: {
      video: true,
      cover4x3: true,
      cover3x4: true,
      publish: true,
    },
  });
  assert.doesNotMatch(JSON.stringify(delivered), /sha256:|ttsText|private/iu);
});

test("live authoring revision makes a delivery stale without a new attempt", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  await writeAttempt(rootDir);
  await writeDelivery(rootDir);

  const progress = await readProgress(rootDir, changedRevisionId);
  assert.equal(progress.projects[0]?.status, "stale");
  assert.equal(progress.projects[0]?.revisionId, changedRevisionId);
  assert.equal(progress.projects[0]?.attempt?.revisionId, revisionId);
  assert.equal(progress.projects[0]?.delivery?.revisionId, revisionId);
  assert.equal(progress.projects[0]?.delivery?.current, false);
});

test("invalid delivery bytes fail closed without hiding attempt diagnostics", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  await writeAttempt(rootDir, {
    diagnosticCode: "cover-task-failed",
  });
  await writeDelivery(rootDir);
  await writeFile(
    join(rootDir, "deliveries/story-example/cover-4x3.png"),
    "tampered",
  );

  const progress = await readProgress(rootDir);
  assert.equal(progress.projects[0]?.status, "error");
  assert.equal(progress.projects[0]?.delivery, null);
  assert.equal(
    progress.projects[0]?.attempt?.diagnosticCode,
    "cover-task-failed",
  );
  assert.match(progress.projects[0]?.error ?? "", /checksum/u);
});

test("matching checksums cannot make invalid media current in Settings", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  await writeDelivery(rootDir);

  const progress = await readProjectProductionProgress({
    rootDir,
    dependencies: {
      readCurrentRevision: (async () => ({
        revisionId,
      })) as unknown as typeof readCurrentProductionRevision,
    },
  });

  assert.equal(progress.projects[0]?.status, "error");
  assert.equal(progress.projects[0]?.delivery, null);
  assert.match(progress.projects[0]?.error ?? "", /media probe|EOF/u);
});

test("attempt identity cannot escape its Project storage root", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  await writeAttempt(rootDir, {
    storyId: StoryIdSchema.parse("other-story"),
  });

  const progress = await readProgress(rootDir);
  assert.equal(progress.projects[0]?.status, "error");
  assert.equal(progress.projects[0]?.attempt, null);
  assert.equal(progress.projects[0]?.error, "当前 attempt 数据无效。");
});
