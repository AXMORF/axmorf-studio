import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  FILM_COVER_VARIANTS,
  FilmAssetsSchema,
  filmCompositionIds,
  FilmPublishSchema,
  resolveFilmBookendFrames,
} from "@axmorf/studio/contracts";

import {
  inspectProjectCover,
  inspectProjectVideo,
} from "../project-production/adapters/media";
import { checkFilm } from "./check";
import {
  exists,
  filmPaths,
  loadFilmSpec,
  readOptionalJsonFile,
  sha256,
  withWorkspaceLock,
  workspacePath,
  writeJsonFile,
} from "./files";
import { renderFilmStill, renderFilmVideo } from "./media";
import { loadCurrentFilmTiming } from "./music";
import { generateFilmRegistry } from "./registry";

export type FilmDeliveryMedia = Readonly<{
  renderVideo: typeof renderFilmVideo;
  renderStill: typeof renderFilmStill;
  inspectVideo: typeof inspectProjectVideo;
  inspectCover: typeof inspectProjectCover;
}>;

const defaultMedia: FilmDeliveryMedia = {
  renderVideo: renderFilmVideo,
  renderStill: renderFilmStill,
  inspectVideo: inspectProjectVideo,
  inspectCover: inspectProjectCover,
};

const describeFile = async (
  rootDir: string,
  path: string,
  finalPath: string,
) => {
  const bytes = await readFile(path);
  return {
    path: workspacePath(rootDir, finalPath),
    checksum: sha256(bytes),
    size: bytes.length,
  };
};

/**
 * Renders into a private staging directory and verifies every file before the
 * current delivery is replaced; the replaced delivery moves to history.
 */
export const deliverFilm = async ({
  rootDir,
  filmId,
  media = defaultMedia,
  now = () => new Date(),
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly media?: FilmDeliveryMedia;
  readonly now?: () => Date;
}) =>
  withWorkspaceLock(rootDir, "film-deliver", async () => {
    const report = await checkFilm({ rootDir, filmId });
    if (report.status !== "film-check-passed") {
      const lines = report.errors.map(
        ({ rule, message, file, line }) =>
          `- [${rule}] ${file ? `${file}${line ? `:${line}` : ""} ` : ""}${message}`,
      );
      throw new Error(
        `film:check failed; fix these before delivering:\n${lines.join("\n")}`,
      );
    }
    const spec = await loadFilmSpec(rootDir, filmId);
    const timing = await loadCurrentFilmTiming(rootDir, spec);
    const paths = filmPaths(rootDir, filmId);
    const ids = filmCompositionIds(paths.id);
    const { introFrames, outroFrames } = resolveFilmBookendFrames(spec);
    // The delivered video adds the system bookends around the authored body.
    const totalFrames = introFrames + timing.durationInFrames + outroFrames;
    await generateFilmRegistry(rootDir);

    const stagingRoot = join(rootDir, ".axmorf/staging");
    await mkdir(stagingRoot, { recursive: true });
    const staging = join(stagingRoot, `${paths.id}.${randomUUID()}`);
    await mkdir(staging);
    try {
      const videoPath = join(staging, "video.mp4");
      await media.renderVideo({
        rootDir,
        compositionId: ids.film,
        outputPath: videoPath,
      });
      await media.inspectVideo({
        rootDir,
        absolutePath: videoPath,
        render: { ...spec.render, output: { audioChannels: 2 } },
        frameCount: totalFrames,
      });
      for (const { variant, file, width, height } of FILM_COVER_VARIANTS) {
        const coverPath = join(staging, file);
        await media.renderStill({
          rootDir,
          compositionId: variant === "4x3" ? ids.cover4x3 : ids.cover3x4,
          outputPath: coverPath,
        });
        await media.inspectCover({
          rootDir,
          absolutePath: coverPath,
          expected: { width, height },
        });
      }

      const assets = await readOptionalJsonFile(
        paths.assets,
        FilmAssetsSchema,
        "assets.json",
      );
      const deliveredAt = now();
      const publish = FilmPublishSchema.parse({
        schemaVersion: 1,
        filmId: paths.id,
        title: spec.publish.title,
        description: spec.publish.description,
        tags: spec.publish.tags,
        durationInFrames: totalFrames,
        ...spec.render,
        deliveredAt: deliveredAt.toISOString(),
        files: {
          video: await describeFile(
            rootDir,
            videoPath,
            join(paths.delivery, "video.mp4"),
          ),
          cover4x3: await describeFile(
            rootDir,
            join(staging, "cover-4x3.png"),
            join(paths.delivery, "cover-4x3.png"),
          ),
          cover3x4: await describeFile(
            rootDir,
            join(staging, "cover-3x4.png"),
            join(paths.delivery, "cover-3x4.png"),
          ),
        },
        attributions: (assets?.assets ?? [])
          .filter(
            ({ origin, attribution }) => origin === "licensed" || attribution,
          )
          .map(
            ({ attribution, creator, license, sourceUrl }) =>
              attribution ??
              `${creator} (${license}${sourceUrl ? `, ${sourceUrl}` : ""})`,
          ),
      });
      await writeJsonFile(join(staging, "publish.json"), publish);

      let archived: string | null = null;
      if (await exists(paths.delivery)) {
        const state = await lstat(paths.delivery);
        if (!state.isDirectory() || state.isSymbolicLink()) {
          throw new Error(
            `${workspacePath(rootDir, paths.delivery)} is not a directory.`,
          );
        }
        // Name the archived copy after its own delivery time, so history reads in order.
        const previous = await readOptionalJsonFile(
          join(paths.delivery, "publish.json"),
          FilmPublishSchema,
          "previous publish.json",
        ).catch(() => null);
        const stamp = (
          previous?.deliveredAt ?? deliveredAt.toISOString()
        ).replace(/[:.]/gu, "-");
        await mkdir(paths.history, { recursive: true });
        archived = join(paths.history, stamp);
        if (await exists(archived))
          archived = `${archived}-${randomUUID().slice(0, 8)}`;
        await rename(paths.delivery, archived);
      }
      try {
        await mkdir(join(paths.delivery, ".."), { recursive: true });
        await rename(staging, paths.delivery);
      } catch (error) {
        if (archived !== null) await rename(archived, paths.delivery);
        throw error;
      }
      return {
        status: "film-delivered",
        filmId: paths.id,
        delivery: workspacePath(rootDir, paths.delivery),
        files: ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"],
        durationInFrames: totalFrames,
        seconds: Number((totalFrames / spec.render.fps).toFixed(2)),
        bookends: { introFrames, outroFrames },
        previousDelivery:
          archived === null ? null : workspacePath(rootDir, archived),
        warnings: report.warnings,
      } as const;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });
