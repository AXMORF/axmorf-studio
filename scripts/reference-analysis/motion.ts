import {
  meanAbsolutePixelDifference,
  REFERENCE_SAMPLE_WIDTH,
  REFERENCE_SAMPLE_HEIGHT,
} from "./domain";

export type ImageTransform = Readonly<{
  translationX: number;
  translationY: number;
  scale: number;
}>;
type Fit = Readonly<{
  transform: ImageTransform;
  residual: number;
  overlap: number;
}>;

const sample = (pixels: Uint8Array, x: number, y: number) => {
  const left = Math.floor(x),
    top = Math.floor(y);
  const right = Math.min(left + 1, REFERENCE_SAMPLE_WIDTH - 1);
  const bottom = Math.min(top + 1, REFERENCE_SAMPLE_HEIGHT - 1);
  const dx = x - left,
    dy = y - top;
  return (
    pixels[top * REFERENCE_SAMPLE_WIDTH + left] * (1 - dx) * (1 - dy) +
    pixels[top * REFERENCE_SAMPLE_WIDTH + right] * dx * (1 - dy) +
    pixels[bottom * REFERENCE_SAMPLE_WIDTH + left] * (1 - dx) * dy +
    pixels[bottom * REFERENCE_SAMPLE_WIDTH + right] * dx * dy
  );
};

const fitTransform = (
  previous: Uint8Array,
  current: Uint8Array,
  transform: ImageTransform,
): Fit => {
  const centerX = (REFERENCE_SAMPLE_WIDTH - 1) / 2;
  const centerY = (REFERENCE_SAMPLE_HEIGHT - 1) / 2;
  let difference = 0,
    valid = 0,
    total = 0;
  for (let y = 2; y < REFERENCE_SAMPLE_HEIGHT - 2; y += 2)
    for (let x = 2; x < REFERENCE_SAMPLE_WIDTH - 2; x += 2) {
      total++;
      const sourceX =
        (x - centerX - transform.translationX) / transform.scale + centerX;
      const sourceY =
        (y - centerY - transform.translationY) / transform.scale + centerY;
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX > REFERENCE_SAMPLE_WIDTH - 1 ||
        sourceY > REFERENCE_SAMPLE_HEIGHT - 1
      )
        continue;
      difference += Math.abs(
        current[y * REFERENCE_SAMPLE_WIDTH + x] -
          sample(previous, sourceX, sourceY),
      );
      valid++;
    }
  return {
    transform,
    residual: valid === 0 ? 1 : difference / (valid * 255),
    overlap: valid / total,
  };
};

const textureDeviation = (pixels: Uint8Array) => {
  let sum = 0,
    squares = 0;
  for (const value of pixels) {
    sum += value;
    squares += value * value;
  }
  return (
    Math.sqrt(
      Math.max(0, squares / pixels.length - (sum / pixels.length) ** 2),
    ) / 255
  );
};

// A bounded photometric registration model, not optical flow or a camera solver.
// Fits use inverse sampling around image center and include no rotation/parallax.
export const estimateReferenceImageMotion = (
  previous: Uint8Array,
  current: Uint8Array,
) => {
  if (
    previous.length !== REFERENCE_SAMPLE_WIDTH * REFERENCE_SAMPLE_HEIGHT ||
    current.length !== previous.length
  )
    throw new Error("Image motion requires complete 64x36 gray frames.");
  const rawDifference = meanAbsolutePixelDifference(previous, current);
  const texture = Math.min(
    textureDeviation(previous),
    textureDeviation(current),
  );
  const fits: Fit[] = [];
  if (texture >= 0.025) {
    const coarseModels: Fit[] = [];
    for (const scale of [0.85, 0.925, 1, 1.075, 1.15]) {
      const atScale: Fit[] = [];
      for (let translationY = -4; translationY <= 4; translationY += 2)
        for (let translationX = -6; translationX <= 6; translationX += 2)
          atScale.push(
            fitTransform(previous, current, {
              translationX,
              translationY,
              scale,
            }),
          );
      atScale.sort(
        (left, right) =>
          left.residual - right.residual || right.overlap - left.overlap,
      );
      fits.push(...atScale);
      coarseModels.push(atScale[0]!);
    }
    // Keep a translation hypothesis at each scale: committing to one coarse
    // winner can mistake subpixel translation for zoom in a textured image.
    for (const { transform: coarse } of coarseModels)
      for (const scaleDelta of [-0.02, 0, 0.02])
        for (const yDelta of [-1, -0.5, 0, 0.5, 1])
          for (const xDelta of [-1, -0.5, 0, 0.5, 1])
            fits.push(
              fitTransform(previous, current, {
                translationX: coarse.translationX + xDelta,
                translationY: coarse.translationY + yDelta,
                scale: coarse.scale + scaleDelta,
              }),
            );
    fits.sort(
      (left, right) =>
        left.residual - right.residual || right.overlap - left.overlap,
    );
  }
  const best = fits[0];
  const alternative =
    best === undefined
      ? undefined
      : fits.find(
          ({ transform }) =>
            Math.abs(transform.translationX - best.transform.translationX) >=
              1.5 ||
            Math.abs(transform.translationY - best.transform.translationY) >=
              1.5 ||
            Math.abs(transform.scale - best.transform.scale) >= 0.06,
        );
  const gap =
    best === undefined || alternative === undefined
      ? null
      : alternative.residual - best.residual;
  const status =
    best === undefined
      ? ("unobservable" as const)
      : best.overlap < 0.7 || best.residual > 0.12
        ? ("poor-fit" as const)
        : gap === null || gap < 0.003
          ? ("ambiguous" as const)
          : ("estimated" as const);
  return {
    status,
    transform:
      status === "estimated"
        ? {
            translationXPixels: best!.transform.translationX,
            translationYPixels: best!.transform.translationY,
            translationXNormalized:
              best!.transform.translationX / REFERENCE_SAMPLE_WIDTH,
            translationYNormalized:
              best!.transform.translationY / REFERENCE_SAMPLE_HEIGHT,
            centeredScale: best!.transform.scale,
          }
        : null,
    evidence: {
      normalizedRawDifference: rawDifference,
      normalizedFitResidual: best?.residual ?? null,
      textureStandardDeviation: texture,
      overlapFraction: best?.overlap ?? null,
      distinctAlternativeResidual: alternative?.residual ?? null,
      distinctAlternativeGap: gap,
      evaluatedTransforms: fits.length,
    },
    semanticCamera: "not-assessed" as const,
  };
};

export type ReferenceImageMotion = ReturnType<
  typeof estimateReferenceImageMotion
>;

export const histogramDifference = (
  previous: Uint8Array,
  current: Uint8Array,
) => {
  if (previous.length === 0 || previous.length !== current.length)
    throw new Error("Histogram comparison requires matching frames.");
  const bins = new Int32Array(16);
  for (const value of previous) bins[value >> 4]--;
  for (const value of current) bins[value >> 4]++;
  return (
    bins.reduce((sum, value) => sum + Math.abs(value), 0) /
    (2 * previous.length)
  );
};

export const describeReferenceChange = (
  previous: Uint8Array,
  current: Uint8Array,
  threshold: number,
) => {
  const imageMotion = estimateReferenceImageMotion(previous, current);
  const difference = imageMotion.evidence.normalizedRawDifference;
  const explainedByImageMotion =
    imageMotion.status === "estimated" &&
    imageMotion.evidence.normalizedFitResidual! <
      Math.min(0.06, threshold * 0.4);
  return {
    normalizedMeanAbsoluteDifference: difference,
    normalizedHistogramDifference: histogramDifference(previous, current),
    explainedByImageMotion,
    abruptChangeCandidate: difference > threshold && !explainedByImageMotion,
    imageMotion,
  };
};
