import { readFile, readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { exists, filmPaths } from "./files";
import { scanLegacyMotionAudio } from "./motion";

/** CLI-side only; render never scans the filesystem. */
const filesWithin = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesWithin(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};
export const filmHasLegacyAudio = async (directory: string) => {
  const files = (await filesWithin(directory)).filter((f) =>
    /\.[cm]?[jt]sx?$/u.test(f),
  );
  return scanLegacyMotionAudio(
    await Promise.all(files.map((f) => readFile(f, "utf8"))),
  );
};

/** mtime avoids a new cache/sidecar format and also works for manually rendered
 * previews. Include all film-local inputs (film.json, sources, generated timing/
 * music), plus public film audio/assets. Source-only edits invalidate the preview. */
export const animaticReminder = async (rootDir: string, filmId: string) => {
  const paths = filmPaths(rootDir, filmId);
  const animatic = join(paths.review, "animatic.mp4");
  const command = `film:review -- --film ${paths.id} --animatic`;
  if (!(await exists(animatic)))
    return `Animatic is missing; run ${command} and hand review/animatic.mp4 to a person to watch and listen on a phone or Mac before delivery; do not open a player on this host (advisory only).`;
  const preview = (await stat(animatic)).mtimeMs;
  const inputs = [
    ...(await filesWithin(paths.dir)),
    ...((await exists(paths.publicDir))
      ? await filesWithin(paths.publicDir)
      : []
    ).filter((f) => !f.startsWith(join(paths.publicDir, "review") + sep)),
  ];
  for (const path of inputs)
    if ((await stat(path)).mtimeMs > preview)
      return `Animatic is older than current film inputs; run ${command} again and hand review/animatic.mp4 to a person to watch and listen on a phone or Mac; do not open a player on this host (advisory only).`;
  return null;
};
