import { spawn } from "node:child_process";
import { basename } from "node:path";

import type { ProcessRunner } from "../../baseline/evidence";

const ALLOWED_MEDIA_EXECUTABLES = new Set(["ffmpeg", "ffprobe", "remotion"]);

export const runProductionMediaProcess: ProcessRunner = (command, args) => {
  if (!ALLOWED_MEDIA_EXECUTABLES.has(basename(command))) {
    throw new Error("Production process adapter only permits Remotion and FFmpeg tools.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) =>
      resolve({ status: status ?? -1, stdout, stderr }),
    );
  });
};
