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

import {
  ProducerTaskSpecSchema,
  StoryIdSchema,
  TaskRevisionSchema,
  serializeCanonicalJson,
  type ProducerTaskSpec,
} from "../../../src/contracts";

const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const assertDeclaredReadsCurrent = async (
  workspace: string,
  task: ProducerTaskSpec,
) => {
  for (const logicalPath of task.declaredReadSet) {
    const binding = task.inputFingerprints.find(
      ({ id }) => id === `read:${logicalPath}`,
    );
    if (binding === undefined) throw new Error("Task declared read binding is missing.");
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

export const resolveTaskWorkspacePath = ({ rootDir, storyId, taskRevision }: {
  readonly rootDir: string; readonly storyId: string; readonly taskRevision: string;
}) => join(rootDir, ".producer-work", StoryIdSchema.parse(storyId), TaskRevisionSchema.parse(taskRevision));

const assertRegularParents = async (rootDir: string, paths: readonly string[]) => {
  for (const path of paths) {
    let metadata;
    try { metadata = await lstat(join(rootDir, path)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Task workspace parent is unsafe.");
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
  const workspace = resolveTaskWorkspacePath({ rootDir, storyId: parsed.storyId, taskRevision: parsed.taskRevision });
  const seeds = Object.entries(seedFiles).sort(([left], [right]) => left.localeCompare(right));
  for (const [logicalPath] of seeds) {
    if (!parsed.declaredReadSet.includes(logicalPath) && !parsed.declaredOutputSet.includes(logicalPath)) {
      throw new Error("Task workspace seed path is undeclared.");
    }
    const target = join(workspace, logicalPath);
    const repositoryRelative = relative(workspace, target).split(sep).join("/");
    if (repositoryRelative !== logicalPath) throw new Error("Task workspace seed path escapes workspace.");
  }
  await assertRegularParents(rootDir, [".producer-work", `.producer-work/${parsed.storyId}`]);
  try {
    const metadata = await lstat(workspace);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Task workspace path is unsafe.");
    const stored = ProducerTaskSpecSchema.parse(JSON.parse(await readFile(join(workspace, "task.json"), "utf8")));
    if (stored.taskRevision !== parsed.taskRevision) throw new Error("Task workspace identity is stale.");
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
    if (seed === undefined || binding === undefined || checksum(seed) !== binding.fingerprint) {
      throw new Error("Task workspace declared read seed is missing or stale.");
    }
  }
  const parent = dirname(workspace);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(join(parent, `.${parsed.taskRevision}.staging-`));
  try {
    await writeFile(join(staging, "task.json"), `${serializeCanonicalJson(parsed)}\n`, { flag: "wx" });
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

export const readTaskWorkspace = async ({ rootDir, taskRevision }: { readonly rootDir: string; readonly taskRevision: string }) => {
  const revision = TaskRevisionSchema.parse(taskRevision);
  const storyRoots = await readdir(join(rootDir, ".producer-work"), { withFileTypes: true });
  const matches: Array<{ task: ProducerTaskSpec; workspace: string }> = [];
  for (const story of storyRoots) {
    if (!story.isDirectory() || story.isSymbolicLink()) continue;
    const workspace = join(rootDir, ".producer-work", story.name, revision);
    try {
      const metadata = await lstat(workspace);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Task workspace path is unsafe.");
      }
      const task = ProducerTaskSpecSchema.parse(JSON.parse(await readFile(join(workspace, "task.json"), "utf8")));
      await assertDeclaredReadsCurrent(workspace, task);
      matches.push({ task, workspace });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (matches.length !== 1) throw new Error("Task workspace is missing or ambiguous.");
  return matches[0];
};

export const removeTaskWorkspace = async ({ rootDir, task }: { readonly rootDir: string; readonly task: ProducerTaskSpec }) => {
  const workspace = resolveTaskWorkspacePath({ rootDir, storyId: task.storyId, taskRevision: task.taskRevision });
  const expected = join(rootDir, ".producer-work", task.storyId, task.taskRevision);
  if (workspace !== expected) throw new Error("Task workspace cleanup target is unsafe.");
  await rm(workspace, { recursive: true, force: true });
};
