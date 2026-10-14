import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeFilmTimingInputFingerprint,
  filmFrameFromSamples,
  FilmTimingSchema,
  type FilmSpec,
  type FilmTiming,
  type NarrationSpec,
} from "@axmorf/studio/contracts";

import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../config/producer-config";
import { resolveProducerNarrationExecution } from "../config/narration-execution";
import { normalizeProviderAudio } from "../narration/adapters/ffmpeg-normalizer";
import { createChunkAudioGenerator } from "../narration/adapters/provider-dispatcher";
import {
  CANONICAL_NARRATION_PCM,
  concatenateCanonicalPcm,
  createExplicitPausePcm,
  measureCanonicalPcmWav,
} from "../narration/domain/pcm-wav";
import { computeChunkRequestFingerprint } from "../narration/domain/provider-input";
import { masterNarrationBytes } from "../narration/mastering";
import { writeBinaryFileAtomic } from "../shared/atomic-file";
import {
  exists,
  filmPaths,
  loadFilmSpec,
  sha256,
  withWorkspaceLock,
  workspacePath,
  writeJsonFile,
} from "./files";
import { generateFilmRegistry } from "./registry";

/** Speech for one sentence, already normalized to canonical 48 kHz mono PCM. */
export type SentenceSpeech = (sentence: {
  readonly id: string;
  readonly text: string;
}) => Promise<Buffer>;

export type FilmVoiceService = Readonly<{
  speak: SentenceSpeech;
  /** Loudness-normalizes the complete narration without changing its length. */
  master: (wav: Buffer) => Promise<Buffer>;
}>;

/**
 * Lays sentences end to end with their pauses and derives frame timing from
 * the measured samples, so captions and visuals follow the real voice.
 */
export const buildFilmTiming = ({
  spec,
  sentenceSamples,
  narration,
}: {
  readonly spec: FilmSpec;
  readonly sentenceSamples: readonly number[];
  readonly narration: FilmTiming["narration"];
}): FilmTiming => {
  const { fps } = spec.render;
  const { narrationStartFrame, tailFrames, durationInFrames } = spec.timeline;
  const rate = CANONICAL_NARRATION_PCM.sampleRate;
  let cursor = 0;
  const sentences = spec.narration.map((sentence, index) => {
    const samples = sentenceSamples[index];
    if (samples === undefined) throw new Error("Missing sentence audio.");
    const startFrame =
      narrationStartFrame + filmFrameFromSamples(cursor, fps, rate);
    cursor += samples;
    const endFrame =
      narrationStartFrame + filmFrameFromSamples(cursor, fps, rate);
    if (sentence.pauseAfterMs) {
      cursor += createExplicitPausePcm(sentence.pauseAfterMs).sampleFrameCount;
    }
    return { id: sentence.id, text: sentence.text, startFrame, endFrame };
  });
  const narrationEndFrame = sentences.at(-1)?.endFrame ?? narrationStartFrame;
  const total = durationInFrames ?? narrationEndFrame + tailFrames;
  if (total < narrationEndFrame) {
    throw new Error(
      `timeline.durationInFrames is ${total}, but narration ends at frame ${narrationEndFrame}. Remove durationInFrames or make it longer.`,
    );
  }
  return FilmTimingSchema.parse({
    schemaVersion: 1,
    filmId: spec.filmId,
    inputFingerprint: computeFilmTimingInputFingerprint(spec),
    fps,
    narrationStartFrame,
    narrationEndFrame,
    durationInFrames: total,
    narration,
    sentences,
  });
};

/** Uses the Workspace TTS provider; each sentence is cached by provider and text. */
export const createFilmVoiceService = async ({
  rootDir,
  env,
}: {
  readonly rootDir: string;
  readonly env: NodeJS.ProcessEnv;
}): Promise<FilmVoiceService> => {
  const configPath = await resolveProducerConfigPathFromEnvironment({
    rootDir,
    env,
  });
  const config = await readProducerConfig({ configPath });
  const narration: NarrationSpec = {
    schemaVersion: 2,
    voiceProfileId: config.tts.defaultVoiceProfileId,
    mode: "voice-clone",
  };
  const { resolved, snapshot } = await resolveProducerNarrationExecution({
    rootDir,
    env: { ...env, RSP_PRODUCER_CONFIG: configPath },
    narration,
  });
  const generate = createChunkAudioGenerator({ resolved });
  const cacheDir = join(rootDir, ".axmorf/cache/voice");
  return {
    speak: async ({ id, text }) => {
      const key = sha256(
        JSON.stringify({
          provider: snapshot.providerAttemptFingerprint,
          speechRate: snapshot.speechRate,
          text,
        }),
      ).slice("sha256:".length);
      const cachePath = join(cacheDir, `${key}.wav`);
      if (await exists(cachePath)) {
        const cached = await readFile(cachePath);
        measureCanonicalPcmWav(cached);
        return cached;
      }
      const request = {
        generationInputFingerprint: key,
        providerAttemptFingerprint: snapshot.providerAttemptFingerprint,
        chunkId: id,
        meaningId: id,
        ttsText: text,
      };
      const raw = await generate({
        ...request,
        requestFingerprint: computeChunkRequestFingerprint(request),
      });
      if (raw.length === 0) {
        throw new Error(`The TTS provider returned no audio for ${id}.`);
      }
      const wav = await normalizeProviderAudio({
        sourceBytes: raw,
        speechRate: snapshot.speechRate,
      });
      await mkdir(cacheDir, { recursive: true });
      await writeBinaryFileAtomic({
        destination: cachePath,
        bytes: Uint8Array.from(wav),
        mode: "replace",
      });
      return wav;
    },
    master: async (wav) => {
      const directory = await mkdtemp(join(tmpdir(), "axmorf-film-voice-"));
      try {
        const sourcePath = join(directory, "narration.wav");
        await writeFile(sourcePath, Uint8Array.from(wav));
        const { outputWav } = await masterNarrationBytes({
          sourcePath,
          sourceWav: wav,
          targetLoudnessLufs: config.tts.speech.targetLoudnessLufs,
        });
        return outputWav;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
};

export const runFilmVoice = async ({
  rootDir,
  filmId,
  env = process.env,
  createService = createFilmVoiceService,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly createService?: typeof createFilmVoiceService;
}) =>
  withWorkspaceLock(rootDir, "film-voice", async () => {
    const spec = await loadFilmSpec(rootDir, filmId);
    const paths = filmPaths(rootDir, filmId);
    let timing: FilmTiming;
    if (spec.narration.length === 0) {
      timing = buildFilmTiming({ spec, sentenceSamples: [], narration: null });
    } else {
      const service = await createService({ rootDir, env });
      const parts: Buffer[] = [];
      const sentenceSamples: number[] = [];
      for (const sentence of spec.narration) {
        const wav = await service.speak(sentence);
        parts.push(wav);
        sentenceSamples.push(measureCanonicalPcmWav(wav).sampleFrameCount);
        if (sentence.pauseAfterMs) {
          parts.push(createExplicitPausePcm(sentence.pauseAfterMs).wav);
        }
      }
      const mastered = await service.master(concatenateCanonicalPcm(parts));
      const { sampleFrameCount } = measureCanonicalPcmWav(mastered);
      await mkdir(paths.publicDir, { recursive: true });
      await writeBinaryFileAtomic({
        destination: paths.narrationWav,
        bytes: Uint8Array.from(mastered),
        mode: "replace",
      });
      timing = buildFilmTiming({
        spec,
        sentenceSamples,
        narration: {
          publicPath: workspacePath(rootDir, paths.narrationWav),
          checksum: sha256(mastered),
          sampleRate: CANONICAL_NARRATION_PCM.sampleRate,
          sampleFrameCount,
        },
      });
    }
    await writeJsonFile(paths.timing, timing);
    await generateFilmRegistry(rootDir);
    return {
      status: "film-voice-ready",
      filmId: spec.filmId,
      durationInFrames: timing.durationInFrames,
      narrationEndFrame: timing.narrationEndFrame,
      sentences: timing.sentences.map(({ id, startFrame, endFrame }) => ({
        id,
        startFrame,
        endFrame,
      })),
      next:
        spec.music === null
          ? "Write Film.tsx with useFilmTiming(); add a music recipe to film.json and run film:music if the film needs a score."
          : "Run film:music so the score matches the new length.",
    } as const;
  });
