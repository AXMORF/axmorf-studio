import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { readProjectProductionProgress } from "../../settings/server/production-progress";
import { readCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import {
  DELIVERY_BUILD_POLICY_VERSION,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  createDeliveryBuildId,
  ExecutionAttemptSchema,
  StoryIdSchema,
  type ExecutionAttempt,
} from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"a".repeat(64)}` as const;
const changedRevisionId = `revision-${"c".repeat(64)}` as const;

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
    schemaVersion: 2,
    contractVersion: "execution-attempt-v2",
    attemptId: "00000000-0000-4000-8000-000000000001",
    storyId: "story-example",
    revisionId,
    planFingerprint: sha("d"),
    artifactSetFingerprint: sha("e"),
    cacheDecisions: [],
    state: "waiting-for-agent",
    createdAt: "2026-08-20T01:00:00.000Z",
    updatedAt: "2026-08-20T01:00:01.000Z",
    dirtyTaskRevisions: [],
    taskSummary: {
      reusedTaskCount: 5,
      dirtyAgentTaskCount: 2,
      dirtyFixedTaskCount: 1,
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
          width: 1200,
          height: 900,
          decodedToEof: true,
        },
      },
      cover3x4: {
        repositoryPath: "deliveries/story-example/cover-3x4.png",
        checksum: checksum(cover3x4),
        sizeBytes: Buffer.byteLength(cover3x4),
        media: {
          imageFormat: "png",
          width: 900,
          height: 1200,
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
    schemaVersion: 4,
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
      attempt: null,
      delivery: null,
      error: null,
    },
  ]);
});

test("progress exposes latest attempt task summary and current four-file delivery", async (context) => {
  const rootDir = await createRoot(context);
  await writeProject(rootDir, "story-example");
  await writeAttempt(rootDir);

  const waiting = await readProgress(rootDir);
  assert.equal(waiting.projects[0]?.status, "needs-agent");
  assert.deepEqual(waiting.projects[0]?.tasks, {
    reusedTaskCount: 5,
    dirtyAgentTaskCount: 2,
    dirtyFixedTaskCount: 1,
    blockedTaskCount: 0,
  });
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
    artifactSetFingerprint: sha("b"),
    frameCount: 120,
    current: true,
    files: {
      video: true,
      cover4x3: true,
      cover3x4: true,
      publish: true,
    },
  });
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
