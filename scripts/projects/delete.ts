import type { Dirent } from "node:fs";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { ProductionRunIdSchema, StoryIdSchema } from "../../src/contracts";
import { generateResourceCatalog } from "../catalog/generate";
import { generateProjectRegistry } from "../registry/generate";
import { acquireProductionRunLock } from "../production/adapters/run-store";
import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";

export type ProjectDeletionSelection =
  | Readonly<{ kind: "projects"; projectIds: readonly string[] }>
  | Readonly<{ kind: "all" }>;

type RegenerationResult = Readonly<{
  catalogEntryCount: number;
  projectEntryCount: number;
}>;

type ProjectDataRegenerator = () => Promise<RegenerationResult>;

type PathState = Awaited<ReturnType<typeof lstat>> | null;

const DIRECT_DATA_ROOTS = [
  "src/projects",
  "public/projects",
  ".narration-work",
  "out",
  "deliveries",
] as const;

const PROJECT_DISCOVERY_ROOTS = [
  "src/projects",
  "public/projects",
  ".narration-work",
  "out",
  "deliveries",
] as const;

const CORE_OUT_DIRECTORIES = new Set(["m6-scene-runtime-proof"]);

const usage =
  "Expected --project <storyId> [--project <storyId> ...] --confirm-delete or --all --confirm-delete.";

const parseDeletableProjectId = (rawProjectId: string) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  if (CORE_OUT_DIRECTORIES.has(projectId)) {
    throw new Error(`Project ID is reserved by core output: ${projectId}.`);
  }
  return projectId;
};

const pathState = async (path: string): Promise<PathState> => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const toRepositoryPath = (rootDir: string, path: string) =>
  relative(rootDir, path).split(sep).join("/");

const assertRealRoot = async (rootDir: string) => {
  const metadata = await lstat(rootDir);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Repository root must be a real directory.");
  }
};

const readOptionalRealDirectory = async ({
  rootDir,
  relativePath,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
}): Promise<readonly Dirent[]> => {
  const absolutePath = join(rootDir, relativePath);
  const metadata = await pathState(absolutePath);
  if (metadata === null) return [];
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${relativePath} must be a real directory.`);
  }
  return (await readdir(absolutePath, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
};

const assertFixedParentChains = async (rootDir: string) => {
  for (const relativePath of [
    "src",
    "src/projects",
    "public",
    "public/projects",
    ".narration-work",
    ".producer-runs",
    "out",
    "deliveries",
    "deliveries/.staging",
  ]) {
    const metadata = await pathState(join(rootDir, relativePath));
    if (
      metadata !== null &&
      (metadata.isSymbolicLink() || !metadata.isDirectory())
    ) {
      throw new Error(`${relativePath} must be a real directory.`);
    }
  }
};

const assertDeliveryStagingIdle = async (rootDir: string) => {
  const entries = await readOptionalRealDirectory({
    rootDir,
    relativePath: "deliveries/.staging",
  });
  if (entries.length > 0) {
    throw new Error(
      "Delivery staging contains an unfinished package; refusing Project deletion.",
    );
  }
};

type StoredRun = Readonly<{
  directoryName: string;
  storyId: string;
  relativePath: string;
  hasWriterLock: boolean;
}>;

const parseStoredRunOwnership = (raw: unknown) => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Production run ownership is malformed.");
  }
  const record = raw as Record<string, unknown>;
  return {
    runId: ProductionRunIdSchema.parse(record.runId),
    storyId: StoryIdSchema.parse(record.storyId),
  } as const;
};

const readStoredRuns = async (
  rootDir: string,
): Promise<readonly StoredRun[]> => {
  const entries = await readOptionalRealDirectory({
    rootDir,
    relativePath: ".producer-runs",
  });
  const runs: StoredRun[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(
        `.producer-runs contains an unsafe entry: ${entry.name}.`,
      );
    }
    const relativePath = `.producer-runs/${entry.name}`;
    const runPath = join(rootDir, relativePath, "run.json");
    const runMetadata = await pathState(runPath);
    if (
      runMetadata === null ||
      runMetadata.isSymbolicLink() ||
      !runMetadata.isFile()
    ) {
      throw new Error(`Production run manifest is unsafe: ${entry.name}.`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(runPath, "utf8"));
    } catch (error) {
      throw new Error(`Production run manifest is malformed: ${entry.name}.`, {
        cause: error,
      });
    }
    const run = parseStoredRunOwnership(raw);
    if (run.runId !== entry.name) {
      throw new Error(
        `Production run directory identity is stale: ${entry.name}.`,
      );
    }
    runs.push({
      directoryName: entry.name,
      storyId: run.storyId,
      relativePath,
      hasWriterLock:
        (await pathState(join(rootDir, relativePath, "lock"))) !== null,
    });
  }
  return runs;
};

const discoverProjectIds = async ({
  rootDir,
  runs,
}: {
  readonly rootDir: string;
  readonly runs: readonly StoredRun[];
}) => {
  const projectIds = new Set<string>(
    runs.map((run) => parseDeletableProjectId(run.storyId)),
  );
  for (const relativeRoot of PROJECT_DISCOVERY_ROOTS) {
    const entries = await readOptionalRealDirectory({
      rootDir,
      relativePath: relativeRoot,
    });
    for (const entry of entries) {
      if (relativeRoot === "deliveries" && entry.name === ".staging") continue;
      if (relativeRoot === "out" && CORE_OUT_DIRECTORIES.has(entry.name)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(
          `${relativeRoot} contains a symbolic-link: ${entry.name}.`,
        );
      }
      if (!entry.isDirectory()) continue;
      projectIds.add(parseDeletableProjectId(entry.name));
    }
  }
  return [...projectIds].sort();
};

export const discoverDeletableProjectIds = async ({
  rootDir: rawRootDir,
}: {
  readonly rootDir: string;
}) => {
  const rootDir = resolve(rawRootDir);
  await assertRealRoot(rootDir);
  await assertFixedParentChains(rootDir);
  const runs = await readStoredRuns(rootDir);
  return discoverProjectIds({ rootDir, runs });
};

const resolveSelectedProjectIds = async ({
  rootDir,
  selection,
  runs,
}: {
  readonly rootDir: string;
  readonly selection: ProjectDeletionSelection;
  readonly runs: readonly StoredRun[];
}) => {
  if (selection.kind === "all") {
    return discoverProjectIds({ rootDir, runs });
  }
  const projectIds = selection.projectIds.map((projectId) =>
    parseDeletableProjectId(projectId),
  );
  if (
    projectIds.length === 0 ||
    new Set(projectIds).size !== projectIds.length
  ) {
    throw new Error("Project deletion requires unique Project IDs.");
  }
  return [...projectIds].sort();
};

const collectDeletionTargets = async ({
  rootDir,
  projectIds,
  runs,
  requireEveryProject,
  ownedLockRunIds = new Set(),
}: {
  readonly rootDir: string;
  readonly projectIds: readonly string[];
  readonly runs: readonly StoredRun[];
  readonly requireEveryProject: boolean;
  readonly ownedLockRunIds?: ReadonlySet<string>;
}) => {
  const selected = new Set(projectIds);
  const found = new Set<string>();
  const targets: string[] = [];
  for (const projectId of projectIds) {
    for (const relativeRoot of DIRECT_DATA_ROOTS) {
      const absolutePath = join(rootDir, relativeRoot, projectId);
      const metadata = await pathState(absolutePath);
      if (metadata === null) continue;
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(
          `Project deletion target is unsafe: ${relativeRoot}/${projectId}.`,
        );
      }
      found.add(projectId);
      targets.push(toRepositoryPath(rootDir, absolutePath));
    }
  }
  for (const run of runs) {
    if (!selected.has(run.storyId)) continue;
    if (run.hasWriterLock && !ownedLockRunIds.has(run.directoryName)) {
      throw new Error(
        `Production run has a writer lock: ${run.directoryName}.`,
      );
    }
    found.add(run.storyId);
    targets.push(run.relativePath);
  }
  if (requireEveryProject) {
    const missing = projectIds.filter((projectId) => !found.has(projectId));
    if (missing.length > 0) {
      throw new Error(
        `No Project-owned data found for: ${missing.join(", ")}.`,
      );
    }
  }
  return [...new Set(targets)].sort();
};

const defaultRegenerator =
  (rootDir: string): ProjectDataRegenerator =>
  async () => {
    const catalog = await generateResourceCatalog({ rootDir, mode: "write" });
    const registry = await generateProjectRegistry({ rootDir, mode: "write" });
    return {
      catalogEntryCount: catalog.entryCount,
      projectEntryCount: registry.entryCount,
    };
  };

export const deleteProjectData = async ({
  rootDir: rawRootDir,
  selection,
  regenerate,
  remove = (path: string) => rm(path, { recursive: true }),
}: {
  readonly rootDir: string;
  readonly selection: ProjectDeletionSelection;
  readonly regenerate?: ProjectDataRegenerator;
  readonly remove?: (path: string) => Promise<void>;
}) => {
  const rootDir = resolve(rawRootDir);
  await assertRealRoot(rootDir);
  let repositoryLock: Awaited<
    ReturnType<typeof acquireRepositoryOperationLock>
  > | null = null;
  const runLocks: Awaited<ReturnType<typeof acquireProductionRunLock>>[] = [];
  let outcome:
    | Readonly<{
        deletionVersion: 1;
        deletedProjectIds: readonly string[];
        deletedPaths: readonly string[];
        catalogEntryCount: number;
        projectEntryCount: number;
      }>
    | undefined;
  let operationError: unknown;
  let registryPrepublished = false;
  try {
    await assertFixedParentChains(rootDir);
    await assertDeliveryStagingIdle(rootDir);
    const runs = await readStoredRuns(rootDir);
    const projectIds = await resolveSelectedProjectIds({
      rootDir,
      selection,
      runs,
    });
    const targets = await collectDeletionTargets({
      rootDir,
      projectIds,
      runs,
      requireEveryProject: selection.kind === "projects",
    });
    const selected = new Set(projectIds);
    for (const run of runs.filter(({ storyId }) => selected.has(storyId))) {
      runLocks.push(
        await acquireProductionRunLock({
          rootDir,
          runId: run.directoryName,
          ownerId: "project-delete",
          acquiredAt: new Date().toISOString(),
        }),
      );
    }

    repositoryLock = await acquireRepositoryOperationLock({
      rootDir,
      ownerId: "project-delete",
    });
    await assertFixedParentChains(rootDir);
    await assertDeliveryStagingIdle(rootDir);
    const lockedRunIds = new Set(
      runs
        .filter(({ storyId }) => selected.has(storyId))
        .map(({ directoryName }) => directoryName),
    );
    const currentRuns = await readStoredRuns(rootDir);
    const currentProjectIds = await resolveSelectedProjectIds({
      rootDir,
      selection,
      runs: currentRuns,
    });
    const currentTargets = await collectDeletionTargets({
      rootDir,
      projectIds: currentProjectIds,
      runs: currentRuns,
      requireEveryProject: selection.kind === "projects",
      ownedLockRunIds: lockedRunIds,
    });
    if (
      JSON.stringify(currentProjectIds) !== JSON.stringify(projectIds) ||
      JSON.stringify(currentTargets) !== JSON.stringify(targets)
    ) {
      throw new Error("Project-owned data changed during deletion preflight.");
    }

    await generateProjectRegistry({
      rootDir,
      mode: "write",
      excludeProjectIds: projectIds,
    });
    registryPrepublished = true;

    for (const relativePath of targets) {
      await remove(join(rootDir, relativePath));
    }
    const generated = await (regenerate ?? defaultRegenerator(rootDir))();
    for (const relativePath of targets) {
      if ((await pathState(join(rootDir, relativePath))) !== null) {
        throw new Error(
          `Project deletion target still exists: ${relativePath}.`,
        );
      }
    }
    outcome = {
      deletionVersion: 1,
      deletedProjectIds: projectIds,
      deletedPaths: targets,
      ...generated,
    } as const;
  } catch (error) {
    if (!registryPrepublished) {
      operationError = error;
    } else {
      const recoveryErrors: unknown[] = [];
      await generateProjectRegistry({ rootDir, mode: "write" }).catch(
        (recoveryError: unknown) => recoveryErrors.push(recoveryError),
      );
      await generateResourceCatalog({ rootDir, mode: "write" }).catch(
        (recoveryError: unknown) => recoveryErrors.push(recoveryError),
      );
      if (recoveryErrors.length === 0) {
        operationError = error;
      } else {
        operationError = new AggregateError(
          [error, ...recoveryErrors],
          "Project deletion failed and current projections could not be rebuilt.",
        );
      }
    }
  }
  const releaseErrors: unknown[] = [];
  for (const lock of runLocks.reverse()) {
    await lock.release().catch((error: unknown) => {
      const directCode = (error as NodeJS.ErrnoException).code;
      const causeCode = (
        (error as Error & { cause?: NodeJS.ErrnoException }).cause ?? {}
      ).code;
      if (directCode !== "ENOENT" && causeCode !== "ENOENT") {
        releaseErrors.push(error);
      }
    });
  }
  await repositoryLock?.release().catch((error: unknown) => {
    releaseErrors.push(error);
  });
  if (operationError !== undefined || releaseErrors.length > 0) {
    const errors = [operationError, ...releaseErrors].filter(
      (error) => error !== undefined,
    );
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, "Project deletion failed.");
  }
  if (outcome === undefined)
    throw new Error("Project deletion produced no result.");
  return outcome;
};

export const parseProjectDeleteArguments = (
  args: readonly string[],
): Readonly<{ selection: ProjectDeletionSelection }> => {
  const projectIds: string[] = [];
  let all = false;
  let confirmed = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--project") {
      const projectId = args[index + 1];
      if (projectId === undefined || projectId.startsWith("--")) {
        throw new Error(usage);
      }
      projectIds.push(parseDeletableProjectId(projectId));
      index += 1;
    } else if (argument === "--all") {
      if (all) throw new Error(usage);
      all = true;
    } else if (argument === "--confirm-delete") {
      if (confirmed) throw new Error(usage);
      confirmed = true;
    } else {
      throw new Error(usage);
    }
  }
  if (!confirmed || all === projectIds.length > 0) {
    throw new Error(usage);
  }
  if (new Set(projectIds).size !== projectIds.length) {
    throw new Error("Project deletion requires unique Project IDs.");
  }
  return all
    ? { selection: { kind: "all" } }
    : { selection: { kind: "projects", projectIds } };
};

export const runProjectDeleteCli = async ({
  args,
  rootDir,
  stdout = (value: string) => process.stdout.write(value),
}: {
  readonly args: readonly string[];
  readonly rootDir: string;
  readonly stdout?: (value: string) => void;
}) => {
  const { selection } = parseProjectDeleteArguments(args);
  const result = await deleteProjectData({ rootDir, selection });
  stdout(`${JSON.stringify(result)}\n`);
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectDeleteCli({
    args: process.argv.slice(2),
    rootDir: process.cwd(),
  }).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Project deletion failed."}\n`,
    );
    process.exitCode = 1;
  });
}
