import { resolveRemotionCliInvocation } from "./remotion-command";

export type MediaTool = "ffmpeg" | "ffprobe";

export type MediaToolCommand = Readonly<{
  command: string;
  args: readonly string[];
}>;

export const resolveMediaToolCommand = async ({
  rootDir,
  tool,
  args,
}: {
  readonly rootDir: string;
  readonly tool: MediaTool;
  readonly args: readonly string[];
}): Promise<MediaToolCommand> => {
  const { command, argsPrefix } = await resolveRemotionCliInvocation(rootDir);
  return {
    command,
    args: [...argsPrefix, tool, ...args],
  };
};
