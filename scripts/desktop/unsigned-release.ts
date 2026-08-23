import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DesktopDualReleaseManifestSchema,
  DesktopInstallerVerificationSchema,
  DesktopUnsignedReleaseManifestSchema,
  type DesktopUnsignedReleaseManifest,
} from "../../desktop/contracts/unsigned-release";
import {
  assertDesktopDarwinNativeHost,
  DesktopDarwinArchitectureSchema,
  getDesktopDarwinTarget,
  type DesktopDarwinArchitecture,
} from "../../desktop/configuration/darwin-target";
import {
  DESKTOP_BUNDLE_ID,
  DESKTOP_MINIMUM_MACOS_VERSION,
  DESKTOP_PRODUCT_NAME,
  createDesktopUnsignedDmgFileName,
} from "../../desktop/configuration/product";
import { verifyDesktopPackageInventory } from "./package-inventory";
import { createDesktopSbomInput } from "./sbom-input";

export {
  createDesktopUnsignedDmgFileName,
  createDesktopUnsignedDmgVolumeName,
} from "../../desktop/configuration/product";

export const selectDesktopUnsignedDmgOutputPath = ({
  expectedFileName,
  candidates,
}: {
  readonly expectedFileName: string;
  readonly candidates: readonly string[];
}) => {
  const sorted = [...candidates].sort();
  if (sorted.length !== 1) {
    throw new Error("desktop-release-dmg-output-inventory-invalid");
  }
  const output = sorted[0]!;
  if (basename(output) !== expectedFileName) {
    throw new Error("desktop-release-dmg-output-name-invalid");
  }
  return output;
};

const discoverDesktopUnsignedDmgOutputPath = async ({
  checkoutRoot,
  expectedFileName,
}: {
  readonly checkoutRoot: string;
  readonly expectedFileName: string;
}) => {
  const makeRoot = join(resolve(checkoutRoot), "out/make");
  const candidates: string[] = [];
  const walk = async (root: string) => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("desktop-release-dmg-output-symlink-forbidden");
      }
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".dmg")) {
        candidates.push(path);
      }
    }
  };
  await walk(makeRoot);
  return selectDesktopUnsignedDmgOutputPath({
    expectedFileName,
    candidates,
  });
};

const RELEASE_EXACT_STATIC_FILES = Object.freeze([
  "INSTALL.md",
  "installer-verification.json",
  "release-manifest.json",
  "runtime-sbom-input.json",
]);
const NATIVE_GATE_REQUIRED_RESULTS = Object.freeze([
  "sourceCurrent",
  "nativeProductionEvidence",
  "deterministicFixture",
  "offlineRuntimeTested",
  "deliveryBuilt",
  "manualDeliveryTested",
  "automaticDeliveryTested",
  "failureCleanupTested",
  "quitCleanupTested",
  "loopbackListenerVerified",
  "processCleanupVerified",
  "sessionCleanupVerified",
  "stagingCleanupVerified",
  "reopen",
]);
const ORDINARY_PACKAGE_FORBIDDEN_MARKERS = Object.freeze([
  "desktop-native-test-pcm-v3",
  "desktop-native-command-failure-v1",
  "Native Delivery action sequence does not match.",
]);

const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const sha256File = async (path: string) =>
  new Promise<string>((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.once("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", () => resolvePromise(hash.digest("hex")));
  });

const inspectReleaseFile = async (path: string) => {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size <= 0) {
    throw new Error(`desktop-release-file-unsafe:${basename(path)}`);
  }
  return {
    fileName: basename(path),
    sizeBytes: metadata.size,
    sha256: await sha256File(path),
  } as const;
};

const readStrictJson = async (path: string) => {
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size <= 0 ||
    metadata.size > 16 * 1024 * 1024
  ) {
    throw new Error(`desktop-release-json-unsafe:${basename(path)}`);
  }
  return JSON.parse(await readFile(path, "utf8")) as unknown;
};

export const createDesktopUnsignedInstallInstructions = ({
  architecture,
  appVersion,
  dmgFileName,
}: {
  readonly architecture: DesktopDarwinArchitecture;
  readonly appVersion: string;
  readonly dmgFileName: string;
}) => `# AXMORF Studio ${appVersion} internal unsigned installer

This ${architecture === "arm64" ? "Apple Silicon" : "Intel Mac"} build is unsigned and not notarized. It is an internal/manual-only test artifact. Remotion runtime binary redistribution permission is not satisfied, so do not publish or redistribute it as a public release.

1. Verify the SHA-256 in \`${dmgFileName}.sha256\`.
2. Open \`${dmgFileName}\` and drag \`AXMORF Studio.app\` to Applications.
3. Open AXMORF Studio. macOS will warn because the developer cannot be verified.
4. In System Settings, open Privacy & Security, find the blocked AXMORF Studio message, choose Open Anyway, then confirm Open.
5. Choose one Workspace Root. The App installs its workspace-local \`rsp\` and Skill there; Node, npm, and Git are not required.

Do not disable Gatekeeper globally. Managed Macs that do not allow Open Anyway are not supported by this unsigned test channel. Updates are manual: download the matching architecture DMG and replace only the App; the Workspace remains separate.
`;

export const buildDesktopUnsignedReleaseManifest = ({
  architecture,
  appVersion,
  exactCommit,
  runtimePackId,
  packageInventory,
  installer,
  runtimeSbomInput,
  installInstructions,
  verification,
  provenance,
}: {
  readonly architecture: DesktopDarwinArchitecture;
  readonly appVersion: string;
  readonly exactCommit: string;
  readonly runtimePackId: string;
  readonly packageInventory: Readonly<{
    asarSha256: string;
    runtimePackFiles: number;
    workspaceIntegrationFiles: number;
    workspaceIntegrationSha256: string;
  }>;
  readonly installer: Readonly<{
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  readonly runtimeSbomInput: Readonly<{
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  readonly installInstructions: Readonly<{
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  readonly verification: Readonly<{
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  readonly provenance: Readonly<{
    githubRunId: string;
    githubRunAttempt: string;
    githubJob: string;
  }>;
}) =>
  DesktopUnsignedReleaseManifestSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-unsigned-dmg-release-v1",
    channel: "internal-manual-only",
    product: {
      name: DESKTOP_PRODUCT_NAME,
      bundleId: DESKTOP_BUNDLE_ID,
      appVersion,
      minimumMacOSVersion: DESKTOP_MINIMUM_MACOS_VERSION,
    },
    source: { exactCommit },
    target: {
      platform: "darwin",
      architecture,
      native: true,
      universalBinary: false,
    },
    security: {
      developerIdSigned: false,
      notarized: false,
      autoUpdate: false,
      publicReleasePublished: false,
      remotionRuntimeRedistributionPermission: "not-satisfied",
    },
    installer,
    application: {
      relativePath: "AXMORF Studio.app",
      asarSha256: packageInventory.asarSha256,
      runtimePackId,
      runtimePackFiles: packageInventory.runtimePackFiles,
      workspaceIntegrationFiles: packageInventory.workspaceIntegrationFiles,
      workspaceIntegrationSha256: packageInventory.workspaceIntegrationSha256,
    },
    runtimeSbomInput,
    installInstructions,
    verificationReport: verification,
    verification: {
      ordinaryProductionPackage: true,
      nativeProductionGate: true,
      mountedDmg: true,
      isolatedApplicationsCopy: true,
      firstRun: true,
      doctor: true,
      previewLaunch: true,
      hostToolsRequiredAtRuntime: false,
      cleanup: true,
    },
    provenance,
  });

export const validateDesktopDualArchitectureRelease = (
  rawManifests: readonly unknown[],
) => {
  const manifests = rawManifests
    .map((value) => DesktopUnsignedReleaseManifestSchema.parse(value))
    .sort((left, right) =>
      left.target.architecture.localeCompare(right.target.architecture),
    );
  if (
    manifests.length !== 2 ||
    manifests[0]?.target.architecture !== "arm64" ||
    manifests[1]?.target.architecture !== "x64"
  ) {
    throw new Error("desktop-release-dual-architecture-incomplete");
  }
  const arm64: DesktopUnsignedReleaseManifest = manifests[0]!;
  const x64: DesktopUnsignedReleaseManifest = manifests[1]!;
  if (
    arm64.product.appVersion !== x64.product.appVersion ||
    arm64.source.exactCommit !== x64.source.exactCommit
  ) {
    throw new Error("desktop-release-dual-identity-mismatch");
  }
  return manifests;
};

const assertNativeGateEvidence = async ({
  evidenceRoot,
  architecture,
  exactCommit,
}: {
  readonly evidenceRoot: string;
  readonly architecture: DesktopDarwinArchitecture;
  readonly exactCommit: string;
}) => {
  const [source, runner, repository] = await Promise.all([
    readStrictJson(join(evidenceRoot, "source.json")),
    readStrictJson(join(evidenceRoot, "runner-summary.json")),
    readStrictJson(join(evidenceRoot, "repository-gate.json")),
  ]);
  if (
    typeof source !== "object" ||
    source === null ||
    (source as Record<string, unknown>).exactCommit !== exactCommit ||
    (source as Record<string, unknown>).architecture !== architecture ||
    (source as Record<string, unknown>).trackedWorktreeClean !== true
  ) {
    throw new Error("desktop-release-native-gate-source-invalid");
  }
  const runnerRecord = runner as Record<string, unknown>;
  if (
    runnerRecord.contractVersion !== "desktop-native-runner-v2" ||
    runnerRecord.status !== "native-evidence-complete" ||
    runnerRecord.architecture !== architecture ||
    NATIVE_GATE_REQUIRED_RESULTS.some((key) => runnerRecord[key] !== true) ||
    runnerRecord.externalCreativeAgentTested !== false ||
    runnerRecord.hostToolsRequiredAtRuntime !== false ||
    runnerRecord.fixtureOrDeliveryUploaded !== false
  ) {
    throw new Error("desktop-release-native-gate-runner-invalid");
  }
  const repositoryRecord = repository as Record<string, unknown>;
  if (
    repositoryRecord.contractVersion !== "desktop-native-repository-gate-v1" ||
    Object.entries(repositoryRecord).some(
      ([key, value]) => key !== "contractVersion" && value !== true,
    )
  ) {
    throw new Error("desktop-release-native-gate-repository-invalid");
  }
};

const assertOrdinaryPackage = async (appPath: string) => {
  const files: string[] = [];
  const walk = async (root: string) => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await walk(appPath);
  for (const path of files) {
    const metadata = await lstat(path);
    if (metadata.size > 256 * 1024 * 1024) continue;
    const bytes = await readFile(path);
    for (const marker of ORDINARY_PACKAGE_FORBIDDEN_MARKERS) {
      if (bytes.includes(Buffer.from(marker))) {
        throw new Error(`desktop-release-native-harness-leaked:${marker}`);
      }
    }
  }
};

const verifyReleaseRoot = async (releaseRoot: string) => {
  const entries = (await readdir(releaseRoot)).sort();
  const manifest = DesktopUnsignedReleaseManifestSchema.parse(
    await readStrictJson(join(releaseRoot, "release-manifest.json")),
  );
  const checksumFile = `${manifest.installer.fileName}.sha256`;
  const expectedEntries = [
    ...RELEASE_EXACT_STATIC_FILES,
    manifest.installer.fileName,
    checksumFile,
  ].sort();
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    throw new Error("desktop-release-artifact-inventory-drift");
  }
  for (const entry of entries) {
    const metadata = await lstat(join(releaseRoot, entry));
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`desktop-release-artifact-entry-unsafe:${entry}`);
    }
  }
  for (const identity of [
    manifest.installer,
    manifest.runtimeSbomInput,
    manifest.installInstructions,
    manifest.verificationReport,
  ]) {
    const actual = await inspectReleaseFile(
      join(releaseRoot, identity.fileName),
    );
    if (
      actual.sizeBytes !== identity.sizeBytes ||
      actual.sha256 !== identity.sha256
    ) {
      throw new Error(
        `desktop-release-artifact-checksum-drift:${identity.fileName}`,
      );
    }
  }
  const checksum = await readFile(join(releaseRoot, checksumFile), "utf8");
  if (
    checksum !==
    `${manifest.installer.sha256}  ${manifest.installer.fileName}\n`
  ) {
    throw new Error("desktop-release-installer-checksum-file-invalid");
  }
  const verification = DesktopInstallerVerificationSchema.parse(
    await readStrictJson(
      join(releaseRoot, manifest.verificationReport.fileName),
    ),
  );
  if (
    verification.architecture !== manifest.target.architecture ||
    verification.appVersion !== manifest.product.appVersion ||
    verification.exactCommit !== manifest.source.exactCommit ||
    verification.runtimePackId !== manifest.application.runtimePackId
  ) {
    throw new Error("desktop-release-verification-identity-mismatch");
  }
  return manifest;
};

const run = (command: string, args: readonly string[], env = process.env) =>
  new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else
        reject(new Error(`${basename(command)} failed (${signal ?? code}).`));
    });
  });

const requiredOption = (args: readonly string[], name: string) => {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`desktop-release-option-required:${name.slice(2)}`);
  }
  return value;
};

const readRootPackage = async () =>
  JSON.parse(await readFile("package.json", "utf8")) as {
    readonly version: string;
  };

const buildReleaseArtifact = async (args: readonly string[]) => {
  const architecture = DesktopDarwinArchitectureSchema.parse(
    requiredOption(args, "--architecture"),
  );
  const target = assertDesktopDarwinNativeHost({
    expectedArchitecture: architecture,
  });
  const exactCommit = requiredOption(args, "--expected-commit");
  const releaseRoot = resolve(requiredOption(args, "--release-root"));
  const evidenceRoot = resolve(requiredOption(args, "--native-evidence-root"));
  const verificationRoot = resolve(requiredOption(args, "--verification-root"));
  const actualCommit = await import("node:child_process").then(
    ({ execFileSync }) =>
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  );
  if (actualCommit !== exactCommit || !/^[a-f0-9]{40}$/u.test(exactCommit)) {
    throw new Error("desktop-release-exact-commit-mismatch");
  }
  await assertNativeGateEvidence({ evidenceRoot, architecture, exactCommit });
  if (process.env.AXMORF_DESKTOP_NATIVE_GATE_BUILD === "1") {
    throw new Error("desktop-release-native-gate-build-forbidden");
  }
  const ordinaryEnvironment = { ...process.env };
  delete ordinaryEnvironment.AXMORF_DESKTOP_NATIVE_GATE_BUILD;
  await run(
    "npm",
    ["run", "desktop:package", "--", "--architecture", architecture],
    ordinaryEnvironment,
  );
  const appPath = join(
    process.cwd(),
    "out",
    target.forgeOutputDirectory,
    `${DESKTOP_PRODUCT_NAME}.app`,
  );
  await assertOrdinaryPackage(appPath);
  const packageInventory = verifyDesktopPackageInventory(appPath, {
    expectedArchitecture: architecture,
  });
  await run(
    join(process.cwd(), "node_modules/.bin/electron-forge"),
    ["make", "--skip-package", "--platform=darwin", `--arch=${architecture}`],
    ordinaryEnvironment,
  );
  const { version: appVersion } = await readRootPackage();
  const dmgFileName = createDesktopUnsignedDmgFileName({
    appVersion,
    architecture,
  });
  const dmgPath = await discoverDesktopUnsignedDmgOutputPath({
    checkoutRoot: process.cwd(),
    expectedFileName: dmgFileName,
  });
  const verificationPath = join(
    verificationRoot,
    "installer-verification.json",
  );
  await run("bash", [
    join(process.cwd(), "scripts/desktop/verify-unsigned-dmg.sh"),
    "--architecture",
    architecture,
    "--expected-commit",
    exactCommit,
    "--app-version",
    appVersion,
    "--user-data-directory",
    DESKTOP_PRODUCT_NAME,
    "--dmg",
    dmgPath,
    "--ordinary-app",
    appPath,
    "--native-evidence-root",
    evidenceRoot,
    "--output-root",
    verificationRoot,
  ]);
  const verification = DesktopInstallerVerificationSchema.parse(
    await readStrictJson(verificationPath),
  );
  if (
    verification.architecture !== architecture ||
    verification.appVersion !== appVersion ||
    verification.exactCommit !== exactCommit ||
    verification.runtimePackId !== packageInventory.runtimePackId
  ) {
    throw new Error("desktop-release-installer-verification-mismatch");
  }
  const releaseParent = dirname(releaseRoot);
  const releaseMetadata = await lstat(releaseRoot).catch(() => null);
  if (releaseMetadata !== null) {
    throw new Error("desktop-release-root-already-exists");
  }
  await mkdir(releaseParent, { recursive: true });
  const staging = join(
    releaseParent,
    `.${basename(releaseRoot)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await mkdir(staging);
  let promoted = false;
  try {
    const stagedDmg = join(staging, dmgFileName);
    await copyFile(dmgPath, stagedDmg);
    const sbomPath = join(staging, "runtime-sbom-input.json");
    await writeFile(
      sbomPath,
      serialize(
        await createDesktopSbomInput(
          join(appPath, "Contents/Resources/runtime-pack"),
        ),
      ),
      { mode: 0o644 },
    );
    const instructionsPath = join(staging, "INSTALL.md");
    await writeFile(
      instructionsPath,
      createDesktopUnsignedInstallInstructions({
        architecture,
        appVersion,
        dmgFileName,
      }),
      { mode: 0o644 },
    );
    const stagedVerification = join(staging, "installer-verification.json");
    await writeFile(stagedVerification, serialize(verification), {
      mode: 0o644,
    });
    const [installer, runtimeSbomInput, installInstructions, verificationFile] =
      await Promise.all([
        inspectReleaseFile(stagedDmg),
        inspectReleaseFile(sbomPath),
        inspectReleaseFile(instructionsPath),
        inspectReleaseFile(stagedVerification),
      ]);
    await writeFile(
      join(staging, `${dmgFileName}.sha256`),
      `${installer.sha256}  ${installer.fileName}\n`,
      { mode: 0o644 },
    );
    const manifest = buildDesktopUnsignedReleaseManifest({
      architecture,
      appVersion,
      exactCommit,
      runtimePackId: packageInventory.runtimePackId,
      packageInventory,
      installer,
      runtimeSbomInput,
      installInstructions,
      verification: verificationFile,
      provenance: {
        githubRunId: process.env.GITHUB_RUN_ID ?? "0",
        githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "0",
        githubJob: process.env.GITHUB_JOB ?? "local",
      },
    });
    await writeFile(
      join(staging, "release-manifest.json"),
      serialize(manifest),
      {
        mode: 0o644,
      },
    );
    await verifyReleaseRoot(staging);
    await rename(staging, releaseRoot);
    promoted = true;
  } finally {
    if (!promoted) await rm(staging, { recursive: true, force: true });
  }
  process.stdout.write(`${serialize(await verifyReleaseRoot(releaseRoot))}`);
};

const validateReleaseSet = async (args: readonly string[]) => {
  const root = resolve(requiredOption(args, "--root"));
  const exactCommit = requiredOption(args, "--expected-commit");
  const arm64Root = join(root, "arm64");
  const x64Root = join(root, "x64");
  const manifests = validateDesktopDualArchitectureRelease([
    await verifyReleaseRoot(arm64Root),
    await verifyReleaseRoot(x64Root),
  ]);
  if (
    manifests.some((manifest) => manifest.source.exactCommit !== exactCommit)
  ) {
    throw new Error("desktop-release-set-commit-mismatch");
  }
  const entries = await Promise.all(
    manifests.map(async (manifest) => {
      const directory = manifest.target.architecture;
      return {
        architecture: manifest.target.architecture,
        directory,
        manifestSha256: await sha256File(
          join(root, directory, "release-manifest.json"),
        ),
        installerSha256: manifest.installer.sha256,
      };
    }),
  );
  const dual = DesktopDualReleaseManifestSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-dual-unsigned-dmg-release-v1",
    channel: "internal-manual-only",
    productName: DESKTOP_PRODUCT_NAME,
    appVersion: manifests[0]!.product.appVersion,
    exactCommit,
    complete: true,
    architectures: entries,
  });
  await writeFile(join(root, "dual-release-manifest.json"), serialize(dual), {
    flag: "wx",
    mode: 0o644,
  });
  process.stdout.write(serialize(dual));
};

const runCli = async (args: readonly string[]) => {
  const command = args[0];
  if (command === "build") return buildReleaseArtifact(args.slice(1));
  if (command === "verify") {
    process.stdout.write(
      serialize(
        await verifyReleaseRoot(
          resolve(requiredOption(args.slice(1), "--root")),
        ),
      ),
    );
    return;
  }
  if (command === "validate-set") return validateReleaseSet(args.slice(1));
  if (command === "describe-target") {
    const architecture = DesktopDarwinArchitectureSchema.parse(
      requiredOption(args.slice(1), "--architecture"),
    );
    process.stdout.write(serialize(getDesktopDarwinTarget(architecture)));
    return;
  }
  throw new Error("desktop-release-command-invalid");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "desktop-release-failed"}\n`,
    );
    process.exitCode = 1;
  });
}
