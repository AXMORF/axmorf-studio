import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { FilmPublishSchema } from "@axmorf/studio/contracts";

import {
  exists,
  filmPaths,
  listFilmIds,
  loadFilmSpec,
  readOptionalJsonFile,
  withWorkspaceLock,
  workspacePath,
} from "./files";
import { generateFilmRegistry } from "./registry";

export const listFilms = async (rootDir: string) => {
  const films = [];
  for (const id of await listFilmIds(rootDir)) {
    const paths = filmPaths(rootDir, id);
    const spec = await loadFilmSpec(rootDir, id).catch(() => null);
    const publish = await readOptionalJsonFile(
      join(paths.delivery, "publish.json"),
      FilmPublishSchema,
      "publish.json",
    ).catch(() => null);
    films.push({
      filmId: id,
      title: spec?.publish.title ?? null,
      render: spec?.render ?? null,
      sentences: spec?.narration.length ?? null,
      voice: await exists(paths.timing),
      music:
        spec?.music === null
          ? "none"
          : (await exists(paths.music))
            ? "ready"
            : "missing",
      delivered:
        publish === null
          ? null
          : {
              at: publish.deliveredAt,
              seconds: Number(
                (publish.durationInFrames / publish.fps).toFixed(2),
              ),
              video: workspacePath(rootDir, join(paths.delivery, "video.mp4")),
            },
    });
  }
  return { status: "films-listed", films } as const;
};

/** Removes exactly the paths a film owns; other films and shared media stay. */
export const deleteFilm = async ({
  rootDir,
  filmId,
  confirm,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly confirm: boolean;
}) => {
  const paths = filmPaths(rootDir, filmId);
  if (!confirm) {
    throw new Error(`Deleting ${paths.id} needs --confirm-delete.`);
  }
  if (!(await exists(join(paths.dir, "film.json")))) {
    throw new Error(`${paths.id} is not a film.`);
  }
  return withWorkspaceLock(rootDir, "film-delete", async () => {
    const owned = [
      paths.dir,
      paths.publicDir,
      paths.delivery,
      paths.history,
      join(rootDir, "out/films", paths.id),
    ];
    const removed = [];
    for (const path of owned) {
      if (!(await exists(path))) continue;
      const state = await lstat(path);
      if (state.isSymbolicLink()) {
        throw new Error(
          `${workspacePath(rootDir, path)} is a symlink; remove it by hand.`,
        );
      }
      await rm(path, { recursive: true, force: true });
      removed.push(workspacePath(rootDir, path));
    }
    const staging = join(rootDir, ".axmorf/staging");
    for (const entry of (await exists(staging)) ? await readdir(staging) : []) {
      if (entry.startsWith(`${paths.id}.`)) {
        await rm(join(staging, entry), { recursive: true, force: true });
      }
    }
    await generateFilmRegistry(rootDir);
    return { status: "film-deleted", filmId: paths.id, removed } as const;
  });
};
