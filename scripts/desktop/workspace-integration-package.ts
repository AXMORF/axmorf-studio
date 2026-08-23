import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export const DESKTOP_PACKAGED_WORKSPACE_INTEGRATION_ROOT =
  ".desktop-package-resources/workspace-integration" as const;

export const DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES = Object.freeze([
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "hermes/INSTALL_PROMPT.md",
  "skills/remotion-story-producer-video/SKILL.md",
]);

export type WorkspaceIntegrationFileIdentity = Readonly<{
  path: string;
  sizeBytes: number;
  sha256: string;
}>;

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const contained = (root: string, path: string) => {
  const value = relative(root, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`));
};

const readRegularFile = async (path: string, label: string) => {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.size !== bytes.byteLength
  ) {
    throw new Error(`${label} changed while being staged.`);
  }
  return bytes;
};

const assertRealParentChain = async (root: string, relativePath: string) => {
  let current = root;
  const parents = relativePath.split("/").slice(0, -1);
  for (const parent of parents) {
    current = join(current, parent);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(
        `Workspace integration source parent is unsafe: ${relativePath}.`,
      );
    }
  }
};

const inspectExactTree = async (root: string) => {
  const actual: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("Packaged Workspace integration cannot contain symlinks.");
      }
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        actual.push(relative(root, path).split(sep).join("/"));
      } else {
        throw new Error(
          "Packaged Workspace integration cannot contain special files.",
        );
      }
    }
  };
  await walk(root);
  return actual.sort();
};

export const stageDesktopWorkspaceIntegration = async ({
  checkoutRoot = process.cwd(),
  outputRoot = resolve(
    checkoutRoot,
    DESKTOP_PACKAGED_WORKSPACE_INTEGRATION_ROOT,
  ),
}: {
  readonly checkoutRoot?: string;
  readonly outputRoot?: string;
} = {}): Promise<readonly WorkspaceIntegrationFileIdentity[]> => {
  const sourceRoot = resolve(
    checkoutRoot,
    "desktop/resources/workspace-integration",
  );
  const sourceMetadata = await lstat(sourceRoot);
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isDirectory()) {
    throw new Error("Workspace integration source must be a real directory.");
  }
  const targetRoot = resolve(outputRoot);
  if (
    targetRoot === dirname(targetRoot) ||
    contained(sourceRoot, targetRoot) ||
    contained(targetRoot, sourceRoot)
  ) {
    throw new Error("Workspace integration staging target is unsafe.");
  }
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true, mode: 0o700 });
  const identities: WorkspaceIntegrationFileIdentity[] = [];
  try {
    for (const relativePath of DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES) {
      const source = resolve(sourceRoot, relativePath);
      const destination = resolve(targetRoot, relativePath);
      if (!contained(sourceRoot, source) || !contained(targetRoot, destination)) {
        throw new Error("Workspace integration resource path escaped its root.");
      }
      await assertRealParentChain(sourceRoot, relativePath);
      const bytes = await readRegularFile(
        source,
        `Workspace integration source ${relativePath}`,
      );
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { flag: "wx", mode: 0o644 });
      identities.push({
        path: relativePath,
        sizeBytes: bytes.byteLength,
        sha256: sha256(bytes),
      });
    }
    const actual = await inspectExactTree(targetRoot);
    const expected = [...DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("Packaged Workspace integration inventory drifted.");
    }
    return identities;
  } catch (error) {
    await rm(targetRoot, { recursive: true, force: true });
    throw error;
  }
};
