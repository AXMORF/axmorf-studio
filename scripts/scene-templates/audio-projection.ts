import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { serializeCanonicalJson } from "../../src/contracts";
import {
  SCENE_TEMPLATE_AUDIO_PROJECTION_PATH,
  SCENE_TEMPLATE_AUDIO_MANIFEST_PATH,
  SceneTemplateAudioProjectionSchema,
  buildDefaultSceneTemplateAudioProjection,
  type SceneTemplateAudioProjection,
} from "../../src/remotion/capabilities/scene-templates/template-audio";
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
  const manifestBytes = await readOptionalRegularFile(
    join(rootDir, SCENE_TEMPLATE_AUDIO_MANIFEST_PATH),
    "Scene template audio manifest",
  );
  if (manifestBytes === null) {
    throw new Error("Scene template audio manifest is missing.");
  }
  return buildDefaultSceneTemplateAudioProjection(
    JSON.parse(manifestBytes.toString("utf8")),
  );
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
    throw new Error(
      "Scene template audio projection is missing; run npm run bootstrap.",
    );
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
