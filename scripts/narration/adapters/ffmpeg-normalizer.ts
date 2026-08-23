import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import {
  CANONICAL_NARRATION_PCM,
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

const runProcess: ProcessRunner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { shell: false });
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

export const runHostProcess: ProcessRunner = runProcess;

export const createExecutableProcessRunner = (
  executable: string,
): ProcessRunner => {
  if (!isAbsolute(executable)) {
    throw new Error("Media process executable must be absolute.");
  }
  return (_command, args) => runProcess(executable, args);
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
  await mkdir(temporaryRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(
    join(temporaryRoot, "rsp-voxcpm-normalize-"),
  );
  const inputPath = join(temporaryDirectory, "provider-audio");
  try {
    await writeFile(inputPath, Uint8Array.from(sourceBytes), { flag: "wx" });
    const result = await runProcess("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-af",
      `atempo=${speechRate}`,
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
      "s16le",
      "pipe:1",
    ]);
    if (result.exitCode !== 0) {
      throw new Error(
        `FFmpeg normalization failed with exit code ${result.exitCode}.`,
      );
    }
    if (result.stdout.length === 0) {
      throw new Error("FFmpeg normalization returned empty PCM.");
    }
    return encodeCanonicalPcmWav(result.stdout);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};
