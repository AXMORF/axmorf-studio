import { randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  DELIVERY_BUILD_POLICY_VERSION,
  DeliveryPublishSchema,
  buildDeliveryPublish,
  createDeliveryBuildId,
  serializeCanonicalJson,
  type DeliveryPublish,
} from "@axmorf/studio/contracts";
import {
  assertDeliveryPath,
  ensureDeliveryDirectory,
  inspectDeliveryFile,
  promoteDeliveryStaging,
} from "../adapters/delivery-filesystem";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import {
  inspectProjectCover,
  inspectProjectVideo,
  renderProjectCover,
  renderProjectVideo,
} from "../adapters/media";
import { prepareProjectAuthoringBuild } from "./prepare-delivery";

type PreparedBuild = Awaited<ReturnType<typeof prepareProjectAuthoringBuild>>;

export type DeliveryBuildDependencies = Readonly<{
  prepare?: typeof prepareProjectAuthoringBuild;
  renderVideo?: typeof renderProjectVideo;
  renderCover?: typeof renderProjectCover;
  inspectVideo?: typeof inspectProjectVideo;
  inspectCover?: typeof inspectProjectCover;
  verifyMaterialized?: () => Promise<void>;
}>;

const exists = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
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
  const projectBuilds = join(staging, "project-production");
  const projectStaging = join(projectBuilds, projectId);
  const buildStaging = join(projectStaging, buildId);
  for (const directory of [
    deliveries,
    staging,
    projectBuilds,
    projectStaging,
  ]) {
    await ensureDeliveryDirectory({ rootDir, directory });
  }
  await ensureDeliveryDirectory({ rootDir, directory: buildStaging });
  return {
    staging: buildStaging,
    delivery: join(deliveries, projectId),
    projectStaging,
    projectBuilds,
  } as const;
};

const removeEmptyDirectory = async (rootDir: string, path: string) => {
  try {
    await assertDeliveryPath({
      rootDir,
      path,
      kind: "directory",
    });
    await rmdir(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
  }
};

const writePublishLast = async ({
  rootDir,
  path,
  publish,
}: {
  readonly rootDir: string;
  readonly path: string;
  readonly publish: DeliveryPublish;
}) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await assertDeliveryPath({ rootDir, path: temporary, kind: "file" });
    await writeFile(temporary, `${serializeCanonicalJson(publish)}\n`, {
      flag: "wx",
    });
    await assertDeliveryPath({
      rootDir,
      path: temporary,
      kind: "file",
      mustExist: true,
    });
    await assertDeliveryPath({ rootDir, path, kind: "file" });
    await rename(temporary, path);
    await assertDeliveryPath({
      rootDir,
      path,
      kind: "file",
      mustExist: true,
    });
  } finally {
    await assertDeliveryPath({ rootDir, path: temporary, kind: "file" });
    await rm(temporary, { force: true });
  }
};

const materializeArtifact = async <T>({
  rootDir,
  path,
  temporarySuffix,
  render,
  inspect,
}: {
  readonly rootDir: string;
  readonly path: string;
  readonly temporarySuffix: string;
  readonly render: (temporary: string) => Promise<void>;
  readonly inspect: (path: string) => Promise<T>;
}) => {
  await assertDeliveryPath({ rootDir, path, kind: "file" });
  if ((await exists(path)) !== null) {
    try {
      const media = await inspect(path);
      await assertDeliveryPath({
        rootDir,
        path,
        kind: "file",
        mustExist: true,
      });
      return { media, reused: true as const };
    } catch {
      await assertDeliveryPath({
        rootDir,
        path,
        kind: "file",
        mustExist: true,
      });
      await rm(path, { force: true });
    }
  }
  const temporary = `${path}.${randomUUID()}.${temporarySuffix}`;
  try {
    await assertDeliveryPath({ rootDir, path: temporary, kind: "file" });
    await render(temporary);
    await assertDeliveryPath({
      rootDir,
      path: temporary,
      kind: "file",
      mustExist: true,
    });
    const media = await inspect(temporary);
    await assertDeliveryPath({
      rootDir,
      path: temporary,
      kind: "file",
      mustExist: true,
    });
    await assertDeliveryPath({ rootDir, path, kind: "file" });
    await rename(temporary, path);
    await assertDeliveryPath({
      rootDir,
      path,
      kind: "file",
      mustExist: true,
    });
    return { media, reused: false as const };
  } finally {
    await assertDeliveryPath({ rootDir, path: temporary, kind: "file" });
    await rm(temporary, { force: true });
  }
};

const assertExactDeliveryEntries = async (
  rootDir: string,
  directory: string,
) => {
  await assertDeliveryPath({
    rootDir,
    path: directory,
    kind: "directory",
    mustExist: true,
  });
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
  await assertDeliveryPath({
    rootDir,
    path: directory,
    kind: "directory",
    mustExist: true,
  });
};

const validateProjectDelivery = async ({
  directory,
  rootDir,
  expectedBuildId,
  revisionId,
  artifactSetFingerprint,
  prepared,
  dependencies,
}: {
  readonly directory: string;
  readonly rootDir: string;
  readonly expectedBuildId: string;
  readonly revisionId: string;
  readonly artifactSetFingerprint: string;
  readonly prepared: PreparedBuild;
  readonly dependencies: DeliveryBuildDependencies;
}) => {
  await assertExactDeliveryEntries(rootDir, directory);
  const publishPath = join(directory, "publish.json");
  await assertDeliveryPath({
    rootDir,
    path: publishPath,
    kind: "file",
    mustExist: true,
  });
  const publish = DeliveryPublishSchema.parse(
    JSON.parse(await readFile(publishPath, "utf8")),
  );
  await assertDeliveryPath({
    rootDir,
    path: publishPath,
    kind: "file",
    mustExist: true,
  });
  if (
    publish.deliveryBuildId !== expectedBuildId ||
    publish.revisionId !== revisionId ||
    publish.artifactSetFingerprint !== artifactSetFingerprint
  ) {
    throw new Error("Project delivery belongs to another source snapshot.");
  }
  const inspectVideo = dependencies.inspectVideo ?? inspectProjectVideo;
  const inspectCover = dependencies.inspectCover ?? inspectProjectCover;
  const videoPath = join(directory, "video.mp4");
  const cover4x3Path = join(directory, "cover-4x3.png");
  const cover3x4Path = join(directory, "cover-3x4.png");
  const videoFile = await inspectDeliveryFile({ rootDir, path: videoPath });
  const cover4x3File = await inspectDeliveryFile({
    rootDir,
    path: cover4x3Path,
  });
  const cover3x4File = await inspectDeliveryFile({
    rootDir,
    path: cover3x4Path,
  });
  await assertDeliveryPath({
    rootDir,
    path: videoPath,
    kind: "file",
    mustExist: true,
  });
  const video = await inspectVideo({
    absolutePath: videoPath,
    render: prepared.render,
    frameCount: prepared.frameCount,
  });
  await assertDeliveryPath({
    rootDir,
    path: videoPath,
    kind: "file",
    mustExist: true,
  });
  await assertDeliveryPath({
    rootDir,
    path: cover4x3Path,
    kind: "file",
    mustExist: true,
  });
  const cover4x3 = await inspectCover({
    absolutePath: cover4x3Path,
    expected: { width: 1600, height: 1200 },
  });
  await assertDeliveryPath({
    rootDir,
    path: cover4x3Path,
    kind: "file",
    mustExist: true,
  });
  await assertDeliveryPath({
    rootDir,
    path: cover3x4Path,
    kind: "file",
    mustExist: true,
  });
  const cover3x4 = await inspectCover({
    absolutePath: cover3x4Path,
    expected: { width: 1200, height: 1600 },
  });
  await assertDeliveryPath({
    rootDir,
    path: cover3x4Path,
    kind: "file",
    mustExist: true,
  });
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
  await assertDeliveryPath({
    rootDir,
    path: directory,
    kind: "directory",
    mustExist: true,
  });
  return publish;
};

const tryCurrentNoOp = async (
  request: Parameters<typeof validateProjectDelivery>[0],
) => {
  try {
    return await validateProjectDelivery(request);
  } catch {
    return null;
  }
};

export const buildDeliveryUnlocked = async ({
  rootDir,
  projectId,
  revisionId,
  artifactSetFingerprint,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly artifactSetFingerprint: string;
  readonly dependencies?: DeliveryBuildDependencies;
}) => {
  const prepare = dependencies.prepare ?? prepareProjectAuthoringBuild;
  const prepared = await prepare({ rootDir, projectId });
  await dependencies.verifyMaterialized?.();
  const identity = {
    storyId: prepared.projectId,
    revisionId,
    artifactSetFingerprint,
    compositionId: prepared.render.compositionId,
    fps: prepared.render.fps,
    frameCount: prepared.frameCount,
    width: prepared.render.width,
    height: prepared.render.height,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const buildId = createDeliveryBuildId(identity);
  const delivery = join(rootDir, "deliveries", prepared.projectId);
  await assertDeliveryPath({ rootDir, path: delivery, kind: "directory" });
  const deliveryMetadata = await exists(delivery);
  if (
    deliveryMetadata !== null &&
    (!deliveryMetadata.isDirectory() || deliveryMetadata.isSymbolicLink())
  ) {
    throw new Error("Project delivery path is unsafe.");
  }
  if (deliveryMetadata !== null) {
    const current = await tryCurrentNoOp({
      rootDir,
      directory: delivery,
      expectedBuildId: buildId,
      revisionId,
      artifactSetFingerprint,
      prepared,
      dependencies,
    });
    if (current !== null) {
      for (const step of ["video", "cover-4x3", "cover-3x4"] as const) {
        void step;
      }
      return {
        projectId: prepared.projectId,
        deliveryBuildId: buildId,
        status: "project-production-current" as const,
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

  const stagingPublishPath = join(paths.staging, "publish.json");
  await assertDeliveryPath({
    rootDir,
    path: stagingPublishPath,
    kind: "file",
  });
  await rm(stagingPublishPath, { force: true });
  const renderVideo = dependencies.renderVideo ?? renderProjectVideo;
  const renderCover = dependencies.renderCover ?? renderProjectCover;
  const inspectVideo = dependencies.inspectVideo ?? inspectProjectVideo;
  const inspectCover = dependencies.inspectCover ?? inspectProjectCover;
  const videoPath = join(paths.staging, "video.mp4");
  const cover4x3Path = join(paths.staging, "cover-4x3.png");
  const cover3x4Path = join(paths.staging, "cover-3x4.png");
  const video = await materializeArtifact({
    rootDir,
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
    rootDir,
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
    rootDir,
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
  await dependencies.verifyMaterialized?.();
  await assertDeliveryPath({
    rootDir,
    path: paths.staging,
    kind: "directory",
    mustExist: true,
  });
  const videoFile = await inspectDeliveryFile({ rootDir, path: videoPath });
  const cover4x3File = await inspectDeliveryFile({
    rootDir,
    path: cover4x3Path,
  });
  const cover3x4File = await inspectDeliveryFile({
    rootDir,
    path: cover3x4Path,
  });
  const publish = buildDeliveryPublish({
    ...identity,
    deliveryBuildId: buildId,
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
  await writePublishLast({ rootDir, path: stagingPublishPath, publish });
  await validateProjectDelivery({
    rootDir,
    directory: paths.staging,
    expectedBuildId: buildId,
    revisionId,
    artifactSetFingerprint,
    prepared,
    dependencies,
  });
  await promoteDeliveryStaging({
    rootDir,
    staging: paths.staging,
    destination: paths.delivery,
    validate: async (directory) => {
      await validateProjectDelivery({
        rootDir,
        directory,
        expectedBuildId: buildId,
        revisionId,
        artifactSetFingerprint,
        prepared,
        dependencies,
      });
    },
  });
  await removeEmptyDirectory(rootDir, paths.projectStaging);
  await removeEmptyDirectory(rootDir, paths.projectBuilds);
  return {
    projectId: prepared.projectId,
    deliveryBuildId: buildId,
    status: "project-production-complete" as const,
    noOp: false as const,
    deliveryPath: `deliveries/${prepared.projectId}`,
    reused: {
      video: video.reused,
      cover4x3: cover4x3.reused,
      cover3x4: cover3x4.reused,
    },
  };
};

export const buildDelivery = async (
  input: Parameters<typeof buildDeliveryUnlocked>[0],
) => {
  const lock = await acquireRepositoryOperationLock({
    rootDir: input.rootDir,
    ownerId: "project-production-delivery",
  });
  try {
    return await buildDeliveryUnlocked(input);
  } finally {
    await lock.release();
  }
};
