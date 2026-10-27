import { stripVTControlCharacters } from "node:util";

import {
  FILM_REVIEW_MEASUREMENT_MARKER,
  FilmReviewMeasurementSchema,
  minimumCaptionFontSize,
  minimumReadableFontSize,
  type FilmReviewMeasurement,
  type FilmReviewRect,
} from "@axmorf/studio/contracts";

/** Remotion may prepend a colored [Tab …, source:line] tag to each line. */
export const extractReviewMeasurements = (output: string) => {
  const records: FilmReviewMeasurement[] = [];
  let badLines = 0;
  for (const line of stripVTControlCharacters(output).split(/\r?\n/u)) {
    const marker = line.indexOf(`${FILM_REVIEW_MEASUREMENT_MARKER} `);
    if (marker < 0) continue;
    try {
      const parsed = FilmReviewMeasurementSchema.safeParse(
        JSON.parse(
          line.slice(marker + FILM_REVIEW_MEASUREMENT_MARKER.length).trim(),
        ),
      );
      if (parsed.success) records.push(parsed.data);
      else badLines++;
    } catch {
      badLines++;
    }
  }
  return { records, badLines };
};

type Rule =
  | "small-text"
  | "small-caption"
  | "text-outside-frame"
  | "text-under-captions";
type Measurement = {
  frame: number;
  fontSize: number;
  rect: FilmReviewRect;
  minimumFontSize?: number;
  outsidePixels?: number;
  captionOverlapRatio?: number;
};
export type ReadabilityWarning = {
  rule: Rule;
  snippet: string;
  frames: number[];
  measurements: Measurement[];
  message: string;
};

const intersectionArea = (a: FilmReviewRect, b: FilmReviewRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Hints only: missing, malformed, failed and truncated telemetry stays visible. */
export const analyzeReviewReadability = ({
  output,
  frames,
  width,
  height,
}: {
  readonly output: string;
  readonly frames: readonly number[];
  readonly width: number;
  readonly height: number;
}) => {
  const { records, badLines } = extractReviewMeasurements(output);
  const measured = new Map<number, FilmReviewMeasurement>();
  for (const record of records) {
    if (
      record.frame !== frames[record.index] ||
      record.width !== width ||
      record.height !== height
    )
      continue;
    if (!measured.has(record.index) || !record.error)
      measured.set(record.index, record);
  }
  const warnings = new Map<string, Omit<ReadabilityWarning, "message">>();
  const add = (rule: Rule, snippet: string, measurement: Measurement) => {
    const key = `${rule}:${snippet}`;
    let warning = warnings.get(key);
    if (!warning) {
      warning = { rule, snippet, frames: [], measurements: [] };
      warnings.set(key, warning);
    }
    if (!warning.frames.includes(measurement.frame))
      warning.frames.push(measurement.frame);
    if (
      !warning.measurements.some(
        (value) => JSON.stringify(value) === JSON.stringify(measurement),
      )
    )
      warning.measurements.push(measurement);
  };
  for (const record of [...measured.values()].sort(
    (a, b) => a.index - b.index,
  )) {
    if (record.error) continue;
    const frameRect = { x: 0, y: 0, width, height };
    const minimumFontSize = minimumReadableFontSize(width, height);
    const minimumCaption = minimumCaptionFontSize(width, height);
    const captions = record.texts
      .filter((text) => text.caption && text.captionRect)
      .map((text) => text.captionRect!);
    for (const { caption, snippet, fontSize, rect } of record.texts) {
      // One warning for all caption lines: the cause is the caption style, not a sentence.
      if (caption && fontSize < minimumCaption)
        add("small-caption", "captions", {
          frame: record.frame,
          fontSize,
          rect,
          minimumFontSize: minimumCaption,
        });
      if (caption || intersectionArea(rect, frameRect) === 0) continue;
      const measurement = { frame: record.frame, fontSize, rect };
      if (fontSize < minimumFontSize)
        add("small-text", snippet, { ...measurement, minimumFontSize });
      const outsidePixels = Math.max(
        0,
        -rect.x,
        -rect.y,
        rect.x + rect.width - width,
        rect.y + rect.height - height,
      );
      if (outsidePixels > 1)
        add("text-outside-frame", snippet, { ...measurement, outsidePixels });
      const captionOverlapRatio = Math.max(
        0,
        ...captions.map(
          (block) => intersectionArea(rect, block) / (rect.width * rect.height),
        ),
      );
      if (captionOverlapRatio >= 0.1)
        add("text-under-captions", snippet, {
          ...measurement,
          captionOverlapRatio,
        });
    }
  }
  const successful = [...measured.values()].filter((record) => !record.error);
  return {
    readabilityWarnings: [...warnings.values()].map(
      (warning): ReadabilityWarning => {
        const frames = warning.frames.sort((a, b) => a - b);
        const measurements = warning.measurements.sort(
          (a, b) => a.frame - b.frame,
        );
        const subject = JSON.stringify(warning.snippet);
        const frameList = frames.join(", ");
        let message: string;
        switch (warning.rule) {
          case "small-text": {
            const fontSize = Number(
              Math.min(...measurements.map((value) => value.fontSize)).toFixed(
                1,
              ),
            );
            message = `${subject} renders at ${fontSize}px (minimum ${minimumReadableFontSize(width, height)}px for a ${width}×${height} frame) on frames ${frameList}; enlarge it or make it clearly decorative.`;
            break;
          }
          case "small-caption": {
            const fontSize = Number(
              Math.min(...measurements.map((value) => value.fontSize)).toFixed(
                1,
              ),
            );
            message = `Captions render at ${fontSize}px (minimum ${minimumCaptionFontSize(width, height)}px for a ${width}×${height} frame) on frames ${frameList}; let long sentences wrap to two lines instead of shrinking them.`;
            break;
          }
          case "text-outside-frame": {
            const outsidePixels = Number(
              Math.max(
                ...measurements.map((value) => value.outsidePixels!),
              ).toFixed(1),
            );
            message = `${subject} extends ${outsidePixels}px outside the frame on frames ${frameList}; move or wrap it so it stays fully visible.`;
            break;
          }
          case "text-under-captions": {
            const overlapPercent = Math.round(
              Math.max(
                ...measurements.map((value) => value.captionOverlapRatio!),
              ) * 100,
            );
            message = `${subject} overlaps the caption box by ${overlapPercent}% on frames ${frameList}; move it away from the captions.`;
            break;
          }
        }
        return { ...warning, frames, measurements, message };
      },
    ),
    readability: {
      measuredFrames: successful.length,
      missingFrames: frames.filter(
        (_, index) =>
          !measured.has(index) || measured.get(index)!.error !== undefined,
      ),
      badLines,
      truncatedFrames: successful
        .filter((record) => record.truncated)
        .map((record) => record.frame),
      errors: [...measured.values()]
        .filter((record) => record.error !== undefined)
        .map(({ frame, error }) => ({ frame, error })),
    },
  };
};
