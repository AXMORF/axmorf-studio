import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import { z } from "zod";

import {
  ProducerTaskSpecSchema,
  StoryIdSchema,
  TaskRevisionSchema,
  serializeCanonicalJson,
  type ProducerTaskSpec,
} from "../../../src/contracts";
import type { ProductionLocations } from "../domain/production-locations";

type TaskWorkspaceLocation = Readonly<{ locations: ProductionLocations }>;

export class TaskWorkspaceAuthorityError extends Error {
  readonly code = "task-workspace-authority-invalid" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const taskWorkspaceRoot = ({ locations }: TaskWorkspaceLocation) =>
  locations.taskWorkspaceRoot;

const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const readStoredTask = async (workspace: string) => {
  const path = join(workspace, "task.json");
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Task workspace authority must be a regular file.");
  }
  return ProducerTaskSpecSchema.parse(JSON.parse(await readFile(path, "utf8")));
};

const assertDeclaredReadsCurrent = async (
  workspace: string,
  task: ProducerTaskSpec,
) => {
  for (const logicalPath of task.declaredReadSet) {
    const binding = task.inputFingerprints.find(
      ({ id }) => id === `read:${logicalPath}`,
    );
    if (binding === undefined)
      throw new Error("Task declared read binding is missing.");
    const path = join(workspace, logicalPath);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Task declared read must be a regular file.");
    }
    if (checksum(await readFile(path)) !== binding.fingerprint) {
      throw new Error("Task declared read checksum drifted.");
    }
  }
};

export const resolveTaskWorkspacePath = (
  input: TaskWorkspaceLocation & {
    readonly storyId: string;
    readonly taskRevision: string;
  },
) =>
  join(
    taskWorkspaceRoot(input),
    StoryIdSchema.parse(input.storyId),
    TaskRevisionSchema.parse(input.taskRevision),
  );

const assertRegularParents = async (root: string, paths: readonly string[]) => {
  for (const path of paths) {
    let metadata;
    try {
      metadata = await lstat(join(root, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error("Task workspace parent is unsafe.");
  }
};

export const createTaskWorkspace = async (
  input: TaskWorkspaceLocation & {
    readonly task: ProducerTaskSpec;
    readonly seedFiles?: Readonly<Record<string, Uint8Array | string>>;
  },
) => {
  const { task, seedFiles = {} } = input;
  const parsed = ProducerTaskSpecSchema.parse(task);
  const storage = taskWorkspaceRoot(input);
  const workspace = resolveTaskWorkspacePath({
    ...input,
    storyId: parsed.storyId,
    taskRevision: parsed.taskRevision,
  });
  const seeds = Object.entries(seedFiles).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [logicalPath] of seeds) {
    if (
      !parsed.declaredReadSet.includes(logicalPath) &&
      !parsed.declaredOutputSet.includes(logicalPath)
    ) {
      throw new Error("Task workspace seed path is undeclared.");
    }
    const target = join(workspace, logicalPath);
    const repositoryRelative = relative(workspace, target).split(sep).join("/");
    if (repositoryRelative !== logicalPath)
      throw new Error("Task workspace seed path escapes workspace.");
  }
  await assertRegularParents(storage, ["", parsed.storyId]);
  try {
    const metadata = await lstat(workspace);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error("Task workspace path is unsafe.");
    const stored = await readStoredTask(workspace);
    if (stored.taskRevision !== parsed.taskRevision)
      throw new Error("Task workspace identity is stale.");
    await assertDeclaredReadsCurrent(workspace, stored);
    return workspace;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const seedByPath = new Map(seeds);
  for (const logicalPath of parsed.declaredReadSet) {
    const seed = seedByPath.get(logicalPath);
    const binding = parsed.inputFingerprints.find(
      ({ id }) => id === `read:${logicalPath}`,
    );
    if (
      seed === undefined ||
      binding === undefined ||
      checksum(seed) !== binding.fingerprint
    ) {
      throw new Error("Task workspace declared read seed is missing or stale.");
    }
  }
  const parent = dirname(workspace);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(
    join(parent, `.${parsed.taskRevision}.staging-`),
  );
  try {
    await writeFile(
      join(staging, "task.json"),
      `${serializeCanonicalJson(parsed)}\n`,
      { flag: "wx" },
    );
    for (const [logicalPath, bytes] of seeds) {
      const target = join(staging, logicalPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    }
    await rename(staging, workspace);
  } catch (error) {
    try {
      const metadata = await lstat(workspace);
      if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        const stored = await readStoredTask(workspace);
        if (stored.taskRevision === parsed.taskRevision) {
          await assertDeclaredReadsCurrent(workspace, stored);
          return workspace;
        }
      }
    } catch {
      // Preserve the original creation error when no concurrent valid workspace won.
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return workspace;
};

export const readTaskWorkspace = async (
  input: TaskWorkspaceLocation & { readonly taskRevision: string },
) => {
  try {
    const { taskRevision } = input;
    const storage = taskWorkspaceRoot(input);
    const revision = TaskRevisionSchema.parse(taskRevision);
    const storyRoots = await readdir(storage, { withFileTypes: true });
    const matches: Array<{ task: ProducerTaskSpec; workspace: string }> = [];
    for (const story of storyRoots) {
      if (!story.isDirectory() || story.isSymbolicLink()) continue;
      const workspace = join(storage, story.name, revision);
      try {
        const metadata = await lstat(workspace);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw new Error("Task workspace path is unsafe.");
        }
        const task = await readStoredTask(workspace);
        await assertDeclaredReadsCurrent(workspace, task);
        matches.push({ task, workspace });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (matches.length !== 1)
      throw new Error("Task workspace is missing or ambiguous.");
    return matches[0];
  } catch (error) {
    if (error instanceof TaskWorkspaceAuthorityError) throw error;
    throw new TaskWorkspaceAuthorityError(
      error instanceof Error
        ? error.message
        : "Task workspace authority is invalid.",
      { cause: error },
    );
  }
};

/**
 * Reads only immutable task identity for controller-owned failure recording.
 * It deliberately does not admit task execution or output writes.
 */
export const readTaskWorkspaceIdentity = async (
  input: TaskWorkspaceLocation & { readonly taskRevision: string },
) => {
  try {
    const revision = TaskRevisionSchema.parse(input.taskRevision);
    const storage = taskWorkspaceRoot(input);
    const storyRoots = await readdir(storage, { withFileTypes: true });
    const matches: Array<{ task: ProducerTaskSpec; workspace: string }> = [];
    for (const story of storyRoots) {
      if (!story.isDirectory() || story.isSymbolicLink()) continue;
      const workspace = join(storage, story.name, revision);
      try {
        const metadata = await lstat(workspace);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw new Error("Task workspace path is unsafe.");
        }
        const task = await readStoredTask(workspace);
        if (task.taskRevision !== revision) {
          throw new Error("Task workspace identity is stale.");
        }
        matches.push({ task, workspace });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (matches.length !== 1) {
      throw new Error("Task workspace identity is missing or ambiguous.");
    }
    return matches[0]!;
  } catch (error) {
    if (error instanceof TaskWorkspaceAuthorityError) throw error;
    throw new TaskWorkspaceAuthorityError(
      error instanceof Error
        ? error.message
        : "Task workspace identity could not be read.",
      { cause: error },
    );
  }
};

export const reissueTaskWorkspace = async (
  input: TaskWorkspaceLocation & {
    readonly task: ProducerTaskSpec;
    readonly seedFiles: Readonly<Record<string, Uint8Array | string>>;
    readonly failedAttemptId: string;
  },
) => {
  const workspace = resolveTaskWorkspacePath({
    ...input,
    storyId: input.task.storyId,
    taskRevision: input.task.taskRevision,
  });
  try {
    return {
      workspace: await createTaskWorkspace(input),
      recovery: "preserved" as const,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error;
  }
  const metadata = await lstat(workspace);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new TaskWorkspaceAuthorityError(
      "Unsafe task workspace cannot be reissued automatically.",
    );
  }
  const quarantine = join(
    dirname(workspace),
    `.${input.task.taskRevision}.failed-${z.string().uuid().parse(input.failedAttemptId)}`,
  );
  try {
    await lstat(quarantine);
    throw new TaskWorkspaceAuthorityError(
      "Task workspace recovery quarantine already exists.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(workspace, quarantine);
  try {
    return {
      workspace: await createTaskWorkspace(input),
      recovery: "fresh-seed" as const,
    };
  } catch (error) {
    await rename(quarantine, workspace).catch(() => undefined);
    throw error;
  }
};

export const removeTaskWorkspace = async (
  input: TaskWorkspaceLocation & { readonly task: ProducerTaskSpec },
) => {
  const { task } = input;
  const storage = taskWorkspaceRoot(input);
  const workspace = resolveTaskWorkspacePath({
    ...input,
    storyId: task.storyId,
    taskRevision: task.taskRevision,
  });
  const expected = join(storage, task.storyId, task.taskRevision);
  if (workspace !== expected)
    throw new Error("Task workspace cleanup target is unsafe.");
  await rm(workspace, { recursive: true, force: true });
};
