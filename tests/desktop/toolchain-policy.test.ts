import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import forgeConfig, {
  DESKTOP_BUNDLE_ID,
  DESKTOP_PACKAGE_ALLOWED_ROOTS,
  DESKTOP_PRODUCT_NAME,
  desktopPackageIgnore,
  desktopVitePluginConfig,
} from "../../forge.config";
import { TRUSTED_SHELL_WEB_PREFERENCES } from "../../desktop/contracts/security-policy";
import {
  DESKTOP_ELECTRON_LOCALES,
  pruneDesktopElectronLocales,
} from "../../scripts/desktop/electron-locales";
import {
  assertDesktopEngineAuthorityBoundary,
  assertDesktopResourcesTopLevel,
  assertPackagedApplicationInventory,
  inspectPackagedWorkspaceIntegration,
  isDesktopPackagePathAllowed,
  verifyDesktopBuildInventory,
} from "../../scripts/desktop/package-inventory";
import {
  DESKTOP_PACKAGED_WORKSPACE_INTEGRATION_ROOT,
  DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES,
  stageDesktopWorkspaceIntegration,
} from "../../scripts/desktop/workspace-integration-package";
import engineViteConfig from "../../vite.desktop.engine.config";
import mainViteConfig from "../../vite.desktop.main.config";
import preloadViteConfig from "../../vite.desktop.preload.config";
import rendererViteConfig from "../../vite.desktop.renderer.config";
import rspViteConfig from "../../vite.desktop.rsp.config";
import { ProjectCreateInputSchema } from "../../src/contracts";

test("Phase B desktop toolchain and product identity are exact", async () => {
  const packageJson = JSON.parse(
    await readFile(join(process.cwd(), "package.json"), "utf8"),
  ) as {
    productName: string;
    main: string;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
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
  assert.match(
    packageJson.scripts["desktop:build"]!,
    /desktop:build:inventory/u,
  );
});

test("repository checks exclude the generated Runtime Pack tree", async () => {
  const [tsconfigSource, eslintSource] = await Promise.all([
    readFile(join(process.cwd(), "tsconfig.json"), "utf8"),
    readFile(join(process.cwd(), "eslint.config.mjs"), "utf8"),
  ]);
  const tsconfig = JSON.parse(tsconfigSource) as { exclude?: string[] };
  assert.equal(tsconfig.exclude?.includes("desktop/runtime-pack"), true);
  assert.match(eslintSource, /"desktop\/runtime-pack\/\*\*"/u);
});

test("every Desktop Vite entry disables repository public copying", () => {
  for (const config of [
    mainViteConfig,
    preloadViteConfig,
    engineViteConfig,
    rspViteConfig,
    rendererViteConfig,
  ]) {
    assert.equal(config.publicDir, false);
  }
  const engineOutput = engineViteConfig.build?.rollupOptions?.output;
  assert.equal(Array.isArray(engineOutput), false);
  assert.equal(
    (engineOutput as { readonly codeSplitting?: boolean }).codeSplitting,
    false,
  );
});

test("Forge config has explicit entries and only the official DMG maker", () => {
  assert.equal(
    DESKTOP_PACKAGED_WORKSPACE_INTEGRATION_ROOT,
    ".desktop-package-resources/workspace-integration",
  );
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
  assert.equal(forgeConfig.makers?.length, 1);
  assert.equal(
    (forgeConfig.makers?.[0] as { readonly name?: string } | undefined)?.name,
    "dmg",
  );
  assert.deepEqual(forgeConfig.publishers, []);
  assert.equal(forgeConfig.packagerConfig?.appBundleId, DESKTOP_BUNDLE_ID);
  assert.equal(forgeConfig.packagerConfig?.name, DESKTOP_PRODUCT_NAME);
  assert.equal(forgeConfig.packagerConfig?.asar, true);
  assert.equal(forgeConfig.packagerConfig?.ignore, desktopPackageIgnore);
  assert.deepEqual(forgeConfig.packagerConfig?.extraResource, [
    "desktop/runtime-pack",
    "desktop/compatibility.json",
    DESKTOP_PACKAGED_WORKSPACE_INTEGRATION_ROOT,
  ]);
  assert.equal(forgeConfig.packagerConfig?.afterCopyExtraResources?.length, 1);
  assert.equal(typeof forgeConfig.hooks?.generateAssets, "function");
});

test("packaging keeps only the exact English and Simplified Chinese Electron locales", async (context) => {
  assert.deepEqual(DESKTOP_ELECTRON_LOCALES, ["en.lproj", "zh_CN.lproj"]);
  const root = await mkdtemp(join(tmpdir(), "desktop-electron-locales-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const locale of ["af.lproj", ...DESKTOP_ELECTRON_LOCALES]) {
    await mkdir(join(root, locale));
    await writeFile(join(root, locale, "locale.pak"), locale);
  }
  await pruneDesktopElectronLocales(root);
  assert.deepEqual((await readdir(root)).sort(), [...DESKTOP_ELECTRON_LOCALES]);
});

test("trusted bundled renderer denies privilege", () => {
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.nodeIntegration, false);
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.contextIsolation, true);
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.sandbox, true);
  assert.equal(TRUSTED_SHELL_WEB_PREFERENCES.webSecurity, true);
});

test("package allowlist excludes repository data and private state", () => {
  assert.deepEqual(DESKTOP_PACKAGE_ALLOWED_ROOTS, [
    ".vite/build",
    ".vite/renderer",
    "package.json",
    "desktop/resources/brand/axmorf-studio-icon.icns",
    "desktop/resources/brand/axmorf-studio-icon.png",
    "desktop/resources/brand/axmorf-studio-icon.svg",
  ]);
  const root = process.cwd();
  for (const path of [
    ".vite/build/main.js",
    "package.json",
    "desktop/resources/brand/axmorf-studio-icon.icns",
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
    ".vite/rsp/rsp-sea.cjs",
    ".vite/rsp/rsp-client.cjs",
    ".vite/build/assets/library/private.wav",
    ".vite/build/public/projects/private/video.mp4",
    ".vite/build/arbitrary.js",
    ".vite/renderer/main_window/public/projects/private/video.mp4",
    "desktop/resources/workspace-integration/AGENTS.md",
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

test("packaged macOS Resources has an exact top-level inventory", () => {
  const required = [
    "app.asar",
    "compatibility.json",
    "electron.icns",
    ...DESKTOP_ELECTRON_LOCALES,
    "runtime-pack",
    "workspace-integration",
  ];
  assert.doesNotThrow(() => assertDesktopResourcesTopLevel(required));
  assert.doesNotThrow(() =>
    assertDesktopResourcesTopLevel([...required, "app.asar.unpacked"]),
  );
  assert.throws(
    () => assertDesktopResourcesTopLevel(required.slice(1)),
    /desktop-resources-top-level-missing:app\.asar/u,
  );
  assert.throws(
    () => assertDesktopResourcesTopLevel([...required, "private.json"]),
    /desktop-resources-top-level-forbidden:private\.json/u,
  );
});

test("Desktop build inventory is exact and rejects copied repository public data", async (t) => {
  const checkoutRoot = await mkdtemp(join(tmpdir(), "axmorf-build-inventory-"));
  t.after(() => rm(checkoutRoot, { recursive: true, force: true }));
  const files = [
    ".vite/build/engine.js",
    ".vite/build/main.js",
    ".vite/build/preload.js",
    ".vite/rsp/rsp-sea.cjs",
    ".vite/renderer/main_window/index.html",
    ".vite/renderer/main_window/assets/index-a.css",
    ".vite/renderer/main_window/assets/index-a.js",
  ];
  for (const relativePath of files) {
    const path = join(checkoutRoot, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "fixture");
  }
  assert.deepEqual(verifyDesktopBuildInventory(checkoutRoot), {
    mainFiles: 3,
    rspFiles: 1,
    rendererFiles: 3,
  });
  const packagedFiles = [
    ...files.filter((path) => !path.startsWith(".vite/rsp/")),
    "package.json",
    "desktop/resources/brand/axmorf-studio-icon.icns",
    "desktop/resources/brand/axmorf-studio-icon.png",
    "desktop/resources/brand/axmorf-studio-icon.svg",
  ];
  assert.doesNotThrow(() => assertPackagedApplicationInventory(packagedFiles));
  assert.throws(
    () =>
      assertPackagedApplicationInventory([
        ...packagedFiles,
        ".vite/build/public/projects/private/video.mp4",
      ]),
    /desktop-asar-inventory-exact-file-drift/u,
  );

  const leakedPublic = join(
    checkoutRoot,
    ".vite/build/public/projects/private/video.mp4",
  );
  await mkdir(dirname(leakedPublic), { recursive: true });
  await writeFile(leakedPublic, "private Project data");
  assert.throws(
    () => verifyDesktopBuildInventory(checkoutRoot),
    /desktop-main-build-inventory-exact-file-drift/u,
  );
  await rm(join(checkoutRoot, ".vite/build/public"), {
    recursive: true,
    force: true,
  });

  const leakedLibrary = join(
    checkoutRoot,
    ".vite/rsp/assets/library/private.wav",
  );
  await mkdir(dirname(leakedLibrary), { recursive: true });
  await writeFile(leakedLibrary, "private library data");
  assert.throws(
    () => verifyDesktopBuildInventory(checkoutRoot),
    /desktop-rsp-build-inventory-exact-file-drift/u,
  );
});

test("Desktop Engine build rejects repository storage and command authority", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-engine-authority-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = join(root, "engine.js");
  await writeFile(engine, "workspace-only-engine");
  assert.doesNotThrow(() => assertDesktopEngineAuthorityBoundary(engine));
  for (const marker of [
    "repositoryRoot",
    "createRepositoryProjectStorageLocations",
    "npm run project:produce:prepare",
    "repositoryMode",
  ]) {
    await writeFile(engine, marker);
    assert.throws(
      () => assertDesktopEngineAuthorityBoundary(engine),
      /desktop-engine-repository-authority/u,
    );
  }
});

test("packaged Workspace integration is an external exact curated tree", async (t) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "axmorf-package-integration-"),
  );
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const resourcesPath = join(temporaryRoot, "Resources");
  const outputRoot = join(resourcesPath, "workspace-integration");
  await mkdir(resourcesPath);
  const staged = await stageDesktopWorkspaceIntegration({ outputRoot });
  assert.deepEqual(
    staged.map(({ path }) => path),
    DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES,
  );
  assert.equal(
    inspectPackagedWorkspaceIntegration({ resourcesPath })
      .workspaceIntegrationFiles,
    DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES.length,
  );
  assert.match(
    inspectPackagedWorkspaceIntegration({ resourcesPath })
      .workspaceIntegrationSha256,
    /^[a-f0-9]{64}$/u,
  );
  for (const identity of staged) {
    assert.match(identity.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(identity.sizeBytes > 0);
  }
  await assert.rejects(
    () => readFile(join(outputRoot, "assets/library/unknown.wav")),
    /ENOENT/u,
  );

  await writeFile(join(outputRoot, "unknown.txt"), "not curated");
  assert.throws(
    () => inspectPackagedWorkspaceIntegration({ resourcesPath }),
    /inventory-drift/u,
  );
  await rm(join(outputRoot, "unknown.txt"));
  await writeFile(join(outputRoot, "AGENTS.md"), "drift");
  assert.throws(
    () => inspectPackagedWorkspaceIntegration({ resourcesPath }),
    /file-drift/u,
  );
  await rm(join(outputRoot, "AGENTS.md"));
  await symlink(
    join(process.cwd(), "desktop/resources/workspace-integration/AGENTS.md"),
    join(outputRoot, "AGENTS.md"),
  );
  assert.throws(
    () => inspectPackagedWorkspaceIntegration({ resourcesPath }),
    /symlink/u,
  );
});

test("Desktop build has no source-checkout locator or public release machinery", async () => {
  await assert.rejects(
    () =>
      readFile(
        join(process.cwd(), "scripts/desktop/repository-locator.ts"),
        "utf8",
      ),
    /ENOENT/u,
  );
  assert.equal(forgeConfig.makers?.length, 1);
  assert.equal(
    (forgeConfig.makers?.[0] as { readonly name?: string } | undefined)?.name,
    "dmg",
  );
  assert.deepEqual(forgeConfig.publishers, []);
});

test("desktop package configuration has no signing, notarization, updater, or publisher", async () => {
  const source = await readFile(join(process.cwd(), "forge.config.ts"), "utf8");
  assert.match(source, /MakerDMG/u);
  assert.doesNotMatch(source, /notari[sz]|osxSign|autoUpdater/u);
  assert.match(source, /publishers:\s*\[\]/u);
});

test("managed production Skill uses UDS control and verified loopback-scoped Delivery", async () => {
  const skill = await readFile(
    join(
      process.cwd(),
      "desktop/resources/workspace-integration/skills/remotion-story-producer-video/SKILL.md",
    ),
    "utf8",
  );
  assert.match(skill, /`productionAvailable: true`/u);
  assert.match(skill, /`runtimePackAvailable: true`/u);
  assert.match(skill, /`deliveryAvailable: true`/u);
  assert.match(skill, /authenticated-unix-domain-socket-only/u);
  assert.match(skill, /"127\.0\.0\.1"/u);
  assert.match(skill, /temporary loopback HTTP listener/u);
  assert.match(skill, /project-production-source-current/u);
  assert.match(skill, /\.\/\.rsp\/bin\/rsp schema project-create/u);
  assert.match(skill, /strict raw `ProjectCreateInput` JSON/u);
  assert.match(skill, /Never wrap it in `command`/u);
  assert.match(skill, /omit `sceneTemplates`/u);
  assert.match(skill, /redacted `issues\[\]` with `path`, `code`, and `message`/u);
  const example = /Valid raw stdin example[\s\S]*?```json\n([\s\S]*?)\n```/u.exec(
    skill,
  )?.[1];
  assert.ok(example !== undefined);
  const createInput = ProjectCreateInputSchema.parse(JSON.parse(example));
  assert.equal(createInput.storyId, "story-example");
  assert.equal("sceneTemplates" in createInput, false);
  for (const wrapperField of [
    "command",
    "input",
    "protocolVersion",
    "requestId",
    "workspaceId",
  ]) {
    assert.equal(wrapperField in createInput, false);
  }
  assert.doesNotMatch(
    skill,
    /true production\/delivery\/runtime capabilities/u,
  );
  assert.doesNotMatch(skill, /`npm run|node_modules/u);
});
