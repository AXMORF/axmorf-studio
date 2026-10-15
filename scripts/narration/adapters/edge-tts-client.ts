import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

import { EdgeTTS } from "node-edge-tts";

import type {
  ChunkAudioGenerator,
  ResolvedEdgeTtsProfile,
} from "../domain/provider-input";

export const EDGE_TTS_MAX_ESCAPED_INPUT_BYTES = 4_096 as const;
export const EDGE_TTS_REQUEST_GAP_MS = 10_000 as const;

type EdgeTtsDiagnostic = Readonly<{
  event: "edge-tts-request";
  phase: "start" | "end";
  chunkId: string;
  route: "proxy" | "direct";
  timestamp: string;
  elapsedMs?: number;
  outcome?: "success" | "failed" | "timeout";
  httpStatus?: number;
}>;

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

const safeHttpStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) return undefined;
  const status = /^Unexpected server response: ([1-5][0-9]{2})$/u.exec(
    error.message,
  )?.[1];
  return status === undefined ? undefined : Number(status);
};

const safeFailureDetail = (error: unknown): string => {
  if (error === "Timed out") return " (synthesis timed out)";
  const status = safeHttpStatus(error);
  return status === undefined ? "" : ` (WebSocket handshake HTTP ${status})`;
};

export const createEdgeTtsChunkGenerator = ({
  resolved,
  env = process.env,
  clientFactory = (options) => new EdgeTTS(options),
  clock = { now: () => performance.now(), sleep },
  reportDiagnostic = (diagnostic) => {
    process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
  },
}: {
  readonly resolved: ResolvedEdgeTtsProfile;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly clientFactory?: (options: EdgeTtsClientOptions) => EdgeTtsClient;
  readonly clock?: Readonly<{
    now: () => number;
    sleep: (milliseconds: number) => Promise<void>;
  }>;
  readonly reportDiagnostic?: (diagnostic: EdgeTtsDiagnostic) => void;
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
  let nextRequestAt = 0;
  // A rejected tail stops queued calls too; a provider failure never sends more text.
  let pending: Promise<unknown> = Promise.resolve();

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
    const result = pending.then(async () => {
      // Lazy waiting leaves the first request and cache-only runs immediate.
      while (clock.now() < nextRequestAt) {
        await clock.sleep(Math.ceil(nextRequestAt - clock.now()));
      }
      const workDir = await mkdtemp(join(tmpdir(), "rsp-edge-tts-"));
      const outputPath = join(workDir, "provider.mp3");
      const startedAt = clock.now();
      const common = {
        event: "edge-tts-request" as const,
        chunkId: request.chunkId,
        route: proxy ? ("proxy" as const) : ("direct" as const),
      };
      let outcome: "success" | "failed" | "timeout" = "failed";
      let httpStatus: number | undefined;
      try {
        reportDiagnostic({
          ...common,
          phase: "start",
          timestamp: new Date().toISOString(),
        });
        await client.ttsPromise(request.ttsText, outputPath);
        const bytes = await readFile(outputPath);
        if (bytes.length === 0) throw new Error("empty provider audio");
        outcome = "success";
        return bytes;
      } catch (error) {
        outcome = error === "Timed out" ? "timeout" : "failed";
        httpStatus = safeHttpStatus(error);
        throw new Error(
          `Edge TTS request failed for chunk ${request.chunkId}${safeFailureDetail(error)}.`,
        );
      } finally {
        nextRequestAt = clock.now() + EDGE_TTS_REQUEST_GAP_MS;
        await rm(workDir, { recursive: true, force: true });
        reportDiagnostic({
          ...common,
          phase: "end",
          timestamp: new Date().toISOString(),
          elapsedMs: Math.round(clock.now() - startedAt),
          outcome,
          ...(httpStatus === undefined ? {} : { httpStatus }),
        });
      }
    });
    pending = result;
    return result;
  };
};
