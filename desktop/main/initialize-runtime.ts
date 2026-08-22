type DisposableWindow = Readonly<{
  isDestroyed: () => boolean;
  destroy: () => void;
}>;

export type InitializingDesktopWindow = Readonly<{ window: DisposableWindow }>;

export const initializeDesktopWindowResources = async <
  Window extends DisposableWindow,
>({
  window,
  installPolicies,
  load,
}: Readonly<{
  window: Window;
  installPolicies: () => void;
  load: () => Promise<void>;
}>) => {
  try {
    installPolicies();
    await load();
    return window;
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
};

export const initializeDesktopRuntimeResources = async <
  DesktopWindow extends InitializingDesktopWindow,
>({
  bootstrapController,
  shutdownController,
  createWindow,
  registerIpc,
  unregisterMedia,
}: Readonly<{
  bootstrapController: () => Promise<unknown>;
  shutdownController: () => Promise<void>;
  createWindow: () => Promise<DesktopWindow>;
  registerIpc: (window: DesktopWindow) => () => void;
  unregisterMedia: () => void;
}>) => {
  let desktopWindow: DesktopWindow | undefined;
  let unregisterIpc: (() => void) | undefined;
  let ipcDisposed = false;
  let windowDisposed = false;
  let mediaDisposed = false;

  const disposeIpc = () => {
    if (ipcDisposed) return;
    ipcDisposed = true;
    unregisterIpc?.();
  };
  const disposeWindow = () => {
    if (windowDisposed) return;
    windowDisposed = true;
    if (
      desktopWindow !== undefined &&
      !desktopWindow.window.isDestroyed()
    ) {
      desktopWindow.window.destroy();
    }
  };
  const disposeMedia = () => {
    if (mediaDisposed) return;
    mediaDisposed = true;
    unregisterMedia();
  };

  try {
    await bootstrapController();
    desktopWindow = await createWindow();
    unregisterIpc = registerIpc(desktopWindow);
  } catch (error) {
    disposeIpc();
    disposeWindow();
    await shutdownController().catch(() => undefined);
    disposeMedia();
    throw error;
  }

  return {
    desktopWindow,
    dispose: () => {
      disposeIpc();
      disposeMedia();
      disposeWindow();
    },
  } as const;
};
