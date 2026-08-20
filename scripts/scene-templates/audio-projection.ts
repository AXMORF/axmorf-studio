import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { serializeCanonicalJson } from "../../src/contracts";
import {
  SCENE_TEMPLATE_AUDIO_PROJECTION_PATH,
  SCENE_TEMPLATE_AUDIO_OVERRIDE_PATH,
  SceneTemplateAudioOverrideSchema,
  SceneTemplateAudioProjectionSchema,
  type SceneTemplateAudioProjection,
} from "../../src/remotion/capabilities/scene-templates/template-audio";
import { loadLocalReferenceAssetDescriptors } from "../catalog/project-files";
import { writeTextFileAtomic } from "../shared/atomic-file";

const readOptionalRegularFile = async (path: string, label: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${label} must be a regular file.`);
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
    "Scene template audio override",
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
    readonly expectedRole: "sound-effect" | "background-music";
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
    expectedRole: "sound-effect",
    minimumDurationInSeconds: 2,
  });
  const outro = select({
    resourceId: override.outroResourceId,
    expectedRole: "background-music",
    minimumDurationInSeconds: 8,
  });
  return SceneTemplateAudioProjectionSchema.parse({
    schemaVersion: 1,
    intro: {
      source: intro,
      targetMediaRole: "sound-effect",
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
      targetMediaRole: "background-music",
      destinationName: basename(outro.localPath),
      soundCues: [
        {
          cueId: "closing-music",
          anchorId: "closing-music-start",
          offsetFrames: 0,
          durationInFrames: 240,
          volume: 1,
        },
      ],
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

export const readCurrentSceneTemplateAudioProjection = async (
  rootDir: string,
): Promise<SceneTemplateAudioProjection> => {
  const bytes = await readOptionalRegularFile(
    join(rootDir, SCENE_TEMPLATE_AUDIO_PROJECTION_PATH),
    "Scene template audio projection",
  );
  if (bytes === null) {
    throw new Error("Scene template audio projection is missing; run npm run bootstrap.");
  }
  const projection = SceneTemplateAudioProjectionSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  await assertSceneTemplateAudioProjectionCurrent({
    rootDir,
    loadedProjection: projection,
  });
  return projection;
};

export const generateSceneTemplateAudioProjection = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: "write" | "check";
}) => {
  const projection = await buildSceneTemplateAudioProjection(rootDir);
  const destination = join(rootDir, SCENE_TEMPLATE_AUDIO_PROJECTION_PATH);
  const expectedBytes = `${JSON.stringify(projection, null, 2)}\n`;
  if (mode === "check") {
    const actualBytes = await readOptionalRegularFile(
      destination,
      "Scene template audio projection",
    );
    if (
      actualBytes === null ||
      actualBytes.toString("utf8") !== expectedBytes
    ) {
      throw new Error("Scene template audio projection is stale.");
    }
    return { mode, projection, written: false } as const;
  }
  const result = await writeTextFileAtomic({
    destination,
    bytes: expectedBytes,
    mode: "replace",
  });
  return { mode, projection, written: result.written } as const;
};
