import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CANONICAL_NARRATION_PCM,
  encodeCanonicalPcmWav,
} from "../domain/pcm-wav";
import { runHostProcess, type ProcessRunner } from "./ffmpeg-normalizer";

export const normalizePromptAudio = async ({
  sourceBytes,
  runProcess = runHostProcess,
}: {
  readonly sourceBytes: Buffer;
  readonly runProcess?: ProcessRunner;
}): Promise<Buffer> => {
  if (sourceBytes.length === 0) {
    throw new Error("Cannot normalize empty prompt audio.");
  }
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "rsp-voxcpm-prompt-"),
  );
  const sourcePath = join(temporaryDirectory, "protected-source");
  try {
    await writeFile(sourcePath, Uint8Array.from(sourceBytes), { flag: "wx" });
    const result = await runProcess("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sourcePath,
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
        `FFmpeg prompt normalization failed with exit code ${result.exitCode}.`,
      );
    }
    if (result.stdout.length === 0) {
      throw new Error("FFmpeg prompt normalization returned empty PCM.");
    }
    return encodeCanonicalPcmWav(result.stdout);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};
