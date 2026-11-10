import { stripVTControlCharacters } from "node:util";

import {
  FILM_REVIEW_MEASUREMENT_MARKER,
  FilmReviewMeasurementSchema,
  minimumCaptionFontSize,
  resolveFilmCaptionFontSize,
  minimumReadableFontSize,
  type FilmReviewForeground,
  type FilmReviewMeasurement,
  type FilmReviewRect,
} from "@axmorf/studio/contracts";

import { analyzeReviewGraphics } from "./graphics";

import {
  contrastCellPosition,
  LOW_TEXT_CONTRAST_RATIO,
  measureTextContrast,
  type ContrastCell,
  type ContrastFrame,
} from "./text-contrast";

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
  | "small-status-tag"
  | "text-outside-frame"
  | "text-under-captions"
  | "text-under-foreground"
  | "low-contrast-text";
type Measurement = {
  frame: number;
  fontSize: number;
  rect: FilmReviewRect;
  minimumFontSize?: number;
  outsidePixels?: number;
  captionOverlapRatio?: number;
  foregroundCoverageRatio?: number;
  transitionWindow?: boolean;
  textGroup?: string;
  contrast?: ContrastCell;
};
export type ReadabilityWarning = {
  rule: Rule;
  snippet: string;
  frames: number[];
  measurements: Measurement[];
  message: string;
};

/** A lower bound: uncertain samples never erase confirmed foreground hits. */
export const foregroundCoverage = (foreground?: FilmReviewForeground) =>
  foreground ? foreground.covered / foreground.samples : null;

const intersectionArea = (a: FilmReviewRect, b: FilmReviewRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Hints only: missing, malformed, failed and truncated telemetry stays visible. */
export const analyzeReviewReadability = ({
  output,
  frames,
  width,
  height,
  contrastFrames,
  contrastMs = 0,
}: {
  readonly output: string;
  readonly frames: readonly number[];
  readonly width: number;
  readonly height: number;
  /** Same review indices as telemetry, decoded from existing sampled stills. */
  readonly contrastFrames?: ReadonlyMap<number, ContrastFrame>;
  readonly contrastMs?: number;
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
  const unknown: {
    rule: "text-under-foreground" | "low-contrast-text";
    frame: number;
    snippet: string;
    reason: string;
  }[] = [];
  let contrastTexts = 0;
  const contrastStart = performance.now();
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
    for (const text of record.texts) {
      const {
        caption,
        statusTag,
        snippet,
        fontSize,
        rect,
        foreground,
        textGroup,
      } = text;
      // One warning for all caption lines: the cause is the caption style, not a sentence.
      if (caption && fontSize < minimumCaption)
        add("small-caption", "captions", {
          frame: record.frame,
          fontSize,
          rect,
          minimumFontSize: minimumCaption,
        });
      if (intersectionArea(rect, frameRect) === 0) continue;
      const measurement = {
        frame: record.frame,
        fontSize,
        rect,
        ...(record.transitionWindow ? { transitionWindow: true } : {}),
        ...(textGroup ? { textGroup } : {}),
      };
      const pixels = contrastFrames?.get(record.index);
      const contrast =
        pixels && "image" in pixels
          ? measureTextContrast({ text, image: pixels.image, width, height })
          : {
              unknown:
                pixels && "error" in pixels
                  ? pixels.error
                  : "Rendered review pixels are unavailable.",
            };
      if (contrast.unknown)
        unknown.push({
          rule: "low-contrast-text",
          frame: record.frame,
          snippet,
          reason: contrast.unknown,
        });
      if (contrast.worst) {
        contrastTexts++;
        if (contrast.worst.contrastRatio < LOW_TEXT_CONTRAST_RATIO)
          add("low-contrast-text", snippet, {
            ...measurement,
            contrast: contrast.worst,
          });
      }
      if (caption) continue;
      const minimumStatusTag =
        (record.captionFontSize ?? resolveFilmCaptionFontSize(width, height)) *
        0.7;
      if (statusTag && fontSize < minimumStatusTag)
        add("small-status-tag", snippet, {
          ...measurement,
          minimumFontSize: minimumStatusTag,
        });
      const foregroundCoverageRatio = foregroundCoverage(foreground);
      if (foregroundCoverageRatio === null || foreground!.unknown > 0)
        unknown.push({
          rule: "text-under-foreground",
          frame: record.frame,
          snippet,
          reason:
            "The text paint position is unavailable (for example clipping or display:contents); inspect the frame.",
        });
      if (foregroundCoverageRatio !== null && foregroundCoverageRatio > 0)
        add("text-under-foreground", snippet, {
          ...measurement,
          foregroundCoverageRatio,
        });
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
    ...analyzeReviewGraphics({
      records: [...measured.values()],
      frames,
      width,
      height,
    }),
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
          case "small-status-tag": {
            const fontSize = Math.min(
              ...measurements.map((value) => value.fontSize),
            );
            message = `${subject} status tag renders at ${Number(fontSize.toFixed(1))}px on frames ${frameList}; keep status and detail at least 70% of the rendered caption size with clear contrast.`;
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
          case "text-under-foreground": {
            const percent = Math.round(
              Math.max(
                ...measurements.map((value) => value.foregroundCoverageRatio!),
              ) * 100,
            );
            message = `${subject} has ${percent}% of visible text samples under foreground elements on frames ${frameList}; move the foreground away from reading text.`;
            const transitionFrames = [
              ...new Set(
                measurements
                  .filter((value) => value.transitionWindow)
                  .map((value) => value.frame),
              ),
            ];
            if (transitionFrames.length)
              message += ` 转场窗口内：frames ${transitionFrames.join(", ")}；请人工核对。`;
            break;
          }
          case "low-contrast-text": {
            message = `${subject} has local text/background contrast below ${LOW_TEXT_CONTRAST_RATIO}:1; avoid similar colors or crossing light/dark boundaries. `;
            message += measurements
              .map(
                (value) =>
                  `f${value.frame} ${contrastCellPosition(value.contrast!)} ${value.contrast!.contrastRatio.toFixed(2)}:1`,
              )
              .join("; ");
            const transitionFrames = [
              ...new Set(
                measurements
                  .filter((value) => value.transitionWindow)
                  .map((value) => value.frame),
              ),
            ];
            if (transitionFrames.length)
              message += ` 转场窗口内：frames ${transitionFrames.join(", ")}；请人工核对。`;
            const grouped = measurements.filter((value) => value.textGroup);
            if (grouped.length)
              message += ` 同组形变（${[...new Set(grouped.map((value) => value.textGroup))].join(", ")}）：frames ${[...new Set(grouped.map((value) => value.frame))].join(", ")}；不跳过碎字，请看图核对。`;
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
      unknown,
      contrast: {
        threshold: LOW_TEXT_CONTRAST_RATIO,
        measuredTexts: contrastTexts,
        analysisMs: Math.round(contrastMs + performance.now() - contrastStart),
      },
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
