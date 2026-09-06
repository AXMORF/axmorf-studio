import { getProcessDiagnosticRoot } from "../../packages/studio/src/process/process-ownership";
import { runBoundedProcess } from "../../packages/studio/src/process/bounded-process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

import type { ProcessRunner } from "./process";
import { hasProcessDeadline, resolveProcessTimeout } from "./process-deadline";

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
  const cwd = options?.cwd ?? process.cwd();
  if (!hasProcessDeadline()) {
    return runBoundedProcess(command, args, options);
  }
  const logDirectory = join(getProcessDiagnosticRoot(cwd), ".process-logs");
  await mkdir(logDirectory, { recursive: true });
  const logPath = options?.logPath ?? join(logDirectory, `${randomUUID()}.log`);
  try {
    return await runBoundedProcess(command, args, {
      ...options,
      cwd,
      logPath,
      trackOwnership: true,
      timeoutMs: resolveProcessTimeout(options?.timeoutMs),
    });
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : "Media process failed"} Diagnostic log: ${logPath}`,
      { cause: error },
    );
  }
};
