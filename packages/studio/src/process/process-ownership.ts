import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { z } from "zod";

export const ProcessOwnershipSchema = z
  .object({
    hostname: z.string().min(1),
    pid: z.number().int().positive(),
    instanceId: z.string().uuid(),
  })
  .strict();
export type ProcessOwnership = z.infer<typeof ProcessOwnershipSchema>;
const ownership: ProcessOwnership = {
  hostname: hostname(),
  pid: process.pid,
  instanceId: randomUUID(),
};
export const getProcessOwnership = (): ProcessOwnership => ({ ...ownership });
export const inspectProcessOwnership = (
  owner: ProcessOwnership,
): "active" | "exited" | "unknown" => {
  if (owner.hostname !== hostname()) return "unknown";
  try {
    process.kill(owner.pid, 0);
    return "active";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH"
      ? "exited"
      : "unknown";
  }
};
const diagnosticScope = new AsyncLocalStorage<string>();
export const getProcessDiagnosticRoot = (rootDir: string) =>
  diagnosticScope.getStore() ?? join(rootDir, ".producer-attempts");
export const withProcessDiagnosticScope = <T>(
  {
    rootDir,
    storyId,
    attemptId,
  }: {
    readonly rootDir: string;
    readonly storyId: string;
    readonly attemptId: string;
  },
  operation: () => Promise<T>,
): Promise<T> => {
  z.string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .parse(storyId);
  z.string().uuid().parse(attemptId);
  return diagnosticScope.run(
    join(rootDir, ".producer-attempts", storyId, attemptId),
    operation,
  );
};
const registryPaths = (
  rootDir: string,
  diagnosticRoot: string,
  owner: ProcessOwnership,
) => {
  const logical = relative(
    rootDir,
    join(diagnosticRoot, ".processes", owner.instanceId),
  );
  if (
    logical === ".." ||
    logical.startsWith(`..${sep}`) ||
    logical.startsWith(sep)
  )
    throw new Error("Process ownership registry escapes the Workspace.");
  const parts = logical.split(sep);
  return parts.map((_, index) => join(rootDir, ...parts.slice(0, index + 1)));
};
const ChildSchema = z
  .object({
    owner: ProcessOwnershipSchema,
    pid: z.number().int().positive().nullable(),
    processGroup: z.boolean(),
  })
  .strict();
const childState = (pid: number, processGroup: boolean) => {
  try {
    process.kill(processGroup ? -pid : pid, 0);
    return "active" as const;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH"
      ? ("exited" as const)
      : ("unknown" as const);
  }
};

// Write a pending record before spawning. A kill in the spawn/record gap leaves
// unknown ownership, which recovery refuses instead of racing an orphan writer.
export const registerOwnedProcess = async ({
  rootDir,
}: {
  readonly rootDir: string;
}) => {
  const owner = getProcessOwnership();
  const diagnosticRoot = getProcessDiagnosticRoot(rootDir);
  const paths = registryPaths(rootDir, diagnosticRoot, owner);
  const directory = join(diagnosticRoot, ".processes", owner.instanceId);
  for (const path of paths) {
    try {
      await mkdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error("Process ownership registry is unsafe.");
  }
  const path = join(directory, `${randomUUID()}.json`);
  await writeFile(
    path,
    JSON.stringify({ owner, pid: null, processGroup: false }),
    { flag: "wx", mode: 0o600 },
  );
  return {
    started: async ({
      pid,
      processGroup,
    }: {
      readonly pid: number;
      readonly processGroup: boolean;
    }) => {
      const bytes = JSON.stringify(
        ChildSchema.parse({ owner, pid, processGroup }),
      );
      const temporary = `${path}.tmp`;
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, path);
    },
    spawnFailed: async () => {
      await unlink(path);
    },
    // Keep the PID record even after the direct child exits: detached process
    // groups can still contain Chromium or FFmpeg descendants.
  };
};

export const inspectOwnedProcesses = async ({
  rootDir,
  owner,
  diagnosticRoot = join(rootDir, ".producer-attempts"),
}: {
  readonly rootDir: string;
  readonly owner: ProcessOwnership;
  readonly diagnosticRoot?: string;
}): Promise<"exited" | "active" | "unknown"> => {
  const directory = join(diagnosticRoot, ".processes", owner.instanceId);
  try {
    for (const path of registryPaths(rootDir, diagnosticRoot, owner)) {
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return "unknown";
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !entry.name.endsWith(".json")
      )
        return "unknown";
      const parsed = ChildSchema.safeParse(
        JSON.parse(await readFile(join(directory, entry.name), "utf8")),
      );
      if (
        !parsed.success ||
        JSON.stringify(parsed.data.owner) !== JSON.stringify(owner) ||
        parsed.data.pid === null
      )
        return "unknown";
      if (owner.hostname !== hostname()) return "unknown";
      const state = childState(parsed.data.pid, parsed.data.processGroup);
      if (state !== "exited") return state;
    }
    return "exited";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "exited"
      : "unknown";
  }
};
