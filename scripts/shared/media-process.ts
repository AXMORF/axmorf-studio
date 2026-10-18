import { runBoundedProcess } from "../../packages/studio/src/process/bounded-process";
import { basename } from "node:path";

import type { ProcessRunner } from "./process";

const isRemotionCliInvocation = (
  command: string,
  args: readonly string[],
): boolean =>
  command === process.execPath &&
  args[0] !== undefined &&
  basename(args[0]) === "remotion-cli.js";

export const runMediaProcess: ProcessRunner = async (
  command,
  args,
  options,
) => {
  if (
    basename(command) !== "remotion" &&
    !isRemotionCliInvocation(command, args)
  ) {
    throw new Error(
      "Media process adapter only permits Remotion and FFmpeg tools.",
    );
  }
  return runBoundedProcess(command, args, {
    ...options,
    cwd: options?.cwd ?? process.cwd(),
  });
};
