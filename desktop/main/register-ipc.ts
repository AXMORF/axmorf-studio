import { ProducerConfigInputSchema } from "../../src/contracts";
import {
  DesktopAppStateSchema,
  DesktopProviderSettingsSchema,
  DESKTOP_SHELL_IPC_CHANNELS,
} from "../contracts/shell";
import { isAllowedNavigation } from "./navigation-policy";
import type { DesktopShellController } from "./shell-controller";

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
      DESKTOP_SHELL_IPC_CHANNELS.getProviderSettings,
      async (event, ...args) => {
        validateSender(event, trustedSenderRules);
        if (args.length !== 0) {
          throw new Error("desktop-ipc-arguments-invalid");
        }
        return DesktopProviderSettingsSchema.parse(
          await controller.getProviderSettings(),
        );
      },
    );
    registerStateMethod(
      DESKTOP_SHELL_IPC_CHANNELS.saveProviderSettings,
      1,
      (...args) =>
        controller.saveProviderSettings(
          ProducerConfigInputSchema.parse(args[0]),
        ),
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
