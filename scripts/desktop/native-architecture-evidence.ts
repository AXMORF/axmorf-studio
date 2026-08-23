import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { verifyRuntimePack } from "../../desktop/adapters/runtime-pack-filesystem";
import {
  assertDesktopDarwinNativeHost,
  DesktopDarwinArchitectureSchema,
  getDesktopDarwinTarget,
  type DesktopDarwinArchitecture,
} from "../../desktop/configuration/darwin-target";
import { verifyDesktopPackageInventory } from "./package-inventory";

const execFileAsync = promisify(execFile);
const NODE_SEA_SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const option = (args: readonly string[], name: string) => {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(
      `desktop-native-architecture-option-required:${name.slice(2)}`,
    );
  }
  return value;
};

const readArchitecture = (args: readonly string[]) =>
  DesktopDarwinArchitectureSchema.parse(option(args, "--architecture"));

const writeEvidence = async (path: string, value: unknown) => {
  await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
};

const containsSentinel = async (path: string, value: 0 | 1) =>
  (await readFile(path)).includes(Buffer.from(`${NODE_SEA_SENTINEL}:${value}`));

export const inspectNativeMachO = async ({
  architecture,
  label,
  path,
}: {
  readonly architecture: DesktopDarwinArchitecture;
  readonly label: string;
  readonly path: string;
}) => {
  const target = getDesktopDarwinTarget(architecture);
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o111) === 0
  ) {
    throw new Error(`desktop-native-binary-unsafe:${label}`);
  }
  const [{ stdout: lipoOutput }, { stdout: fileOutput }, bytes] =
    await Promise.all([
      execFileAsync("/usr/bin/lipo", ["-archs", path], {
        encoding: "utf8",
        maxBuffer: 64 * 1024,
      }),
      execFileAsync("/usr/bin/file", ["-b", path], {
        encoding: "utf8",
        maxBuffer: 64 * 1024,
      }),
      readFile(path),
    ]);
  const architectures = lipoOutput.trim().split(/\s+/u).filter(Boolean);
  const fileIdentity = fileOutput.trim();
  if (
    architectures.length !== 1 ||
    architectures[0] !== target.machoArchitecture ||
    !fileIdentity.includes("Mach-O") ||
    !fileIdentity.includes(target.machoArchitecture)
  ) {
    throw new Error(`desktop-native-binary-architecture-mismatch:${label}`);
  }
  return {
    label,
    architectures,
    fileIdentity,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  } as const;
};

export const collectNativeHostEvidence = async (
  architecture: DesktopDarwinArchitecture,
) => {
  const target = assertDesktopDarwinNativeHost({
    expectedArchitecture: architecture,
  });
  const { stdout } = await execFileAsync("/usr/bin/uname", ["-m"], {
    encoding: "utf8",
    maxBuffer: 1024,
  });
  const unameArchitecture = stdout.trim();
  if (unameArchitecture !== target.unameArchitecture) {
    throw new Error("desktop-native-uname-architecture-mismatch");
  }
  if (!(await containsSentinel(process.execPath, 0))) {
    throw new Error("desktop-native-node-sea-sentinel-missing");
  }
  return {
    contractVersion: "desktop-native-host-evidence-v1",
    platform: process.platform,
    processArchitecture: process.arch,
    unameArchitecture,
    machoArchitecture: target.machoArchitecture,
    nodeVersion: process.version,
    nodeSeaCapable: true,
  } as const;
};

export const collectNativePackageEvidence = async ({
  appPath,
  architecture,
}: {
  readonly appPath: string;
  readonly architecture: DesktopDarwinArchitecture;
}) => {
  const target = assertDesktopDarwinNativeHost({
    expectedArchitecture: architecture,
  });
  const absoluteAppPath = resolve(appPath);
  const resourcesRoot = join(absoluteAppPath, "Contents", "Resources");
  const runtimePackRoot = join(resourcesRoot, "runtime-pack");
  const runtimePack = await verifyRuntimePack({
    runtimePackRoot,
    expectedResourcesRoot: resourcesRoot,
    expectedPlatform: target.platform,
    expectedArchitecture: target.architecture,
  });
  const packageInventory = verifyDesktopPackageInventory(absoluteAppPath, {
    expectedArchitecture: target.architecture,
  });
  const binaries = await Promise.all(
    [
      {
        label: "electron-app",
        path: join(absoluteAppPath, "Contents/MacOS/AXMORF Studio"),
      },
      {
        label: "renderer-browser",
        path: join(runtimePackRoot, runtimePack.rendererBrowser.relativePath),
      },
      {
        label: "ffmpeg",
        path: join(runtimePackRoot, runtimePack.ffmpeg.relativePath),
      },
      {
        label: "ffprobe",
        path: join(runtimePackRoot, runtimePack.ffprobe.relativePath),
      },
      {
        label: "node",
        path: join(runtimePackRoot, runtimePack.node.relativePath),
      },
      {
        label: "rsp-sea",
        path: join(runtimePackRoot, runtimePack.rspClient.relativePath),
      },
      {
        label: "remotion-compositor",
        path: join(runtimePackRoot, "bin/remotion"),
      },
    ].map(({ label, path }) =>
      inspectNativeMachO({ architecture: target.architecture, label, path }),
    ),
  );
  const rspPath = join(runtimePackRoot, runtimePack.rspClient.relativePath);
  const nodePath = join(runtimePackRoot, runtimePack.node.relativePath);
  if (
    !(await containsSentinel(rspPath, 1)) ||
    !(await containsSentinel(nodePath, 0))
  ) {
    throw new Error("desktop-native-runtime-sea-identity-invalid");
  }
  return {
    contractVersion: "desktop-native-package-evidence-v1",
    architecture: target.architecture,
    compositorPackage: target.compositorPackageName,
    runtimePackId: runtimePack.runtimePackId,
    runtimePackFiles: runtimePack.files.length,
    packageInventory: {
      asarEntries: packageInventory.asarEntries,
      unpackedFiles: packageInventory.unpackedFiles,
      asarSha256: packageInventory.asarSha256,
      workspaceIntegrationFiles: packageInventory.workspaceIntegrationFiles,
      workspaceIntegrationSha256: packageInventory.workspaceIntegrationSha256,
    },
    rspSeaInjected: true,
    runtimeNodeSeaCapable: true,
    binaries,
  } as const;
};

const runCli = async (args: readonly string[]) => {
  const command = args[0];
  const architecture = readArchitecture(args);
  if (command === "describe") {
    process.stdout.write(
      `${JSON.stringify(getDesktopDarwinTarget(architecture))}\n`,
    );
    return;
  }
  const output = option(args, "--output");
  if (command === "assert-host") {
    await writeEvidence(output, await collectNativeHostEvidence(architecture));
    return;
  }
  if (command === "assert-package") {
    await writeEvidence(
      output,
      await collectNativePackageEvidence({
        architecture,
        appPath: option(args, "--app"),
      }),
    );
    return;
  }
  throw new Error("desktop-native-architecture-command-invalid");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "desktop-native-architecture-failed"}\n`,
    );
    process.exitCode = 1;
  });
}
