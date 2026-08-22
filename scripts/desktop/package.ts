import { spawn } from "node:child_process";
import { join } from "node:path";

import { verifyDesktopPackageInventory } from "./package-inventory";

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

if (process.platform !== "darwin") {
  process.stderr.write(
    "desktop-native-package-unavailable: desktop:package requires a native macOS host.\n",
  );
  process.exitCode = 1;
} else {
  void (async () => {
    await run(process.execPath, [
      "--import",
      "tsx",
      join(process.cwd(), "scripts/desktop/generate-brand-assets.ts"),
    ]);
    await run(join(process.cwd(), "node_modules/.bin/vite"), [
      "build",
      "--config",
      "vite.desktop.rsp.config.ts",
    ]);
    await run(join(process.cwd(), "node_modules/.bin/electron-forge"), [
      "package",
      "--platform=darwin",
      `--arch=${process.arch}`,
    ]);
    const inventory = verifyDesktopPackageInventory(
      join(
        process.cwd(),
        "out",
        `AXMORF Studio-darwin-${process.arch}`,
        "AXMORF Studio.app",
      ),
    );
    process.stdout.write(`${JSON.stringify(inventory)}\n`);
  })().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Desktop package failed."}\n`,
    );
    process.exitCode = 1;
  });
}
