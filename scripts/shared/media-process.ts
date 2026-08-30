import { spawn } from "node:child_process";
import { basename } from "node:path";

import type { ProcessRunner } from "./process";

const isRemotionCliInvocation = (
  command: string,
  args: readonly string[],
): boolean =>
  command === process.execPath &&
  args[0] !== undefined &&
  basename(args[0]) === "remotion-cli.js";

export const runMediaProcess: ProcessRunner = (command, args) => {
  if (
    basename(command) !== "remotion" &&
    !isRemotionCliInvocation(command, args)
  ) {
    throw new Error(
      "Media process adapter only permits Remotion and FFmpeg tools.",
    );
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
