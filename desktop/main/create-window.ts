import { BrowserWindow, shell } from "electron";
import { join } from "node:path";

import { TRUSTED_SHELL_WEB_PREFERENCES } from "../contracts/security-policy";
import {
  installNavigationPolicy,
  installSessionSecurityPolicy,
} from "./navigation-policy";

export type DesktopWindow = Readonly<{
  window: BrowserWindow;
  trustedSenderRules: ReadonlyMap<
    number,
    Readonly<{ shellDocumentUrl: string }>
  >;
}>;

export const createDesktopWindow = async ({
  shellDocumentUrl,
}: Readonly<{
  shellDocumentUrl: string;
}>): Promise<DesktopWindow> => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 680,
    show: false,
    title: "AXMORF Studio",
    backgroundColor: "#1d1c1a",
    webPreferences: {
      ...TRUSTED_SHELL_WEB_PREFERENCES,
      preload: join(__dirname, "preload.js"),
    },
  });

  installNavigationPolicy({
    webContents: window.webContents,
    shellDocumentUrl,
    openExternal: (url) => void shell.openExternal(url),
  });
  installSessionSecurityPolicy(window.webContents.session);

  window.once("ready-to-show", () => window.show());
  await window.loadURL(shellDocumentUrl);

  return {
    window,
    trustedSenderRules: new Map([
      [window.webContents.id, { shellDocumentUrl }],
    ]),
  };
};
