import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  DeliveryPublishSchema,
  StoryIdSchema,
  type DeliveryPublish,
  type RenderSpec,
} from "../../../src/contracts";
import { assertDeliveryPath, inspectDeliveryFile } from "./delivery-filesystem";
import { inspectProjectCover, inspectProjectVideo } from "./media";
import { runMediaProcessWithEnvironment } from "../../shared/media-process";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "../domain/production-locations";

type ExpectedVideo = Readonly<{
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  audioChannels: 1 | 2;
}>;

type ExpectedCover = Readonly<{
  width: number;
  height: number;
}>;

export type CurrentDeliveryInspectionDependencies = Readonly<{
  inspectVideo?: (
    input: Readonly<{
      absolutePath: string;
      expected: ExpectedVideo;
    }>,
  ) => Promise<DeliveryPublish["artifacts"]["video"]["media"]>;
  inspectCover?: (
    input: Readonly<{
      absolutePath: string;
      expected: ExpectedCover;
    }>,
  ) => Promise<DeliveryPublish["artifacts"]["cover4x3"]["media"]>;
}>;

export const createRuntimeDeliveryInspectionDependencies = (
  runtime: RuntimeExecutionResources,
): CurrentDeliveryInspectionDependencies => {
  const runProcess = (command: string, args: readonly string[]) =>
    runMediaProcessWithEnvironment(command, args, {
      DYLD_LIBRARY_PATH: runtime.binariesDirectory,
    });
  return {
    inspectVideo: ({ absolutePath, expected }) =>
      inspectProjectVideo({
        absolutePath,
        render: {
          width: expected.width,
          height: expected.height,
          fps: expected.fps,
          output: { audioChannels: expected.audioChannels },
        } as RenderSpec,
        frameCount: expected.frameCount,
        ffprobeExecutable: runtime.ffprobeExecutable,
        runProcess,
      }),
    inspectCover: ({ absolutePath, expected }) =>
      inspectProjectCover({
        absolutePath,
        expected,
        ffprobeExecutable: runtime.ffprobeExecutable,
        runProcess,
      }),
  };
};

const expectedEntries = [
  "cover-3x4.png",
  "cover-4x3.png",
  "publish.json",
  "video.mp4",
] as const;

const assertExactRegularFiles = async ({
  locations,
  directory,
}: {
  readonly locations: ProductionLocations;
  readonly directory: string;
}) => {
  await assertDeliveryPath({
    locations,
    path: directory,
    kind: "directory",
    mustExist: true,
  });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Current delivery root is unsafe.");
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const actual = entries.map(({ name }) => name).sort();
  if (
    actual.length !== expectedEntries.length ||
    actual.some((name, index) => name !== expectedEntries[index]) ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  ) {
    throw new Error(
      "Current delivery must contain exactly four regular files.",
    );
  }
};

const defaultInspectVideo: NonNullable<
  CurrentDeliveryInspectionDependencies["inspectVideo"]
> = ({ absolutePath, expected }) =>
  inspectProjectVideo({
    absolutePath,
    render: {
      width: expected.width,
      height: expected.height,
      fps: expected.fps,
      output: { audioChannels: expected.audioChannels },
    } as RenderSpec,
    frameCount: expected.frameCount,
  });

const defaultInspectCover: NonNullable<
  CurrentDeliveryInspectionDependencies["inspectCover"]
> = ({ absolutePath, expected }) =>
  inspectProjectCover({ absolutePath, expected });

const sameFile = (
  left: Readonly<{ checksum: string; sizeBytes: number }>,
  right: Readonly<{ checksum: string; sizeBytes: number }>,
) => left.checksum === right.checksum && left.sizeBytes === right.sizeBytes;

const inspectBoundArtifact = async <T>({
  locations,
  path,
  recorded,
  inspectMedia,
}: {
  readonly locations: ProductionLocations;
  readonly path: string;
  readonly recorded: Readonly<{
    checksum: string;
    sizeBytes: number;
    media: T;
  }>;
  readonly inspectMedia: () => Promise<T>;
}) => {
  const before = await inspectDeliveryFile({ locations, path });
  if (!sameFile(before, recorded)) {
    throw new Error("Current delivery checksum or size binding is stale.");
  }
  const media = await inspectMedia();
  const after = await inspectDeliveryFile({ locations, path });
  if (
    !sameFile(before, after) ||
    JSON.stringify(media) !== JSON.stringify(recorded.media)
  ) {
    throw new Error("Current delivery media binding is stale.");
  }
};

export const inspectCurrentDelivery = async ({
  locations,
  storyId: rawStoryId,
  dependencies = {},
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly dependencies?: CurrentDeliveryInspectionDependencies;
}): Promise<DeliveryPublish | null> => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  try {
    const root = await lstat(locations.deliveryRoot);
    if (!root.isDirectory() || root.isSymbolicLink()) {
      throw new Error("Configured delivery root is unsafe.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const directory = join(locations.deliveryRoot, storyId);
  await assertDeliveryPath({ locations, path: directory, kind: "directory" });
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Current delivery root is unsafe.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  await assertExactRegularFiles({ locations, directory });
  const publishPath = join(directory, "publish.json");
  const publishFile = await inspectDeliveryFile({
    locations,
    path: publishPath,
  });
  let rawPublish: unknown;
  try {
    rawPublish = JSON.parse(new TextDecoder().decode(publishFile.bytes));
  } catch (error) {
    throw new Error("Current delivery publish manifest is malformed.", {
      cause: error,
    });
  }
  const publish = DeliveryPublishSchema.parse(rawPublish);
  if (publish.storyId !== storyId) {
    throw new Error("Current delivery Project identity is stale.");
  }

  const inspectVideo = dependencies.inspectVideo ?? defaultInspectVideo;
  const inspectCover = dependencies.inspectCover ?? defaultInspectCover;
  await inspectBoundArtifact({
    locations,
    path: join(directory, "video.mp4"),
    recorded: publish.artifacts.video,
    inspectMedia: () =>
      inspectVideo({
        absolutePath: join(directory, "video.mp4"),
        expected: {
          width: publish.width,
          height: publish.height,
          fps: publish.fps,
          frameCount: publish.frameCount,
          audioChannels: publish.artifacts.video.media.audioChannels,
        },
      }),
  });
  await inspectBoundArtifact({
    locations,
    path: join(directory, "cover-4x3.png"),
    recorded: publish.artifacts.cover4x3,
    inspectMedia: () =>
      inspectCover({
        absolutePath: join(directory, "cover-4x3.png"),
        expected: { width: 1600, height: 1200 },
      }),
  });
  await inspectBoundArtifact({
    locations,
    path: join(directory, "cover-3x4.png"),
    recorded: publish.artifacts.cover3x4,
    inspectMedia: () =>
      inspectCover({
        absolutePath: join(directory, "cover-3x4.png"),
        expected: { width: 1200, height: 1600 },
      }),
  });

  const publishAfter = await inspectDeliveryFile({
    locations,
    path: publishPath,
  });
  if (!sameFile(publishFile, publishAfter)) {
    throw new Error(
      "Current delivery publish manifest changed during inspection.",
    );
  }
  await assertExactRegularFiles({ locations, directory });
  return publish;
};
