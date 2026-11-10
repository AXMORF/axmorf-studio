import { readFile } from "node:fs/promises";

import {
  countCaptionDisplayHalfUnits,
  filmFrameFromSamples,
  FilmTimingSchema,
  splitFilmCaptionClauses,
  type FilmTiming,
} from "@axmorf/studio/contracts";

import { decodeCanonicalPcmWav } from "../narration/domain/pcm-wav";
import {
  filmPaths,
  loadFilmSpec,
  sha256,
  withWorkspaceLock,
  writeJsonFile,
} from "./files";
import { loadCurrentFilmTiming } from "./music";

// 10 ms RMS windows resolve pauses below one 30fps frame. A conservative 6%
// of sentence peak RMS rejects room noise; >=120 ms avoids most unvoiced
// consonants. Only interior silences count, never leading/trailing padding.
export const CAPTION_ENERGY_WINDOW_MS = 10;
export const CAPTION_SILENCE_PEAK_RATIO = 0.06;
export const CAPTION_MIN_PAUSE_MS = 120;

type Sentence = FilmTiming["sentences"][number];

/** Maximum-cardinality monotone matching, then minimum total absolute distance.
 * Match every item of the shorter sequence to an ordered subset of the longer.
 * Equal-cost paths keep the earlier subset, so ties are deterministic. */
export const matchCaptionBoundaries = (
  targets: readonly number[],
  observed: readonly number[],
): (number | null)[] => {
  const result: (number | null)[] = targets.map(() => null);
  const fewerTargets = targets.length <= observed.length;
  const small = fewerTargets ? targets : observed;
  const large = fewerTargets ? observed : targets;
  const costs = Array.from({ length: small.length + 1 }, (_, i) =>
    Array.from({ length: large.length + 1 }, () => (i === 0 ? 0 : Infinity)),
  );
  const take = costs.map((row) => row.map(() => false));
  for (let i = 1; i <= small.length; i++) {
    for (let j = i; j <= large.length; j++) {
      const match = costs[i - 1][j - 1] + Math.abs(small[i - 1] - large[j - 1]);
      const skip = costs[i][j - 1];
      take[i][j] = match < skip;
      costs[i][j] = take[i][j] ? match : skip;
    }
  }
  let i = small.length;
  let j = large.length;
  while (i > 0) {
    if (take[i][j]) {
      if (fewerTargets) result[i - 1] = j - 1;
      else result[j - 1] = i - 1;
      i--;
    }
    j--;
  }
  return result;
};

/** Offline, canonical PCM only. Never invokes a provider or changes audio,
 * sentence frames, input fingerprints, or unrelated timing fields. */
export const estimateFilmCaptionTiming = (timing: FilmTiming, wav: Buffer) => {
  const { rawPcm, pcm, sampleFrameCount } = decodeCanonicalPcmWav(wav);
  const rate = pcm.sampleRate;
  const windowSamples = (rate * CAPTION_ENERGY_WINDOW_MS) / 1000;
  const diagnostics = timing.sentences.map((sentence) => {
    const startSample = Math.floor(
      ((sentence.startFrame - timing.narrationStartFrame) * rate) / timing.fps,
    );
    const endSample = Math.min(
      sampleFrameCount,
      Math.floor(
        ((sentence.endFrame - timing.narrationStartFrame) * rate) / timing.fps,
      ),
    );
    if (startSample < 0 || endSample <= startSample)
      throw new Error(`No narration samples for ${sentence.id}.`);
    const envelope: { startSample: number; endSample: number; rms: number }[] =
      [];
    for (let at = startSample; at < endSample; at += windowSamples) {
      const end = Math.min(at + windowSamples, endSample);
      let sum = 0;
      for (let i = at; i < end; i++) {
        const sample = rawPcm.readInt16LE(i * 2);
        sum += sample * sample;
      }
      envelope.push({
        startSample: at,
        endSample: end,
        rms: Math.sqrt(sum / (end - at)) / 32768,
      });
    }
    const peak = Math.max(...envelope.map((window) => window.rms));
    const threshold = peak * CAPTION_SILENCE_PEAK_RATIO;
    const first = envelope.findIndex((window) => window.rms > threshold);
    let last = envelope.length - 1;
    while (last >= 0 && envelope[last].rms <= threshold) last--;
    const pauses: { startSample: number; endSample: number }[] = [];
    let silenceStart: number | null = null;
    for (let i = first + 1; first >= 0 && i <= last; i++) {
      const window = envelope[i];
      if (window.rms <= threshold) silenceStart ??= window.startSample;
      else if (silenceStart !== null) {
        if (
          window.startSample - silenceStart >=
          (rate * CAPTION_MIN_PAUSE_MS) / 1000
        ) {
          pauses.push({
            startSample: silenceStart,
            endSample: window.startSample,
          });
        }
        silenceStart = null;
      }
    }
    const texts = splitFilmCaptionClauses(sentence.text);
    if (!texts.length)
      throw new Error(`No caption clauses for ${sentence.id}.`);
    const speechStart = first < 0 ? startSample : envelope[first].startSample;
    const speechEnd = last < 0 ? endSample : envelope[last].endSample;
    const units = texts.map(countCaptionDisplayHalfUnits);
    const total = units.reduce((sum, value) => sum + value, 0);
    let consumed = 0;
    const targets = units.slice(0, -1).map((value) => {
      consumed += value;
      return consumed / total;
    });
    const assignments = matchCaptionBoundaries(
      targets,
      pauses.map(
        (pause) =>
          ((pause.startSample + pause.endSample) / 2 - speechStart) /
          (speechEnd - speechStart),
      ),
    );
    const matchedBoundaries = assignments.filter(
      (index) => index !== null,
    ).length;
    // Missing boundaries interpolate only inside their nearest measured anchors.
    // Use the end of a preceding pause and start of a following pause so a
    // proportional point can never cross or consume a retained silence.
    const boundaries = assignments.map((pauseIndex, index) => {
      if (pauseIndex !== null)
        return { ...pauses[pauseIndex], source: "pause" as const, pauseIndex };
      let left = index - 1;
      let right = index + 1;
      while (left >= 0 && assignments[left] === null) left--;
      while (right < targets.length && assignments[right] === null) right++;
      const leftRatio = targets[left] ?? 0;
      const rightRatio = targets[right] ?? 1;
      const leftSample =
        left < 0 ? speechStart : pauses[assignments[left]!].endSample;
      const rightSample =
        right >= targets.length
          ? speechEnd
          : pauses[assignments[right]!].startSample;
      const sample =
        leftSample +
        Math.round(
          ((rightSample - leftSample) * (targets[index] - leftRatio)) /
            (rightRatio - leftRatio),
        );
      return {
        startSample: sample,
        endSample: sample,
        source: "proportional" as const,
        pauseIndex: null,
      };
    });
    const frame = (sample: number) =>
      Math.min(
        sentence.endFrame,
        Math.max(
          sentence.startFrame,
          timing.narrationStartFrame +
            filmFrameFromSamples(sample, timing.fps, rate),
        ),
      );
    const clauses = texts.map((text, index) => {
      const before = boundaries[index - 1];
      const after = boundaries[index];
      const pause =
        first >= 0 &&
        before?.source !== "proportional" &&
        after?.source !== "proportional";
      return {
        text,
        startFrame: frame(before?.endSample ?? speechStart),
        endFrame: frame(after?.startSample ?? speechEnd),
        source: pause ? ("pause" as const) : ("proportional" as const),
      };
    });
    return {
      sentenceId: sentence.id,
      punctuationBoundaries: texts.length - 1,
      detectedPauses: pauses.length,
      source: clauses.every((clause) => clause.source === "pause")
        ? ("pause" as const)
        : matchedBoundaries > 0
          ? ("mixed" as const)
          : ("proportional" as const),
      matchedBoundaries,
      ignoredPauses: pauses.length - matchedBoundaries,
      boundaries,
      threshold,
      pauses,
      envelope,
      clauses,
    };
  });
  const sentences: Sentence[] = timing.sentences.map((sentence, index) => {
    const updated = { ...sentence, clauses: diagnostics[index].clauses };
    delete updated.estimated;
    if (updated.clauses.some((clause) => clause.source === "proportional"))
      updated.estimated = "proportional";
    return updated;
  });
  return {
    timing: FilmTimingSchema.parse({ ...timing, sentences }),
    diagnostics,
  };
};

/** Explicit opt-in lets existing takes gain estimates without initializing TTS.
 * Rendering and review stay read-only and never analyze audio at render time. */
export const runFilmCaptionTiming = async ({
  rootDir,
  filmId,
}: {
  readonly rootDir: string;
  readonly filmId: string;
}) =>
  withWorkspaceLock(rootDir, "film-captions", async () => {
    const spec = await loadFilmSpec(rootDir, filmId);
    const timing = await loadCurrentFilmTiming(rootDir, spec);
    const paths = filmPaths(rootDir, filmId);
    if (timing.filmId !== filmId || timing.fps !== spec.render.fps)
      throw new Error("Caption timing does not match this film.");
    if (timing.narration === null)
      throw new Error("No narration audio; run film:voice first.");
    const wav = await readFile(paths.narrationWav);
    const { pcm, sampleFrameCount } = decodeCanonicalPcmWav(wav);
    if (
      sha256(wav) !== timing.narration.checksum ||
      pcm.sampleRate !== timing.narration.sampleRate ||
      sampleFrameCount !== timing.narration.sampleFrameCount
    )
      throw new Error(
        "narration.wav is missing or changed; run film:voice first.",
      );
    const result = estimateFilmCaptionTiming(timing, wav);
    await writeJsonFile(paths.timing, result.timing);
    return {
      status: "film-captions-ready",
      filmId,
      sentences: result.diagnostics.map(
        ({
          sentenceId,
          punctuationBoundaries,
          detectedPauses,
          source,
          matchedBoundaries,
          ignoredPauses,
          boundaries,
          clauses,
        }) => ({
          sentenceId,
          punctuationBoundaries,
          detectedPauses,
          source,
          matchedBoundaries,
          ignoredPauses,
          boundaries,
          clauses,
        }),
      ),
    } as const;
  });
