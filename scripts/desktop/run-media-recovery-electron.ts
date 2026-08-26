import { spawn } from "node:child_process";
import { resolve } from "node:path";

const command = process.platform === "linux" ? "xvfb-run" : "electron";
const args =
  process.platform === "linux"
    ? ["-a", "electron", resolve(".vite/build/media-recovery-electron.cjs")]
    : process.platform === "darwin"
      ? [resolve(".vite/build/media-recovery-electron.cjs")]
      : null;

if (args === null) {
  throw new Error("desktop-media-recovery-electron-host-unsupported");
}

const child = spawn(command, args, { stdio: "inherit" });
child.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal === null ? 1 : 128);
});
