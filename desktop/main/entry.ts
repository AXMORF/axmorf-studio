import { app, BrowserWindow } from "electron";
import { join } from "node:path";

import { TRUSTED_SHELL_WEB_PREFERENCES } from "../contracts/security-policy";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export const DESKTOP_MAIN_ENTRY_ID = "desktop-main-phase-a-v1" as const;

const createBootstrapWindow = async () => {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    show: false,
    webPreferences: {
      ...TRUSTED_SHELL_WEB_PREFERENCES,
      preload: join(__dirname, "preload.js"),
    },
  });
  window.once("ready-to-show", () => window.show());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

if (app.requestSingleInstanceLock()) {
  app.whenReady().then(createBootstrapWindow);
  app.on("window-all-closed", () => app.quit());
} else {
  app.quit();
}
