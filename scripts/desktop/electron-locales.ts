import { lstat, readdir, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export const DESKTOP_ELECTRON_LOCALES = Object.freeze([
  "en.lproj",
  "zh_CN.lproj",
] as const);

const contained = (root: string, candidate: string) => {
  const value = relative(root, candidate);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`);
};

export const pruneDesktopElectronLocales = async (resourcesRoot: string) => {
  const root = resolve(resourcesRoot);
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Desktop Resources root must be a real directory.");
  }
  const localeEntries = (await readdir(root, { withFileTypes: true }))
    .filter(({ name }) => name.endsWith(".lproj"))
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
  for (const entry of localeEntries) {
    const path = resolve(root, entry.name);
    if (
      !contained(root, path) ||
      entry.isSymbolicLink() ||
      !entry.isDirectory()
    ) {
      throw new Error(`Desktop Electron locale is unsafe: ${entry.name}.`);
    }
    if (!DESKTOP_ELECTRON_LOCALES.includes(entry.name as never)) {
      await rm(path, { recursive: true });
    }
  }
  const actual = (await readdir(root, { withFileTypes: true }))
    .filter(({ name }) => name.endsWith(".lproj"))
    .map(({ name }) => name)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(DESKTOP_ELECTRON_LOCALES)) {
    throw new Error("Desktop Electron locale inventory drifted.");
  }
};
