import { randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  resolve,
  sep,
} from "node:path";

import {
  DESKTOP_PREFERENCES_CONTRACT_VERSION,
  DesktopPreferencesSchema,
  type DesktopPreferences,
} from "../contracts/workspace";

export const DESKTOP_PREFERENCES_FILE_NAME = "preferences.json" as const;

export const resolveDesktopPreferencesPath = ({
  applicationSupportRoot,
}: {
  readonly applicationSupportRoot: string;
}) => {
  if (!isAbsolute(applicationSupportRoot)) {
    throw new Error("Application Support root must be absolute.");
  }
  return join(resolve(applicationSupportRoot), DESKTOP_PREFERENCES_FILE_NAME);
};

const readMetadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertNormalizedAbsolutePath = (path: string) => {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(
      "Desktop preferences path must be normalized and absolute.",
    );
  }
};

const ensureRealDirectoryChain = async ({
  directory,
  createMissing,
}: {
  readonly directory: string;
  readonly createMissing: boolean;
}) => {
  assertNormalizedAbsolutePath(directory);
  const root = parse(directory).root;
  const segments = directory.slice(root.length).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    const metadata = await readMetadata(current);
    if (metadata === null) {
      if (!createMissing) return false;
      await mkdir(current, { mode: 0o700 });
      const created = await lstat(current);
      if (created.isSymbolicLink() || !created.isDirectory()) {
        throw new Error("Desktop preferences directory creation was unsafe.");
      }
      continue;
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Desktop preferences path contains an unsafe parent.");
    }
  }
  return true;
};

const assertOwnerOnlyDirectory = async (directory: string) => {
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Desktop preferences parent must be a real directory.");
  }
  await chmod(directory, 0o700);
};

export const loadAppPreferences = async ({
  preferencesPath,
}: {
  readonly preferencesPath: string;
}): Promise<DesktopPreferences | null> => {
  assertNormalizedAbsolutePath(preferencesPath);
  if (
    !(await ensureRealDirectoryChain({
      directory: dirname(preferencesPath),
      createMissing: false,
    }))
  ) {
    return null;
  }
  const metadata = await readMetadata(preferencesPath);
  if (metadata === null) return null;
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error("Desktop preferences must be an owner-only regular file.");
  }
  try {
    const preferences = DesktopPreferencesSchema.parse(
      JSON.parse(await readFile(preferencesPath, "utf8")),
    );
    if (!isAbsolute(preferences.workspaceRoot)) {
      throw new Error("Saved Workspace root must be absolute.");
    }
    return preferences;
  } catch (error) {
    throw new Error("Desktop preferences are malformed or invalid.", {
      cause: error,
    });
  }
};

export type AtomicPreferencesWriter = (request: {
  readonly destination: string;
  readonly bytes: string;
}) => Promise<void>;

export const writeAppPreferencesAtomic: AtomicPreferencesWriter = async ({
  destination,
  bytes,
}) => {
  assertNormalizedAbsolutePath(destination);
  if (basename(destination) !== DESKTOP_PREFERENCES_FILE_NAME) {
    throw new Error("Desktop preferences must use the fixed file name.");
  }
  const parent = dirname(destination);
  await ensureRealDirectoryChain({ directory: parent, createMissing: true });
  await assertOwnerOnlyDirectory(parent);
  const existing = await readMetadata(destination);
  if (existing?.isSymbolicLink() || (existing !== null && !existing.isFile())) {
    throw new Error("Desktop preferences target must be a regular file.");
  }
  const temporaryPath = join(
    parent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let promoted = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporaryPath, 0o600);
    try {
      await link(temporaryPath, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("A Desktop Workspace preference already exists.", {
          cause: error,
        });
      }
      throw error;
    }
    await unlink(temporaryPath);
    promoted = true;
    const directoryHandle = await open(parent, "r");
    try {
      await directoryHandle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") {
        throw error;
      }
    } finally {
      await directoryHandle.close();
    }
  } finally {
    if (!promoted) {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
};

export const persistInitialWorkspacePreference = async ({
  preferencesPath,
  workspaceRoot: rawWorkspaceRoot,
  writeAtomic = writeAppPreferencesAtomic,
}: {
  readonly preferencesPath: string;
  readonly workspaceRoot: string;
  readonly writeAtomic?: AtomicPreferencesWriter;
}): Promise<
  Readonly<{ preferences: DesktopPreferences; written: boolean }>
> => {
  if (!isAbsolute(rawWorkspaceRoot)) {
    throw new Error("Initial Workspace preference must be absolute.");
  }
  const workspaceRoot = resolve(rawWorkspaceRoot);
  const existing = await loadAppPreferences({ preferencesPath });
  if (existing !== null) {
    if (resolve(existing.workspaceRoot) !== workspaceRoot) {
      throw new Error(
        "Workspace switching is unavailable in Phase A; a Workspace authority already exists.",
      );
    }
    return { preferences: existing, written: false };
  }
  const preferences = DesktopPreferencesSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREFERENCES_CONTRACT_VERSION,
    workspaceRoot,
  });
  await writeAtomic({
    destination: preferencesPath,
    bytes: `${JSON.stringify(preferences, null, 2)}\n`,
  });
  const persisted = await loadAppPreferences({ preferencesPath });
  if (persisted === null || persisted.workspaceRoot !== workspaceRoot) {
    throw new Error("Desktop preferences atomic verification failed.");
  }
  return { preferences: persisted, written: true };
};
