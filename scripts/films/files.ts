import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  FilmIdSchema,
  FilmSpecSchema,
  type FilmSpec,
} from "@axmorf/studio/contracts";
import type { z } from "zod";

import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";
import { writeTextFileAtomic } from "../shared/atomic-file";

export const filmPaths = (rootDir: string, filmId: string) => {
  const id = FilmIdSchema.parse(filmId);
  const dir = join(rootDir, "src/films", id);
  const publicDir = join(rootDir, "public/films", id);
  return {
    id,
    dir,
    spec: join(dir, "film.json"),
    film: join(dir, "Film.tsx"),
    cover: join(dir, "Cover.tsx"),
    assets: join(dir, "assets.json"),
    timing: join(dir, "generated/timing.json"),
    music: join(dir, "generated/music.json"),
    publicDir,
    narrationWav: join(publicDir, "narration.wav"),
    musicWav: join(publicDir, "music.wav"),
    assetDir: join(publicDir, "assets"),
    delivery: join(rootDir, "deliveries", id),
    history: join(rootDir, ".axmorf/history", id),
    review: join(rootDir, "out/films", id, "review"),
  } as const;
};
export type FilmPaths = ReturnType<typeof filmPaths>;

export const filmsRoot = (rootDir: string) => join(rootDir, "src/films");
export const filmRegistryPath = (rootDir: string) =>
  join(rootDir, "src/films/index.ts");

/** Workspace-relative POSIX path, as recorded in generated JSON. */
export const workspacePath = (rootDir: string, path: string) =>
  relative(rootDir, path).split("\\").join("/");

export const sha256 = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export const exists = async (path: string) => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const formatIssues = (error: z.ZodError) =>
  error.issues
    .map(({ path, message }) => `  ${path.join(".") || "(root)"}: ${message}`)
    .join("\n");

export const readJsonFile = async <T>(
  path: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is missing or is not valid JSON: ${path}`, {
      cause: error,
    });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${label} is invalid:\n${formatIssues(parsed.error)}`);
  }
  return parsed.data;
};

export const readOptionalJsonFile = async <T>(
  path: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T | null> =>
  (await exists(path)) ? readJsonFile(path, schema, label) : null;

export const writeJsonFile = async (path: string, value: unknown) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeTextFileAtomic({
    destination: path,
    bytes: `${JSON.stringify(value, null, 2)}\n`,
    mode: "replace",
  });
};

export const loadFilmSpec = async (
  rootDir: string,
  filmId: string,
): Promise<FilmSpec> => {
  const paths = filmPaths(rootDir, filmId);
  const spec = await readJsonFile(paths.spec, FilmSpecSchema, "film.json");
  if (spec.filmId !== paths.id) {
    throw new Error(
      `film.json filmId ${spec.filmId} does not match its directory ${paths.id}.`,
    );
  }
  return spec;
};

export const listFilmIds = async (rootDir: string) => {
  let entries;
  try {
    entries = await readdir(filmsRoot(rootDir), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !FilmIdSchema.safeParse(entry.name).success) {
      continue;
    }
    if (await exists(join(filmsRoot(rootDir), entry.name, "film.json"))) {
      ids.push(entry.name);
    }
  }
  return ids.sort();
};

/** Serializes film writers with each other and with upgrades. */
export const withWorkspaceLock = async <T>(
  rootDir: string,
  operation: string,
  run: () => Promise<T>,
): Promise<T> => {
  const lock = await acquireRepositoryOperationLock({
    rootDir,
    ownerId: operation,
  });
  try {
    return await run();
  } finally {
    await lock.release();
  }
};
