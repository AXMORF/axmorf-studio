import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";

import {
  FILM_CONTACT_SHEET_ID,
  FILM_MOTION_CURVE_ID,
  FilmMotionReviewSchema,
  filmCompositionIds,
  FilmMusicSchema,
  resolveFilmBookendFrames,
  type FilmTiming,
} from "@axmorf/studio/contracts";

import {
  filmPaths,
  loadFilmSpec,
  readOptionalJsonFile,
  workspacePath,
} from "./files";
import {
  meanAbsoluteDifference,
  readFrameSignature,
  readReviewFramePixels,
} from "./frame-compare";
import {
  renderFilmAnimatic,
  renderMotionCurve,
  renderContactSheet,
  renderFilmReviewFrames,
} from "./media";
import { loadCurrentFilmTiming } from "./music";
import { readWorkspaceRenderTimeoutMs } from "./render-timeout";
import { analyzeReviewReadability } from "./readability";
import type { ContrastFrame } from "./text-contrast";

import {
  analyzeMotion,
  buildMotionCurve,
  compositionSegments,
  reviewMotionScenes,
  extractMotionMeasurements,
  MOTION_SAMPLE_SECONDS,
  selectDenseMotionFrames,
} from "./motion";
import { animaticReminder, filmHasLegacyAudio } from "./motion-files";
import { analyzeMotionEnergy, decodeMotionEnergy } from "./motion-energy";
import {
  renderStrongAccentStrips,
  STRONG_ACCENT_STRIP_CELL_WIDTH,
} from "./strong-accent-strips";

export type ReviewFrame = Readonly<{ frame: number; reason: string }>;

const MAX_REVIEW_FRAMES = 36;

/**
 * Picks the frames worth looking at: the middle of each sentence (what the
 * viewer sees while hearing it), section starts and accents (where the music
 * expects a visual landing), and the opening and closing images.
 */
export const selectReviewFrames = ({
  timing,
  music,
}: {
  readonly timing: FilmTiming;
  readonly music: {
    sectionFrames: readonly number[];
    accentFrames: readonly number[];
  } | null;
}): ReviewFrame[] => {
  const last = timing.durationInFrames - 1;
  const candidates: ReviewFrame[] = [
    { frame: Math.min(last, 10), reason: "opening" },
    ...timing.sentences.map(({ id, startFrame, endFrame }) => ({
      frame: Math.floor((startFrame + endFrame) / 2),
      reason: `sentence ${id}`,
    })),
    ...(music?.sectionFrames ?? []).map((frame) => ({
      frame: Math.min(last, frame + 2),
      reason: "music section",
    })),
    ...(music?.accentFrames ?? []).map((frame) => ({
      frame: Math.min(last, frame + 2),
      reason: "music accent",
    })),
    { frame: Math.max(0, last - 5), reason: "ending" },
  ];
  const byFrame = new Map<number, string[]>();
  for (const { frame, reason } of candidates) {
    if (frame < 0 || frame > last) continue;
    byFrame.set(frame, [...(byFrame.get(frame) ?? []), reason]);
  }
  const frames = [...byFrame.entries()]
    .sort(([left], [right]) => left - right)
    .map(([frame, reasons]) => ({ frame, reason: reasons.join(", ") }));
  if (frames.length <= MAX_REVIEW_FRAMES) return frames;
  // Keep an even spread when a long film has more moments than fit on a sheet.
  return Array.from(
    { length: MAX_REVIEW_FRAMES },
    (_, index) =>
      frames[
        Math.round((index * (frames.length - 1)) / (MAX_REVIEW_FRAMES - 1))
      ]!,
  );
};

/** Below this average 0–255 difference two review frames look the same. */
export const STILL_FRAME_DIFFERENCE = 3;
/** Holds shorter than this are reading pauses, not a static picture. */
export const STILL_FRAME_MIN_SECONDS = 2;

/**
 * Flags review frames that stay visually unchanged across a long stretch,
 * the "static slide" a viewer reads as the video having stopped.
 */
export const findStillStretches = ({
  frames,
  fps,
}: {
  readonly frames: readonly { frame: number; signature: Uint8Array }[];
  readonly fps: number;
}) => {
  const ordered = [...frames].sort((left, right) => left.frame - right.frame);
  const stretches = [];
  for (let index = 1; index < ordered.length; index++) {
    const before = ordered[index - 1]!;
    const after = ordered[index]!;
    const seconds = (after.frame - before.frame) / fps;
    if (seconds < STILL_FRAME_MIN_SECONDS) continue;
    const difference = meanAbsoluteDifference(
      before.signature,
      after.signature,
    );
    if (difference < STILL_FRAME_DIFFERENCE) {
      stretches.push({
        frames: [before.frame, after.frame] as const,
        seconds: Number(seconds.toFixed(1)),
        difference: Number(difference.toFixed(2)),
        message: `Frames ${before.frame} and ${after.frame} are ${seconds.toFixed(1)}s apart and look nearly identical; keep a visible change or slow secondary motion outside short reading holds.`,
      });
    }
  }
  return stretches;
};

/** Two samples closer than this (0–255) count as the same picture. */
export const REPEAT_FRAME_DIFFERENCE = 8;
/** One picture holding more than this share of the unnarrated time is flagged. */
export const REPEAT_MAX_SHARE = 0.25;
/** Unnarrated stretches shorter than this in total are not analysed. */
export const REPEAT_MIN_SECONDS = 8;
/** Sampling interval for the repetition pass, and its sample cap. */
export const REPEAT_SAMPLE_SECONDS = 0.5;
export const REPEAT_MAX_SAMPLES = 120;

/** Frame ranges with no sentence playing: hooks, transitions, climaxes, endings. */
export const findUnnarratedRanges = (
  timing: Pick<FilmTiming, "durationInFrames" | "sentences">,
): (readonly [number, number])[] => {
  const ranges: (readonly [number, number])[] = [];
  let cursor = 0;
  for (const { startFrame, endFrame } of [...timing.sentences].sort(
    (left, right) => left.startFrame - right.startFrame,
  )) {
    if (startFrame > cursor) ranges.push([cursor, startFrame]);
    cursor = Math.max(cursor, endFrame);
  }
  if (cursor < timing.durationInFrames)
    ranges.push([cursor, timing.durationInFrames]);
  return ranges;
};

/** Evenly spaced sample frames inside the unnarrated ranges, capped. */
export const selectRepetitionSamples = ({
  ranges,
  fps,
}: {
  readonly ranges: readonly (readonly [number, number])[];
  readonly fps: number;
}): number[] => {
  const step = Math.max(1, Math.round(fps * REPEAT_SAMPLE_SECONDS));
  const frames = ranges.flatMap(([start, end]) => {
    const inside: number[] = [];
    for (let frame = start + Math.floor(step / 2); frame < end; frame += step)
      inside.push(frame);
    return inside;
  });
  if (frames.length <= REPEAT_MAX_SAMPLES) return frames;
  return Array.from(
    { length: REPEAT_MAX_SAMPLES },
    (_, index) =>
      frames[
        Math.round((index * (frames.length - 1)) / (REPEAT_MAX_SAMPLES - 1))
      ]!,
  );
};

/**
 * Flags one picture returning for much of the music-led time, the "same
 * background again" a viewer reads as a slideshow. Narrated ranges are left
 * out: a held explanation shot is expected there.
 */
export const findRepetition = ({
  samples,
  fps,
}: {
  readonly samples: readonly { frame: number; signature: Uint8Array }[];
  readonly fps: number;
}) => {
  if (samples.length * REPEAT_SAMPLE_SECONDS < REPEAT_MIN_SECONDS) return [];
  const clusters: { signature: Uint8Array; frames: number[] }[] = [];
  for (const sample of [...samples].sort(
    (left, right) => left.frame - right.frame,
  )) {
    const match = clusters.find(
      ({ signature }) =>
        meanAbsoluteDifference(signature, sample.signature) <
        REPEAT_FRAME_DIFFERENCE,
    );
    if (match) match.frames.push(sample.frame);
    else clusters.push({ signature: sample.signature, frames: [sample.frame] });
  }
  return clusters
    .filter(({ frames }) => frames.length / samples.length > REPEAT_MAX_SHARE)
    .map(({ frames }) => {
      const share = frames.length / samples.length;
      const seconds = frames.length * REPEAT_SAMPLE_SECONDS;
      return {
        frames: [frames[0]!, frames.at(-1)!] as const,
        share: Number(share.toFixed(2)),
        seconds: Number(seconds.toFixed(1)),
        message: `One picture fills ${Math.round(share * 100)}% (about ${seconds.toFixed(1)}s) of the unnarrated time, seen from f${frames[0]} to f${frames.at(-1)} at ${fps} fps; vary the framing, artwork or palette so music-led stretches do not read as a slideshow.`,
      };
    });
};

export const runFilmReview = async ({
  rootDir,
  filmId,
  frames: requested,
  scale = 0.5,
  animatic = false,
  env = process.env,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly frames?: readonly number[];
  readonly scale?: number;
  readonly animatic?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}) => {
  const timeoutMs = await readWorkspaceRenderTimeoutMs({ rootDir, env });
  const spec = await loadFilmSpec(rootDir, filmId);
  const timing = await loadCurrentFilmTiming(rootDir, spec);
  const paths = filmPaths(rootDir, filmId);
  const music =
    spec.music === null
      ? null
      : await readOptionalJsonFile(
          paths.music,
          FilmMusicSchema,
          "generated/music.json",
        );
  const selected: ReviewFrame[] =
    requested === undefined || requested.length === 0
      ? selectReviewFrames({ timing, music })
      : requested.map((frame) => {
          if (
            !Number.isInteger(frame) ||
            frame < 0 ||
            frame >= timing.durationInFrames
          ) {
            throw new Error(
              `Frame ${frame} is outside the film (0–${timing.durationInFrames - 1}).`,
            );
          }
          return { frame, reason: "requested" };
        });
  await mkdir(paths.review, { recursive: true });
  // A normal contact-sheet refresh must not discard an expensive animatic.
  // Its mtime still lets deliver identify source edits since the preview.
  for (const name of await readdir(paths.review)) {
    if (name === "animatic.mp4") continue;
    await rm(join(paths.review, name), { recursive: true, force: true });
  }
  // Remotion reads anything after the last dot of a sequence directory as an
  // extension, so the scratch name has no dot and is passed relative to rootDir.
  const scratch = await mkdtemp(join(paths.review, "render-"));
  try {
    const propsPath = join(scratch, "props.json");
    await writeFile(
      propsPath,
      JSON.stringify({ frames: selected.map(({ frame }) => frame) }),
    );
    const renderOutput = await renderFilmReviewFrames({
      rootDir,
      compositionId: filmCompositionIds(paths.id).review,
      propsPath,
      outputDirectory: relative(rootDir, join(scratch, "frames")),
      count: selected.length,
      scale,
      timeoutMs,
    });
    const rendered = (await readdir(join(scratch, "frames")))
      .filter((name) => name.startsWith("review-"))
      .sort(
        (left, right) =>
          Number(left.match(/\d+/u)?.[0]) - Number(right.match(/\d+/u)?.[0]),
      );
    if (rendered.length !== selected.length) {
      throw new Error(
        `Expected ${selected.length} review frames, got ${rendered.length}.`,
      );
    }
    const contrastStart = performance.now();
    const contrastFrames = new Map<number, ContrastFrame>();
    for (const [index, name] of rendered.entries()) {
      try {
        contrastFrames.set(index, {
          image: await readReviewFramePixels({
            rootDir,
            imagePath: join(scratch, "frames", name),
            pixelsPath: join(scratch, `contrast-${index}.png`),
          }),
        });
      } catch (error) {
        // Pixel failure is unknown, never a pass or an automatic retry.
        contrastFrames.set(index, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const readability = analyzeReviewReadability({
      output: `${renderOutput.stdout}\n${renderOutput.stderr}`,
      frames: selected.map(({ frame }) => frame),
      width: spec.render.width,
      height: spec.render.height,
      contrastFrames,
      contrastMs: performance.now() - contrastStart,
    });
    contrastFrames.clear();
    // The sheet Still loads frames through staticFile(), so they also go under public/.
    const sheetFrames = join(paths.publicDir, "review");
    await rm(sheetFrames, { recursive: true, force: true });
    await mkdir(sheetFrames, { recursive: true });
    const images = [];
    for (const [index, name] of rendered.entries()) {
      const { frame, reason } = selected[index]!;
      const tile = String(index + 1).padStart(2, "0");
      const target = join(paths.review, `${tile}-frame-${frame}.jpeg`);
      await copyFile(join(scratch, "frames", name), target);
      await copyFile(target, join(sheetFrames, `${tile}.jpeg`));
      images.push({
        tile: index + 1,
        frame,
        reason,
        image: workspacePath(rootDir, target),
      });
    }
    const sheet = join(paths.review, "contact-sheet.jpeg");
    const columns =
      images.length <= 4 ? images.length : images.length <= 12 ? 4 : 6;
    const cellWidth = 360;
    const sheetProps = join(scratch, "sheet.json");
    await writeFile(
      sheetProps,
      JSON.stringify({
        cells: images.map(({ tile, frame, reason }) => ({
          image: `films/${paths.id}/review/${String(tile).padStart(2, "0")}.jpeg`,
          label: `#${tile} · f${frame} · ${reason}`,
        })),
        columns,
        cellWidth,
        cellHeight: Math.round(
          (cellWidth * spec.render.height) / spec.render.width,
        ),
      }),
    );
    await renderContactSheet({
      rootDir,
      compositionId: FILM_CONTACT_SHEET_ID,
      propsPath: sheetProps,
      outputPath: sheet,
    });
    const signatures = [];
    for (const image of images) {
      signatures.push({
        frame: image.frame,
        signature: await readFrameSignature({
          rootDir,
          imagePath: join(rootDir, image.image),
          signaturePath: join(scratch, `signature-${image.tile}.png`),
        }),
      });
    }
    const stillWarnings = findStillStretches({
      frames: signatures,
      fps: spec.render.fps,
    });
    const repetitionWarnings = await analyzeRepetition({
      rootDir,
      compositionId: filmCompositionIds(paths.id).review,
      scratch,
      timing,
      fps: spec.render.fps,
      timeoutMs,
    });
    const motion = await reviewMotion({
      rootDir,
      filmId,
      scratch,
      timing,
      music,
      stillWarnings,
      timeoutMs,
      animatic,
    });
    return {
      status: "film-review-rendered",
      filmId: paths.id,
      contactSheet: workspacePath(rootDir, sheet),
      frames: images,
      stillWarnings,
      repetitionWarnings,
      ...readability,
      ...motion,
      next: "Open the contact sheet and the frames; resolve or justify each readabilityWarning, repetitionWarning and motionWarning, and inspect missingFrames. Open the motion curve, dense frames and animatic (use --animatic to generate it); inspect motion.unknown and missingFrames. Check subject, framing, and changes on the listed sentences and accents. 必须逐张打开 motion['strong-accent-strip']，在 review-notes 按帧记录预备及数字/文字过程是否可见；整帧运动不能证明配方过程可见。",
    } as const;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/** Renders small samples of the unnarrated ranges and measures repetition. */
const analyzeRepetition = async ({
  rootDir,
  compositionId,
  scratch,
  timing,
  fps,
  timeoutMs,
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly scratch: string;
  readonly timing: FilmTiming;
  readonly fps: number;
  readonly timeoutMs: number;
}) => {
  const frames = selectRepetitionSamples({
    ranges: findUnnarratedRanges(timing),
    fps,
  });
  if (frames.length * REPEAT_SAMPLE_SECONDS < REPEAT_MIN_SECONDS) return [];
  const directory = join(scratch, "repetition");
  await mkdir(directory, { recursive: true });
  const propsPath = join(directory, "props.json");
  await writeFile(propsPath, JSON.stringify({ frames }));
  await renderFilmReviewFrames({
    rootDir,
    compositionId,
    propsPath,
    outputDirectory: relative(rootDir, join(directory, "frames")),
    count: frames.length,
    scale: 0.125,
    timeoutMs,
  });
  const rendered = (await readdir(join(directory, "frames")))
    .filter((name) => name.startsWith("review-"))
    .sort(
      (left, right) =>
        Number(left.match(/\d+/u)?.[0]) - Number(right.match(/\d+/u)?.[0]),
    );
  if (rendered.length !== frames.length) {
    throw new Error(
      `Expected ${frames.length} repetition samples, got ${rendered.length}.`,
    );
  }
  const samples = [];
  for (const [index, name] of rendered.entries()) {
    samples.push({
      frame: frames[index]!,
      signature: await readFrameSignature({
        rootDir,
        imagePath: join(directory, "frames", name),
        signaturePath: join(directory, `signature-${index}.png`),
      }),
    });
  }
  return findRepetition({ samples, fps });
};

/** Keep telemetry well below bounded-process's 1 MiB tail and reuse one frame
 * renderer for the curve and dense frames. Chunking preserves 0.5s coverage. */
const sampleMotionFrames = async ({
  rootDir,
  compositionId,
  scratch,
  frames,
  timeoutMs,
  onImage,
  scale = 0.125,
}: {
  rootDir: string;
  compositionId: string;
  scratch: string;
  frames: readonly number[];
  timeoutMs: number;
  onImage: (frame: number, path: string, index: number) => Promise<void>;
  scale?: number;
}) => {
  const records = [];
  let badLines = 0;
  const chunkSize = 48;
  for (let start = 0; start < frames.length; start += chunkSize) {
    const batch = frames.slice(start, start + chunkSize);
    const dir = join(scratch, `motion-${start}`);
    await mkdir(dir, { recursive: true });
    const propsPath = join(dir, "props.json");
    await writeFile(
      propsPath,
      JSON.stringify({ frames: batch, readability: false }),
    );
    const result = await renderFilmReviewFrames({
      rootDir,
      compositionId,
      propsPath,
      outputDirectory: relative(rootDir, join(dir, "frames")),
      count: batch.length,
      scale,
      timeoutMs,
    });
    const parsed = extractMotionMeasurements(
      `${result.stdout}\n${result.stderr}`,
    );
    badLines += parsed.badLines;
    records.push(
      ...parsed.records
        .filter((r) => batch[r.index] === r.frame)
        .map((r) => ({ ...r, index: r.index + start })),
    );
    const images = (await readdir(join(dir, "frames")))
      .filter((n) => n.startsWith("review-"))
      .sort(
        (a, b) => Number(a.match(/\d+/u)?.[0]) - Number(b.match(/\d+/u)?.[0]),
      );
    if (images.length !== batch.length)
      throw new Error(
        `Expected ${batch.length} motion samples, got ${images.length}.`,
      );
    for (const [i, name] of images.entries())
      await onImage(batch[i], join(dir, "frames", name), start + i);
    await rm(dir, { recursive: true, force: true });
  }
  return { records, badLines };
};

const reviewMotion = async ({
  rootDir,
  filmId,
  scratch,
  timing,
  music,
  stillWarnings,
  timeoutMs,
  animatic,
}: {
  rootDir: string;
  filmId: string;
  scratch: string;
  timing: FilmTiming;
  music: ReturnType<typeof FilmMusicSchema.parse> | null;
  stillWarnings: ReturnType<typeof findStillStretches>;
  timeoutMs: number;
  animatic: boolean;
}) => {
  const paths = filmPaths(rootDir, filmId);
  const spec = await loadFilmSpec(rootDir, filmId);
  const compositionId = filmCompositionIds(filmId).review;
  const step = Math.max(1, Math.round(spec.render.fps * MOTION_SAMPLE_SECONDS));
  const frames: number[] = [];
  for (let frame = 0; frame < timing.durationInFrames; frame += step)
    frames.push(frame);
  const samples: { frame: number; signature: Uint8Array }[] = [];
  const { records, badLines } = await sampleMotionFrames({
    rootDir,
    compositionId,
    scratch,
    frames,
    timeoutMs,
    onImage: async (frame, path, index) => {
      samples.push({
        frame,
        signature: await readFrameSignature({
          rootDir,
          imagePath: path,
          signaturePath: join(scratch, `motion-signature-${index}.png`),
        }),
      });
    },
  });
  const curve = buildMotionCurve(samples, spec.render.fps);
  const compositionSamples: typeof samples = [];
  const midpoints = compositionSegments(reviewMotionScenes(records), curve).map(
    (s) => s.frame,
  );
  const sampled = new Map(samples.map((sample) => [sample.frame, sample]));
  for (const frame of midpoints)
    if (sampled.has(frame)) compositionSamples.push(sampled.get(frame)!);
  const missingMidpoints = [
    ...new Set(midpoints.filter((frame) => !sampled.has(frame))),
  ];
  if (missingMidpoints.length)
    await sampleMotionFrames({
      rootDir,
      compositionId,
      scratch,
      frames: missingMidpoints,
      timeoutMs,
      onImage: async (frame, path, index) => {
        compositionSamples.push({
          frame,
          signature: await readFrameSignature({
            rootDir,
            imagePath: path,
            signaturePath: join(scratch, `composition-signature-${index}.png`),
          }),
        });
      },
    });
  const preview = join(paths.review, "animatic.mp4");
  if (animatic)
    await renderFilmAnimatic({
      rootDir,
      compositionId: filmCompositionIds(filmId).film,
      outputPath: preview,
      ...spec.render,
      timeoutMs,
    });
  // Sparse stills are not consecutive frames. Only a fresh continuous preview can
  // support energy comparisons; no preview (or a stale one) remains unknown.
  const energyUnavailable = await animaticReminder(rootDir, filmId);
  const energy =
    energyUnavailable === null
      ? await decodeMotionEnergy({
          rootDir,
          videoPath: preview,
          scratch,
          startFrame: resolveFilmBookendFrames(spec).introFrames,
          durationInFrames: timing.durationInFrames,
        })
      : null;
  const energyAnalysis = analyzeMotionEnergy({
    samples: energy?.samples ?? null,
    durationInFrames: timing.durationInFrames,
    sentences: timing.sentences,
    accents: music?.onsets?.accents ?? null,
    unavailableReason: energyUnavailable ?? undefined,
  });
  const energyJson = join(paths.review, "motion-energy.json");
  if (energy)
    await writeFile(energyJson, JSON.stringify(energy, null, 2) + "\n");
  const analysis = analyzeMotion({
    records,
    frames,
    curve,
    compositionSamples,
    durationInFrames: timing.durationInFrames,
    fps: spec.render.fps,
    hasNarration: timing.sentences.length > 0,
    legacyAudio: await filmHasLegacyAudio(paths.dir),
    music,
    stillWarnings,
  });
  analysis.motionWarnings.push(...energyAnalysis.motionWarnings);
  analysis.unknown.push(...energyAnalysis.unknown);
  const curveJson = join(paths.review, "motion-curve.json");
  const curveImage = join(paths.review, "motion-curve.png");
  await writeFile(curveJson, JSON.stringify(curve, null, 2) + "\n");
  await renderMotionCurve({
    rootDir,
    compositionId: FILM_MOTION_CURVE_ID,
    propsPath: curveJson,
    outputPath: curveImage,
    timeoutMs,
  });
  const dense = [];
  const ranges = selectDenseMotionFrames(
    analysis.motionWarnings,
    spec.render.fps,
  );
  for (const range of ranges) {
    const directory = join(
      paths.review,
      "dense",
      `${range.rule}-${range.range[0]}-${range.range[1]}`,
    );
    await mkdir(directory, { recursive: true });
    await sampleMotionFrames({
      rootDir,
      compositionId,
      scratch,
      frames: range.frames,
      timeoutMs,
      onImage: async (frame, path) => {
        await copyFile(path, join(directory, `frame-${frame}.jpeg`));
      },
    });
    dense.push({
      rule: range.rule,
      frames: range.range,
      directory: workspacePath(rootDir, directory),
      count: range.frames.length,
    });
  }
  const strips = await renderStrongAccentStrips({
    rootDir,
    filmId,
    scratch,
    ...spec.render,
    durationInFrames: timing.durationInFrames,
    accents: music?.onsets?.accents ?? null,
    timeoutMs,
    renderFrames: async (frames, onImage) => {
      await sampleMotionFrames({
        rootDir,
        compositionId,
        scratch,
        frames,
        timeoutMs,
        onImage,
        scale: Math.min(1, STRONG_ACCENT_STRIP_CELL_WIDTH / spec.render.width),
      });
    },
  });
  return FilmMotionReviewSchema.parse({
    motion: {
      summary: { ...analysis.summary, motionEnergy: energyAnalysis.summary },
      boundaryChecks: analysis.boundaryChecks,
      telemetry: analysis.telemetry,
      badLines,
      missingFrames: analysis.missingFrames,
      unknown: analysis.unknown,
      curve: {
        json: workspacePath(rootDir, curveJson),
        image: workspacePath(rootDir, curveImage),
      },
      dense,
      denseSkipped: analysis.motionWarnings.length - ranges.length,
      animatic:
        energyUnavailable === null ? workspacePath(rootDir, preview) : null,
      "strong-accent-strip": strips,
      energy: energy
        ? {
            json: workspacePath(rootDir, energyJson),
            decodedFrames: energy.decodedFrames,
            decodeMs: energy.decodeMs,
          }
        : null,
    },
    motionWarnings: analysis.motionWarnings,
  });
};
