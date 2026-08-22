import {
  DesktopAppStateSchema,
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
  const registerStateMethod = (
    channel: string,
    argumentCount: number,
    invoke: (...args: readonly unknown[]) => Promise<unknown> | unknown,
  ) => {
    ipcMain.handle(channel, async (event, ...args) => {
      validateSender(event, trustedSenderRules);
      if (args.length !== argumentCount) {
        throw new Error("desktop-ipc-arguments-invalid");
      }
      return DesktopAppStateSchema.parse(await invoke(...args));
    });
  };

  registerStateMethod(DESKTOP_SHELL_IPC_CHANNELS.getAppState, 0, () =>
    controller.getState(),
  );
  registerStateMethod(
    DESKTOP_SHELL_IPC_CHANNELS.chooseInitialWorkspace,
    0,
    controller.chooseInitialWorkspace,
  );
  ipcMain.handle(
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
    DESKTOP_SHELL_IPC_CHANNELS.retryEngine,
    0,
    controller.retryEngine,
  );

  return () => {
    for (const channel of Object.values(DESKTOP_SHELL_IPC_CHANNELS)) {
      ipcMain.removeHandler(channel);
    }
  };
};
