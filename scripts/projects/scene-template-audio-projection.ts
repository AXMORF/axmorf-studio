import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { serializeCanonicalJson } from "../../src/contracts";
import {
  SCENE_TEMPLATE_AUDIO_OVERRIDE_PATH,
  SceneTemplateAudioOverrideSchema,
  SceneTemplateAudioProjectionSchema,
  type SceneTemplateAudioProjection,
} from "../../src/remotion/capabilities/scenes/template-audio";
import { loadLocalReferenceAssetDescriptors } from "../catalog/project-files";

const readOptionalRegularFile = async (path: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Scene template audio override must be a regular file.");
    }
    return readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const buildSceneTemplateAudioProjection = async (
  rootDir: string,
): Promise<SceneTemplateAudioProjection> => {
  const overrideBytes = await readOptionalRegularFile(
    join(rootDir, SCENE_TEMPLATE_AUDIO_OVERRIDE_PATH),
  );
  if (overrideBytes === null) {
    return SceneTemplateAudioProjectionSchema.parse({
      schemaVersion: 1,
      intro: null,
      outro: null,
    });
  }
  const override = SceneTemplateAudioOverrideSchema.parse(
    JSON.parse(overrideBytes.toString("utf8")),
  );
  const descriptors = await loadLocalReferenceAssetDescriptors(rootDir);
  const select = ({
    resourceId,
    expectedRole,
    minimumDurationInSeconds,
  }: {
    readonly resourceId: string;
    readonly expectedRole: "scene-sfx" | "global-bgm";
    readonly minimumDurationInSeconds: number;
  }) => {
    const descriptor = descriptors.find(({ id }) => id === resourceId);
    if (
      descriptor === undefined ||
      descriptor.kind !== "asset" ||
      descriptor.assetKind !== "audio" ||
      descriptor.allowedUse !== "localize-asset" ||
      descriptor.mediaRole !== expectedRole ||
      descriptor.media?.durationInSeconds === undefined ||
      descriptor.media.durationInSeconds < minimumDurationInSeconds
    ) {
      throw new Error(
        `Scene template audio override is incompatible: ${resourceId}.`,
      );
    }
    return descriptor;
  };
  const intro = select({
    resourceId: override.introResourceId,
    expectedRole: "scene-sfx",
    minimumDurationInSeconds: 2,
  });
  const outro = select({
    resourceId: override.outroResourceId,
    expectedRole: "global-bgm",
    minimumDurationInSeconds: 8,
  });
  return SceneTemplateAudioProjectionSchema.parse({
    schemaVersion: 1,
    intro: {
      source: intro,
      targetMediaRole: "scene-sfx",
      destinationName: basename(intro.localPath),
      soundCues: [
        {
          cueId: "reveal-impact",
          anchorId: "intro-sound-start",
          offsetFrames: 0,
          durationInFrames: 60,
          volume: 0.82,
        },
      ],
    },
    outro: {
      source: outro,
      targetMediaRole: "scene-ambience",
      destinationName: basename(outro.localPath),
      soundCues: [],
    },
  });
};

export const assertSceneTemplateAudioProjectionCurrent = async ({
  rootDir,
  loadedProjection,
}: {
  readonly rootDir: string;
  readonly loadedProjection: unknown;
}) => {
  const expected = await buildSceneTemplateAudioProjection(rootDir);
  const loaded = SceneTemplateAudioProjectionSchema.parse(loadedProjection);
  if (serializeCanonicalJson(expected) !== serializeCanonicalJson(loaded)) {
    throw new Error(
      "Scene template audio projection is stale; run npm run bootstrap.",
    );
  }
};
