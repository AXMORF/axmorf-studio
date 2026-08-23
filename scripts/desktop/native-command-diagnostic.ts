import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const DESKTOP_NATIVE_COMMAND_DIAGNOSTIC_VERSION =
  "desktop-native-command-failure-v1" as const;

const MAXIMUM_MESSAGE_BYTES = 2 * 1024;

const contained = (root: string, candidate: string) => {
  const value = relative(root, candidate);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`);
};

export const recordWorkspaceCommandFailure = async ({
  workspaceRoot,
  command,
  storyId,
  error,
}: {
  readonly workspaceRoot: string;
  readonly command: string;
  readonly storyId: string | null;
  readonly error: unknown;
}) => {
  const root = resolve(workspaceRoot);
  if ((await realpath(root)) !== root) {
    throw new Error("Native command diagnostic Workspace is not canonical.");
  }
  const gateRoot = join(root, ".rsp/native-gate");
  if (!contained(root, gateRoot)) {
    throw new Error("Native command diagnostic escaped the Workspace.");
  }
  await mkdir(gateRoot, { recursive: true, mode: 0o700 });
  const gateMetadata = await lstat(gateRoot);
  if (
    gateMetadata.isSymbolicLink() ||
    !gateMetadata.isDirectory() ||
    (await realpath(gateRoot)) !== gateRoot ||
    (gateMetadata.mode & 0o077) !== 0
  ) {
    throw new Error("Native command diagnostic root is unsafe.");
  }
  const target = join(gateRoot, "command-failure.json");
  const temporary = join(gateRoot, `.command-failure.${process.pid}.tmp`);
  const rawMessage = error instanceof Error ? error.message : "unknown-error";
  const redacted = rawMessage.replaceAll(root, "<workspace-root>");
  const message = Buffer.from(redacted, "utf8")
    .subarray(0, MAXIMUM_MESSAGE_BYTES)
    .toString("utf8");
  try {
    await writeFile(
      temporary,
      `${JSON.stringify({
        contractVersion: DESKTOP_NATIVE_COMMAND_DIAGNOSTIC_VERSION,
        command,
        storyId,
        message,
      })}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
};
