import { isAbsolute, join, resolve } from "node:path";

import { loadAppPreferences } from "../adapters/app-preferences";

export const resolveDefaultWorkspaceRoot = ({
  homeDirectory,
}: {
  readonly homeDirectory: string;
}) => {
  if (!isAbsolute(homeDirectory)) {
    throw new Error("Home directory must be absolute.");
  }
  return join(resolve(homeDirectory), "Movies", "AXMORF Studio");
};

export type WorkspaceSelection = Readonly<{
  workspaceRoot: string;
  source: "saved" | "custom-initial" | "builtin-default";
  initialized: boolean;
  canChooseInitialWorkspace: boolean;
}>;

export const resolveWorkspaceSelection = async ({
  homeDirectory,
  preferencesPath,
  requestedWorkspaceRoot,
}: {
  readonly homeDirectory: string;
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
        "Workspace switching is unavailable in Phase A; the saved Workspace remains authoritative.",
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
    workspaceRoot: resolveDefaultWorkspaceRoot({ homeDirectory }),
    source: "builtin-default",
    initialized: false,
    canChooseInitialWorkspace: true,
  };
};
