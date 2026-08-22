import {
  MessageChannelMain,
  app,
  dialog,
  ipcMain,
  protocol,
  shell,
  utilityProcess,
  type MessagePortMain,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadAppPreferences,
  persistInitialWorkspacePreference,
  resolveDesktopPreferencesPath,
} from "../adapters/app-preferences";
import { resolveDefaultWorkspaceRoot } from "../application/resolve-workspace-selection";
import { DESKTOP_MEDIA_SCHEME } from "../contracts/preview";
import { createDesktopWindow } from "./create-window";
import {
  createUtilityProcessDesktopEnginePort,
  type DesktopUtilityProcess,
} from "./engine-port";
import { startDesktopLifecycle } from "./lifecycle";
import {
  DesktopMediaProtocol,
  registerDesktopMediaProtocol,
} from "./media-protocol";
import { initializeDesktopRuntimeResources } from "./initialize-runtime";
import { registerDesktopShellIpc } from "./register-ipc";
import { DesktopShellController } from "./shell-controller";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const DESKTOP_PHASE_A_REPOSITORY_ROOT: string;

export const DESKTOP_MAIN_ENTRY_ID = "desktop-main-phase-a-v1" as const;
export const DESKTOP_REPOSITORY_ROOT = DESKTOP_PHASE_A_REPOSITORY_ROOT;

protocol.registerSchemesAsPrivileged([
  {
    scheme: DESKTOP_MEDIA_SCHEME,
    privileges: {
      secure: true,
      stream: true,
      standard: false,
      bypassCSP: false,
      allowServiceWorkers: false,
      supportFetchAPI: false,
      corsEnabled: false,
      codeCache: false,
      allowExtensions: false,
    },
  },
]);

const shellDocumentUrl = () =>
  MAIN_WINDOW_VITE_DEV_SERVER_URL ??
  pathToFileURL(
    join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  ).href;

const chooseInitialWorkspace = async (defaultRoot: string) => {
  const decision = await dialog.showMessageBox({
    type: "question",
    title: "选择唯一 Workspace",
    message: "AXMORF Studio Phase A 只使用一个 Workspace Root。",
    detail: defaultRoot,
    buttons: ["使用默认位置", "选择其他文件夹", "取消"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (decision.response === 0) return defaultRoot;
  if (decision.response !== 1) return null;
  const selected = await dialog.showOpenDialog({
    title: "选择 AXMORF Studio Workspace",
    defaultPath: defaultRoot,
    properties: ["openDirectory", "createDirectory"],
  });
  return selected.canceled ? null : (selected.filePaths[0] ?? null);
};

const forkDesktopEngine = (modulePath: string): DesktopUtilityProcess => {
  const child = utilityProcess.fork(modulePath, [], {
    cwd: DESKTOP_REPOSITORY_ROOT,
    serviceName: "AXMORF Studio Engine",
    stdio: "ignore",
  });
  return {
    get pid() {
      return child.pid;
    },
    on: child.on.bind(child) as DesktopUtilityProcess["on"],
    off: child.off.bind(child) as DesktopUtilityProcess["off"],
    postMessage: (message, transfer) =>
      child.postMessage(message, transfer as MessagePortMain[] | undefined),
    kill: () => child.kill(),
  };
};

void startDesktopLifecycle({
  app,
  createRuntime: async () => {
    const repositoryRoot = DESKTOP_REPOSITORY_ROOT;
    const defaultWorkspaceRoot = resolveDefaultWorkspaceRoot({
      homeDirectory: app.getPath("home"),
    });
    const preferencesPath = resolveDesktopPreferencesPath({
      applicationSupportRoot: app.getPath("userData"),
    });
    const media = new DesktopMediaProtocol(repositoryRoot);
    const unregisterMedia = registerDesktopMediaProtocol({ protocol, media });
    const engine = createUtilityProcessDesktopEnginePort({
      repositoryRoot,
      modulePath: join(__dirname, "engine.js"),
      utilityProcess: { fork: forkDesktopEngine },
      MessageChannelMain,
    });
    const controller = new DesktopShellController({
      defaultWorkspaceRoot,
      workspace: {
        loadSelectedRoot: async () =>
          (await loadAppPreferences({ preferencesPath }))?.workspaceRoot ??
          null,
        chooseInitialRoot: chooseInitialWorkspace,
        initializeInitialRoot: async (workspaceRoot) =>
          (
            await persistInitialWorkspacePreference({
              preferencesPath,
              workspaceRoot,
            })
          ).preferences.workspaceRoot,
        showInFileManager: async (workspaceRoot) => {
          shell.showItemInFolder(workspaceRoot);
        },
      },
      engine,
      media,
    });
    const initialized = await initializeDesktopRuntimeResources({
      bootstrapController: controller.bootstrap,
      shutdownController: controller.shutdown,
      createWindow: () =>
        createDesktopWindow({ shellDocumentUrl: shellDocumentUrl() }),
      registerIpc: (desktopWindow) =>
        registerDesktopShellIpc({
          ipcMain,
          trustedSenderRules: desktopWindow.trustedSenderRules,
          controller,
        }),
      unregisterMedia,
    });
    const desktopWindow = initialized.desktopWindow;
    return {
      window: desktopWindow.window,
      controller,
      confirmQuit: async () =>
        (
          await dialog.showMessageBox(desktopWindow.window, {
            type: "warning",
            title: "退出 AXMORF Studio？",
            message: "退出会停止当前 Desktop Engine。",
            buttons: ["继续运行", "退出"],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          })
        ).response === 1,
      dispose: initialized.dispose,
    };
  },
}).catch(() => {
  app.quit();
});
