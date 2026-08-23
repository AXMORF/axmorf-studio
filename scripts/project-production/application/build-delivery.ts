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
  createFingerprint,
  createDeliveryBuildId,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type DeliveryPublish,
  type ProducerConfig,
} from "../../../src/contracts";
import {
  assertDeliveryPath,
  ensureDeliveryDirectory,
  inspectDeliveryFile,
  promoteDeliveryStaging,
} from "../adapters/delivery-filesystem";
import { acquireProductionOperationLock } from "../adapters/production-operation-lock";
import type {
  inspectProjectCover,
  inspectProjectVideo,
  renderProjectCover,
  renderProjectVideo,
} from "../adapters/media";
import { inspectArtifact as inspectArtifactFromStore } from "../adapters/artifact-store";
import {
  createSourceCurrentAttestation,
  inspectSourceCurrent,
  readSourceCurrent,
} from "../adapters/source-current-store";
import { buildCurrentProductionPlan } from "./build-current-plan";
import type { prepareProjectAuthoringBuild } from "./prepare-delivery";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";

type PreparedBuild = Awaited<ReturnType<typeof prepareProjectAuthoringBuild>>;

export type DeliveryBuildDependencies = Readonly<{
  prepare: (input: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly projectId: string;
    readonly mode: "check";
  }) => ReturnType<typeof prepareProjectAuthoringBuild>;
  renderVideo: typeof renderProjectVideo;
  renderCover: typeof renderProjectCover;
  inspectVideo: typeof inspectProjectVideo;
  inspectCover: typeof inspectProjectCover;
  verifyMaterialized?: () => Promise<void>;
}>;

export type DeliveryBuildRequestDependencies = Readonly<{
  prepare?: DeliveryBuildDependencies["prepare"];
  verifyMaterialized?: DeliveryBuildDependencies["verifyMaterialized"];
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
  locations,
  deliveryRoot,
  projectId,
  buildId,
}: {
  readonly locations: ProductionLocations;
  readonly deliveryRoot: string;
  readonly projectId: string;
  readonly buildId: string;
}) => {
  const deliveries = deliveryRoot;
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
    await ensureDeliveryDirectory({ locations, directory });
  }
  await ensureDeliveryDirectory({ locations, directory: buildStaging });
  return {
    staging: buildStaging,
    delivery: join(deliveries, projectId),
    projectStaging,
    projectBuilds,
  } as const;
};

const removeEmptyDirectory = async (
  locations: ProductionLocations,
  path: string,
) => {
  try {
    await assertDeliveryPath({
      locations,
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
  locations,
  path,
  publish,
}: {
  readonly locations: ProductionLocations;
  readonly path: string;
  readonly publish: DeliveryPublish;
}) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await assertDeliveryPath({ locations, path: temporary, kind: "file" });
    await writeFile(temporary, `${serializeCanonicalJson(publish)}\n`, {
      flag: "wx",
    });
    await assertDeliveryPath({
      locations,
      path: temporary,
      kind: "file",
      mustExist: true,
    });
    await assertDeliveryPath({ locations, path, kind: "file" });
    await rename(temporary, path);
    await assertDeliveryPath({
      locations,
      path,
      kind: "file",
      mustExist: true,
    });
  } finally {
    await assertDeliveryPath({ locations, path: temporary, kind: "file" });
    await rm(temporary, { force: true });
  }
};

const materializeArtifact = async <T>({
  locations,
  path,
  temporarySuffix,
  render,
  inspect,
}: {
  readonly locations: ProductionLocations;
  readonly path: string;
  readonly temporarySuffix: string;
  readonly render: (temporary: string) => Promise<void>;
  readonly inspect: (path: string) => Promise<T>;
}) => {
  await assertDeliveryPath({ locations, path, kind: "file" });
  if ((await exists(path)) !== null) {
    try {
      const media = await inspect(path);
      await assertDeliveryPath({
        locations,
        path,
        kind: "file",
        mustExist: true,
      });
      return { media, reused: true as const };
    } catch {
      await assertDeliveryPath({
        locations,
        path,
        kind: "file",
        mustExist: true,
      });
      await rm(path, { force: true });
    }
  }
  const temporary = `${path}.${randomUUID()}.${temporarySuffix}`;
  try {
    await assertDeliveryPath({ locations, path: temporary, kind: "file" });
    await render(temporary);
    await assertDeliveryPath({
      locations,
      path: temporary,
      kind: "file",
      mustExist: true,
    });
    const media = await inspect(temporary);
    await assertDeliveryPath({
      locations,
      path: temporary,
      kind: "file",
      mustExist: true,
    });
    await assertDeliveryPath({ locations, path, kind: "file" });
    await rename(temporary, path);
    await assertDeliveryPath({
      locations,
      path,
      kind: "file",
      mustExist: true,
    });
    return { media, reused: false as const };
  } finally {
    await assertDeliveryPath({ locations, path: temporary, kind: "file" });
    await rm(temporary, { force: true });
  }
};

const assertExactDeliveryEntries = async (
  locations: ProductionLocations,
  directory: string,
) => {
  await assertDeliveryPath({
    locations,
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
    locations,
    path: directory,
    kind: "directory",
    mustExist: true,
  });
};

const validateProjectDelivery = async ({
  directory,
  locations,
  expectedBuildId,
  revisionId,
  sourceCurrentId,
  rendererRuntimeFingerprint,
  runtime,
  prepared,
  dependencies,
}: {
  readonly directory: string;
  readonly locations: ProductionLocations;
  readonly expectedBuildId: string;
  readonly revisionId: string;
  readonly sourceCurrentId: string;
  readonly rendererRuntimeFingerprint: string;
  readonly runtime: RuntimeExecutionResources;
  readonly prepared: PreparedBuild;
  readonly dependencies: DeliveryBuildDependencies;
}) => {
  await assertExactDeliveryEntries(locations, directory);
  const publishPath = join(directory, "publish.json");
  await assertDeliveryPath({
    locations,
    path: publishPath,
    kind: "file",
    mustExist: true,
  });
  const publish = DeliveryPublishSchema.parse(
    JSON.parse(await readFile(publishPath, "utf8")),
  );
  await assertDeliveryPath({
    locations,
    path: publishPath,
    kind: "file",
    mustExist: true,
  });
  if (
    publish.deliveryBuildId !== expectedBuildId ||
    publish.revisionId !== revisionId ||
    publish.sourceCurrentId !== sourceCurrentId ||
    publish.rendererRuntimeFingerprint !== rendererRuntimeFingerprint
  ) {
    throw new Error("Project delivery belongs to another source snapshot.");
  }
  const { inspectVideo, inspectCover } = dependencies;
  const videoPath = join(directory, "video.mp4");
  const cover4x3Path = join(directory, "cover-4x3.png");
  const cover3x4Path = join(directory, "cover-3x4.png");
  const videoFile = await inspectDeliveryFile({ locations, path: videoPath });
  const cover4x3File = await inspectDeliveryFile({
    locations,
    path: cover4x3Path,
  });
  const cover3x4File = await inspectDeliveryFile({
    locations,
    path: cover3x4Path,
  });
  await assertDeliveryPath({
    locations,
    path: videoPath,
    kind: "file",
    mustExist: true,
  });
  const video = await inspectVideo({
    absolutePath: videoPath,
    render: prepared.render,
    frameCount: prepared.frameCount,
    ffprobeExecutable: runtime.ffprobeExecutable,
  });
  await assertDeliveryPath({
    locations,
    path: videoPath,
    kind: "file",
    mustExist: true,
  });
  await assertDeliveryPath({
    locations,
    path: cover4x3Path,
    kind: "file",
    mustExist: true,
  });
  const cover4x3 = await inspectCover({
    absolutePath: cover4x3Path,
    expected: { width: 1600, height: 1200 },
  });
  await assertDeliveryPath({
    locations,
    path: cover4x3Path,
    kind: "file",
    mustExist: true,
  });
  await assertDeliveryPath({
    locations,
    path: cover3x4Path,
    kind: "file",
    mustExist: true,
  });
  const cover3x4 = await inspectCover({
    absolutePath: cover3x4Path,
    expected: { width: 1200, height: 1600 },
  });
  await assertDeliveryPath({
    locations,
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
    locations,
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

export const buildDeliveryUnlocked = async (
  {
    locations,
    runtime,
    projectId,
    revisionId,
    sourceCurrentId,
    config,
  }: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly projectId: string;
    readonly revisionId: string;
    readonly sourceCurrentId: string;
    readonly config: ProducerConfig;
    readonly dependencies?: DeliveryBuildRequestDependencies;
  },
  dependencies: DeliveryBuildDependencies,
) => {
  const repositoryRuntimeRoot = locations.runtimeResources;
  const rendererRuntimeFingerprint = runtime.rendererRuntimeFingerprint;
  const prepared = await dependencies.prepare({
    locations,
    runtime,
    config,
    projectId,
    mode: "check",
  });
  await dependencies.verifyMaterialized?.();
  const identity = {
    storyId: prepared.projectId,
    revisionId,
    sourceCurrentId,
    rendererRuntimeFingerprint,
    publishingFingerprint: createFingerprint({
      namespace: "delivery-publishing-input",
      version: 1,
      value: prepared.publishing,
    }),
    compositionId: prepared.render.compositionId,
    fps: prepared.render.fps,
    frameCount: prepared.frameCount,
    width: prepared.render.width,
    height: prepared.render.height,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const buildId = createDeliveryBuildId(identity);
  const delivery = join(locations.deliveryRoot, prepared.projectId);
  await assertDeliveryPath({ locations, path: delivery, kind: "directory" });
  const deliveryMetadata = await exists(delivery);
  if (
    deliveryMetadata !== null &&
    (!deliveryMetadata.isDirectory() || deliveryMetadata.isSymbolicLink())
  ) {
    throw new Error("Project delivery path is unsafe.");
  }
  if (deliveryMetadata !== null) {
    const current = await tryCurrentNoOp({
      locations,
      directory: delivery,
      expectedBuildId: buildId,
      revisionId,
      sourceCurrentId,
      rendererRuntimeFingerprint,
      runtime,
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
    locations,
    deliveryRoot: locations.deliveryRoot,
    projectId: prepared.projectId,
    buildId,
  });

  const stagingPublishPath = join(paths.staging, "publish.json");
  await assertDeliveryPath({
    locations,
    path: stagingPublishPath,
    kind: "file",
  });
  await rm(stagingPublishPath, { force: true });
  const { renderVideo, renderCover, inspectVideo, inspectCover } = dependencies;
  const videoPath = join(paths.staging, "video.mp4");
  const cover4x3Path = join(paths.staging, "cover-4x3.png");
  const cover3x4Path = join(paths.staging, "cover-3x4.png");
  const video = await materializeArtifact({
    locations,
    path: videoPath,
    temporarySuffix: "mp4",
    render: (outputPath) =>
      renderVideo({
        rootDir: repositoryRuntimeRoot,
        compositionId: prepared.render.compositionId,
        outputPath,
        browserExecutable: runtime.browserExecutable,
        binariesDirectory: runtime.binariesDirectory,
      }),
    inspect: (absolutePath) =>
      inspectVideo({
        absolutePath,
        render: prepared.render,
        frameCount: prepared.frameCount,
        ffprobeExecutable: runtime.ffprobeExecutable,
      }),
  });
  const cover4x3 = await materializeArtifact({
    locations,
    path: cover4x3Path,
    temporarySuffix: "png",
    render: (outputPath) =>
      renderCover({
        rootDir: repositoryRuntimeRoot,
        projectId: prepared.projectId,
        compositionId: `${prepared.coverCompositionBaseId}DeliveryCover4x3V2`,
        outputPath,
        browserExecutable: runtime.browserExecutable,
        binariesDirectory: runtime.binariesDirectory,
      }),
    inspect: (absolutePath) =>
      inspectCover({
        absolutePath,
        expected: { width: 1600, height: 1200 },
      }),
  });
  const cover3x4 = await materializeArtifact({
    locations,
    path: cover3x4Path,
    temporarySuffix: "png",
    render: (outputPath) =>
      renderCover({
        rootDir: repositoryRuntimeRoot,
        projectId: prepared.projectId,
        compositionId: `${prepared.coverCompositionBaseId}DeliveryCover3x4V2`,
        outputPath,
        browserExecutable: runtime.browserExecutable,
        binariesDirectory: runtime.binariesDirectory,
      }),
    inspect: (absolutePath) =>
      inspectCover({
        absolutePath,
        expected: { width: 1200, height: 1600 },
      }),
  });
  await dependencies.verifyMaterialized?.();
  await assertDeliveryPath({
    locations,
    path: paths.staging,
    kind: "directory",
    mustExist: true,
  });
  const videoFile = await inspectDeliveryFile({
    locations,
    path: videoPath,
  });
  const cover4x3File = await inspectDeliveryFile({
    locations,
    path: cover4x3Path,
  });
  const cover3x4File = await inspectDeliveryFile({
    locations,
    path: cover3x4Path,
  });
  const publish = buildDeliveryPublish({
    ...identity,
    deliveryBuildId: buildId,
    artifacts: {
      video: {
        logicalPath: `deliveries/${prepared.projectId}/video.mp4`,
        checksum: videoFile.checksum,
        sizeBytes: videoFile.sizeBytes,
        media: video.media,
      },
      cover4x3: {
        logicalPath: `deliveries/${prepared.projectId}/cover-4x3.png`,
        checksum: cover4x3File.checksum,
        sizeBytes: cover4x3File.sizeBytes,
        media: cover4x3.media,
      },
      cover3x4: {
        logicalPath: `deliveries/${prepared.projectId}/cover-3x4.png`,
        checksum: cover3x4File.checksum,
        sizeBytes: cover3x4File.sizeBytes,
        media: cover3x4.media,
      },
    },
    publishing: prepared.publishing,
  });
  await writePublishLast({
    locations,
    path: stagingPublishPath,
    publish,
  });
  await validateProjectDelivery({
    locations,
    directory: paths.staging,
    expectedBuildId: buildId,
    revisionId,
    sourceCurrentId,
    rendererRuntimeFingerprint,
    runtime,
    prepared,
    dependencies,
  });
  await promoteDeliveryStaging({
    locations,
    staging: paths.staging,
    destination: paths.delivery,
    validate: async (directory) => {
      await validateProjectDelivery({
        locations,
        directory,
        expectedBuildId: buildId,
        revisionId,
        sourceCurrentId,
        rendererRuntimeFingerprint,
        runtime,
        prepared,
        dependencies,
      });
    },
  });
  await removeEmptyDirectory(locations, paths.projectStaging);
  await removeEmptyDirectory(locations, paths.projectBuilds);
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

export type DeliveryBuildPort = (
  input: Parameters<typeof buildDeliveryUnlocked>[0],
) => ReturnType<typeof buildDeliveryUnlocked>;

export const buildDelivery = async (
  input: Parameters<typeof buildDeliveryUnlocked>[0],
  dependencies: DeliveryBuildDependencies,
) => {
  const lock = await acquireProductionOperationLock({
    locations: input.locations,
    ownerId: "project-production-delivery",
  });
  try {
    return await buildDeliveryUnlocked(input, dependencies);
  } finally {
    await lock.release();
  }
};

export type CurrentDeliveryBuildDependencies = Readonly<{
  buildCurrentPlan?: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
    readonly config: ProducerConfig;
  }) => ReturnType<typeof buildCurrentProductionPlan>;
  inspectArtifact?: (input: {
    readonly locations: ProductionLocations;
    readonly task: Parameters<typeof inspectArtifactFromStore>[0]["task"];
  }) => ReturnType<typeof inspectArtifactFromStore>;
  build: DeliveryBuildPort;
}>;

/**
 * Builds Delivery strictly from the current materialized source. This path is
 * intentionally outside ExecutionAttempt and never prepares providers, tasks,
 * or Agent workspaces.
 */
export const buildCurrentDelivery = async (
  {
    locations,
    runtime,
    config,
    projectId,
  }: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly projectId: string;
  },
  dependencies: CurrentDeliveryBuildDependencies,
) => {
  const recorded = await readSourceCurrent({ locations, storyId: projectId });
  if (recorded === null) {
    throw new Error("Current source attestation is missing.");
  }
  const buildCurrentPlan =
    dependencies.buildCurrentPlan ?? buildCurrentProductionPlan;
  const planned = await buildCurrentPlan({ locations, projectId, config });
  if (
    planned.revision.revisionId !== recorded.revisionId ||
    planned.plan.tasks.some(({ action }) => action !== "reuse")
  ) {
    throw new Error("Current source revision is stale.");
  }
  const inspectArtifact =
    dependencies.inspectArtifact ?? inspectArtifactFromStore;
  const artifacts: ArtifactAttestation[] = [];
  for (const task of planned.tasks) {
    const attestation = await inspectArtifact({ locations, task });
    if (attestation === null) {
      throw new Error("Current source artifact is missing.");
    }
    artifacts.push(attestation);
  }
  const expected = await createSourceCurrentAttestation({
    locations,
    storyId: projectId,
    revisionId: recorded.revisionId,
    artifacts,
  });
  const verifySourceCurrent = async () => {
    if ((await inspectSourceCurrent({ locations, expected })) === null) {
      throw new Error("Current source attestation is missing.");
    }
  };
  await verifySourceCurrent();
  return dependencies.build({
    locations,
    runtime,
    config,
    projectId,
    revisionId: recorded.revisionId,
    sourceCurrentId: recorded.sourceCurrentId,
    dependencies: { verifyMaterialized: verifySourceCurrent },
  });
};
