import { lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  createFingerprint,
  serializeCanonicalJson,
  type ProjectRevisionSnapshotEntry,
} from "@axmorf/studio/contracts";
import {
  checksumBytes,
  readRegularBytes,
} from "../project-production/adapters/project-input-snapshot";
import type { ProductionScope } from "../project-production/application/production-scope";
import {
  copyProjectRevisionRegularTree,
  inspectProjectRevisionRegularTree,
} from "../projects/application/project-revision-candidate-store";

export const pathState = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const assertPreviewDirectory = async ({
  root,
  directory,
  create = false,
}: {
  readonly root: string;
  readonly directory: string;
  readonly create?: boolean;
}) => {
  const resolvedRoot = resolve(root);
  const fromRoot = relative(resolvedRoot, resolve(directory));
  if (
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`)
  ) {
    throw new Error("Project preview path escaped its scope.");
  }
  let current = resolvedRoot;
  for (const segment of ["", ...fromRoot.split(sep).filter(Boolean)]) {
    current = join(current, segment);
    let state = await pathState(current);
    if (state === null && create && current !== resolvedRoot) {
      await mkdir(current);
      state = await lstat(current);
    }
    if (state === null || state.isSymbolicLink() || !state.isDirectory()) {
      throw new Error(
        "Project preview directory must be a real contained directory.",
      );
    }
  }
};

type PreviewTree = Readonly<{
  path: string;
  source: string;
  entries: readonly ProjectRevisionSnapshotEntry[] | null;
}>;
type PreviewFile = Readonly<{
  path: string;
  source: string;
  checksum: string | null;
}>;

export type PreviewSnapshot = Readonly<{
  fingerprint: string;
  trees: readonly PreviewTree[];
  files: readonly PreviewFile[];
}>;

export const capturePreviewSnapshot = async (
  scope: ProductionScope,
): Promise<PreviewSnapshot> => {
  const trees: PreviewTree[] = [];
  for (const [path, source, required] of [
    [
      `src/projects/${scope.storyId}`,
      join(scope.projectSourceRoot, scope.storyId),
      true,
    ],
    [
      `public/projects/${scope.storyId}`,
      join(scope.projectPublicRoot, scope.storyId),
      false,
    ],
    ["src/runtime", join(scope.shared.runtimeRoot, "src/runtime"), false],
    ["src/contracts", join(scope.shared.runtimeRoot, "src/contracts"), false],
    ["src/remotion", join(scope.shared.runtimeRoot, "src/remotion"), false],
    ["public/assets", join(scope.shared.runtimeRoot, "public/assets"), false],
  ] as const) {
    const state = await pathState(source);
    if (state === null && !required) {
      trees.push({ path, source, entries: null });
      continue;
    }
    await assertPreviewDirectory({
      root: scope.repositoryRoot,
      directory: source,
    });
    trees.push({
      path,
      source,
      entries: await inspectProjectRevisionRegularTree(source),
    });
  }
  const files: PreviewFile[] = [];
  for (const path of [
    "src/index.css",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "remotion.config.ts",
    "remotion.config.mjs",
  ]) {
    const source = join(scope.shared.runtimeRoot, path);
    const state = await pathState(source);
    if (state === null) {
      if (
        path === "tsconfig.json" ||
        path === "remotion.config.ts" ||
        path === "remotion.config.mjs"
      ) {
        files.push({ path, source, checksum: null });
        continue;
      }
      throw new Error(`Project preview runtime input is missing: ${path}.`);
    }
    await assertPreviewDirectory({
      root: scope.repositoryRoot,
      directory: dirname(source),
    });
    files.push({
      path,
      source,
      checksum: checksumBytes(
        await readRegularBytes(source, "Preview runtime input"),
      ),
    });
  }
  if (
    files.filter(
      ({ path, checksum }) =>
        path.startsWith("remotion.config.") && checksum !== null,
    ).length !== 1
  ) {
    throw new Error(
      "Project preview requires exactly one current Remotion config.",
    );
  }
  return {
    fingerprint: createFingerprint({
      namespace: "project-preview-source-bytes",
      version: 1,
      value: {
        trees: trees.map(({ path, entries }) => ({ path, entries })),
        files: files.map(({ path, checksum }) => ({ path, checksum })),
      },
    }),
    trees,
    files,
  };
};

export const freezePreviewSnapshot = async ({
  rootDir,
  destination,
  snapshot,
}: {
  readonly rootDir: string;
  readonly destination: string;
  readonly snapshot: PreviewSnapshot;
}) => {
  await assertPreviewDirectory({
    root: rootDir,
    directory: destination,
    create: true,
  });
  for (const tree of snapshot.trees) {
    if (tree.entries === null) continue;
    const target = join(destination, tree.path);
    await assertPreviewDirectory({
      root: rootDir,
      directory: dirname(target),
      create: true,
    });
    const copied = await copyProjectRevisionRegularTree({
      sourceRoot: tree.source,
      destinationRoot: target,
    });
    if (
      serializeCanonicalJson(copied) !== serializeCanonicalJson(tree.entries)
    ) {
      throw new Error("Project preview source changed while freezing.");
    }
  }
  const projectPublic = snapshot.trees.find(({ path }) =>
    path.startsWith("public/projects/"),
  )!;
  await assertPreviewDirectory({
    root: rootDir,
    directory: join(destination, projectPublic.path),
    create: true,
  });
  // Configuration stays workspace-owned. Only the stylesheet is needed in the
  // view; config/package checksums are included in source identity and rechecked.
  const stylesheet = snapshot.files.find(
    ({ path }) => path === "src/index.css",
  )!;
  const stylesheetBytes = await readRegularBytes(
    stylesheet.source,
    "Preview stylesheet",
  );
  if (checksumBytes(stylesheetBytes) !== stylesheet.checksum) {
    throw new Error("Project preview stylesheet changed while freezing.");
  }
  await writeFile(join(destination, "src/index.css"), stylesheetBytes, {
    flag: "wx",
  });
};

export const capturePreviewViewFingerprint = async ({
  rootDir,
  view,
}: {
  readonly rootDir: string;
  readonly view: string;
}) => {
  await assertPreviewDirectory({ root: rootDir, directory: view });
  return createFingerprint({
    namespace: "project-preview-frozen-view",
    version: 1,
    value: await Promise.all(
      ["src", "public"].map(async (path) => ({
        path,
        entries: await inspectProjectRevisionRegularTree(join(view, path)),
      })),
    ),
  });
};

export const inspectPreviewFile = async (path: string) => {
  const bytes = await readRegularBytes(path, "Preview artifact");
  if (bytes.byteLength === 0)
    throw new Error("Project preview artifact is empty.");
  return { checksum: checksumBytes(bytes), sizeBytes: bytes.byteLength };
};

export const readPreviewReceipt = async (path: string) => {
  const bytes = await readRegularBytes(path, "Preview receipt");
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
};
