import { spawn } from "node:child_process";
import { join } from "node:path";

import {
  assertDesktopDarwinNativeHost,
  DesktopDarwinArchitectureSchema,
} from "../../desktop/configuration/darwin-target";
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
            `Desktop package prerequisite failed with ${signal === null ? `exit ${code}` : `signal ${signal}`}.`,
          ),
        );
      }
    });
  });

const architectureOption = process.argv.indexOf("--architecture");
const requestedArchitecture = DesktopDarwinArchitectureSchema.safeParse(
  architectureOption === -1
    ? process.arch
    : process.argv[architectureOption + 1],
);

if (process.platform !== "darwin" || !requestedArchitecture.success) {
  process.stderr.write(
    "desktop-native-package-unavailable: desktop:package requires a native macOS host.\n",
  );
  process.exitCode = 1;
} else {
  void (async () => {
    const toolchain = desktopReleaseToolchain();
    const target = assertDesktopDarwinNativeHost({
      expectedArchitecture: requestedArchitecture.data,
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
      "--architecture",
      target.architecture,
    ]);
    await run(toolchain.node, [
      toolchain.forgeCli,
      "package",
      "--platform=darwin",
      `--arch=${target.architecture}`,
    ]);
    const inventory = verifyDesktopPackageInventory(
      join(
        process.cwd(),
        "out",
        target.forgeOutputDirectory,
        "AXMORF Studio.app",
      ),
      { expectedArchitecture: target.architecture },
    );
    process.stdout.write(`${JSON.stringify(inventory)}\n`);
  })().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Desktop package failed."}\n`,
    );
    process.exitCode = 1;
  });
}
