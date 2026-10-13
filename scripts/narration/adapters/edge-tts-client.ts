import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  proxy?: string;
}>;

const environmentProxy = (
  env: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  const serviceHost = "api.msedgeservices.com";
  const bypass = (env.no_proxy || env.NO_PROXY || "")
    .toLowerCase()
    .split(/[\s,]+/u)
    .some((entry) => {
      const [host, port] = entry.split(":");
      if (!host || (port && port !== "443")) return false;
      if (host === "*") return true;
      const suffix = host.startsWith("*.") ? host.slice(1) : host;
      return suffix.startsWith(".")
        ? serviceHost.endsWith(suffix)
        : serviceHost === suffix;
    });
  if (bypass) return undefined;
  return (
    env.https_proxy?.trim() ||
    env.HTTPS_PROXY?.trim() ||
    env.http_proxy?.trim() ||
    env.HTTP_PROXY?.trim() ||
    undefined
  );
};

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

const safeFailureDetail = (error: unknown): string => {
  if (error === "Timed out") return " (synthesis timed out)";
  if (error instanceof Error) {
    const status = /^Unexpected server response: ([1-5][0-9]{2})$/u.exec(
      error.message,
    )?.[1];
    if (status) return ` (WebSocket handshake HTTP ${status})`;
  }
  return "";
};

export const createEdgeTtsChunkGenerator = ({
  resolved,
  env = process.env,
  clientFactory = (options) => new EdgeTTS(options),
}: {
  readonly resolved: ResolvedEdgeTtsProfile;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly clientFactory?: (options: EdgeTtsClientOptions) => EdgeTtsClient;
}): ChunkAudioGenerator => {
  // node-edge-tts does not consume environment proxy settings itself.
  const proxy = environmentProxy(env);
  const client = clientFactory({
    voice: resolved.voiceId,
    lang: resolved.locale,
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    saveSubtitles: false,
    rate: "default",
    timeout: resolved.timeoutMs,
    ...(proxy ? { proxy } : {}),
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
    const workDir = await mkdtemp(join(tmpdir(), "rsp-edge-tts-"));
    const outputPath = join(workDir, "provider.mp3");
    try {
      await client.ttsPromise(request.ttsText, outputPath);
      const bytes = await readFile(outputPath);
      if (bytes.length === 0) throw new Error("empty provider audio");
      return bytes;
    } catch (error) {
      throw new Error(
        `Edge TTS request failed for chunk ${request.chunkId}${safeFailureDetail(error)}.`,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  };
};
