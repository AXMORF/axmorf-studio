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
  filmCompositionIds,
  FilmMusicSchema,
  type FilmTiming,
} from "@axmorf/studio/contracts";

import {
  filmPaths,
  loadFilmSpec,
  readOptionalJsonFile,
  workspacePath,
} from "./files";
import { meanAbsoluteDifference, readFrameSignature } from "./frame-compare";
import { renderContactSheet, renderFilmReviewFrames } from "./media";
import { loadCurrentFilmTiming } from "./music";
import { analyzeReviewReadability } from "./readability";

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
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly frames?: readonly number[];
  readonly scale?: number;
}) => {
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
  await rm(paths.review, { recursive: true, force: true });
  await mkdir(paths.review, { recursive: true });
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
    });
    const readability = analyzeReviewReadability({
      output: `${renderOutput.stdout}\n${renderOutput.stderr}`,
      frames: selected.map(({ frame }) => frame),
      width: spec.render.width,
      height: spec.render.height,
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
    });
    return {
      status: "film-review-rendered",
      filmId: paths.id,
      contactSheet: workspacePath(rootDir, sheet),
      frames: images,
      stillWarnings,
      repetitionWarnings,
      ...readability,
      next: "Open the contact sheet and the frames; resolve or justify each readabilityWarning and repetitionWarning, and inspect missingFrames. Check subject, framing, and changes on the listed sentences and accents.",
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
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly scratch: string;
  readonly timing: FilmTiming;
  readonly fps: number;
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
