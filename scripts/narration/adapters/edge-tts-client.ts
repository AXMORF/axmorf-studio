import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EdgeTTS } from "node-edge-tts";

import type {
  ChunkAudioGenerator,
  ResolvedEdgeTtsProfile,
} from "../domain/provider-input";

export const EDGE_TTS_MAX_ESCAPED_INPUT_BYTES = 4_096 as const;

type EdgeTtsClient = {
  ttsPromise(text: string, outputPath: string): Promise<unknown>;
};

type EdgeTtsClientOptions = Readonly<{
  voice: string;
  lang: string;
  outputFormat: "audio-24khz-48kbitrate-mono-mp3";
  saveSubtitles: false;
  rate: string;
  timeout: number;
}>;

const escapeXml = (value: string) =>
  value.replace(/[<>&"']/gu, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });

const containsUnsupportedXmlControl = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return (
      code <= 8 || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)
    );
  });

export const createEdgeTtsChunkGenerator = ({
  resolved,
  temporaryRoot = tmpdir(),
  clientFactory = (options) => new EdgeTTS(options),
}: {
  readonly resolved: ResolvedEdgeTtsProfile;
  readonly temporaryRoot?: string;
  readonly clientFactory?: (options: EdgeTtsClientOptions) => EdgeTtsClient;
}): ChunkAudioGenerator => {
  const client = clientFactory({
    voice: resolved.voiceId,
    lang: resolved.locale,
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    saveSubtitles: false,
    rate: "default",
    timeout: resolved.timeoutMs,
  });

  return async (request) => {
    if (containsUnsupportedXmlControl(request.ttsText)) {
      throw new Error(
        `Edge TTS input contains unsupported control characters for chunk ${request.chunkId}.`,
      );
    }
    if (
      Buffer.byteLength(escapeXml(request.ttsText), "utf8") >
      EDGE_TTS_MAX_ESCAPED_INPUT_BYTES
    ) {
      throw new Error(
        `Edge TTS single-request limit exceeded for chunk ${request.chunkId}.`,
      );
    }
    await mkdir(temporaryRoot, { recursive: true });
    const workDir = await mkdtemp(join(temporaryRoot, "rsp-edge-tts-"));
    const outputPath = join(workDir, "provider.mp3");
    try {
      await client.ttsPromise(request.ttsText, outputPath);
      const bytes = await readFile(outputPath);
      if (bytes.length === 0) throw new Error("empty provider audio");
      return bytes;
    } catch {
      throw new Error(`Edge TTS request failed for chunk ${request.chunkId}.`);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  };
};
