import { join } from "node:path";

import { runMediaProcess } from "../shared/media-process";
import type { ProcessRunner } from "../shared/process";
import { resolveRemotionCliInvocation } from "../shared/remotion-command";
import { renderH264AacVideo } from "../shared/render-h264-aac";

export type FilmMediaRunner = Readonly<{
  runProcess: ProcessRunner;
}>;

/** Keeps the end of Remotion's output, where the actual error is reported. */
const failure = (label: string, result: { stdout: string; stderr: string }) => {
  const detail = `${result.stderr}\n${result.stdout}`
    .trim()
    .split("\n")
    .slice(-25)
    .join("\n");
  return new Error(`${label} failed.${detail ? `\n${detail}` : ""}`);
};

const remotion = async (
  rootDir: string,
  args: readonly string[],
  label: string,
  runProcess: ProcessRunner,
  logLevel: "error" | "warn" = "error",
  timeoutMs?: number,
) => {
  const invocation = await resolveRemotionCliInvocation(rootDir);
  let result;
  try {
    result = await runProcess(
      invocation.command,
      [
        ...invocation.argsPrefix,
        ...args,
        `--log=${logLevel}`,
        `--public-dir=${join(rootDir, "public")}`,
      ],
      { cwd: rootDir, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
    );
  } catch (error) {
    if (/timed out/u.test((error as Error).message)) {
      throw new Error(
        `${label} stopped after ${Math.round((timeoutMs ?? 15 * 60_000) / 60_000)} minutes. Keep the film's size, fps and quality; raise renderDefaults.renderTimeoutMinutes (up to 120) in the Workspace settings and try again.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (result.status !== 0) throw failure(label, result);
  return result;
};

const entryPoint = (rootDir: string) => join(rootDir, "src/index.ts");

export const renderFilmVideo = async ({
  rootDir,
  compositionId,
  outputPath,
  timeoutMs,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly timeoutMs?: number;
  readonly runProcess?: ProcessRunner;
}) =>
  renderH264AacVideo({
    rootDir,
    outputPath,
    audioChannels: 2,
    runProcess,
    render: async ({ videoPath, pcmPath, options }) => {
      await remotion(
        rootDir,
        [
          "render",
          entryPoint(rootDir),
          compositionId,
          videoPath,
          `--codec=${options.codec}`,
          `--audio-codec=${options.audioCodec}`,
          `--separate-audio-to=${pcmPath}`,
          `--sample-rate=${options.sampleRate}`,
          "--disallow-parallel-encoding",
          "--enforce-audio-track",
          `--pixel-format=${options.pixelFormat}`,
        ],
        "Rendering the film",
        runProcess,
        "error",
        timeoutMs,
      );
    },
  });

export const renderFilmStill = async ({
  rootDir,
  compositionId,
  outputPath,
  timeoutMs,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly timeoutMs?: number;
  readonly runProcess?: ProcessRunner;
}) => {
  await remotion(
    rootDir,
    [
      "still",
      entryPoint(rootDir),
      compositionId,
      outputPath,
      "--image-format=png",
    ],
    `Rendering ${compositionId}`,
    runProcess,
    "error",
    timeoutMs,
  );
};

/** Renders the review composition (one output image per requested film frame). */
export const renderFilmReviewFrames = ({
  rootDir,
  compositionId,
  propsPath,
  outputDirectory,
  count,
  scale,
  timeoutMs,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly propsPath: string;
  readonly outputDirectory: string;
  /** Number of requested film frames; review frame i shows the i-th one. */
  readonly count: number;
  readonly scale: number;
  readonly timeoutMs?: number;
  readonly runProcess?: ProcessRunner;
}) =>
  remotion(
    rootDir,
    [
      "render",
      entryPoint(rootDir),
      compositionId,
      outputDirectory,
      "--sequence",
      "--image-format=jpeg",
      "--jpeg-quality=85",
      `--scale=${scale}`,
      `--props=${propsPath}`,
      `--frames=${count === 1 ? "0" : `0-${count - 1}`}`,
      "--image-sequence-pattern=review-[frame].[ext]",
    ],
    "Rendering review frames",
    runProcess,
    // Verified with pinned Remotion 4.0.489 in a non-TTY child: bundle
    // console.warn emits complete lines on stderr at warn. Avoid verbose noise:
    // bounded-process retains only the last 1 MiB of each output stream.
    "warn",
    timeoutMs,
  );

/** Renders the shared contact-sheet Still from review frames under public/. */
export const renderContactSheet = ({
  rootDir,
  compositionId,
  propsPath,
  outputPath,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly propsPath: string;
  readonly outputPath: string;
  readonly runProcess?: ProcessRunner;
}) =>
  remotion(
    rootDir,
    [
      "still",
      entryPoint(rootDir),
      compositionId,
      outputPath,
      "--image-format=jpeg",
      "--jpeg-quality=85",
      `--props=${propsPath}`,
    ],
    "Building the contact sheet",
    runProcess,
  );
