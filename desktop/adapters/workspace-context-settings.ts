import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  WorkspaceProjectControlSettingsSchema,
  type WorkspaceProjectControlSettings,
} from "../contracts/workspace-context";
import { StoryIdSchema } from "../../src/contracts";
import {
  DEFAULT_EXECUTION_PREFERENCES,
  ExecutionPreferencesSchema,
  type ExecutionPreferenceSource,
  type ExecutionPreferences,
} from "../../settings/contracts/execution-preferences";

export const WORKSPACE_EXECUTION_PREFERENCES_FILE =
  "execution-preferences.json" as const;
export const WORKSPACE_PROJECT_SETTINGS_DIRECTORY =
  "project-settings" as const;

const optionalMetadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const contained = (root: string, candidate: string) => {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
};

const assertPrivateRoot = async (rawRoot: string) => {
  const root = resolve(rawRoot);
  const metadata = await lstat(root);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    (await realpath(root)) !== root
  ) {
    throw new Error("Workspace control settings root must be a real directory.");
  }
  return root;
};

const readOptionalOwnerOnlyJson = async ({
  root,
  path,
  label,
}: {
  readonly root: string;
  readonly path: string;
  readonly label: string;
}) => {
  if (!contained(root, path)) {
    throw new Error(`${label} path escaped its private root.`);
  }
  const parentPath = dirname(path);
  const parentMetadata = await optionalMetadata(parentPath);
  if (parentMetadata === null) return null;
  if (
    parentMetadata.isSymbolicLink() ||
    !parentMetadata.isDirectory() ||
    (await realpath(parentPath)) !== parentPath
  ) {
    throw new Error(`${label} parent must be a real directory.`);
  }
  const metadata = await optionalMetadata(path);
  if (metadata === null) return null;
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error(`${label} must be an owner-only regular file.`);
  }
  const before = metadata;
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error(`${label} changed while being read.`);
  }
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} is malformed.`, { cause: error });
  }
};

export const loadWorkspaceExecutionPreferences = async ({
  privateConfigRoot,
}: {
  readonly privateConfigRoot: string;
}): Promise<
  Readonly<{
    preferences: ExecutionPreferences;
    source: ExecutionPreferenceSource;
  }>
> => {
  const root = await assertPrivateRoot(privateConfigRoot);
  const raw = await readOptionalOwnerOnlyJson({
    root,
    path: join(root, WORKSPACE_EXECUTION_PREFERENCES_FILE),
    label: "Workspace execution preferences",
  });
  return raw === null
    ? {
        preferences: DEFAULT_EXECUTION_PREFERENCES,
        source: "builtin-default",
      }
    : {
        preferences: ExecutionPreferencesSchema.parse(raw),
        source: "settings",
      };
};

export const loadWorkspaceProjectControlSettings = async ({
  privateConfigRoot,
  storyId: rawStoryId,
}: {
  readonly privateConfigRoot: string;
  readonly storyId: string;
}): Promise<WorkspaceProjectControlSettings | null> => {
  const [root, storyId] = await Promise.all([
    assertPrivateRoot(privateConfigRoot),
    Promise.resolve(StoryIdSchema.parse(rawStoryId)),
  ]);
  const raw = await readOptionalOwnerOnlyJson({
    root,
    path: join(root, WORKSPACE_PROJECT_SETTINGS_DIRECTORY, `${storyId}.json`),
    label: "Workspace Project control settings",
  });
  if (raw === null) return null;
  const settings = WorkspaceProjectControlSettingsSchema.parse(raw);
  if (settings.storyId !== storyId) {
    throw new Error("Workspace Project control settings identity is stale.");
  }
  return settings;
};
