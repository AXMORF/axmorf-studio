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
} from "@axmorf/studio/contracts";

const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export class TaskWorkspaceAuthorityError extends Error {
  readonly code = "task-workspace-authority-invalid" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export const assertTaskWorkspaceInputsCurrent = async (
  workspace: string,
  task: ProducerTaskSpec,
) => {
  for (const logicalPath of task.declaredReadSet) {
    const binding = task.inputFingerprints.find(
      ({ id }) => id === `read:${logicalPath}`,
    );
    if (binding === undefined)
      throw new TaskWorkspaceAuthorityError(
        "Task declared read binding is missing.",
      );
    const path = join(workspace, logicalPath);
    let metadata;
    try {
      metadata = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new TaskWorkspaceAuthorityError(
          "Task declared read is missing.",
          { cause: error },
        );
      }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new TaskWorkspaceAuthorityError(
        "Task declared read must be a regular file.",
      );
    }
    if (checksum(await readFile(path)) !== binding.fingerprint) {
      throw new TaskWorkspaceAuthorityError(
        "Task declared read checksum drifted.",
      );
    }
  }
};

export const resolveTaskWorkspacePath = ({
  rootDir,
  storyId,
  taskRevision,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly taskRevision: string;
}) =>
  join(
    rootDir,
    ".producer-work",
    StoryIdSchema.parse(storyId),
    TaskRevisionSchema.parse(taskRevision),
  );

const assertRegularParents = async (
  rootDir: string,
  paths: readonly string[],
) => {
  for (const path of paths) {
    let metadata;
    try {
      metadata = await lstat(join(rootDir, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error("Task workspace parent is unsafe.");
  }
};

export const createTaskWorkspace = async ({
  rootDir,
  task,
  seedFiles = {},
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly seedFiles?: Readonly<Record<string, Uint8Array | string>>;
}) => {
  const parsed = ProducerTaskSpecSchema.parse(task);
  const workspace = resolveTaskWorkspacePath({
    rootDir,
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
  await assertRegularParents(rootDir, [
    ".producer-work",
    `.producer-work/${parsed.storyId}`,
  ]);
  try {
    const metadata = await lstat(workspace);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error("Task workspace path is unsafe.");
    const stored = ProducerTaskSpecSchema.parse(
      JSON.parse(await readFile(join(workspace, "task.json"), "utf8")),
    );
    if (stored.taskRevision !== parsed.taskRevision)
      throw new Error("Task workspace identity is stale.");
    await assertTaskWorkspaceInputsCurrent(workspace, stored);
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
        const stored = ProducerTaskSpecSchema.parse(
          JSON.parse(await readFile(join(workspace, "task.json"), "utf8")),
        );
        if (stored.taskRevision === parsed.taskRevision) {
          await assertTaskWorkspaceInputsCurrent(workspace, stored);
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

export const readTaskWorkspaceIdentity = async ({
  rootDir,
  taskRevision,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
}) => {
  const revision = TaskRevisionSchema.parse(taskRevision);
  let storyRoots;
  try {
    storyRoots = await readdir(join(rootDir, ".producer-work"), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new TaskWorkspaceAuthorityError("Task workspace is missing.");
    }
    throw error;
  }
  const matches: Array<{ task: ProducerTaskSpec; workspace: string }> = [];
  for (const story of storyRoots) {
    if (!story.isDirectory() || story.isSymbolicLink()) continue;
    const workspace = join(rootDir, ".producer-work", story.name, revision);
    try {
      const metadata = await lstat(workspace);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Task workspace path is unsafe.");
      }
      const taskPath = join(workspace, "task.json");
      const taskMetadata = await lstat(taskPath);
      if (!taskMetadata.isFile() || taskMetadata.isSymbolicLink()) {
        throw new TaskWorkspaceAuthorityError(
          "Task workspace identity must be a regular file.",
        );
      }
      const task = ProducerTaskSpecSchema.parse(
        JSON.parse(await readFile(taskPath, "utf8")),
      );
      matches.push({ task, workspace });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (
        error instanceof TaskWorkspaceAuthorityError ||
        error instanceof SyntaxError ||
        (error instanceof Error && error.name === "ZodError")
      ) {
        throw new TaskWorkspaceAuthorityError(
          "Task workspace identity is invalid.",
          { cause: error },
        );
      }
      throw error;
    }
  }
  if (matches.length !== 1) {
    throw new TaskWorkspaceAuthorityError(
      "Task workspace is missing or ambiguous.",
    );
  }
  return matches[0];
};

export const readTaskWorkspace = async (input: {
  readonly rootDir: string;
  readonly taskRevision: string;
}) => {
  const current = await readTaskWorkspaceIdentity(input);
  await assertTaskWorkspaceInputsCurrent(current.workspace, current.task);
  return current;
};

export const reissueTaskWorkspace = async ({
  rootDir,
  task,
  seedFiles,
  failedAttemptId,
  createWorkspace = createTaskWorkspace,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly seedFiles: Readonly<Record<string, Uint8Array | string>>;
  readonly failedAttemptId: string;
  readonly createWorkspace?: typeof createTaskWorkspace;
}) => {
  const parsed = ProducerTaskSpecSchema.parse(task);
  const parsedFailedAttemptId = z.string().uuid().parse(failedAttemptId);
  const workspace = resolveTaskWorkspacePath({
    rootDir,
    storyId: parsed.storyId,
    taskRevision: parsed.taskRevision,
  });
  try {
    await readTaskWorkspace({ rootDir, taskRevision: parsed.taskRevision });
    return { workspace, recovery: "preserved" as const };
  } catch (error) {
    if (!(error instanceof TaskWorkspaceAuthorityError)) throw error;
  }

  let workspaceExists = false;
  try {
    const metadata = await lstat(workspace);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new TaskWorkspaceAuthorityError(
        "Task workspace recovery target is unsafe.",
      );
    }
    workspaceExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!workspaceExists) {
    return {
      workspace: await createWorkspace({ rootDir, task: parsed, seedFiles }),
      recovery: "fresh-seed" as const,
    };
  }

  const quarantine = join(
    dirname(workspace),
    `.${parsed.taskRevision}.failed-${parsedFailedAttemptId}`,
  );
  try {
    await lstat(quarantine);
    throw new TaskWorkspaceAuthorityError(
      "Task workspace quarantine already exists.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(workspace, quarantine);
  try {
    const created = await createWorkspace({
      rootDir,
      task: parsed,
      seedFiles,
    });
    return {
      workspace: created,
      recovery: "fresh-seed" as const,
      quarantine,
    };
  } catch (error) {
    try {
      await rename(quarantine, workspace);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Task workspace recovery failed and rollback was incomplete.",
      );
    }
    throw error;
  }
};

export const removeTaskWorkspace = async ({
  rootDir,
  task,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
}) => {
  const workspace = resolveTaskWorkspacePath({
    rootDir,
    storyId: task.storyId,
    taskRevision: task.taskRevision,
  });
  const expected = join(
    rootDir,
    ".producer-work",
    task.storyId,
    task.taskRevision,
  );
  if (workspace !== expected)
    throw new Error("Task workspace cleanup target is unsafe.");
  await rm(workspace, { recursive: true, force: true });
};
