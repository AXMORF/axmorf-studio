import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assertDesktopNativeHost } from "../../desktop/configuration/native-target";
import { pruneDesktopLinuxElectronLocales } from "./electron-locales";
import { verifyDesktopPackageInventory } from "./package-inventory";
import { desktopReleaseToolchain } from "./release-toolchain";

const run = (command: string, args: readonly string[]) =>
  new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `Ubuntu package prerequisite failed with ${signal === null ? `exit ${code}` : `signal ${signal}`}.`,
          ),
        );
      }
    });
  });

const findDebPackage = async (directory: string) => {
  const matches: string[] = [];
  const walk = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".deb")) {
        matches.push(resolve(path));
      }
    }
  };
  await walk(directory);
  if (matches.length !== 1) {
    throw new Error(`desktop-ubuntu-package-count-invalid:${matches.length}`);
  }
  return matches[0]!;
};

void (async () => {
  const toolchain = desktopReleaseToolchain();
  const target = assertDesktopNativeHost({
    expectedPlatform: "linux",
    expectedArchitecture: "x64",
  });
  await run(toolchain.node, [
    "--import",
    "tsx",
    join(process.cwd(), "scripts/desktop/generate-brand-assets.ts"),
  ]);
  await run(toolchain.node, [
    "--import",
    "tsx",
    join(process.cwd(), "scripts/desktop/build-runtime-pack.ts"),
    "--platform",
    target.platform,
    "--architecture",
    target.architecture,
  ]);
  await run(toolchain.node, [
    toolchain.forgeCli,
    "package",
    "--platform=linux",
    "--arch=x64",
  ]);
  const applicationPath = join(
    process.cwd(),
    "out",
    target.forgeOutputDirectory,
  );
  await pruneDesktopLinuxElectronLocales(applicationPath);
  const inventory = verifyDesktopPackageInventory(applicationPath, {
    expectedPlatform: target.platform,
    expectedArchitecture: target.architecture,
  });
  await run(toolchain.node, [
    toolchain.forgeCli,
    "make",
    "--skip-package",
    "--platform=linux",
    "--arch=x64",
    "--targets=deb",
  ]);
  const packagePath = await findDebPackage(
    join(process.cwd(), "out", "make", "deb", target.architecture),
  );
  const metadata = await lstat(packagePath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size === 0) {
    throw new Error("desktop-ubuntu-package-invalid");
  }
  const extractedRoot = await mkdtemp(
    join(tmpdir(), "axmorf-ubuntu-package-verify-"),
  );
  try {
    await run("dpkg-deb", ["-x", packagePath, extractedRoot]);
    const extractedAppPath = join(
      extractedRoot,
      "usr/lib/axmorf-studio",
    );
    const extractedInventory = verifyDesktopPackageInventory(
      extractedAppPath,
      {
        expectedPlatform: target.platform,
        expectedArchitecture: target.architecture,
      },
    );
    if (JSON.stringify(extractedInventory) !== JSON.stringify(inventory)) {
      throw new Error("desktop-ubuntu-package-extracted-inventory-drift");
    }
    await run(
      join(extractedAppPath, "resources/runtime-pack/bin/rsp"),
      ["help", "--json"],
    );
  } finally {
    await rm(extractedRoot, { recursive: true, force: true });
  }
  const sha256 = createHash("sha256")
    .update(await readFile(packagePath))
    .digest("hex");
  process.stdout.write(
    `${JSON.stringify({ packagePath, sizeBytes: metadata.size, sha256, inventory })}\n`,
  );
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Ubuntu package failed."}\n`,
  );
  process.exitCode = 1;
});
