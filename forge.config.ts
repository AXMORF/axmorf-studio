import MakerDMG from "@electron-forge/maker-dmg";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { DesktopDarwinArchitectureSchema } from "./desktop/configuration/darwin-target";
import {
  DESKTOP_BUNDLE_ID,
  DESKTOP_MINIMUM_MACOS_VERSION,
  DESKTOP_PRODUCT_NAME,
  createDesktopUnsignedDmgFileName,
  createDesktopUnsignedDmgVolumeName,
} from "./desktop/configuration/product";

import { isDesktopPackagePathAllowed } from "./scripts/desktop/package-inventory";
import { pruneDesktopElectronLocales } from "./scripts/desktop/electron-locales";
import {
  DESKTOP_PACKAGED_WORKSPACE_INTEGRATION_ROOT,
  stageDesktopWorkspaceIntegration,
} from "./scripts/desktop/workspace-integration-package";

export { DESKTOP_PACKAGE_ALLOWED_ROOTS } from "./scripts/desktop/package-inventory";

export {
  DESKTOP_BUNDLE_ID,
  DESKTOP_PRODUCT_NAME,
} from "./desktop/configuration/product";

const desktopPackageRoot = dirname(fileURLToPath(import.meta.url));
const toPosixPath = (path: string) => path.split(sep).join("/");
const desktopAppVersion = (
  JSON.parse(
    readFileSync(join(desktopPackageRoot, "package.json"), "utf8"),
  ) as {
    readonly version: string;
  }
).version;

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
    extendInfo: {
      LSMinimumSystemVersion: DESKTOP_MINIMUM_MACOS_VERSION,
    },
    icon: "desktop/resources/brand/axmorf-studio-icon",
    extraResource: [
      "desktop/runtime-pack",
      "desktop/compatibility.json",
      DESKTOP_PACKAGED_WORKSPACE_INTEGRATION_ROOT,
    ],
    afterCopyExtraResources: [
      (buildPath, _electronVersion, _platform, _arch, done) => {
        void pruneDesktopElectronLocales(
          join(
            buildPath,
            `${DESKTOP_PRODUCT_NAME}.app`,
            "Contents",
            "Resources",
          ),
        ).then(
          () => done(),
          (error: unknown) =>
            done(
              error instanceof Error
                ? error
                : new Error("Desktop Electron locale pruning failed."),
            ),
        );
      },
    ],
    ignore: desktopPackageIgnore,
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG((rawArchitecture) => {
      const architecture =
        DesktopDarwinArchitectureSchema.parse(rawArchitecture);
      const fileName = createDesktopUnsignedDmgFileName({
        appVersion: desktopAppVersion,
        architecture,
      });
      return {
        name: fileName.slice(0, -".dmg".length),
        title: createDesktopUnsignedDmgVolumeName(architecture),
        format: "ULFO",
        overwrite: true,
      };
    }),
  ],
  publishers: [],
  hooks: {
    generateAssets: async () => {
      await stageDesktopWorkspaceIntegration({
        checkoutRoot: desktopPackageRoot,
      });
    },
  },
  plugins: [new VitePlugin(desktopVitePluginConfig)],
};

export default config;
