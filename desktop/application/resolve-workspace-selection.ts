import { lstat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { loadAppPreferences } from "../adapters/app-preferences";
import type { WorkspacePreferenceSwitcher } from "./migrate-workspace";

export const resolveDefaultWorkspaceRoot = ({
  videosDirectory,
}: {
  readonly videosDirectory: string;
}) => {
  if (!isAbsolute(videosDirectory)) {
    throw new Error("Videos directory must be absolute.");
  }
  return join(resolve(videosDirectory), "AXMORF Studio");
};

export const resolveLegacyDefaultWorkspaceRoot = ({
  homeDirectory,
}: {
  readonly homeDirectory: string;
}) => {
  if (!isAbsolute(homeDirectory)) {
    throw new Error("Home directory must be absolute.");
  }
  return join(resolve(homeDirectory), "Movies", "AXMORF Studio");
};

const pathExists = async (path: string) => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const repairMissingLegacyLinuxWorkspacePreference = async ({
  homeDirectory,
  videosDirectory,
  preferencesPath,
  switchPreference,
  exists = pathExists,
}: {
  readonly homeDirectory: string;
  readonly videosDirectory: string;
  readonly preferencesPath: string;
  readonly switchPreference: WorkspacePreferenceSwitcher;
  readonly exists?: (path: string) => Promise<boolean>;
}) => {
  const preferences = await loadAppPreferences({ preferencesPath });
  if (preferences === null) return null;
  const legacyWorkspaceRoot = resolveLegacyDefaultWorkspaceRoot({
    homeDirectory,
  });
  const workspaceRoot = resolveDefaultWorkspaceRoot({ videosDirectory });
  if (
    workspaceRoot === legacyWorkspaceRoot ||
    resolve(preferences.workspaceRoot) !== legacyWorkspaceRoot ||
    (await exists(legacyWorkspaceRoot)) ||
    (await exists(workspaceRoot))
  ) {
    return preferences.workspaceRoot;
  }
  await switchPreference({
    expectedWorkspaceRoot: legacyWorkspaceRoot,
    nextWorkspaceRoot: workspaceRoot,
  });
  return workspaceRoot;
};

export type WorkspaceSelection = Readonly<{
  workspaceRoot: string;
  source: "saved" | "custom-initial" | "builtin-default";
  initialized: boolean;
  canChooseInitialWorkspace: boolean;
}>;

export const resolveWorkspaceSelection = async ({
  videosDirectory,
  preferencesPath,
  requestedWorkspaceRoot,
}: {
  readonly videosDirectory: string;
  readonly preferencesPath: string;
  readonly requestedWorkspaceRoot?: string;
}): Promise<WorkspaceSelection> => {
  const saved = await loadAppPreferences({ preferencesPath });
  if (saved !== null) {
    if (
      requestedWorkspaceRoot !== undefined &&
      (!isAbsolute(requestedWorkspaceRoot) ||
        resolve(requestedWorkspaceRoot) !== resolve(saved.workspaceRoot))
    ) {
      throw new Error(
        "Workspace switching is unavailable after initial selection; the saved Workspace remains authoritative.",
      );
    }
    return {
      workspaceRoot: resolve(saved.workspaceRoot),
      source: "saved",
      initialized: true,
      canChooseInitialWorkspace: false,
    };
  }

  if (requestedWorkspaceRoot !== undefined) {
    if (!isAbsolute(requestedWorkspaceRoot)) {
      throw new Error("Initial Workspace selection must be absolute.");
    }
    return {
      workspaceRoot: resolve(requestedWorkspaceRoot),
      source: "custom-initial",
      initialized: false,
      canChooseInitialWorkspace: true,
    };
  }

  return {
    workspaceRoot: resolveDefaultWorkspaceRoot({ videosDirectory }),
    source: "builtin-default",
    initialized: false,
    canChooseInitialWorkspace: true,
  };
};
