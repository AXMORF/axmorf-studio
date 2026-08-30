import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { serializeCanonicalJson } from "@axmorf/studio/contracts";

export type SceneArtifactMode = "write" | "check";

export const writeOrCheckSceneArtifact = async ({
  destination,
  value,
  mode,
}: {
  readonly destination: string;
  readonly value: unknown;
  readonly mode: SceneArtifactMode;
}): Promise<void> => {
  const expected = `${serializeCanonicalJson(value)}\n`;
  if (mode === "check") {
    const current = await readFile(destination, "utf8");
    if (current !== expected) {
      throw new Error("Generated Scene artifact bytes are stale.");
    }
    return;
  }
  try {
    if ((await readFile(destination, "utf8")) === expected) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(expected, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const writeOrCheckSceneText = async ({
  destination,
  value,
  mode,
}: {
  readonly destination: string;
  readonly value: string;
  readonly mode: SceneArtifactMode;
}): Promise<void> => {
  if (mode === "check") {
    if ((await readFile(destination, "utf8")) !== value) {
      throw new Error("Generated Scene source bytes are stale.");
    }
    return;
  }
  try {
    if ((await readFile(destination, "utf8")) === value) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const readJsonFile = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));
