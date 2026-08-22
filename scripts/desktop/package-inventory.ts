import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, type Stats } from "node:fs";
import { join, relative, sep } from "node:path";

import { listPackage, statFile } from "@electron/asar";

export const DESKTOP_PACKAGE_ALLOWED_ROOTS = Object.freeze([
  ".vite",
  "package.json",
  "node_modules",
  "desktop/resources/brand/axmorf-studio-icon.icns",
  "desktop/resources/brand/axmorf-studio-icon.png",
  "desktop/resources/brand/axmorf-studio-icon.svg",
  "desktop/resources/workspace-integration/AGENTS.md",
  "desktop/resources/workspace-integration/CLAUDE.md",
  "desktop/resources/workspace-integration/GEMINI.md",
  "desktop/resources/workspace-integration/hermes/INSTALL_PROMPT.md",
  "desktop/resources/workspace-integration/rsp",
  "desktop/resources/workspace-integration/rsp-client.cjs",
  "desktop/resources/workspace-integration/skills/remotion-story-producer-video/SKILL.md",
]);

const toPosixPath = (path: string) => path.split(sep).join("/");

export const isDesktopPackagePathAllowed = (repositoryPath: string) => {
  const normalized = toPosixPath(repositoryPath).replace(/^\/+|\/+$/gu, "");
  if (normalized === "") return true;
  if (normalized === ".." || normalized.startsWith("../")) return false;
  if (
    normalized === "node_modules/.bin" ||
    normalized.startsWith("node_modules/.bin/")
  ) {
    return false;
  }
  return DESKTOP_PACKAGE_ALLOWED_ROOTS.some(
    (root) =>
      normalized === root ||
      normalized.startsWith(`${root}/`) ||
      root.startsWith(`${normalized}/`),
  );
};

const assertRegularFile = (path: string, stat: Stats) => {
  if (!stat.isFile()) {
    throw new Error(`desktop-package-inventory-invalid-file:${path}`);
  }
};

const inspectUnpackedTree = (root: string, current = root): number => {
  let files = 0;
  for (const name of readdirSync(current)) {
    const path = join(current, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`desktop-package-inventory-symlink:${path}`);
    }
    const archivePath = toPosixPath(relative(root, path));
    if (!isDesktopPackagePathAllowed(archivePath)) {
      throw new Error(`desktop-package-inventory-forbidden:${archivePath}`);
    }
    if (stat.isDirectory()) files += inspectUnpackedTree(root, path);
    else {
      assertRegularFile(path, stat);
      files += 1;
    }
  }
  return files;
};

export type DesktopPackageInventory = Readonly<{
  appPath: string;
  asarEntries: number;
  unpackedFiles: number;
  asarSha256: string;
}>;

export const verifyDesktopPackageInventory = (
  appPath: string,
): DesktopPackageInventory => {
  const resourcesPath = join(appPath, "Contents", "Resources");
  const asarPath = join(resourcesPath, "app.asar");
  assertRegularFile(asarPath, lstatSync(asarPath));

  const entries = listPackage(asarPath, { isPack: false });
  for (const entry of entries) {
    const archivePath = toPosixPath(entry).replace(/^\/+|\/+$/gu, "");
    if (!isDesktopPackagePathAllowed(archivePath)) {
      throw new Error(`desktop-package-inventory-forbidden:${archivePath}`);
    }
    const metadata = statFile(asarPath, archivePath, false);
    if ("link" in metadata) {
      throw new Error(`desktop-package-inventory-symlink:${archivePath}`);
    }
  }

  const unpackedPath = `${asarPath}.unpacked`;
  let unpackedFiles = 0;
  try {
    const stat = lstatSync(unpackedPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(
        `desktop-package-inventory-invalid-unpacked:${unpackedPath}`,
      );
    }
    unpackedFiles = inspectUnpackedTree(unpackedPath);
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  return {
    appPath,
    asarEntries: entries.length,
    unpackedFiles,
    asarSha256: createHash("sha256")
      .update(readFileSync(asarPath))
      .digest("hex"),
  };
};
