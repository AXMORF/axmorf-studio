import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  FilmMusicSchema,
  FilmSfxSchema,
  FilmSpecSchema,
} from "@axmorf/studio/contracts";

import {
  MUSIC_SYNC_FILM_ID,
  MUSIC_SYNC_SPEC,
} from "../../packages/studio/src/remotion/compositions/capability-gallery/music-sync-fixture";
import {
  exists,
  filmPaths,
  readJsonFile,
  withWorkspaceLock,
  writeJsonFile,
} from "./files";
import { runFilmMusic } from "./music";
import { COVER_SOURCE, FILM_SOURCE } from "./new";
import { runFilmSfx } from "./sfx";
import { runFilmVoice } from "./voice";

/** Developer fixture for MusicSyncGallery; never touches an existing film. */
export const prepareMusicSyncPreview = async (rootDir: string) => {
  const filmId = MUSIC_SYNC_FILM_ID;
  const paths = filmPaths(rootDir, filmId);
  await withWorkspaceLock(rootDir, "prepare-sound-preview", async () => {
    if ((await exists(paths.dir)) || (await exists(paths.publicDir))) {
      throw new Error(
        `${filmId} already exists. Reuse its generated files or choose film:delete with explicit confirmation before recreating it.`,
      );
    }
    await mkdir(paths.dir, { recursive: true });
    await writeJsonFile(paths.spec, FilmSpecSchema.parse(MUSIC_SYNC_SPEC));
    await writeJsonFile(paths.assets, { schemaVersion: 1, filmId, assets: [] });
    await writeFile(
      paths.film,
      FILM_SOURCE.replace(
        "  FilmCaptions,",
        "  FilmCaptions,\n  FilmSoundEffects,",
      ).replace(
        "<FilmSoundtrack />",
        "<FilmSoundtrack />\n      <FilmSoundEffects />",
      ),
      { flag: "wx" },
    );
    await writeFile(paths.cover, COVER_SOURCE, { flag: "wx" });
    await writeFile(
      join(paths.dir, "storyboard.md"),
      `# P7 original sound fixture\n\n1920×1080 / 30fps / 300 body frames; no narration or bookends.\n\n- Sections at f0/f120/f240; tempo search [96,124].\n- f120–150 arrangement break (pad only); exact reveal hit f150; harmonic resolve f270.\n- The gallery lamp flashes exactly at kick onsets; ring glow follows low energy.\n- Each sound action and its exact interval is recorded in film.json sound.effects[].for.\n- Review: compare effect start/end/alignment frames against each visible gallery action.\n- This is an engineering preview, not a replacement for the locked v3 film.\n`,
      { flag: "wx" },
    );
  });
  await runFilmVoice({ rootDir, filmId });
  const musicReport = await runFilmMusic({ rootDir, filmId });
  const sfxReport = await runFilmSfx({ rootDir, filmId });
  const props = {
    music: await readJsonFile(
      paths.music,
      FilmMusicSchema,
      "generated/music.json",
    ),
    sfx: await readJsonFile(paths.sfx, FilmSfxSchema, "generated/sfx.json"),
  };
  const outputDir = join(rootDir, "out/p7-validation");
  await mkdir(outputDir, { recursive: true });
  const propsPath = join(outputDir, "gallery-props.json");
  await writeJsonFile(propsPath, props);
  await writeFile(
    join(outputDir, "fixture-film.json"),
    await readFile(paths.spec),
    { flag: "w" },
  );
  return {
    filmId,
    composition: "MusicSyncGallery",
    propsPath,
    musicReport,
    sfxReport,
  };
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  prepareMusicSyncPreview(process.cwd()).then(
    (report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`),
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
