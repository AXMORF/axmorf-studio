import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDeliveryPublishing,
  createFingerprint,
} from "../../src/contracts";
import {
  buildProject,
  type ProjectBuildDependencies,
} from "../../scripts/project-build/application/build";
import { readProjectBuildProgressProjection } from "../../scripts/project-build/application/progress-query";
import type { ProjectBuildProgressReporter } from "../../scripts/project-build/adapters/progress";
import { readProjectProductionProgress } from "../../settings/server/production-progress";

const digest = (value: string) =>
  createFingerprint({ namespace: "project-build-test", version: 1, value });

const media = {
  video: {
    codec: "h264" as const,
    audioCodec: "aac" as const,
    audioChannels: 2 as const,
    width: 1080,
    height: 1920,
    fps: 30,
    frameCount: 120,
    decodedToEof: true as const,
  },
  cover4x3: {
    imageFormat: "png" as const,
    width: 1600,
    height: 1200,
    decodedToEof: true as const,
  },
  cover3x4: {
    imageFormat: "png" as const,
    width: 1200,
    height: 1600,
    decodedToEof: true as const,
  },
};

const prepared = {
  projectId: "story-example",
  story: { storyId: "story-example" },
  render: {
    schemaVersion: 1,
    compositionId: "StoryExample",
    fps: 30,
    width: 1080,
    height: 1920,
    locale: "zh-CN",
    leadInFrames: 0,
    tailFrames: 0,
    output: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: 2,
    },
  },
  timing: { storyId: "story-example" },
  visualStyle: { storyId: "story-example" },
  publishing: buildDeliveryPublishing({
    storyId: "story-example",
    title: "Build proof",
    description: "Build proof description",
    topics: ["a", "b", "c", "d", "e", "f"],
    collection: "Build proof",
    outputFileName: "video.mp4",
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
    fps: 30,
    frameCount: 120,
    plannedDurationSeconds: 4,
    chapters: [
      {
        meaningId: "opening",
        name: "开场",
        startFrame: 0,
        timecode: "00:00:00",
      },
    ],
  }),
  frameCount: 120,
  coverCompositionBaseId: "StoryExampleCover",
} as const;

const createDependencies = ({
  snapshot = digest("source-a"),
  failTallOnce = false,
  failVideo = false,
}: {
  readonly snapshot?: ReturnType<typeof digest>;
  readonly failTallOnce?: boolean;
  readonly failVideo?: boolean;
} = {}) => {
  const calls = { video: 0, cover4x3: 0, cover3x4: 0 };
  let tallFailed = false;
  return {
    calls,
    dependencies: {
      prepare: async () =>
        prepared as Awaited<
          ReturnType<NonNullable<ProjectBuildDependencies["prepare"]>>
        >,
      collectSnapshot: async () => ({
        fingerprint: snapshot,
        files: [
          {
            repositoryPath: "src/projects/story-example/Composition.tsx",
            checksum: digest("composition"),
            sizeBytes: 1,
          },
        ],
      }),
      renderVideo: async ({ outputPath }: { readonly outputPath: string }) => {
        calls.video += 1;
        if (failVideo) throw new Error("video failed");
        await writeFile(outputPath, "video");
      },
      renderCover: async ({
        compositionId,
        outputPath,
      }: {
        readonly compositionId: string;
        readonly outputPath: string;
      }) => {
        if (compositionId.endsWith("4x3V2")) {
          calls.cover4x3 += 1;
          await writeFile(outputPath, "cover-4x3");
          return;
        }
        calls.cover3x4 += 1;
        if (failTallOnce && !tallFailed) {
          tallFailed = true;
          throw new Error("tall failed");
        }
        await writeFile(outputPath, "cover-3x4");
      },
      inspectVideo: async ({
        absolutePath,
      }: {
        readonly absolutePath: string;
      }) => {
        assert.equal(await readFile(absolutePath, "utf8"), "video");
        return media.video;
      },
      inspectCover: async ({
        absolutePath,
        expected,
      }: {
        readonly absolutePath: string;
        readonly expected: { width: number; height: number };
      }) => {
        const value = await readFile(absolutePath, "utf8");
        if (expected.width === 1600) {
          assert.equal(value, "cover-4x3");
          return media.cover4x3;
        }
        assert.equal(value, "cover-3x4");
        return media.cover3x4;
      },
    } satisfies ProjectBuildDependencies,
  };
};

const recordingProgress = () => {
  const events: string[] = [];
  const progress: ProjectBuildProgressReporter = {
    bindIdentity: async () => {
      events.push("bind");
    },
    start: async (step) => {
      events.push(`start:${step}`);
    },
    succeed: async (step, result) => {
      events.push(`succeed:${step}:${String(result?.reused ?? null)}`);
    },
    fail: async () => {
      events.push("fail");
    },
    clear: async () => {
      events.push("clear");
    },
  };
  return { events, progress } as const;
};

test("Project build resumes the same source snapshot and publishes atomically", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-build-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "src/projects/story-example"), { recursive: true });
  const fixture = createDependencies({ failTallOnce: true });

  await assert.rejects(
    buildProject({
      rootDir,
      projectId: "story-example",
      dependencies: fixture.dependencies,
    }),
    /tall failed/u,
  );
  await assert.rejects(
    readFile(join(rootDir, "deliveries/story-example/publish.json")),
  );

  const result = await buildProject({
    rootDir,
    projectId: "story-example",
    dependencies: fixture.dependencies,
  });
  assert.equal(result.status, "project-build-complete");
  assert.deepEqual(result.reused, {
    video: true,
    cover4x3: true,
    cover3x4: false,
  });
  assert.deepEqual(fixture.calls, { video: 1, cover4x3: 1, cover3x4: 2 });
  await assert.rejects(
    readdir(join(rootDir, "deliveries/.staging")),
    /ENOENT/u,
  );
  const publish = JSON.parse(
    await readFile(
      join(rootDir, "deliveries/story-example/publish.json"),
      "utf8",
    ),
  );
  assert.equal(publish.sourceSnapshotFingerprint, digest("source-a"));
  assert.deepEqual(Object.keys(publish.artifacts).sort(), [
    "cover3x4",
    "cover4x3",
    "video",
  ]);

  const noOp = await buildProject({
    rootDir,
    projectId: "story-example",
    dependencies: fixture.dependencies,
  });
  assert.equal(noOp.noOp, true);
  assert.deepEqual(fixture.calls, { video: 1, cover4x3: 1, cover3x4: 2 });

  const progress = await readProjectProductionProgress({
    rootDir,
    collectSnapshot: async () => ({
      fingerprint: digest("source-a"),
      files: [
        {
          repositoryPath: "src/projects/story-example/Composition.tsx",
          checksum: digest("composition"),
          sizeBytes: 1,
        },
      ],
    }),
  });
  assert.equal(progress.projects[0]?.status, "current");
  assert.equal(progress.projects[0]?.build.delivery?.sourceCurrent, true);
  assert.equal(progress.projects[0]?.auditedRun, null);
  assert.equal(progress.projects[0]?.auditedRunError, null);
});

test("changed source gets a new build identity and failure preserves current delivery", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-rebuild-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const first = createDependencies();
  const completed = await buildProject({
    rootDir,
    projectId: "story-example",
    dependencies: first.dependencies,
  });
  const currentPublishPath = join(
    rootDir,
    "deliveries/story-example/publish.json",
  );
  const previousPublish = await readFile(currentPublishPath, "utf8");

  const changed = createDependencies({
    snapshot: digest("source-b"),
    failVideo: true,
  });
  await assert.rejects(
    buildProject({
      rootDir,
      projectId: "story-example",
      dependencies: changed.dependencies,
    }),
    /video failed/u,
  );
  assert.equal(await readFile(currentPublishPath, "utf8"), previousPublish);
  assert.notEqual(
    JSON.parse(previousPublish).sourceSnapshotFingerprint,
    digest("source-b"),
  );
  assert.equal(completed.noOp, false);
  const failedProgress = await readProjectBuildProgressProjection({
    rootDir,
    projectId: "story-example",
    collectSnapshot: async () => ({
      fingerprint: digest("source-b"),
      files: [
        {
          repositoryPath: "src/projects/story-example/Composition.tsx",
          checksum: digest("composition"),
          sizeBytes: 1,
        },
      ],
    }),
  });
  assert.equal(failedProgress.status, "failed");
  assert.equal(failedProgress.delivery?.sourceCurrent, false);
  assert.equal(failedProgress.steps[1]?.status, "failed");
});

test("Project build reports ordered phases and staged artifact reuse", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-progress-order-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = createDependencies({ failTallOnce: true });
  const first = recordingProgress();
  await assert.rejects(
    buildProject({
      rootDir,
      projectId: "story-example",
      dependencies: {
        ...fixture.dependencies,
        progress: first.progress,
      },
    }),
    /tall failed/u,
  );
  assert.deepEqual(first.events, [
    "bind",
    "succeed:prepare:null",
    "start:video",
    "succeed:video:false",
    "start:cover-4x3",
    "succeed:cover-4x3:false",
    "start:cover-3x4",
    "fail",
  ]);

  const retry = recordingProgress();
  await buildProject({
    rootDir,
    projectId: "story-example",
    dependencies: {
      ...fixture.dependencies,
      progress: retry.progress,
    },
  });
  assert.deepEqual(retry.events, [
    "bind",
    "succeed:prepare:null",
    "start:video",
    "succeed:video:true",
    "start:cover-4x3",
    "succeed:cover-4x3:true",
    "start:cover-3x4",
    "succeed:cover-3x4:false",
    "start:verify",
    "succeed:verify:null",
    "start:promote",
    "succeed:promote:null",
    "clear",
  ]);
});

test("Project progress rejects incomplete, unknown, linked, drifted, or malformed delivery files", async () => {
  const cases = [
    {
      name: "missing",
      mutate: (rootDir: string) =>
        rm(join(rootDir, "deliveries/story-example/video.mp4")),
    },
    {
      name: "unknown",
      mutate: (rootDir: string) =>
        writeFile(join(rootDir, "deliveries/story-example/extra.txt"), "extra"),
    },
    {
      name: "symlink",
      mutate: async (rootDir: string) => {
        const video = join(rootDir, "deliveries/story-example/video.mp4");
        await rm(video);
        await symlink("publish.json", video);
      },
    },
    {
      name: "checksum",
      mutate: (rootDir: string) =>
        writeFile(join(rootDir, "deliveries/story-example/video.mp4"), "drift"),
    },
    {
      name: "malformed",
      mutate: (rootDir: string) =>
        writeFile(join(rootDir, "deliveries/story-example/publish.json"), "{"),
    },
  ] as const;

  for (const scenario of cases) {
    const rootDir = await mkdtemp(
      join(tmpdir(), `rsp-project-invalid-${scenario.name}-`),
    );
    try {
      await mkdir(join(rootDir, "src/projects/story-example"), {
        recursive: true,
      });
      const fixture = createDependencies();
      await buildProject({
        rootDir,
        projectId: "story-example",
        dependencies: fixture.dependencies,
      });
      await scenario.mutate(rootDir);
      const progress = await readProjectProductionProgress({
        rootDir,
        collectSnapshot: async () => ({
          fingerprint: digest("source-a"),
          files: [
            {
              repositoryPath: "src/projects/story-example/Composition.tsx",
              checksum: digest("composition"),
              sizeBytes: 1,
            },
          ],
        }),
      });
      assert.equal(progress.projects[0]?.status, "error", scenario.name);
      assert.equal(
        progress.projects[0]?.error,
        "交付状态异常；请检查 publish.json 与四文件完整性。",
        scenario.name,
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  }
});
