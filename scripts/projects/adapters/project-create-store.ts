import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { StoryIdSchema } from "../../../src/contracts/primitives";

export const PROJECT_CREATE_CATALOG_PATH =
  "src/remotion/catalog/resource-catalog.generated.json" as const;

type PathMetadata = Awaited<ReturnType<typeof lstat>> | null;

const pathMetadata = async (path: string): Promise<PathMetadata> => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const toRepositoryPath = (rootDir: string, absolutePath: string) =>
  relative(rootDir, absolutePath).split(sep).join("/");

export const assertRealRepositoryDirectoryChain = async ({
  rootDir: rawRootDir,
  relativePath,
  allowMissingTail = false,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly allowMissingTail?: boolean;
}) => {
  const rootDir = resolve(rawRootDir);
  const root = await lstat(rootDir);
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error("Repository root must be a real directory.");
  }
  const segments = relativePath.split("/");
  let current = rootDir;
  let missing = false;
  for (const segment of segments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\\")
    ) {
      throw new Error("Repository path must be normalized and relative.");
    }
    current = join(current, segment);
    const metadata = await pathMetadata(current);
    if (metadata === null) {
      missing = true;
      if (!allowMissingTail) {
        throw new Error(`Repository directory is missing: ${relativePath}.`);
      }
      continue;
    }
    if (missing || metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`Repository directory chain is unsafe: ${relativePath}.`);
    }
  }
  return current;
};

export const readContainedRegularFile = async ({
  rootDir: rawRootDir,
  relativePath,
  label,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly label: string;
}) => {
  const rootDir = resolve(rawRootDir);
  const segments = relativePath.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\"),
    )
  ) {
    throw new Error(`${label} must use a normalized repository-relative path.`);
  }
  const parentPath = segments.slice(0, -1).join("/");
  if (parentPath !== "") {
    await assertRealRepositoryDirectoryChain({
      rootDir,
      relativePath: parentPath,
    });
  }
  const absolutePath = join(rootDir, relativePath);
  if (!absolutePath.startsWith(`${rootDir}${sep}`)) {
    throw new Error(`${label} escapes the repository.`);
  }
  const metadata = await lstat(absolutePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  return readFile(absolutePath);
};

export const createProjectCreateStaging = async ({
  rootDir: rawRootDir,
}: {
  readonly rootDir: string;
}) => {
  const rootDir = resolve(rawRootDir);
  await assertRealRepositoryDirectoryChain({
    rootDir,
    relativePath: "src/projects",
    allowMissingTail: true,
  });
  await mkdir(join(rootDir, "src/projects"), { recursive: true });
  await assertRealRepositoryDirectoryChain({
    rootDir,
    relativePath: "src/projects",
  });
  const relativePath = `src/projects/.project-create-staging-${randomUUID()}`;
  const stagingRoot = join(rootDir, relativePath);
  await mkdir(stagingRoot);
  return {
    stagingRoot,
    relativePath,
    cleanup: () => rm(stagingRoot, { recursive: true, force: true }),
  } as const;
};

export const inspectProjectCreateTargets = async ({
  rootDir: rawRootDir,
  storyId: rawStoryId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  const rootDir = resolve(rawRootDir);
  const storyId = StoryIdSchema.parse(rawStoryId);
  for (const parent of ["src", "src/projects", "public", "public/projects"]) {
    await assertRealRepositoryDirectoryChain({
      rootDir,
      relativePath: parent,
      allowMissingTail: true,
    });
  }
  const sourcePath = join(rootDir, "src/projects", storyId);
  const publicPath = join(rootDir, "public/projects", storyId);
  const [source, publicRoot] = await Promise.all([
    pathMetadata(sourcePath),
    pathMetadata(publicPath),
  ]);
  for (const [label, metadata] of [
    ["Project source target", source],
    ["Project public target", publicRoot],
  ] as const) {
    if (
      metadata !== null &&
      (metadata.isSymbolicLink() || !metadata.isDirectory())
    ) {
      throw new Error(`${label} must be a real directory.`);
    }
  }
  if ((source === null) !== (publicRoot === null)) {
    throw new Error("Project create target is partial.");
  }
  return {
    state: source === null ? ("missing" as const) : ("existing" as const),
    sourcePath,
    publicPath,
  };
};

export const commitStagedProjectCreate = async ({
  rootDir: rawRootDir,
  storyId: rawStoryId,
  stagingRoot,
  verifyLive,
  move = rename,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly stagingRoot: string;
  readonly verifyLive: () => Promise<void>;
  readonly move?: (source: string, destination: string) => Promise<void>;
}) => {
  const rootDir = resolve(rawRootDir);
  const storyId = StoryIdSchema.parse(rawStoryId);
  const resolvedStaging = resolve(stagingRoot);
  if (
    !resolvedStaging.startsWith(`${join(rootDir, "src/projects")}${sep}`) ||
    toRepositoryPath(rootDir, resolvedStaging).split("/").length !== 3
  ) {
    throw new Error("Project create staging root is outside its fixed scope.");
  }
  const stagingMetadata = await lstat(resolvedStaging);
  if (stagingMetadata.isSymbolicLink() || !stagingMetadata.isDirectory()) {
    throw new Error("Project create staging root must be a real directory.");
  }
  const targets = await inspectProjectCreateTargets({ rootDir, storyId });
  if (targets.state !== "missing") {
    throw new Error("Project create target already exists.");
  }
  await mkdir(join(rootDir, "public/projects"), { recursive: true });
  await assertRealRepositoryDirectoryChain({
    rootDir,
    relativePath: "public/projects",
  });
  const stagedSource = join(resolvedStaging, "root/src/projects", storyId);
  const stagedPublic = join(resolvedStaging, "root/public/projects", storyId);
  const stagedCatalog = join(resolvedStaging, "catalog/resource-catalog.json");
  for (const [label, path, kind] of [
    ["staged Project source", stagedSource, "directory"],
    ["staged Project public", stagedPublic, "directory"],
    ["staged ResourceCatalog", stagedCatalog, "file"],
  ] as const) {
    const metadata = await lstat(path);
    if (
      metadata.isSymbolicLink() ||
      (kind === "directory" ? !metadata.isDirectory() : !metadata.isFile())
    ) {
      throw new Error(`${label} is unsafe.`);
    }
  }

  const catalogTarget = join(rootDir, PROJECT_CREATE_CATALOG_PATH);
  await assertRealRepositoryDirectoryChain({
    rootDir,
    relativePath: dirname(PROJECT_CREATE_CATALOG_PATH).split(sep).join("/"),
  });
  const catalogBackup = join(resolvedStaging, "rollback/resource-catalog.json");
  const catalogPrevious = await pathMetadata(catalogTarget);
  if (
    catalogPrevious !== null &&
    (catalogPrevious.isSymbolicLink() || !catalogPrevious.isFile())
  ) {
    throw new Error("Current ResourceCatalog target is unsafe.");
  }

  let sourcePromoted = false;
  let publicPromoted = false;
  let catalogBackedUp = false;
  let catalogPromoted = false;
  try {
    await move(stagedSource, targets.sourcePath);
    sourcePromoted = true;
    await move(stagedPublic, targets.publicPath);
    publicPromoted = true;
    if (catalogPrevious !== null) {
      await mkdir(dirname(catalogBackup), { recursive: true });
      await move(catalogTarget, catalogBackup);
      catalogBackedUp = true;
    }
    await move(stagedCatalog, catalogTarget);
    catalogPromoted = true;
    await verifyLive();
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (catalogPromoted) {
      await rename(catalogTarget, stagedCatalog).catch((rollbackError) =>
        rollbackErrors.push(rollbackError),
      );
      catalogPromoted = false;
    }
    if (catalogBackedUp) {
      await rename(catalogBackup, catalogTarget).catch((rollbackError) =>
        rollbackErrors.push(rollbackError),
      );
      catalogBackedUp = false;
    }
    if (publicPromoted) {
      await rename(targets.publicPath, stagedPublic).catch((rollbackError) =>
        rollbackErrors.push(rollbackError),
      );
      publicPromoted = false;
    }
    if (sourcePromoted) {
      await rename(targets.sourcePath, stagedSource).catch((rollbackError) =>
        rollbackErrors.push(rollbackError),
      );
      sourcePromoted = false;
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Project create failed and rollback was incomplete.",
      );
    }
    throw error;
  }
  await rm(resolvedStaging, { recursive: true, force: true });
  return {
    sourceRoot: `src/projects/${storyId}`,
    publicRoot: `public/projects/${storyId}`,
    catalogPath: PROJECT_CREATE_CATALOG_PATH,
  } as const;
};
