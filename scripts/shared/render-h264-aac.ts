import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runMediaProcess } from "./media-process";
import { resolveMediaToolCommand } from "./media-tool-command";
import type { ProcessRunner } from "./process";

const H264_PCM_RENDER_OPTIONS = {
  codec: "h264",
  pixelFormat: "yuv420p",
  audioCodec: "pcm-16",
  sampleRate: 48_000,
  enforceAudioTrack: true,
  disallowParallelEncoding: true,
} as const;

const requireRegularMedia = async (path: string, label: string) => {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isFile() || state.size === 0) {
    throw new Error(`${label} must be non-empty regular media.`);
  }
};

export const renderH264AacVideo = async ({
  rootDir,
  outputPath,
  audioChannels,
  render,
  runProcess = runMediaProcess,
  resolveMediaTool = resolveMediaToolCommand,
}: {
  readonly rootDir: string;
  readonly outputPath: string;
  readonly audioChannels: 1 | 2;
  // The callback must use Remotion's sequential encoding path to preserve
  // exact frame timestamps, and export its complete mix as uncompressed PCM.
  readonly render: (paths: {
    readonly videoPath: string;
    readonly pcmPath: string;
    readonly options: typeof H264_PCM_RENDER_OPTIONS;
  }) => Promise<void>;
  readonly runProcess?: ProcessRunner;
  readonly resolveMediaTool?: typeof resolveMediaToolCommand;
}) => {
  await mkdir(dirname(outputPath), { recursive: true });
  const staging = await mkdtemp(join(dirname(outputPath), ".media-render-"));
  try {
    const videoPath = join(staging, "video.mp4");
    const pcmPath = join(staging, "audio.wav");
    await render({ videoPath, pcmPath, options: H264_PCM_RENDER_OPTIONS });
    await requireRegularMedia(videoPath, "Rendered H.264");
    await requireRegularMedia(pcmPath, "Rendered PCM");
    const muxedPath = join(staging, "muxed.mp4");
    // ADTS cannot carry AAC priming metadata. Keep Remotion's mix lossless,
    // encode once into MP4, and let the encoder/muxer signal its actual delay.
    const command = await resolveMediaTool({
      rootDir,
      tool: "ffmpeg",
      args: [
        "-v",
        "error",
        "-i",
        videoPath,
        "-i",
        pcmPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-map_metadata",
        "-1",
        "-c:v",
        "copy",
        "-c:a",
        "libfdk_aac",
        "-ac",
        String(audioChannels),
        "-b:a",
        audioChannels === 1 ? "160k" : "320k",
        "-cutoff",
        "18000",
        "-use_editlist",
        "1",
        "-movflags",
        "+faststart",
        "-y",
        muxedPath,
      ],
    });
    const muxed = await runProcess(command.command, command.args, {
      cwd: rootDir,
    });
    if (muxed.status !== 0) {
      throw new Error("Rendered H.264/AAC mux failed.");
    }
    await requireRegularMedia(muxedPath, "Muxed H.264/AAC");
    await rename(muxedPath, outputPath);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};
