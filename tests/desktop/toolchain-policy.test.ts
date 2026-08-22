import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import forgeConfig, {
  DESKTOP_BUNDLE_ID,
  DESKTOP_PACKAGE_ALLOWED_ROOTS,
  DESKTOP_PRODUCT_NAME,
  desktopPackageIgnore,
  desktopVitePluginConfig,
} from "../../forge.config";
import { TRUSTED_SHELL_WEB_PREFERENCES } from "../../desktop/contracts/security-policy";
import { DESKTOP_PHASE_A_REPOSITORY_ROOT } from "../../scripts/desktop/repository-locator";
import { isDesktopPackagePathAllowed } from "../../scripts/desktop/package-inventory";

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
  assert.equal(forgeConfig.packagerConfig?.ignore, desktopPackageIgnore);
});

test("trusted bundled renderer denies privilege", () => {
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.nodeIntegration, false);
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.contextIsolation, true);
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.sandbox, true);
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.webSecurity, true);
});

test("package allowlist excludes repository data and private state", () => {
  assert.deepEqual(DESKTOP_PACKAGE_ALLOWED_ROOTS, [
    ".vite",
    "package.json",
    "desktop/resources/brand/axmorf-studio-icon.icns",
    "desktop/resources/brand/axmorf-studio-icon.png",
    "desktop/resources/brand/axmorf-studio-icon.svg",
    "desktop/resources/workspace-integration/AGENTS.md",
    "desktop/resources/workspace-integration/CLAUDE.md",
    "desktop/resources/workspace-integration/GEMINI.md",
    "desktop/resources/workspace-integration/hermes/INSTALL_PROMPT.md",
    "desktop/resources/workspace-integration/rsp",
    "desktop/resources/workspace-integration/rsp-client.cjs",
    "desktop/resources/workspace-integration/skills/remotion-story-producer-video/SKILL.md",
  ]);
  const root = process.cwd();
  for (const path of [
    ".vite/build/main.js",
    "package.json",
    "desktop/resources/brand/axmorf-studio-icon.icns",
    "desktop/resources/workspace-integration/AGENTS.md",
  ]) {
    assert.equal(desktopPackageIgnore(join(root, path)), false, path);
  }
  for (const path of [
    "private/producer.private.json",
    "src/projects/story-one/story.json",
    "public/projects/story-one/video.png",
    "deliveries/story-one/video.mp4",
    ".producer-artifacts/story-one/artifact.json",
    ".producer-attempts/story-one/attempt.json",
    ".producer-runs/story-one/run.json",
    ".narration-work/story-one/audio.wav",
    "out/story-one/video.mp4",
    "node_modules/zod/package.json",
    "node_modules/@remotion/cli/package.json",
    "node_modules/@remotion/studio-server/package.json",
    "node_modules/@remotion/renderer/package.json",
    "node_modules/.bin/remotion",
    "desktop/resources/workspace-integration/assets/library/unknown.wav",
  ]) {
    assert.equal(desktopPackageIgnore(join(root, path)), true, path);
  }
  assert.equal(
    isDesktopPackagePathAllowed("/deliveries/story-one/video.mp4"),
    false,
  );
  assert.equal(
    isDesktopPackagePathAllowed("/node_modules/@remotion/cli/index.js"),
    false,
  );
  assert.equal(
    isDesktopPackagePathAllowed("/node_modules/.bin/remotion"),
    false,
  );
  assert.equal(desktopPackageIgnore("/package.json"), false);
  assert.equal(desktopPackageIgnore("/private/producer.private.json"), true);
});

test("Phase A repository locator is the config checkout, not runtime cwd fallback", () => {
  assert.equal(DESKTOP_PHASE_A_REPOSITORY_ROOT, process.cwd());
});

test("desktop package configuration has no maker, signing, notarization, or updater policy", async () => {
  const source = await readFile(join(process.cwd(), "forge.config.ts"), "utf8");
  assert.doesNotMatch(
    source,
    /Maker[A-Z]|notari[sz]|osxSign|autoUpdater|publishers:\s*\[[^\]]+\]/u,
  );
});
