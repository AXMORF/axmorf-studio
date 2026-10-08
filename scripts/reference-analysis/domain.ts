import { isAbsolute } from "node:path";

export const REFERENCE_SAMPLE_WIDTH = 64;
export const REFERENCE_SAMPLE_HEIGHT = 36;
export const REFERENCE_MAX_SAMPLES = 120;
export const REFERENCE_MAX_REFINEMENT_WINDOWS = 12;
export const REFERENCE_MAX_REFINEMENT_STEPS = 8;
export const REFERENCE_MAX_PREVIEWS = 24;
export const REFERENCE_ALGORITHM_ID = "reference-diagnostics-v2";

export const validateReferenceInputPath = (path: string): string => {
  if (
    !path.startsWith("public/") ||
    isAbsolute(path) ||
    path.includes("\\") ||
    [...path].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  )
    throw new Error(
      "Reference input must be an exact public-relative file path.",
    );
  return path;
};

export const validateReferenceThreshold = (threshold: number): number => {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Reference detection threshold must be between 0 and 1.");
  return threshold;
};

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Reference video metadata is malformed.");
  return value as Record<string, unknown>;
};

const positiveSeconds = (value: unknown) => {
  const parsed =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const parseReferenceVideoProbe = (stdout: string) => {
  let parsed: Record<string, unknown>;
  try {
    parsed = record(JSON.parse(stdout));
  } catch (error) {
    throw new Error("Reference video metadata is malformed.", { cause: error });
  }
  if (!Array.isArray(parsed.streams) || parsed.streams.length !== 1)
    throw new Error(
      "Reference video metadata must contain exactly one selected video stream.",
    );
  const stream = record(parsed.streams[0]);
  const width = stream.width;
  const height = stream.height;
  if (
    typeof width !== "number" ||
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    typeof height !== "number" ||
    !Number.isSafeInteger(height) ||
    height <= 0
  )
    throw new Error("Reference video dimensions metadata is invalid.");
  const rate =
    stream.avg_frame_rate === undefined || stream.avg_frame_rate === "0/0"
      ? stream.r_frame_rate
      : stream.avg_frame_rate;
  const match = typeof rate === "string" ? /^(\d+)\/(\d+)$/u.exec(rate) : null;
  const numerator = Number(match?.[1]);
  const denominator = Number(match?.[2]);
  const fps = numerator / denominator;
  if (
    !Number.isSafeInteger(numerator) ||
    numerator <= 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0 ||
    !Number.isFinite(fps) ||
    fps <= 0
  )
    throw new Error("Reference video frame-rate metadata is invalid.");
  const streamDuration = positiveSeconds(stream.duration);
  const formatDuration =
    parsed.format === undefined
      ? null
      : positiveSeconds(record(parsed.format).duration);
  const durationSeconds = streamDuration ?? formatDuration;
  if (durationSeconds === null)
    throw new Error("Reference video duration metadata is invalid.");
  return {
    width,
    height,
    fps,
    frameRate: { numerator, denominator },
    durationSeconds,
    durationSource:
      streamDuration === null
        ? ("container-format" as const)
        : ("video-stream" as const),
  };
};

export const inspectReferenceSamplingCapabilities = ({
  filters,
  encoders,
  pixelFormats,
  muxers,
}: {
  readonly filters: string;
  readonly encoders: string;
  readonly pixelFormats: string;
  readonly muxers: string;
}) => {
  const filterNames = new Set(
    [...filters.matchAll(/^\s*[TSC.]{3}\s+(\w+)\s+/gmu)].map(
      (match) => match[1],
    ),
  );
  return [
    ...["scale", "format"]
      .filter((name) => !filterNames.has(name))
      .map((name) => `ffmpeg-filter:${name}`),
    ...["rawvideo", "png"]
      .filter(
        (name) =>
          !new RegExp(`^\\s*V\\S{5}\\s+${name}(?:\\s|$)`, "mu").test(encoders),
      )
      .map((name) => `ffmpeg-encoder:${name}`),
    ...["gray", "rgb24"]
      .filter(
        (name) =>
          !new RegExp(`^\\s*IO\\S{3}\\s+${name}\\s`, "mu").test(pixelFormats),
      )
      .map((name) => `ffmpeg-pixel-format:${name}`),
    ...(/^\s*E\s+image2(?:\s|$)/mu.test(muxers) ? [] : ["ffmpeg-muxer:image2"]),
  ];
};

export const planReferenceSamples = (durationSeconds: number, fps: number) => {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(fps) ||
    fps <= 0
  )
    throw new Error(
      "Reference sampling requires positive finite duration and fps.",
    );
  const nominalFrameCount = Math.ceil(durationSeconds * fps);
  if (!Number.isSafeInteger(nominalFrameCount) || nominalFrameCount < 1)
    throw new Error(
      "Reference nominal frame range exceeds safe integer bounds.",
    );
  const intervalFrames = Math.max(
    1,
    Math.ceil(fps / 2),
    Math.ceil(nominalFrameCount / REFERENCE_MAX_SAMPLES),
  );
  const samplingIntervalSeconds = intervalFrames / fps;
  const count = Math.min(
    REFERENCE_MAX_SAMPLES,
    Math.ceil(durationSeconds / samplingIntervalSeconds),
  );
  const sampleFrameIndices = Array.from(
    { length: count },
    (_, index) => index * intervalFrames,
  );
  const sampleTimesSeconds = sampleFrameIndices.map((frame) => frame / fps);
  return {
    width: REFERENCE_SAMPLE_WIDTH,
    height: REFERENCE_SAMPLE_HEIGHT,
    pixelFormat: "gray" as const,
    encoder: "rawvideo" as const,
    muxer: "image2" as const,
    maximumSamples: REFERENCE_MAX_SAMPLES,
    maximumSamplesPerSecond: 2,
    samplingIntervalSeconds,
    intervalFrames,
    sampleFrameIndices,
    sampleTimesSeconds,
    nominalFrameCount,
    gridClock: "nominal-average-fps-requested-seek" as const,
    decodedFrameTimestampsMeasured: false,
    unsampledTailSeconds: durationSeconds - sampleTimesSeconds.at(-1)!,
  };
};

export const planReferencePreviewDimensions = (
  width: number,
  height: number,
) => {
  if (
    !Number.isSafeInteger(width) ||
    width < 1 ||
    !Number.isSafeInteger(height) ||
    height < 1
  )
    throw new Error("Reference preview dimensions are invalid.");
  const scale = Math.min(1, 512 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    maximumLongEdge: 512,
  };
};

export const selectReferencePreviewFrames = (
  frames: readonly number[],
  brackets: readonly { beforeFrame: number; afterFrame: number }[],
) => {
  const chosen = new Set<number>();
  for (const frame of [frames[0], frames.at(-1)])
    if (frame !== undefined) chosen.add(frame);
  for (const { beforeFrame, afterFrame } of brackets) {
    if (
      chosen.size +
        Number(!chosen.has(beforeFrame)) +
        Number(!chosen.has(afterFrame)) >
      REFERENCE_MAX_PREVIEWS
    )
      break;
    chosen.add(beforeFrame);
    chosen.add(afterFrame);
  }
  for (
    let index = 0;
    index < REFERENCE_MAX_PREVIEWS && chosen.size < REFERENCE_MAX_PREVIEWS;
    index++
  ) {
    const frame =
      frames[
        Math.round((index * (frames.length - 1)) / (REFERENCE_MAX_PREVIEWS - 1))
      ];
    if (frame !== undefined) chosen.add(frame);
  }
  return [...chosen].sort((left, right) => left - right);
};

export const meanAbsolutePixelDifference = (
  previous: Uint8Array,
  current: Uint8Array,
) => {
  if (previous.byteLength === 0 || previous.byteLength !== current.byteLength)
    throw new Error(
      "Reference sample frames must have matching non-empty pixel data.",
    );
  let sum = 0;
  for (let index = 0; index < previous.byteLength; index++)
    sum += Math.abs(current[index] - previous[index]);
  return sum / (previous.byteLength * 255);
};

export const buildRhythmSummary = (
  candidateIntervals: readonly { startSeconds: number; endSeconds: number }[],
  durationSeconds: number,
) => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("Reference rhythm duration is invalid.");
  let previousEnd = 0;
  for (const interval of candidateIntervals) {
    if (
      !Number.isFinite(interval.startSeconds) ||
      !Number.isFinite(interval.endSeconds) ||
      interval.startSeconds < previousEnd ||
      interval.startSeconds < 0 ||
      interval.endSeconds <= interval.startSeconds ||
      interval.endSeconds >= durationSeconds
    )
      throw new Error(
        "Reference candidate interval is unordered or outside video duration.",
      );
    previousEnd = interval.endSeconds;
  }
  const estimates = candidateIntervals.map(
    ({ startSeconds, endSeconds }) => (startSeconds + endSeconds) / 2,
  );
  const boundaries = [0, ...estimates, durationSeconds];
  const estimatedShotDurationsSeconds = boundaries
    .slice(1)
    .map((end, index) => end - boundaries[index]);
  const sorted = [...estimatedShotDurationsSeconds].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return {
    candidateCutCount: candidateIntervals.length,
    estimatedShotCount: estimatedShotDurationsSeconds.length,
    candidateCutsPerMinute: (candidateIntervals.length * 60) / durationSeconds,
    cutTimeEstimation: "tested-nominal-bracket-midpoint" as const,
    estimatedShotDurationsSeconds,
    estimatedDurationStatistics: {
      minimumSeconds: sorted[0],
      maximumSeconds: sorted.at(-1)!,
      meanSeconds: durationSeconds / sorted.length,
      medianSeconds:
        sorted.length % 2 === 1
          ? sorted[midpoint]
          : (sorted[midpoint - 1] + sorted[midpoint]) / 2,
    },
    estimatedDurationDistribution: [
      { lowerSeconds: 0, upperSeconds: 1 },
      { lowerSeconds: 1, upperSeconds: 3 },
      { lowerSeconds: 3, upperSeconds: 6 },
      { lowerSeconds: 6, upperSeconds: null },
    ].map((bin) => ({
      ...bin,
      count: estimatedShotDurationsSeconds.filter(
        (duration) =>
          duration >= bin.lowerSeconds &&
          (bin.upperSeconds === null || duration < bin.upperSeconds),
      ).length,
    })),
  };
};
