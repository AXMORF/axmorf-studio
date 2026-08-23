import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import forgeConfig from "../../forge.config";
import {
  buildDesktopUnsignedReleaseManifest,
  createDesktopUnsignedDmgFileName,
  createDesktopUnsignedDmgVolumeName,
  createDesktopUnsignedInstallInstructions,
  selectDesktopUnsignedDmgOutputPath,
  validateDesktopDualArchitectureRelease,
} from "../../scripts/desktop/unsigned-release";

const sha256 = (value: string) => value.repeat(64);

const releaseManifest = (architecture: "arm64" | "x64") =>
  buildDesktopUnsignedReleaseManifest({
    architecture,
    appVersion: "0.1.0",
    exactCommit: "1".repeat(40),
    runtimePackId: `runtime-pack-${sha256(architecture === "arm64" ? "a" : "b")}`,
    packageInventory: {
      asarSha256: sha256("c"),
      runtimePackFiles: 100,
      workspaceIntegrationFiles: 10,
      workspaceIntegrationSha256: sha256("d"),
    },
    installer: {
      fileName: createDesktopUnsignedDmgFileName({
        appVersion: "0.1.0",
        architecture,
      }),
      sizeBytes: 1_000,
      sha256: sha256("e"),
    },
    runtimeSbomInput: {
      fileName: "runtime-sbom-input.json",
      sizeBytes: 200,
      sha256: sha256("f"),
    },
    installInstructions: {
      fileName: "INSTALL.md",
      sizeBytes: 300,
      sha256: sha256("1"),
    },
    verification: {
      fileName: "installer-verification.json",
      sizeBytes: 400,
      sha256: sha256("2"),
    },
    provenance: {
      githubRunId: "1234",
      githubRunAttempt: "1",
      githubJob: `build-${architecture}`,
    },
  });

test("Phase D configures only the official unsigned DMG maker", async () => {
  const [packageJsonSource, releaseBuilder, installerVerifier, smokePreparer] =
    await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/desktop/unsigned-release.ts", "utf8"),
      readFile("scripts/desktop/verify-unsigned-dmg.sh", "utf8"),
      readFile("scripts/desktop/prepare-installer-smoke.ts", "utf8"),
    ]);
  const packageJson = JSON.parse(packageJsonSource) as {
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.devDependencies["@electron-forge/maker-dmg"],
    "7.11.2",
  );
  assert.equal(
    packageJson.scripts["desktop:dmg"],
    "node --import tsx scripts/desktop/unsigned-release.ts build",
  );
  assert.equal(forgeConfig.makers?.length, 1);
  assert.equal(forgeConfig.publishers?.length, 0);
  assert.equal(forgeConfig.packagerConfig?.osxSign, undefined);
  assert.equal(forgeConfig.packagerConfig?.osxNotarize, undefined);
  assert.deepEqual(forgeConfig.packagerConfig?.extendInfo, {
    LSMinimumSystemVersion: "13.0",
  });
  assert.match(releaseBuilder, /electron-forge[\s\S]*"make"/u);
  assert.doesNotMatch(releaseBuilder, /--targets/u);
  assert.match(
    releaseBuilder,
    /--user-data-directory[\s\S]*DESKTOP_PRODUCT_NAME/u,
  );
  assert.match(
    installerVerifier,
    /Application Support\/\$user_data_directory/u,
  );
  assert.match(installerVerifier, /\/bin\/kill -TERM "\$pid"/u);
  assert.doesNotMatch(installerVerifier, /osascript/u);
  assert.match(installerVerifier, /if \/usr\/sbin\/spctl[\s\S]*; then/u);
  assert.doesNotMatch(installerVerifier, /set \+e\n\/usr\/sbin\/spctl/u);
  assert.match(smokePreparer, /--application-support-root/u);
  assert.doesNotMatch(smokePreparer, /com\.axmorf\.studio/u);
});

test("Phase D installer identity is native, versioned, and explicitly unsigned", () => {
  assert.equal(
    createDesktopUnsignedDmgFileName({
      appVersion: "0.1.0",
      architecture: "arm64",
    }),
    "AXMORF-Studio-0.1.0-mac-arm64-full-unsigned.dmg",
  );
  assert.equal(
    createDesktopUnsignedDmgFileName({
      appVersion: "0.1.0",
      architecture: "x64",
    }),
    "AXMORF-Studio-0.1.0-mac-x64-full-unsigned.dmg",
  );
  assert.throws(() =>
    createDesktopUnsignedDmgFileName({
      appVersion: "0.1.0/escape",
      architecture: "arm64",
    }),
  );
  assert.equal(
    createDesktopUnsignedDmgVolumeName("arm64"),
    "AXMORF Studio arm64",
  );
  assert.equal(createDesktopUnsignedDmgVolumeName("x64"), "AXMORF Studio x64");
  assert.ok(
    Buffer.byteLength(createDesktopUnsignedDmgVolumeName("arm64")) <= 27,
  );
  assert.ok(Buffer.byteLength(createDesktopUnsignedDmgVolumeName("x64")) <= 27);
  const expected = "AXMORF-Studio-0.1.0-mac-arm64-full-unsigned.dmg";
  assert.equal(
    selectDesktopUnsignedDmgOutputPath({
      expectedFileName: expected,
      candidates: [`/checkout/out/make/dmg/darwin/arm64/${expected}`],
    }),
    `/checkout/out/make/dmg/darwin/arm64/${expected}`,
  );
  assert.throws(() =>
    selectDesktopUnsignedDmgOutputPath({
      expectedFileName: expected,
      candidates: [
        `/checkout/out/make/${expected}`,
        `/checkout/out/make/other/${expected}`,
      ],
    }),
  );
  assert.throws(() =>
    selectDesktopUnsignedDmgOutputPath({
      expectedFileName: expected,
      candidates: ["/checkout/out/make/unexpected.dmg"],
    }),
  );
});

test("Phase D release manifest keeps deferred distribution gates explicit", () => {
  const manifest = releaseManifest("arm64");
  assert.equal(manifest.channel, "internal-manual-only");
  assert.equal(manifest.security.developerIdSigned, false);
  assert.equal(manifest.security.notarized, false);
  assert.equal(manifest.security.autoUpdate, false);
  assert.equal(manifest.security.publicReleasePublished, false);
  assert.equal(
    manifest.security.remotionRuntimeRedistributionPermission,
    "not-satisfied",
  );
  assert.equal(manifest.target.universalBinary, false);
  assert.equal(manifest.target.architecture, "arm64");
  assert.equal(manifest.verification.ordinaryProductionPackage, true);
  assert.equal(manifest.verification.nativeProductionGate, true);
  assert.equal(manifest.verification.mountedDmg, true);
  assert.equal(manifest.verification.firstRun, true);
  assert.equal(manifest.verification.doctor, true);
  assert.equal(manifest.verification.previewLaunch, true);
  assert.equal(manifest.verification.hostToolsRequiredAtRuntime, false);
  assert.equal(manifest.verification.cleanup, true);
});

test("Phase D release set requires both architectures at one commit and app version", () => {
  assert.deepEqual(
    validateDesktopDualArchitectureRelease([
      releaseManifest("x64"),
      releaseManifest("arm64"),
    ]).map(({ target }) => target.architecture),
    ["arm64", "x64"],
  );
  assert.throws(() =>
    validateDesktopDualArchitectureRelease([releaseManifest("arm64")]),
  );
  assert.throws(() =>
    validateDesktopDualArchitectureRelease([
      releaseManifest("arm64"),
      {
        ...releaseManifest("x64"),
        product: { ...releaseManifest("x64").product, appVersion: "0.1.1" },
      },
    ]),
  );
});

test("unsigned install instructions use the official Gatekeeper UI flow", () => {
  const instructions = createDesktopUnsignedInstallInstructions({
    architecture: "x64",
    appVersion: "0.1.0",
    dmgFileName: createDesktopUnsignedDmgFileName({
      appVersion: "0.1.0",
      architecture: "x64",
    }),
  });
  assert.match(instructions, /Intel Mac/u);
  assert.match(instructions, /Privacy & Security/u);
  assert.match(instructions, /Open Anyway/u);
  assert.match(instructions, /unsigned/u);
  assert.match(instructions, /not notarized/u);
  assert.doesNotMatch(instructions, /xattr|spctl --master-disable/u);
});

test("Phase D workflow is manual-only, native on both architectures, and never publishes a Release", async () => {
  const workflow = await readFile(
    ".github/workflows/desktop-phase-d-unsigned-dmg.yml",
    "utf8",
  );
  assert.match(workflow, /^on:\n {2}workflow_dispatch:\s*$/mu);
  assert.match(workflow, /^ {2}workflow_call:\s*$/mu);
  assert.match(workflow, /architecture: arm64[\s\S]*runner: macos-15/u);
  assert.match(workflow, /architecture: x64[\s\S]*runner: macos-15-intel/u);
  assert.match(workflow, /npm ci/u);
  assert.match(workflow, /scripts\/desktop\/native-gate\.sh/u);
  assert.match(workflow, /npm run desktop:dmg/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
  assert.match(workflow, /validate-set/u);
  assert.doesNotMatch(
    workflow,
    /^ {2}(?:pull_request|push|release):|gh release|actions\/create-release|contents: write/mu,
  );
});
