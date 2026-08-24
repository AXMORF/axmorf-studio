import { z } from "zod";

import {
  DesktopSettingsSecureStoreError,
  desktopSettingsError,
} from "../application/manage-settings";
import {
  DesktopAppStateSchema,
  DESKTOP_SHELL_IPC_CHANNELS,
} from "../contracts/shell";
import {
  DesktopSettingsSaveRequestSchema,
  DesktopSettingsSaveResultSchema,
  DesktopSettingsSnapshotSchema,
} from "../contracts/settings";
import { isAllowedNavigation } from "./navigation-policy";
import {
  DesktopSettingsEngineRestartError,
  type DesktopShellController,
} from "./shell-controller";

type IpcEvent = Readonly<{
  sender: Readonly<{ id: number; mainFrame: unknown }>;
  senderFrame: Readonly<{ url: string }> | null;
}>;

export type IpcMainPort = Readonly<{
  handle: (
    channel: string,
    listener: (event: IpcEvent, ...args: readonly unknown[]) => unknown,
  ) => void;
  removeHandler: (channel: string) => void;
}>;

const validateSender = (
  event: IpcEvent,
  trustedSenderRules: ReadonlyMap<
    number,
    Readonly<{ shellDocumentUrl: string }>
  >,
) => {
  const senderRule = trustedSenderRules.get(event.sender.id);
  if (
    event.senderFrame === null ||
    event.senderFrame !== event.sender.mainFrame ||
    senderRule === undefined ||
    !isAllowedNavigation(event.senderFrame.url, senderRule.shellDocumentUrl)
  ) {
    throw new Error("desktop-ipc-denied");
  }
};

export const mapDesktopSettingsFailure = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return desktopSettingsError({
      code: "desktop-settings-validation-failed",
      message: "配置字段未通过严格校验。",
      action: "按字段提示修正后再次保存。",
      error,
    });
  }
  if (error instanceof DesktopSettingsEngineRestartError) {
    return desktopSettingsError({
      code: "desktop-settings-engine-restart-failed",
      message: "配置已安全保存，但 Desktop Engine 未能重新启动。",
      action: "检查 Runtime 与 Provider 配置后点击“重试 Engine”；配置页面仍可继续修改。",
    });
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "desktop-settings-active-work") {
    return desktopSettingsError({
      code: "desktop-settings-active-work",
      message: "当前制作或 Delivery 仍在运行，不能切换配置。",
      action: "等待 active work 结束后再次保存。",
    });
  }
  if (/encryption is unavailable/iu.test(message)) {
    return desktopSettingsError({
      code: "desktop-settings-encryption-unavailable",
      message: "macOS 安全存储当前不可用，配置没有写入。",
      action: "解锁当前登录会话并重新打开 AXMORF Studio 后再试。",
    });
  }
  if (error instanceof DesktopSettingsSecureStoreError) {
    return desktopSettingsError({
      code: `desktop-settings-secure-store-${error.operation}-failed`,
      message:
        error.operation === "read"
          ? "现有加密配置无法安全读取，Desktop 没有覆盖任何内容。"
          : "加密配置无法安全写入，Desktop 保留了上一次有效设置。",
      action:
        error.operation === "read"
          ? "检查 AXMORF Studio Application Support 的当前用户所有权与文件完整性后再试。"
          : "确认 Application Support 可写且归当前用户所有，然后再次保存。",
    });
  }
  if (
    /private config|application support|owner-only|canonical|identity changed/iu.test(
      message,
    )
  ) {
    return desktopSettingsError({
      code: "desktop-settings-secure-store-invalid",
      message: "加密配置存储的权限或文件身份不安全，配置没有写入。",
      action: "恢复 AXMORF Studio Application Support 的当前用户所有权后再试。",
    });
  }
  return desktopSettingsError({
    code: "desktop-settings-save-failed",
    message: "配置没有写入，Desktop 保留了上一次有效设置。",
    action: "检查字段提示；若问题持续，重新打开 App 后再试。",
  });
};

export const registerDesktopShellIpc = ({
  ipcMain,
  trustedSenderRules,
  controller,
}: Readonly<{
  ipcMain: IpcMainPort;
  trustedSenderRules: ReadonlyMap<
    number,
    Readonly<{ shellDocumentUrl: string }>
  >;
  controller: DesktopShellController;
}>) => {
  const registeredChannels: string[] = [];
  let disposed = false;
  const register = (
    channel: string,
    listener: (event: IpcEvent, ...args: readonly unknown[]) => unknown,
  ) => {
    ipcMain.handle(channel, listener);
    registeredChannels.push(channel);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const channel of [...registeredChannels].reverse()) {
      ipcMain.removeHandler(channel);
    }
  };
  const registerStateMethod = (
    channel: string,
    argumentCount: number,
    invoke: (...args: readonly unknown[]) => Promise<unknown> | unknown,
  ) => {
    register(channel, async (event, ...args) => {
      validateSender(event, trustedSenderRules);
      if (args.length !== argumentCount) {
        throw new Error("desktop-ipc-arguments-invalid");
      }
      return DesktopAppStateSchema.parse(await invoke(...args));
    });
  };

  try {
    registerStateMethod(DESKTOP_SHELL_IPC_CHANNELS.getAppState, 0, () =>
      controller.getState(),
    );
    registerStateMethod(
      DESKTOP_SHELL_IPC_CHANNELS.chooseInitialWorkspace,
      0,
      controller.chooseInitialWorkspace,
    );
    register(
      DESKTOP_SHELL_IPC_CHANNELS.showWorkspaceInFinder,
      async (event, ...args) => {
        validateSender(event, trustedSenderRules);
        if (args.length !== 0) {
          throw new Error("desktop-ipc-arguments-invalid");
        }
        await controller.showWorkspaceInFinder();
      },
    );
    registerStateMethod(
      DESKTOP_SHELL_IPC_CHANNELS.migrateWorkspace,
      0,
      controller.migrateWorkspace,
    );
    registerStateMethod(
      DESKTOP_SHELL_IPC_CHANNELS.refreshPreviewCatalog,
      0,
      controller.refreshPreviewCatalog,
    );
    registerStateMethod(
      DESKTOP_SHELL_IPC_CHANNELS.selectPreview,
      1,
      (...args) => {
        if (typeof args[0] !== "string") {
          throw new Error("desktop-ipc-arguments-invalid");
        }
        return controller.selectPreview(args[0]);
      },
    );
    registerStateMethod(
      DESKTOP_SHELL_IPC_CHANNELS.buildDelivery,
      1,
      (...args) => {
        if (typeof args[0] !== "string") {
          throw new Error("desktop-ipc-arguments-invalid");
        }
        return controller.buildDelivery(args[0]);
      },
    );
    register(
      DESKTOP_SHELL_IPC_CHANNELS.getSettings,
      async (event, ...args) => {
        validateSender(event, trustedSenderRules);
        if (args.length !== 0) {
          throw new Error("desktop-ipc-arguments-invalid");
        }
        return DesktopSettingsSnapshotSchema.parse(
          await controller.getSettings(),
        );
      },
    );
    register(
      DESKTOP_SHELL_IPC_CHANNELS.saveSettings,
      async (event, ...args) => {
        validateSender(event, trustedSenderRules);
        if (args.length !== 1) {
          throw new Error("desktop-ipc-arguments-invalid");
        }
        const request = DesktopSettingsSaveRequestSchema.safeParse(args[0]);
        if (!request.success) {
          return DesktopSettingsSaveResultSchema.parse({
            ok: false,
            error: mapDesktopSettingsFailure(request.error),
          });
        }
        try {
          return DesktopSettingsSaveResultSchema.parse({
            ok: true,
            settings: await controller.saveSettings(request.data),
          });
        } catch (error) {
          return DesktopSettingsSaveResultSchema.parse({
            ok: false,
            error: mapDesktopSettingsFailure(error),
          });
        }
      },
    );
    registerStateMethod(
      DESKTOP_SHELL_IPC_CHANNELS.retryEngine,
      0,
      controller.retryEngine,
    );
  } catch (error) {
    dispose();
    throw error;
  }

  return dispose;
};
