import { spawn } from "node:child_process";
import { join } from "node:path";

if (process.platform !== "darwin") {
  process.stderr.write(
    "desktop-native-package-unavailable: desktop:package requires a native macOS host.\n",
  );
  process.exitCode = 1;
} else {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      join(process.cwd(), "scripts/desktop/generate-brand-assets.ts"),
    ],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  child.once("exit", (code) => {
    if (code !== 0) {
      process.exitCode = code ?? 1;
      return;
    }
    const forge = spawn(
      join(process.cwd(), "node_modules/.bin/electron-forge"),
      ["package", "--platform=darwin", `--arch=${process.arch}`],
      { cwd: process.cwd(), stdio: "inherit" },
    );
    forge.once("exit", (forgeCode) => {
      process.exitCode = forgeCode ?? 1;
    });
  });
}
