import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerConfig,
  buildDeliveryPublishing,
  type ProductionRevisionId,
  type Sha256Digest,
  type SourceCurrentId,
} from "../../src/contracts";
import {
  buildDelivery,
  type DeliveryBuildDependencies,
} from "../../scripts/project-production/application/build-delivery";
import {
  createRepositoryProductionLocations,
  createRuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import { validProjectCreateProducerConfig } from "../fixtures/project-create";

const revision = (character: string) =>
  `revision-${character.repeat(64)}` as ProductionRevisionId;
const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;
const sourceCurrent = (character: string) =>
  `source-current-${character.repeat(64)}` as SourceCurrentId;
const config = buildProducerConfig(validProjectCreateProducerConfig);

const locations = (rootDir: string) =>
  createRepositoryProductionLocations({ repositoryRoot: rootDir });
const initializeDeliveryRoot = (rootDir: string) =>
  mkdir(locations(rootDir).deliveryRoot, { recursive: true });
const runtime = (rootDir: string, rendererRuntimeFingerprint: Sha256Digest) =>
  createRuntimeExecutionResources({
    rendererRuntimeFingerprint,
    browserExecutable: join(rootDir, "bin/browser"),
    binariesDirectory: join(rootDir, "bin"),
    ffmpegExecutable: join(rootDir, "bin/ffmpeg"),
    ffprobeExecutable: join(rootDir, "bin/ffprobe"),
  });

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
    title: "Delivery proof",
    description: "Synchronous delivery proof.",
    topics: ["one", "two", "three", "four", "five", "six"],
    collection: "Delivery proof",
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
  failTallOnce = false,
  failVideo = false,
  failPromotedVideoInspectionOnce = false,
}: {
  readonly failTallOnce?: boolean;
  readonly failVideo?: boolean;
  readonly failPromotedVideoInspectionOnce?: boolean;
} = {}) => {
  const calls = { video: 0, cover4x3: 0, cover3x4: 0, verify: 0 };
  let tallFailed = false;
  let promotedInspectionFailed = false;
  const dependencies: DeliveryBuildDependencies = {
    prepare: async () =>
      prepared as Awaited<
        ReturnType<NonNullable<DeliveryBuildDependencies["prepare"]>>
      >,
    renderVideo: async ({ outputPath }) => {
      calls.video += 1;
      if (failVideo) throw new Error("synthetic video failure");
      await writeFile(outputPath, "video");
    },
    renderCover: async ({ compositionId, outputPath }) => {
      if (compositionId.endsWith("4x3V2")) {
        calls.cover4x3 += 1;
        await writeFile(outputPath, "cover-4x3");
        return;
      }
      calls.cover3x4 += 1;
      if (failTallOnce && !tallFailed) {
        tallFailed = true;
        throw new Error("synthetic tall cover failure");
      }
      await writeFile(outputPath, "cover-3x4");
    },
    inspectVideo: async ({ absolutePath }) => {
      if (
        failPromotedVideoInspectionOnce &&
        !promotedInspectionFailed &&
        !absolutePath.split("/").includes(".staging")
      ) {
        promotedInspectionFailed = true;
        throw new Error("synthetic post-promotion probe failure");
      }
      assert.equal(await readFile(absolutePath, "utf8"), "video");
      return media.video;
    },
    inspectCover: async ({ absolutePath, expected }) => {
      const value = await readFile(absolutePath, "utf8");
      if (expected.width === 1600) {
        assert.equal(value, "cover-4x3");
        return media.cover4x3;
      }
      assert.equal(value, "cover-3x4");
      return media.cover3x4;
    },
    verifyMaterialized: async () => {
      calls.verify += 1;
    },
  };
  return { calls, dependencies } as const;
};

test("synchronous delivery resumes verified staging media and publishes exactly four files", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-delivery-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await initializeDeliveryRoot(rootDir);
  const fixture = createDependencies({ failTallOnce: true });

  await assert.rejects(
    buildDelivery(
      {
        locations: locations(rootDir),
        projectId: "story-example",
        config,
        revisionId: revision("1"),
        sourceCurrentId: sourceCurrent("2"),
        runtime: runtime(rootDir, sha("3")),
      },
      fixture.dependencies,
    ),
    /synthetic tall cover failure/u,
  );
  await assert.rejects(
    readFile(join(rootDir, "deliveries/story-example/publish.json")),
    /ENOENT/u,
  );

  const completed = await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId: revision("1"),
      sourceCurrentId: sourceCurrent("2"),
      runtime: runtime(rootDir, sha("3")),
    },
    fixture.dependencies,
  );
  assert.equal(completed.status, "project-production-complete");
  assert.deepEqual(completed.reused, {
    video: true,
    cover4x3: true,
    cover3x4: false,
  });
  assert.deepEqual(fixture.calls, {
    video: 1,
    cover4x3: 1,
    cover3x4: 2,
    verify: 3,
  });
  assert.deepEqual(
    (await readdir(join(rootDir, "deliveries/story-example"))).sort(),
    ["cover-3x4.png", "cover-4x3.png", "publish.json", "video.mp4"],
  );
  const publish = JSON.parse(
    await readFile(
      join(rootDir, "deliveries/story-example/publish.json"),
      "utf8",
    ),
  ) as {
    revisionId: string;
    sourceCurrentId: string;
    rendererRuntimeFingerprint: string;
    publishingFingerprint: string;
  };
  assert.equal(publish.revisionId, revision("1"));
  assert.equal(publish.sourceCurrentId, sourceCurrent("2"));
  assert.equal(publish.rendererRuntimeFingerprint, sha("3"));
  assert.match(publish.publishingFingerprint, /^sha256:[0-9a-f]{64}$/u);

  const current = await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId: revision("1"),
      sourceCurrentId: sourceCurrent("2"),
      runtime: runtime(rootDir, sha("3")),
    },
    fixture.dependencies,
  );
  assert.equal(current.status, "project-production-current");
  assert.equal(current.noOp, true);
  assert.deepEqual(fixture.calls, {
    video: 1,
    cover4x3: 1,
    cover3x4: 2,
    verify: 4,
  });
});

test("source, renderer runtime, and publishing drift invalidate the current DeliveryBuild", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-identity-drift-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await initializeDeliveryRoot(rootDir);
  const revisionId = revision("0");
  const initial = await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId,
      sourceCurrentId: sourceCurrent("1"),
      runtime: runtime(rootDir, sha("2")),
    },
    createDependencies().dependencies,
  );

  const sourceDrift = await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId,
      sourceCurrentId: sourceCurrent("3"),
      runtime: runtime(rootDir, sha("2")),
    },
    createDependencies().dependencies,
  );
  assert.equal(sourceDrift.status, "project-production-complete");
  assert.notEqual(sourceDrift.deliveryBuildId, initial.deliveryBuildId);

  const runtimeDrift = await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId,
      sourceCurrentId: sourceCurrent("3"),
      runtime: runtime(rootDir, sha("4")),
    },
    createDependencies().dependencies,
  );
  assert.equal(runtimeDrift.status, "project-production-complete");
  assert.notEqual(runtimeDrift.deliveryBuildId, sourceDrift.deliveryBuildId);

  const publishing = buildDeliveryPublishing({
    storyId: "story-example",
    title: "Changed publishing input",
    description: "A changed payload must make the old DeliveryBuild stale.",
    topics: ["one", "two", "three", "four", "five", "six"],
    collection: "Delivery proof",
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
  });
  const publishingDependencies = createDependencies().dependencies;
  const publishingDrift = await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId,
      sourceCurrentId: sourceCurrent("3"),
      runtime: runtime(rootDir, sha("4")),
    },
    {
      ...publishingDependencies,
      prepare: async () =>
        ({ ...prepared, publishing }) as Awaited<
          ReturnType<NonNullable<DeliveryBuildDependencies["prepare"]>>
        >,
    },
  );
  assert.equal(publishingDrift.status, "project-production-complete");
  assert.notEqual(
    publishingDrift.deliveryBuildId,
    runtimeDrift.deliveryBuildId,
  );
});

test("a failed new DeliveryBuild preserves the complete current package", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-preserve-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await initializeDeliveryRoot(rootDir);
  const first = createDependencies();
  await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId: revision("3"),
      sourceCurrentId: sourceCurrent("4"),
      runtime: runtime(rootDir, sha("5")),
    },
    first.dependencies,
  );
  const deliveryRoot = join(rootDir, "deliveries/story-example");
  const before = await Promise.all(
    ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
      (name) => readFile(join(deliveryRoot, name)),
    ),
  );

  const changed = createDependencies({ failVideo: true });
  await assert.rejects(
    buildDelivery(
      {
        locations: locations(rootDir),
        projectId: "story-example",
        config,
        revisionId: revision("6"),
        sourceCurrentId: sourceCurrent("7"),
        runtime: runtime(rootDir, sha("8")),
      },
      changed.dependencies,
    ),
    /synthetic video failure/u,
  );
  const after = await Promise.all(
    ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
      (name) => readFile(join(deliveryRoot, name)),
    ),
  );
  assert.deepEqual(after, before);
  assert.equal(
    JSON.parse(after[3]?.toString("utf8") ?? "null").revisionId,
    revision("3"),
  );
});

test("post-promotion validation failure rolls back to the previous current package", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-rollback-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await initializeDeliveryRoot(rootDir);
  await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId: revision("9"),
      sourceCurrentId: sourceCurrent("a"),
      runtime: runtime(rootDir, sha("b")),
    },
    createDependencies().dependencies,
  );
  const deliveryRoot = join(rootDir, "deliveries/story-example");
  const before = await Promise.all(
    ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
      (name) => readFile(join(deliveryRoot, name)),
    ),
  );

  const changed = createDependencies({
    failPromotedVideoInspectionOnce: true,
  });
  await assert.rejects(
    buildDelivery(
      {
        locations: locations(rootDir),
        projectId: "story-example",
        config,
        revisionId: revision("c"),
        sourceCurrentId: sourceCurrent("d"),
        runtime: runtime(rootDir, sha("e")),
      },
      changed.dependencies,
    ),
    /post-promotion probe failure/u,
  );
  const after = await Promise.all(
    ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
      (name) => readFile(join(deliveryRoot, name)),
    ),
  );
  assert.deepEqual(after, before);
  assert.equal(
    JSON.parse(after[3]?.toString("utf8") ?? "null").revisionId,
    revision("9"),
  );

  const retried = await buildDelivery(
    {
      locations: locations(rootDir),
      projectId: "story-example",
      config,
      revisionId: revision("c"),
      sourceCurrentId: sourceCurrent("d"),
      runtime: runtime(rootDir, sha("e")),
    },
    changed.dependencies,
  );
  assert.equal(retried.status, "project-production-complete");
  assert.deepEqual(retried.reused, {
    video: true,
    cover4x3: true,
    cover3x4: true,
  });
  assert.deepEqual(changed.calls, {
    video: 1,
    cover4x3: 1,
    cover3x4: 1,
    verify: 4,
  });
});

for (const hasCurrent of [false, true] as const) {
  test(`delivery rejects a deliveries-parent symlink swap immediately before promotion (${hasCurrent ? "existing current" : "first delivery"})`, async (context) => {
    const rootDir = await mkdtemp(
      join(tmpdir(), "rsp-production-delivery-swap-"),
    );
    const outside = await mkdtemp(
      join(tmpdir(), "rsp-production-delivery-outside-"),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    context.after(() => rm(outside, { recursive: true, force: true }));
    await initializeDeliveryRoot(rootDir);

    let previous: readonly Buffer[] = [];
    if (hasCurrent) {
      await buildDelivery(
        {
          locations: locations(rootDir),
          projectId: "story-example",
          config,
          revisionId: revision("b"),
          sourceCurrentId: sourceCurrent("c"),
          runtime: runtime(rootDir, sha("d")),
        },
        createDependencies().dependencies,
      );
      previous = await Promise.all(
        ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
          (name) => readFile(join(rootDir, "deliveries/story-example", name)),
        ),
      );
    }

    const heldDeliveries = join(rootDir, "deliveries-before-swap");
    const swapped = createDependencies().dependencies;
    let videoInspections = 0;
    await assert.rejects(
      buildDelivery(
        {
          locations: locations(rootDir),
          projectId: "story-example",
          config,
          revisionId: revision("e"),
          sourceCurrentId: sourceCurrent("f"),
          runtime: runtime(rootDir, sha("0")),
        },
        {
          ...swapped,
          inspectVideo: async () => {
            videoInspections += 1;
            if (videoInspections === 2) {
              await rename(join(rootDir, "deliveries"), heldDeliveries);
              await symlink(outside, join(rootDir, "deliveries"));
            }
            return media.video;
          },
        },
      ),
      /unsafe/u,
    );

    assert.deepEqual(await readdir(outside), []);
    if (hasCurrent) {
      const preserved = await Promise.all(
        ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
          (name) => readFile(join(heldDeliveries, "story-example", name)),
        ),
      );
      assert.deepEqual(preserved, previous);
    }
  });
}

test("delivery rejects a deliveries-parent symlink swap before the first media write", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-delivery-prewrite-"),
  );
  const outside = await mkdtemp(
    join(tmpdir(), "rsp-production-delivery-prewrite-outside-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await initializeDeliveryRoot(rootDir);

  await assert.rejects(
    buildDelivery(
      {
        locations: locations(rootDir),
        projectId: "story-example",
        config,
        revisionId: revision("f"),
        sourceCurrentId: sourceCurrent("0"),
        runtime: runtime(rootDir, sha("1")),
      },
      {
        ...createDependencies().dependencies,
        renderVideo: async () => {
          await rename(
            join(rootDir, "deliveries"),
            join(rootDir, "deliveries-before-write"),
          );
          await symlink(outside, join(rootDir, "deliveries"));
        },
      },
    ),
    /unsafe/u,
  );
  assert.deepEqual(await readdir(outside), []);
});
