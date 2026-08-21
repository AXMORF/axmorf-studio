import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import {
  DEFAULT_EXECUTION_PREFERENCES,
  ExecutionPreferencesSchema,
  type ExecutionPreferenceSource,
  type ExecutionPreferences,
} from "../../settings/contracts/execution-preferences";

export const DEFAULT_EXECUTION_PREFERENCES_REPOSITORY_PATH =
  "private/execution-preferences.json" as const;

export const resolveExecutionPreferencesPath = ({
  rootDir,
}: {
  readonly rootDir: string;
}) => join(rootDir, DEFAULT_EXECUTION_PREFERENCES_REPOSITORY_PATH);

export const loadExecutionPreferences = async ({
  preferencesPath,
}: {
  readonly preferencesPath: string;
}): Promise<
  Readonly<{
    preferences: ExecutionPreferences;
    source: ExecutionPreferenceSource;
  }>
> => {
  if (!isAbsolute(preferencesPath)) {
    throw new Error("Execution preferences path must be absolute.");
  }
  let metadata;
  try {
    metadata = await lstat(preferencesPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        preferences: DEFAULT_EXECUTION_PREFERENCES,
        source: "builtin-default",
      };
    }
    throw new Error("Execution preferences are unreadable.", { cause: error });
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Execution preferences must be a regular file.");
  }
  try {
    return {
      preferences: ExecutionPreferencesSchema.parse(
        JSON.parse(await readFile(preferencesPath, "utf8")),
      ),
      source: "settings",
    };
  } catch (error) {
    throw new Error("Execution preferences are malformed or invalid.", {
      cause: error,
    });
  }
};

export const writeExecutionPreferences = async ({
  preferencesPath,
  value,
}: {
  readonly preferencesPath: string;
  readonly value: unknown;
}) => {
  if (!isAbsolute(preferencesPath)) {
    throw new Error("Execution preferences path must be absolute.");
  }
  const preferences = ExecutionPreferencesSchema.parse(value);
  await mkdir(dirname(preferencesPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${preferencesPath}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(preferences, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    await rename(temporaryPath, preferencesPath);
    await chmod(preferencesPath, 0o600);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return preferences;
};
