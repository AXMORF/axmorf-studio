import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CANONICAL_NARRATION_PCM,
  decodeCanonicalPcmWav,
  encodeCanonicalPcmWav,
} from "../domain/pcm-wav";
import { resolveMediaToolCommand } from "../../shared/media-tool-command";

export type ProcessResult = {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
};

export type ProcessRunner = (
  command: string,
  args: readonly string[],
) => Promise<ProcessResult>;

export const runHostProcess: ProcessRunner = (command, args) =>
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

export const normalizeProviderAudio = async ({
  sourceBytes,
  speechRate = 1,
  runProcess = runHostProcess,
}: {
  readonly sourceBytes: Buffer;
  readonly speechRate?: number;
  readonly runProcess?: ProcessRunner;
}): Promise<Buffer> => {
  if (sourceBytes.length === 0) {
    throw new Error("Cannot normalize empty provider audio.");
  }
  if (!Number.isFinite(speechRate) || speechRate < 0.5 || speechRate > 2) {
    throw new Error("Narration speech rate must be between 0.5 and 2.");
  }
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "rsp-voxcpm-normalize-"),
  );
  const inputPath = join(temporaryDirectory, "provider-audio");
  const outputPath = join(temporaryDirectory, "canonical.wav");
  try {
    await writeFile(inputPath, Uint8Array.from(sourceBytes), { flag: "wx" });
    const invocation = await resolveMediaToolCommand({
      rootDir: process.cwd(),
      tool: "ffmpeg",
      args: [
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
        "wav",
        outputPath,
      ],
    });
    const result = await runProcess(invocation.command, invocation.args);
    if (result.exitCode !== 0) {
      throw new Error(
        `FFmpeg normalization failed with exit code ${result.exitCode}.`,
      );
    }
    const normalizedWav = await readFile(outputPath);
    if (normalizedWav.length === 0) {
      throw new Error("FFmpeg normalization returned empty PCM.");
    }
    const { rawPcm } = decodeCanonicalPcmWav(normalizedWav);
    return encodeCanonicalPcmWav(rawPcm);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};
