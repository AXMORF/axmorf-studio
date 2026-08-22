import {
  resolveClosePolicy,
  shouldQuitAfterConfirmation,
  type CloseIntent,
} from "../application/close-policy";
import type { DesktopShellController } from "./shell-controller";

type PreventableEvent = Readonly<{ preventDefault: () => void }>;

export type DesktopLifecycleWindow = Readonly<{
  isDestroyed: () => boolean;
  isVisible: () => boolean;
  show: () => void;
  focus: () => void;
  hide: () => void;
  on: (event: "close", listener: (event: PreventableEvent) => void) => void;
}>;

export type DesktopLifecycleApp = Readonly<{
  requestSingleInstanceLock: () => boolean;
  whenReady: () => Promise<void>;
  quit: () => void;
  on: {
    (event: "second-instance", listener: () => void): void;
    (event: "before-quit", listener: (event: PreventableEvent) => void): void;
  };
}>;

export type DesktopLifecycleRuntime = Readonly<{
  window: DesktopLifecycleWindow;
  controller: DesktopShellController;
  confirmQuit: () => Promise<boolean>;
  dispose: () => void;
}>;

export const startDesktopLifecycle = async ({
  app,
  createRuntime,
}: Readonly<{
  app: DesktopLifecycleApp;
  createRuntime: () => Promise<DesktopLifecycleRuntime>;
}>) => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return null;
  }

  await app.whenReady();
  const runtime = await createRuntime();
  let shutdownStarted = false;

  const shutdownAndQuit = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    await runtime.controller.shutdown();
    runtime.dispose();
    app.quit();
  };

  const handleCloseIntent = async (intent: CloseIntent) => {
    const decision = resolveClosePolicy({
      activeWork: runtime.controller.getState().activeWork,
      intent,
    });
    if (decision === "hide-window") {
      runtime.window.hide();
      return;
    }
    const confirmed =
      decision === "confirm-quit" ? await runtime.confirmQuit() : true;
    if (shouldQuitAfterConfirmation(decision, confirmed)) {
      await shutdownAndQuit();
    }
  };

  runtime.window.on("close", (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    void handleCloseIntent("window-close");
  });
  app.on("before-quit", (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    void handleCloseIntent("explicit-quit");
  });
  app.on("second-instance", () => {
    if (runtime.window.isDestroyed()) return;
    if (!runtime.window.isVisible()) runtime.window.show();
    runtime.window.focus();
  });

  await runtime.controller.bootstrap();
  return runtime;
};
