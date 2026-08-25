import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import {
  CANONICAL_NARRATION_PCM,
  decodeCanonicalPcmWav,
  encodeCanonicalPcmWav,
} from "../domain/pcm-wav";

export type ProcessResult = {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
};

export type ProcessRunner = (
  command: string,
  args: readonly string[],
) => Promise<ProcessResult>;

const runProcess = (
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv | undefined,
) =>
  new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      env: environment,
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer | Uint8Array) => {
      stdout.push(Buffer.from(Uint8Array.from(chunk)));
    });
    child.stderr.on("data", (chunk: Buffer | Uint8Array) => {
      stderr.push(Buffer.from(Uint8Array.from(chunk)));
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout.map((chunk) => Uint8Array.from(chunk))),
        stderr: Buffer.concat(stderr.map((chunk) => Uint8Array.from(chunk))),
      });
    });
  });

export const runHostProcess: ProcessRunner = (command, args) =>
  runProcess(command, args, undefined);

export const createExecutableProcessRunner = (
  executable: string,
): ProcessRunner => {
  if (!isAbsolute(executable)) {
    throw new Error("Media process executable must be absolute.");
  }
  return (_command, args) =>
    runProcess(
      executable,
      args,
      process.platform === "darwin"
        ? { DYLD_LIBRARY_PATH: dirname(executable) }
        : { LD_LIBRARY_PATH: dirname(executable) },
    );
};

export const normalizeFfmpegAudioToCanonicalWav = async ({
  sourceBytes,
  audioFilter,
  normalizationKind,
  runProcess = runHostProcess,
  temporaryRoot = tmpdir(),
}: {
  readonly sourceBytes: Buffer;
  readonly audioFilter?: string;
  readonly normalizationKind: "narration" | "prompt";
  readonly runProcess?: ProcessRunner;
  readonly temporaryRoot?: string;
}): Promise<Buffer> => {
  const label =
    normalizationKind === "narration"
      ? "FFmpeg normalization"
      : "FFmpeg prompt normalization";
  await mkdir(temporaryRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(
    join(
      temporaryRoot,
      normalizationKind === "narration"
        ? "rsp-narration-normalize-"
        : "rsp-voxcpm-prompt-",
    ),
  );
  const inputPath = join(temporaryDirectory, "provider-audio");
  const outputPath = join(temporaryDirectory, "normalized.wav");
  try {
    await writeFile(inputPath, Uint8Array.from(sourceBytes), { flag: "wx" });
    const result = await runProcess("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      ...(audioFilter === undefined ? [] : ["-af", audioFilter]),
      "-map_metadata",
      "-1",
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(CANONICAL_NARRATION_PCM.sampleRate),
      "-acodec",
      "pcm_s16le",
      "-f",
      "wav",
      outputPath,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`${label} failed with exit code ${result.exitCode}.`);
    }
    let outputBytes: Buffer;
    try {
      outputBytes = await readFile(outputPath);
    } catch (error) {
      throw new Error(`${label} did not create WAV output.`, { cause: error });
    }
    try {
      return encodeCanonicalPcmWav(
        decodeCanonicalPcmWav(outputBytes).rawPcm,
      );
    } catch (error) {
      throw new Error(`${label} produced invalid canonical WAV output.`, {
        cause: error,
      });
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

export const normalizeProviderAudio = async ({
  sourceBytes,
  speechRate = 1,
  runProcess = runHostProcess,
  temporaryRoot = tmpdir(),
}: {
  readonly sourceBytes: Buffer;
  readonly speechRate?: number;
  readonly runProcess?: ProcessRunner;
  readonly temporaryRoot?: string;
}): Promise<Buffer> => {
  if (sourceBytes.length === 0) {
    throw new Error("Cannot normalize empty provider audio.");
  }
  if (!Number.isFinite(speechRate) || speechRate < 0.5 || speechRate > 2) {
    throw new Error("Narration speech rate must be between 0.5 and 2.");
  }
  return normalizeFfmpegAudioToCanonicalWav({
    sourceBytes,
    audioFilter: `atempo=${speechRate}`,
    normalizationKind: "narration",
    runProcess,
    temporaryRoot,
  });
};
