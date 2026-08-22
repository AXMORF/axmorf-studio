import { contextBridge, ipcRenderer } from "electron";

import {
  DESKTOP_SHELL_IPC_CHANNELS,
  type DesktopShellApi,
} from "../contracts/shell";

export const DESKTOP_PRELOAD_ENTRY_ID = "desktop-preload-phase-a-v1" as const;

export const createDesktopShellApi = (
  invoke: (channel: string, ...args: readonly unknown[]) => Promise<unknown>,
): DesktopShellApi =>
  Object.freeze({
    getAppState: () =>
      invoke(DESKTOP_SHELL_IPC_CHANNELS.getAppState) as ReturnType<
        DesktopShellApi["getAppState"]
      >,
    chooseInitialWorkspace: () =>
      invoke(DESKTOP_SHELL_IPC_CHANNELS.chooseInitialWorkspace) as ReturnType<
        DesktopShellApi["chooseInitialWorkspace"]
      >,
    showWorkspaceInFinder: () =>
      invoke(DESKTOP_SHELL_IPC_CHANNELS.showWorkspaceInFinder) as ReturnType<
        DesktopShellApi["showWorkspaceInFinder"]
      >,
    refreshPreviewCatalog: () =>
      invoke(DESKTOP_SHELL_IPC_CHANNELS.refreshPreviewCatalog) as ReturnType<
        DesktopShellApi["refreshPreviewCatalog"]
      >,
    selectPreview: (storyId) =>
      invoke(DESKTOP_SHELL_IPC_CHANNELS.selectPreview, storyId) as ReturnType<
        DesktopShellApi["selectPreview"]
      >,
    retryEngine: () =>
      invoke(DESKTOP_SHELL_IPC_CHANNELS.retryEngine) as ReturnType<
        DesktopShellApi["retryEngine"]
      >,
  });

contextBridge.exposeInMainWorld(
  "axmorfStudio",
  createDesktopShellApi((channel, ...args) =>
    ipcRenderer.invoke(channel, ...args),
  ),
);
