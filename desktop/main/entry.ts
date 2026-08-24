import {
  MessageChannelMain,
  app,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  shell,
  utilityProcess,
  type MessagePortMain,
} from "electron";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadAppPreferences,
  persistInitialWorkspacePreference,
  resolveDesktopPreferencesPath,
} from "../adapters/app-preferences";
import {
  loadWorkspaceMigrationRecoveryPointer,
  removeWorkspaceMigrationRecoveryPointer,
  writeWorkspaceMigrationRecoveryPointer,
} from "../adapters/workspace-migration-recovery";
import { createWorkspacePreferenceSwitcher } from "../adapters/workspace-preference-switch";
import { workspaceHasActiveProduction } from "../adapters/workspace-migration-filesystem";
import {
  locateEmbeddedRuntimePack,
  verifyRuntimePack,
} from "../adapters/runtime-pack-filesystem";
import {
  readDesktopPrivateConfig,
  writeDesktopPrivateConfig,
} from "../adapters/private-config-store";
import {
  DesktopSettingsSecureStoreError,
  createDesktopSettingsSnapshot,
  mergeDesktopSettingsSaveRequest,
} from "../application/manage-settings";
import { resolveDefaultWorkspaceRoot } from "../application/resolve-workspace-selection";
import {
  completeWorkspaceRootMigration,
  migrateWorkspaceRoot,
  recoverWorkspaceMigration,
  rollbackWorkspaceRootMigration,
} from "../application/migrate-workspace";
import { DESKTOP_MEDIA_SCHEME } from "../contracts/preview";
import { createDesktopWindow } from "./create-window";
import {
  createUtilityProcessDesktopEnginePort,
  desktopEngineForkOptions,
  type DesktopUtilityProcess,
} from "./engine-port";
import {
  registerDesktopTerminationSignal,
  startDesktopLifecycle,
} from "./lifecycle";
import {
  DesktopMediaProtocol,
  registerDesktopMediaProtocol,
} from "./media-protocol";
import { initializeDesktopRuntimeResources } from "./initialize-runtime";
import { registerDesktopShellIpc } from "./register-ipc";
import { DesktopShellController } from "./shell-controller";
import {
  createNativeSmokePrivateConfigCrypto,
  resolveNativeSmokeOptions,
  runPackagedNativeSmoke,
  writeNativeSmokeEngineDiagnostic,
  writeNativeSmokeFailure,
  writeNativeSmokeStartupStage,
  type NativeSmokeOptions,
  type NativeSmokeStartupStage,
} from "./native-smoke-port";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
export const DESKTOP_MAIN_ENTRY_ID = "desktop-main-phase-b-v1" as const;
registerDesktopTerminationSignal({ app, signal: process });
const nativeSmoke: NativeSmokeOptions | null = resolveNativeSmokeOptions({
  isPackaged: app.isPackaged,
});
if (nativeSmoke !== null) {
  app.setPath("home", nativeSmoke.homeRoot);
  app.setPath("userData", nativeSmoke.userDataRoot);
}
const recordNativeStartupStage = async (stage: NativeSmokeStartupStage) => {
  if (nativeSmoke === null) return;
  await writeNativeSmokeStartupStage({ options: nativeSmoke, stage });
};
void recordNativeStartupStage("main-loaded");

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
  if (nativeSmoke !== null) {
    if (
      nativeSmoke.selection === "default" &&
      nativeSmoke.workspaceRoot !== defaultRoot
    ) {
      throw new Error("desktop-native-smoke-default-workspace-drift");
    }
    return nativeSmoke.workspaceRoot;
  }
  const decision = await dialog.showMessageBox({
    type: "question",
    title: "选择唯一 Workspace",
    message: "AXMORF Studio 只使用一个 Workspace Root。",
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
  const standardOptions = desktopEngineForkOptions(process.resourcesPath);
  const child = utilityProcess.fork(
    modulePath,
    [],
    nativeSmoke === null
      ? standardOptions
      : { ...standardOptions, stdio: ["ignore", "ignore", "pipe"] },
  );
  if (nativeSmoke !== null && child.stderr !== null) {
    const chunks: Buffer[] = [];
    let size = 0;
    child.stderr.on("data", (rawChunk: Buffer | string) => {
      if (size >= 16_384) return;
      const chunk = Buffer.from(rawChunk);
      const retained = chunk.subarray(0, 16_384 - size);
      chunks.push(retained);
      size += retained.byteLength;
    });
    child.once("exit", (code) => {
      void writeNativeSmokeEngineDiagnostic({
        code,
        options: nativeSmoke,
        stderr: Buffer.concat(chunks).toString("utf8"),
      });
    });
  }
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

let nativeRuntime: Readonly<{
  window: Awaited<ReturnType<typeof createDesktopWindow>>["window"];
  controller: DesktopShellController;
  media: DesktopMediaProtocol;
}> | null = null;

void startDesktopLifecycle({
  app,
  createRuntime: async () => {
    await recordNativeStartupStage("lifecycle-create-runtime");
    const appResourcesRoot = process.resourcesPath;
    const applicationSupportRoot = app.getPath("userData");
    const cacheRoot = resolve(
      app.getPath("appData"),
      "../Caches/com.axmorf.studio",
    );
    const defaultWorkspaceRoot = resolveDefaultWorkspaceRoot({
      homeDirectory: app.getPath("home"),
    });
    const preferencesPath = resolveDesktopPreferencesPath({
      applicationSupportRoot: app.getPath("userData"),
    });
    const integrationResourcesRoot = join(
      appResourcesRoot,
      "workspace-integration",
    );
    const runtimePackRoot = locateEmbeddedRuntimePack(appResourcesRoot);
    const preferenceSwitcher = createWorkspacePreferenceSwitcher({
      preferencesPath,
    });
    const readWorkspacePreference = async () => {
      const preferences = await loadAppPreferences({ preferencesPath });
      if (preferences === null) {
        throw new Error("Workspace preference is unavailable.");
      }
      return preferences.workspaceRoot;
    };
    const clearMigrationRecovery = (migrationId: string) =>
      removeWorkspaceMigrationRecoveryPointer({
        applicationSupportRoot,
        migrationId,
      });
    const migrationRuntime = async () => {
      const runtimePack = await verifyRuntimePack({ runtimePackRoot });
      return {
        rspExecutable: {
          path: join(runtimePackRoot, runtimePack.rspClient.relativePath),
          sha256: runtimePack.rspClient.sha256,
        },
      } as const;
    };
    await recordNativeStartupStage("recovery-read-start");
    const pendingRecovery = await loadWorkspaceMigrationRecoveryPointer({
      applicationSupportRoot,
    });
    await recordNativeStartupStage("recovery-read-complete");
    if (pendingRecovery !== null) {
      const runtime = await migrationRuntime();
      await recoverWorkspaceMigration({
        parentRoot: pendingRecovery.parentRoot,
        migrationRoot: pendingRecovery.migrationRoot,
        sourceWorkspaceRoot: pendingRecovery.sourceWorkspaceRoot,
        targetWorkspaceRoot: pendingRecovery.targetWorkspaceRoot,
        integrationResourcesRoot,
        rspExecutable: runtime.rspExecutable,
        readPreference: readWorkspacePreference,
        switchPreference: preferenceSwitcher,
        clearRecovery: clearMigrationRecovery,
      });
    }
    const media = new DesktopMediaProtocol();
    const unregisterMedia = registerDesktopMediaProtocol({ protocol, media });
    const privateConfigCrypto =
      nativeSmoke === null
        ? {
            available: () => safeStorage.isEncryptionAvailable(),
            encrypt: (plaintext: string) => safeStorage.encryptString(plaintext),
            decrypt: (ciphertext: Uint8Array) =>
              safeStorage.decryptString(Buffer.from(ciphertext)),
          }
        : createNativeSmokePrivateConfigCrypto();
    const loadDesktopConfiguration = async () => {
      if (!privateConfigCrypto.available()) {
        return { privateConfig: null, provider: "unavailable" as const };
      }
      try {
        const privateConfig = await readDesktopPrivateConfig({
          applicationSupportRoot,
          crypto: privateConfigCrypto,
        });
        return privateConfig === null
          ? { privateConfig: null, provider: "not-configured" as const }
          : { privateConfig, provider: "ready" as const };
      } catch {
        return { privateConfig: null, provider: "unavailable" as const };
      }
    };
    const loadSettingsSnapshot = async () => {
      const loaded = await loadDesktopConfiguration();
      return createDesktopSettingsSnapshot({
        privateConfig: loaded.privateConfig,
        status: loaded.provider,
      });
    };
    const engine = createUtilityProcessDesktopEnginePort({
      appResourcesRoot,
      applicationSupportRoot,
      cacheRoot,
      modulePath: join(__dirname, "engine.js"),
      loadDesktopConfiguration,
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
        chooseMigrationTarget: async (workspaceRoot) => {
          const selected = await dialog.showOpenDialog({
            title: "选择新 Workspace 的父文件夹",
            defaultPath: dirname(workspaceRoot),
            buttonLabel: "迁移到这里",
            properties: ["openDirectory", "createDirectory"],
          });
          if (selected.canceled || selected.filePaths[0] === undefined) {
            return null;
          }
          return join(resolve(selected.filePaths[0]), basename(workspaceRoot));
        },
        migrateRoot: async (sourceWorkspaceRoot, targetWorkspaceRoot) => {
          const runtime = await migrationRuntime();
          const result = await migrateWorkspaceRoot({
            sourceWorkspaceRoot,
            targetWorkspaceRoot,
            integrationResourcesRoot,
            rspExecutable: runtime.rspExecutable,
            activeWork: workspaceHasActiveProduction,
            homeDirectory: app.getPath("home"),
            forbiddenRoots: [
              appResourcesRoot,
              applicationSupportRoot,
              cacheRoot,
              runtimePackRoot,
            ],
            readPreference: readWorkspacePreference,
            switchPreference: preferenceSwitcher,
            writeRecovery: async (pointer) =>
              writeWorkspaceMigrationRecoveryPointer({
                applicationSupportRoot,
                pointer: {
                  schemaVersion: 1,
                  contractVersion: "desktop-workspace-migration-recovery-v1",
                  ...pointer,
                },
              }),
            removeRecovery: clearMigrationRecovery,
          });
          if (result.pending === null) {
            return {
              workspaceRoot: sourceWorkspaceRoot,
              complete: async () => undefined,
              rollback: async () => undefined,
            };
          }
          return {
            workspaceRoot: result.pending.targetWorkspaceRoot,
            complete: () =>
              completeWorkspaceRootMigration({
                pending: result.pending!,
                removeRecovery: clearMigrationRecovery,
              }),
            rollback: () =>
              rollbackWorkspaceRootMigration({
                pending: result.pending!,
                readPreference: readWorkspacePreference,
                switchPreference: preferenceSwitcher,
                removeRecovery: clearMigrationRecovery,
              }),
          };
        },
        showInFileManager: async (workspaceRoot) => {
          shell.showItemInFolder(workspaceRoot);
        },
      },
      settings: {
        get: loadSettingsSnapshot,
        save: async (request) => {
          if (!privateConfigCrypto.available()) {
            throw new Error("Desktop credential encryption is unavailable.");
          }
          let current: Awaited<ReturnType<typeof readDesktopPrivateConfig>>;
          try {
            current = await readDesktopPrivateConfig({
              applicationSupportRoot,
              crypto: privateConfigCrypto,
            });
          } catch (error) {
            throw new DesktopSettingsSecureStoreError("read", {
              cause: error,
            });
          }
          const privateConfig = mergeDesktopSettingsSaveRequest({
            current,
            request,
          });
          try {
            await writeDesktopPrivateConfig({
              applicationSupportRoot,
              crypto: privateConfigCrypto,
              value: privateConfig,
            });
          } catch (error) {
            throw new DesktopSettingsSecureStoreError("write", {
              cause: error,
            });
          }
          return createDesktopSettingsSnapshot({ privateConfig });
        },
      },
      engine,
      media,
    });
    const initialized = await initializeDesktopRuntimeResources({
      bootstrapController: async () => {
        await recordNativeStartupStage("bootstrap-start");
        await controller.bootstrap();
        await recordNativeStartupStage("bootstrap-complete");
      },
      shutdownController: controller.shutdown,
      createWindow: async () => {
        await recordNativeStartupStage("window-load-start");
        const desktopWindow = await createDesktopWindow({
          shellDocumentUrl: shellDocumentUrl(),
        });
        await recordNativeStartupStage("window-load-complete");
        return desktopWindow;
      },
      registerIpc: (desktopWindow) =>
        registerDesktopShellIpc({
          ipcMain,
          trustedSenderRules: desktopWindow.trustedSenderRules,
          controller,
        }),
      unregisterMedia,
    });
    const desktopWindow = initialized.desktopWindow;
    nativeRuntime = {
      window: desktopWindow.window,
      controller,
      media,
    };
    await recordNativeStartupStage("runtime-created");
    return {
      window: desktopWindow.window,
      controller,
      confirmQuit: async () => {
        if (nativeSmoke !== null) return true;
        return (
          await dialog.showMessageBox(desktopWindow.window, {
            type: "warning",
            title: "退出 AXMORF Studio？",
            message: "退出会停止当前 Desktop Engine。",
            buttons: ["继续运行", "退出"],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          })
        ).response === 1;
      },
      dispose: initialized.dispose,
    };
  },
})
  .then(async () => {
    if (nativeSmoke === null || nativeRuntime === null) return;
    await recordNativeStartupStage("lifecycle-ready");
    await recordNativeStartupStage("native-smoke-started");
    await runPackagedNativeSmoke({
      app,
      ...nativeRuntime,
      options: nativeSmoke,
    });
  })
  .catch(async (error: unknown) => {
    if (nativeSmoke !== null) {
      await writeNativeSmokeFailure({ error, options: nativeSmoke });
      app.exit(1);
      return;
    }
    app.quit();
  });
