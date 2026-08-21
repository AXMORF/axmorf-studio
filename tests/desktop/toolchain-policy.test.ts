import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import forgeConfig, {
  DESKTOP_BUNDLE_ID,
  DESKTOP_PRODUCT_NAME,
  desktopVitePluginConfig,
} from "../../forge.config";
import {
  STUDIO_WEB_PREFERENCES,
  TRUSTED_SHELL_WEB_PREFERENCES,
} from "../../desktop/contracts/security-policy";

test("Phase A desktop toolchain and product identity are exact", async () => {
  const packageJson = JSON.parse(
    await readFile(join(process.cwd(), "package.json"), "utf8"),
  ) as {
    productName: string;
    main: string;
    devDependencies: Record<string, string>;
  };
  assert.equal(packageJson.productName, DESKTOP_PRODUCT_NAME);
  assert.equal(packageJson.main, ".vite/build/main.js");
  assert.equal(DESKTOP_PRODUCT_NAME, "AXMORF Studio");
  assert.equal(DESKTOP_BUNDLE_ID, "com.axmorf.studio");
  assert.deepEqual(
    {
      electron: packageJson.devDependencies.electron,
      forge: packageJson.devDependencies["@electron-forge/cli"],
      vite: packageJson.devDependencies["@electron-forge/plugin-vite"],
    },
    { electron: "43.4.1", forge: "7.11.2", vite: "7.11.2" },
  );
});

test("Forge config has explicit entries and no release machinery", () => {
  assert.deepEqual(
    desktopVitePluginConfig.build.map(({ entry, config, target }) => ({
      entry,
      config,
      target,
    })),
    [
      {
        entry: "desktop/main/entry.ts",
        config: "vite.desktop.main.config.ts",
        target: "main",
      },
      {
        entry: "desktop/preload/shell.ts",
        config: "vite.desktop.preload.config.ts",
        target: "preload",
      },
      {
        entry: "desktop/engine/entry.ts",
        config: "vite.desktop.engine.config.ts",
        target: "main",
      },
    ],
  );
  assert.deepEqual(desktopVitePluginConfig.renderer, [
    { name: "main_window", config: "vite.desktop.renderer.config.ts" },
  ]);
  assert.equal(desktopVitePluginConfig.concurrent, false);
  assert.deepEqual(forgeConfig.makers, []);
  assert.deepEqual(forgeConfig.publishers, []);
  assert.equal(forgeConfig.packagerConfig?.appBundleId, DESKTOP_BUNDLE_ID);
  assert.equal(forgeConfig.packagerConfig?.name, DESKTOP_PRODUCT_NAME);
  assert.equal(forgeConfig.packagerConfig?.asar, true);
});

test("trusted shell and Studio policies deny renderer privilege", () => {
  for (const preferences of [
    TRUSTED_SHELL_WEB_PREFERENCES,
    STUDIO_WEB_PREFERENCES,
  ]) {
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.webSecurity, true);
  }
});

test("desktop package configuration has no maker, signing, notarization, or updater policy", async () => {
  const source = await readFile(join(process.cwd(), "forge.config.ts"), "utf8");
  assert.doesNotMatch(
    source,
    /Maker[A-Z]|notari[sz]|osxSign|autoUpdater|publishers:\s*\[[^\]]+\]/u,
  );
});
