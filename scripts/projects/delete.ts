import type { Dirent } from "node:fs";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ProductionRunManifestSchema,
  StoryIdSchema,
} from "../../src/contracts";
import { generateResourceCatalog } from "../catalog/generate";
import { generateProjectRegistry } from "../registry/generate";

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
    const run = ProductionRunManifestSchema.parse(raw);
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
}: {
  readonly rootDir: string;
  readonly projectIds: readonly string[];
  readonly runs: readonly StoredRun[];
  readonly requireEveryProject: boolean;
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
    if (run.hasWriterLock) {
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
}: {
  readonly rootDir: string;
  readonly selection: ProjectDeletionSelection;
  readonly regenerate?: ProjectDataRegenerator;
}) => {
  const rootDir = resolve(rawRootDir);
  await assertRealRoot(rootDir);
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

  for (const relativePath of targets) {
    await rm(join(rootDir, relativePath), { recursive: true });
  }
  const generated = await (regenerate ?? defaultRegenerator(rootDir))();
  for (const relativePath of targets) {
    if ((await pathState(join(rootDir, relativePath))) !== null) {
      throw new Error(`Project deletion target still exists: ${relativePath}.`);
    }
  }
  return {
    deletionVersion: 1,
    deletedProjectIds: projectIds,
    deletedPaths: targets,
    ...generated,
  } as const;
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
