import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DESKTOP_DARWIN_ARCHITECTURES,
  assertDesktopDarwinNativeHost,
  getDesktopDarwinTarget,
} from "../../desktop/configuration/darwin-target";
import {
  DESKTOP_RENDER_SOURCE_PACKAGES,
  resolveDesktopRuntimeModuleNames,
} from "../../scripts/desktop/build-runtime-pack";

test("darwin architecture configuration is exact and owns target-specific identities", () => {
  assert.deepEqual(DESKTOP_DARWIN_ARCHITECTURES, ["arm64", "x64"]);
  assert.deepEqual(getDesktopDarwinTarget("arm64"), {
    platform: "darwin",
    architecture: "arm64",
    unameArchitecture: "arm64",
    machoArchitecture: "arm64",
    compositorPackageName: "@remotion/compositor-darwin-arm64",
    compositorPackageJson: "@remotion/compositor-darwin-arm64/package.json",
    forgeOutputDirectory: "AXMORF Studio-darwin-arm64",
  });
  assert.deepEqual(getDesktopDarwinTarget("x64"), {
    platform: "darwin",
    architecture: "x64",
    unameArchitecture: "x86_64",
    machoArchitecture: "x86_64",
    compositorPackageName: "@remotion/compositor-darwin-x64",
    compositorPackageJson: "@remotion/compositor-darwin-x64/package.json",
    forgeOutputDirectory: "AXMORF Studio-darwin-x64",
  });
  assert.throws(() => getDesktopDarwinTarget("ia32"));
  assert.throws(() =>
    assertDesktopDarwinNativeHost({
      expectedArchitecture: "x64",
      platform: "darwin",
      architecture: "arm64",
    }),
  );
  assert.equal(
    assertDesktopDarwinNativeHost({
      expectedArchitecture: "x64",
      platform: "darwin",
      architecture: "x64",
    }).unameArchitecture,
    "x86_64",
  );
});

test("package-lock resolves one matching native dependency set per darwin architecture", async () => {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  for (const architecture of DESKTOP_DARWIN_ARCHITECTURES) {
    const target = getDesktopDarwinTarget(architecture);
    const foreign = getDesktopDarwinTarget(
      architecture === "arm64" ? "x64" : "arm64",
    );
    const modules = resolveDesktopRuntimeModuleNames(
      lock,
      DESKTOP_RENDER_SOURCE_PACKAGES,
      { platform: "darwin", architecture },
    );
    assert.ok(modules.includes(target.compositorPackageName));
    assert.ok(modules.includes(`@rspack/binding-darwin-${architecture}`));
    assert.ok(modules.includes(`@esbuild/darwin-${architecture}`));
    assert.equal(modules.includes(foreign.compositorPackageName), false);
    assert.equal(
      modules.includes(`@rspack/binding-darwin-${foreign.architecture}`),
      false,
    );
    assert.equal(
      modules.includes(`@esbuild/darwin-${foreign.architecture}`),
      false,
    );
  }
});
