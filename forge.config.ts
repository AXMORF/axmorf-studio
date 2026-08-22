import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isDesktopPackagePathAllowed } from "./scripts/desktop/package-inventory";

export { DESKTOP_PACKAGE_ALLOWED_ROOTS } from "./scripts/desktop/package-inventory";

export const DESKTOP_PRODUCT_NAME = "AXMORF Studio" as const;
export const DESKTOP_BUNDLE_ID = "com.axmorf.studio" as const;

const desktopPackageRoot = dirname(fileURLToPath(import.meta.url));
const toPosixPath = (path: string) => path.split(sep).join("/");

export const desktopPackageIgnore = (absolutePath: string) => {
  const repositoryPath = absolutePath.startsWith(`${desktopPackageRoot}${sep}`)
    ? toPosixPath(relative(desktopPackageRoot, absolutePath))
    : toPosixPath(absolutePath).replace(/^\/+|\/+$/gu, "");
  return !isDesktopPackagePathAllowed(repositoryPath);
};

export const desktopVitePluginConfig = {
  build: [
    {
      entry: "desktop/main/entry.ts",
      config: "vite.desktop.main.config.ts",
      target: "main" as const,
    },
    {
      entry: "desktop/preload/shell.ts",
      config: "vite.desktop.preload.config.ts",
      target: "preload" as const,
    },
    {
      entry: "desktop/engine/entry.ts",
      config: "vite.desktop.engine.config.ts",
      target: "main" as const,
    },
  ],
  renderer: [
    {
      name: "main_window",
      config: "vite.desktop.renderer.config.ts",
    },
  ],
  concurrent: false,
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: DESKTOP_PRODUCT_NAME,
    executableName: DESKTOP_PRODUCT_NAME,
    appBundleId: DESKTOP_BUNDLE_ID,
    appCategoryType: "public.app-category.video",
    icon: "desktop/resources/brand/axmorf-studio-icon",
    ignore: desktopPackageIgnore,
  },
  rebuildConfig: {},
  makers: [],
  publishers: [],
  plugins: [new VitePlugin(desktopVitePluginConfig)],
};

export default config;
