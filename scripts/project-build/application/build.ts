import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  PROJECT_BUILD_POLICY_VERSION,
  ProjectPublishSchema,
  buildProjectPublish,
  createProjectBuildId,
  serializeCanonicalJson,
  type ProjectPublish,
} from "../../../src/contracts";
import {
  inspectDeliveryFile,
  promoteDeliveryStaging,
} from "../../delivery/adapters/filesystem";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import {
  inspectProjectCover,
  inspectProjectVideo,
  renderProjectCover,
  renderProjectVideo,
} from "../adapters/media";
import {
  collectProjectSourceSnapshot,
  type ProjectSourceSnapshot,
} from "../adapters/source-snapshot";
import { prepareProjectAuthoringBuild } from "./prepare";

type PreparedBuild = Awaited<ReturnType<typeof prepareProjectAuthoringBuild>>;

export type ProjectBuildDependencies = Readonly<{
  prepare?: typeof prepareProjectAuthoringBuild;
  collectSnapshot?: typeof collectProjectSourceSnapshot;
  renderVideo?: typeof renderProjectVideo;
  renderCover?: typeof renderProjectCover;
  inspectVideo?: typeof inspectProjectVideo;
  inspectCover?: typeof inspectProjectCover;
}>;

const exists = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const ensureDirectory = async (path: string) => {
  const metadata = await exists(path);
  if (metadata === null) {
    await mkdir(path);
    return;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Project build directory path is unsafe.");
  }
};

const ensureStaging = async ({
  rootDir,
  projectId,
  buildId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly buildId: string;
}) => {
  const deliveries = join(rootDir, "deliveries");
  const staging = join(deliveries, ".staging");
  const projectBuilds = join(staging, "project-build");
  const projectStaging = join(projectBuilds, projectId);
  const buildStaging = join(projectStaging, buildId);
  for (const directory of [deliveries, staging, projectBuilds, projectStaging]) {
    await ensureDirectory(directory);
  }
  await ensureDirectory(buildStaging);
  return {
    staging: buildStaging,
    delivery: join(deliveries, projectId),
    projectStaging,
    projectBuilds,
  } as const;
};

const removeEmptyDirectory = async (path: string) => {
  try {
    await rmdir(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
  }
};

const writePublishLast = async (path: string, publish: ProjectPublish) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${serializeCanonicalJson(publish)}\n`, {
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

const materializeArtifact = async <T>({
  path,
  temporarySuffix,
  render,
  inspect,
}: {
  readonly path: string;
  readonly temporarySuffix: string;
  readonly render: (temporary: string) => Promise<void>;
  readonly inspect: (path: string) => Promise<T>;
}) => {
  if ((await exists(path)) !== null) {
    try {
      return { media: await inspect(path), reused: true as const };
    } catch {
      await rm(path, { force: true });
    }
  }
  const temporary = `${path}.${randomUUID()}.${temporarySuffix}`;
  try {
    await render(temporary);
    const media = await inspect(temporary);
    await rename(temporary, path);
    return { media, reused: false as const };
  } finally {
    await rm(temporary, { force: true });
  }
};

const assertExactDeliveryEntries = async (directory: string) => {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Project delivery must be a regular directory.");
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const expected = [
    "cover-3x4.png",
    "cover-4x3.png",
    "publish.json",
    "video.mp4",
  ];
  const actual = entries.map(({ name }) => name).sort();
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index]) ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  ) {
    throw new Error("Project delivery contains missing or unknown artifacts.");
  }
};

const validateProjectDelivery = async ({
  directory,
  expectedBuildId,
  expectedSnapshot,
  prepared,
  dependencies,
}: {
  readonly directory: string;
  readonly expectedBuildId: string;
  readonly expectedSnapshot: ProjectSourceSnapshot;
  readonly prepared: PreparedBuild;
  readonly dependencies: ProjectBuildDependencies;
}) => {
  await assertExactDeliveryEntries(directory);
  const publish = ProjectPublishSchema.parse(
    JSON.parse(await readFile(join(directory, "publish.json"), "utf8")),
  );
  if (
    publish.buildId !== expectedBuildId ||
    publish.sourceSnapshotFingerprint !== expectedSnapshot.fingerprint ||
    publish.sourceFileCount !== expectedSnapshot.files.length
  ) {
    throw new Error("Project delivery belongs to another source snapshot.");
  }
  const inspectVideo = dependencies.inspectVideo ?? inspectProjectVideo;
  const inspectCover = dependencies.inspectCover ?? inspectProjectCover;
  const [videoFile, cover4x3File, cover3x4File, video, cover4x3, cover3x4] =
    await Promise.all([
      inspectDeliveryFile(join(directory, "video.mp4")),
      inspectDeliveryFile(join(directory, "cover-4x3.png")),
      inspectDeliveryFile(join(directory, "cover-3x4.png")),
      inspectVideo({
        absolutePath: join(directory, "video.mp4"),
        render: prepared.render,
        frameCount: prepared.frameCount,
      }),
      inspectCover({
        absolutePath: join(directory, "cover-4x3.png"),
        expected: { width: 1600, height: 1200 },
      }),
      inspectCover({
        absolutePath: join(directory, "cover-3x4.png"),
        expected: { width: 1200, height: 1600 },
      }),
    ]);
  const actual = {
    video: { ...videoFile, media: video },
    cover4x3: { ...cover4x3File, media: cover4x3 },
    cover3x4: { ...cover3x4File, media: cover3x4 },
  };
  for (const key of ["video", "cover4x3", "cover3x4"] as const) {
    const recorded = publish.artifacts[key];
    if (
      recorded.checksum !== actual[key].checksum ||
      recorded.sizeBytes !== actual[key].sizeBytes ||
      JSON.stringify(recorded.media) !== JSON.stringify(actual[key].media)
    ) {
      throw new Error("Project publish checksum or media binding is stale.");
    }
  }
  return publish;
};

const tryCurrentNoOp = async (request: Parameters<typeof validateProjectDelivery>[0]) => {
  try {
    return await validateProjectDelivery(request);
  } catch {
    return null;
  }
};

const buildProjectUnlocked = async ({
  rootDir,
  projectId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly dependencies?: ProjectBuildDependencies;
}) => {
  const prepare = dependencies.prepare ?? prepareProjectAuthoringBuild;
  const collectSnapshot =
    dependencies.collectSnapshot ?? collectProjectSourceSnapshot;
  const prepared = await prepare({ rootDir, projectId });
  const snapshot = await collectSnapshot({ rootDir, projectId });
  const identity = {
    storyId: prepared.projectId,
    sourceSnapshotFingerprint: snapshot.fingerprint,
    compositionId: prepared.render.compositionId,
    fps: prepared.render.fps,
    frameCount: prepared.frameCount,
    width: prepared.render.width,
    height: prepared.render.height,
    policyVersion: PROJECT_BUILD_POLICY_VERSION,
  } as const;
  const buildId = createProjectBuildId(identity);
  const delivery = join(rootDir, "deliveries", prepared.projectId);
  const deliveryMetadata = await exists(delivery);
  if (
    deliveryMetadata !== null &&
    (!deliveryMetadata.isDirectory() || deliveryMetadata.isSymbolicLink())
  ) {
    throw new Error("Project delivery path is unsafe.");
  }
  if (deliveryMetadata !== null) {
    const current = await tryCurrentNoOp({
      directory: delivery,
      expectedBuildId: buildId,
      expectedSnapshot: snapshot,
      prepared,
      dependencies,
    });
    if (current !== null) {
      return {
        projectId: prepared.projectId,
        buildId,
        status: "project-build-current" as const,
        noOp: true as const,
        deliveryPath: `deliveries/${prepared.projectId}`,
      };
    }
  }
  const paths = await ensureStaging({
    rootDir,
    projectId: prepared.projectId,
    buildId,
  });

  await rm(join(paths.staging, "publish.json"), { force: true });
  const renderVideo = dependencies.renderVideo ?? renderProjectVideo;
  const renderCover = dependencies.renderCover ?? renderProjectCover;
  const inspectVideo = dependencies.inspectVideo ?? inspectProjectVideo;
  const inspectCover = dependencies.inspectCover ?? inspectProjectCover;
  const videoPath = join(paths.staging, "video.mp4");
  const cover4x3Path = join(paths.staging, "cover-4x3.png");
  const cover3x4Path = join(paths.staging, "cover-3x4.png");
  const video = await materializeArtifact({
    path: videoPath,
    temporarySuffix: "mp4",
    render: (outputPath) =>
      renderVideo({
        rootDir,
        compositionId: prepared.render.compositionId,
        outputPath,
      }),
    inspect: (absolutePath) =>
      inspectVideo({
        absolutePath,
        render: prepared.render,
        frameCount: prepared.frameCount,
      }),
  });
  const cover4x3 = await materializeArtifact({
    path: cover4x3Path,
    temporarySuffix: "png",
    render: (outputPath) =>
      renderCover({
        rootDir,
        projectId: prepared.projectId,
        compositionId: `${prepared.coverCompositionBaseId}DeliveryCover4x3V2`,
        outputPath,
      }),
    inspect: (absolutePath) =>
      inspectCover({
        absolutePath,
        expected: { width: 1600, height: 1200 },
      }),
  });
  const cover3x4 = await materializeArtifact({
    path: cover3x4Path,
    temporarySuffix: "png",
    render: (outputPath) =>
      renderCover({
        rootDir,
        projectId: prepared.projectId,
        compositionId: `${prepared.coverCompositionBaseId}DeliveryCover3x4V2`,
        outputPath,
      }),
    inspect: (absolutePath) =>
      inspectCover({
        absolutePath,
        expected: { width: 1200, height: 1600 },
      }),
  });
  const currentSnapshot = await collectSnapshot({ rootDir, projectId });
  if (
    currentSnapshot.fingerprint !== snapshot.fingerprint ||
    currentSnapshot.files.length !== snapshot.files.length
  ) {
    throw new Error("Project authoring source drifted during build.");
  }
  const [videoFile, cover4x3File, cover3x4File] = await Promise.all([
    inspectDeliveryFile(videoPath),
    inspectDeliveryFile(cover4x3Path),
    inspectDeliveryFile(cover3x4Path),
  ]);
  const publish = buildProjectPublish({
    ...identity,
    buildId,
    sourceFileCount: snapshot.files.length,
    artifacts: {
      video: {
        repositoryPath: `deliveries/${prepared.projectId}/video.mp4`,
        checksum: videoFile.checksum,
        sizeBytes: videoFile.sizeBytes,
        media: video.media,
      },
      cover4x3: {
        repositoryPath: `deliveries/${prepared.projectId}/cover-4x3.png`,
        checksum: cover4x3File.checksum,
        sizeBytes: cover4x3File.sizeBytes,
        media: cover4x3.media,
      },
      cover3x4: {
        repositoryPath: `deliveries/${prepared.projectId}/cover-3x4.png`,
        checksum: cover3x4File.checksum,
        sizeBytes: cover3x4File.sizeBytes,
        media: cover3x4.media,
      },
    },
    publishing: prepared.publishing,
  });
  await writePublishLast(join(paths.staging, "publish.json"), publish);
  await validateProjectDelivery({
    directory: paths.staging,
    expectedBuildId: buildId,
    expectedSnapshot: snapshot,
    prepared,
    dependencies,
  });
  await promoteDeliveryStaging({
    staging: paths.staging,
    destination: paths.delivery,
  });
  await validateProjectDelivery({
    directory: paths.delivery,
    expectedBuildId: buildId,
    expectedSnapshot: snapshot,
    prepared,
    dependencies,
  });
  await removeEmptyDirectory(paths.projectStaging);
  await removeEmptyDirectory(paths.projectBuilds);
  return {
    projectId: prepared.projectId,
    buildId,
    status: "project-build-complete" as const,
    noOp: false as const,
    deliveryPath: `deliveries/${prepared.projectId}`,
    reused: {
      video: video.reused,
      cover4x3: cover4x3.reused,
      cover3x4: cover3x4.reused,
    },
  };
};

export const buildProject = async (
  input: Parameters<typeof buildProjectUnlocked>[0],
) => {
  const lock = await acquireRepositoryOperationLock({
    rootDir: input.rootDir,
    ownerId: "project-build",
  });
  try {
    return await buildProjectUnlocked(input);
  } finally {
    await lock.release();
  }
};
