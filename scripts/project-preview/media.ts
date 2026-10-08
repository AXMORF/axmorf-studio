import { basename } from "node:path";

import { runMediaProcess } from "../shared/media-process";
import { resolveMediaToolCommand } from "../shared/media-tool-command";
import { renderH264AacVideo } from "../shared/render-h264-aac";
import type { ProcessRunner } from "../shared/process";
import { resolveRemotionCliInvocation } from "../shared/remotion-command";
import type { PreviewProfile } from "./domain";

export const renderProjectPreview = async ({
  rootDir,
  entryPoint,
  publicDir,
  compositionId,
  outputPath,
  profile,
  runProcess = runMediaProcess,
  resolveInvocation = resolveRemotionCliInvocation,
  resolveMediaTool = resolveMediaToolCommand,
}: {
  readonly rootDir: string;
  readonly entryPoint: string;
  readonly publicDir: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly profile: PreviewProfile;
  readonly runProcess?: ProcessRunner;
  readonly resolveInvocation?: typeof resolveRemotionCliInvocation;
  readonly resolveMediaTool?: typeof resolveMediaToolCommand;
}) => {
  const invocation = await resolveInvocation(rootDir);
  await renderH264AacVideo({
    rootDir,
    outputPath,
    audioChannels: profile.audioChannels,
    runProcess,
    resolveMediaTool,
    render: async ({ videoPath, pcmPath, options }) => {
      const result = await runProcess(
        invocation.command,
        [
          ...invocation.argsPrefix,
          "render",
          entryPoint,
          compositionId,
          videoPath,
          `--codec=${options.codec}`,
          `--audio-codec=${options.audioCodec}`,
          `--separate-audio-to=${pcmPath}`,
          `--sample-rate=${options.sampleRate}`,
          "--disallow-parallel-encoding",
          "--enforce-audio-track",
          `--pixel-format=${options.pixelFormat}`,
          `--crf=${profile.crf}`,
          `--scale=${profile.scale}`,
          "--log=error",
          `--public-dir=${publicDir}`,
        ],
        { cwd: rootDir },
      );
      if (result.status !== 0) {
        throw new Error(
          `Remotion could not render Project preview: ${basename(outputPath)}.`,
        );
      }
    },
  });
};
