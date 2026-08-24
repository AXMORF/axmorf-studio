import { tmpdir } from "node:os";

import {
  normalizeFfmpegAudioToCanonicalWav,
  runHostProcess,
  type ProcessRunner,
} from "./ffmpeg-normalizer";

export const normalizePromptAudio = async ({
  sourceBytes,
  runProcess = runHostProcess,
  temporaryRoot = tmpdir(),
}: {
  readonly sourceBytes: Buffer;
  readonly runProcess?: ProcessRunner;
  readonly temporaryRoot?: string;
}): Promise<Buffer> => {
  if (sourceBytes.length === 0) {
    throw new Error("Cannot normalize empty prompt audio.");
  }
  return normalizeFfmpegAudioToCanonicalWav({
    sourceBytes,
    normalizationKind: "prompt",
    runProcess,
    temporaryRoot,
  });
};
