import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { encodeCanonicalPcmWav } from "../domain/pcm-wav";

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
  runProcess = runHostProcess,
}: {
  readonly sourceBytes: Buffer;
  readonly runProcess?: ProcessRunner;
}): Promise<Buffer> => {
  if (sourceBytes.length === 0) {
    throw new Error("Cannot normalize empty provider audio.");
  }
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "rsp-voxcpm-normalize-"),
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
      "-map_metadata",
      "-1",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
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
