import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { PositiveIntegerSchema, Sha256DigestSchema } from "./primitives";
import { StorySpecSchema, type StorySpec } from "./story";

export const SCENE_READABILITY_POLICY_ID =
  "production-readability-v2" as const;
export const CAPTION_DISPLAY_UNIT_ALGORITHM_ID =
  "caption-display-unit-v1" as const;

const SCALE_DENOMINATOR = 1080;
const CAPTION_LINE_HEIGHT_NUMERATOR = 135;
const CAPTION_LINE_HEIGHT_DENOMINATOR = 100;
const RECOMMENDED_DISPLAY_HALF_UNITS = 64;
const MAX_DISPLAY_HALF_UNITS = 72;

const ceilDiv = (numerator: number, denominator: number) =>
  Math.floor((numerator + denominator - 1) / denominator);

const roundDiv = (numerator: number, denominator: number) =>
  Math.floor((numerator + Math.floor(denominator / 2)) / denominator);

const roundUpToMultiple = (value: number, multiple: number) =>
  ceilDiv(value, multiple) * multiple;

const scaleInteger = (base: number, scaleNumerator: number) =>
  roundDiv(base * scaleNumerator, SCALE_DENOMINATOR);

const SafeAreaSchema = z
  .object({
    top: z.number().int().nonnegative().safe(),
    right: z.number().int().nonnegative().safe(),
    bottom: z.number().int().nonnegative().safe(),
    left: z.number().int().nonnegative().safe(),
  })
  .strict()
  .readonly();

const SceneReadabilityPolicyInputObject = z
  .object({
    schemaVersion: z.literal(1),
    policyId: z.literal(SCENE_READABILITY_POLICY_ID),
    policyVersion: z.literal(1),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    scale: z
      .object({
        numerator: PositiveIntegerSchema,
        denominator: z.literal(SCALE_DENOMINATOR),
      })
      .strict()
      .readonly(),
    baseEdgeInsetPx: PositiveIntegerSchema.max(1000),
    edgeInsetPx: PositiveIntegerSchema,
    sceneBottomInsetPx: PositiveIntegerSchema,
    typographyPolicy: z
      .object({ minFontSizePx: PositiveIntegerSchema })
      .strict()
      .readonly(),
    captionPolicy: z
      .object({
        displayUnitAlgorithmId: z.literal(CAPTION_DISPLAY_UNIT_ALGORITHM_ID),
        recommendedDisplayUnitsPerChunk: z.literal(32),
        maxDisplayUnitsPerChunk: z.literal(36),
        recommendedDisplayHalfUnits: z.literal(RECOMMENDED_DISPLAY_HALF_UNITS),
        maxDisplayHalfUnits: z.literal(MAX_DISPLAY_HALF_UNITS),
        maxCaptionLines: z.literal(2),
        captionFontSizePx: PositiveIntegerSchema,
        captionBottomInsetPx: PositiveIntegerSchema,
        captionGapPx: PositiveIntegerSchema,
        captionVerticalPaddingPx: PositiveIntegerSchema,
        captionBoxHeightPx: PositiveIntegerSchema,
        lineHeight: z
          .object({
            numerator: z.literal(CAPTION_LINE_HEIGHT_NUMERATOR),
            denominator: z.literal(CAPTION_LINE_HEIGHT_DENOMINATOR),
          })
          .strict()
          .readonly(),
      })
      .strict()
      .readonly(),
    sceneContentSafeAreaPx: SafeAreaSchema,
    captionSafeAreaPx: SafeAreaSchema,
  })
  .strict();

const SceneReadabilityPolicyInputSchema =
  SceneReadabilityPolicyInputObject.readonly();

export const computeSceneReadabilityPolicyFingerprint = (
  rawPolicy: unknown,
) => {
  const record = { ...(rawPolicy as Record<string, unknown>) };
  delete record.policyFingerprint;
  const policy = SceneReadabilityPolicyInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-readability-policy",
    version: 1,
    value: policy,
  });
};

const buildSceneReadabilityPolicyInput = ({
  width,
  height,
  edgeInsetPx: rawEdgeInsetPx,
}: {
  readonly width: number;
  readonly height: number;
  readonly edgeInsetPx: number;
}) => {
  const parsedWidth = PositiveIntegerSchema.parse(width);
  const parsedHeight = PositiveIntegerSchema.parse(height);
  const baseEdgeInsetPx = PositiveIntegerSchema.max(1000).parse(rawEdgeInsetPx);
  const scaleNumerator = Math.max(
    SCALE_DENOMINATOR,
    Math.min(parsedWidth, parsedHeight),
  );
  const edgeInsetPx = scaleInteger(baseEdgeInsetPx, scaleNumerator);
  const minFontSizePx = scaleInteger(36, scaleNumerator);
  const captionFontSizePx = scaleInteger(40, scaleNumerator);
  const captionBottomInsetPx = edgeInsetPx * 2;
  const captionGapPx = scaleInteger(30, scaleNumerator);
  const captionVerticalPaddingPx = scaleInteger(38, scaleNumerator);
  const captionBoxHeightPx =
    ceilDiv(
      2 * captionFontSizePx * CAPTION_LINE_HEIGHT_NUMERATOR,
      CAPTION_LINE_HEIGHT_DENOMINATOR,
    ) + captionVerticalPaddingPx;
  const sceneBottomInsetPx = roundUpToMultiple(
    captionBottomInsetPx + captionBoxHeightPx + captionGapPx,
    10,
  );
  return SceneReadabilityPolicyInputSchema.parse({
    schemaVersion: 1,
    policyId: SCENE_READABILITY_POLICY_ID,
    policyVersion: 1,
    width: parsedWidth,
    height: parsedHeight,
    scale: {
      numerator: scaleNumerator,
      denominator: SCALE_DENOMINATOR,
    },
    baseEdgeInsetPx,
    edgeInsetPx,
    sceneBottomInsetPx,
    typographyPolicy: { minFontSizePx },
    captionPolicy: {
      displayUnitAlgorithmId: CAPTION_DISPLAY_UNIT_ALGORITHM_ID,
      recommendedDisplayUnitsPerChunk: 32,
      maxDisplayUnitsPerChunk: 36,
      recommendedDisplayHalfUnits: RECOMMENDED_DISPLAY_HALF_UNITS,
      maxDisplayHalfUnits: MAX_DISPLAY_HALF_UNITS,
      maxCaptionLines: 2,
      captionFontSizePx,
      captionBottomInsetPx,
      captionGapPx,
      captionVerticalPaddingPx,
      captionBoxHeightPx,
      lineHeight: {
        numerator: CAPTION_LINE_HEIGHT_NUMERATOR,
        denominator: CAPTION_LINE_HEIGHT_DENOMINATOR,
      },
    },
    sceneContentSafeAreaPx: {
      top: edgeInsetPx,
      right: edgeInsetPx,
      bottom: sceneBottomInsetPx,
      left: edgeInsetPx,
    },
    captionSafeAreaPx: {
      top: edgeInsetPx,
      right: edgeInsetPx,
      bottom: captionBottomInsetPx,
      left: edgeInsetPx,
    },
  });
};

export const SceneReadabilityPolicySchema =
  SceneReadabilityPolicyInputObject.extend({
    policyFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((policy, context) => {
      const expected = buildSceneReadabilityPolicyInput({
        width: policy.width,
        height: policy.height,
        edgeInsetPx: policy.baseEdgeInsetPx,
      });
      const actual = { ...policy } as Record<string, unknown>;
      delete actual.policyFingerprint;
      if (
        serializeCanonicalJson(actual) !== serializeCanonicalJson(expected) ||
        policy.policyFingerprint !==
          computeSceneReadabilityPolicyFingerprint(expected)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Production readability derived fields or fingerprint are stale.",
          path: ["policyFingerprint"],
        });
      }
    })
    .readonly();

export const resolveSceneReadabilityPolicy = ({
  width,
  height,
  edgeInsetPx = 90,
}: {
  readonly width: number;
  readonly height: number;
  readonly edgeInsetPx?: number;
}) => {
  const input = buildSceneReadabilityPolicyInput({
    width,
    height,
    edgeInsetPx,
  });
  return SceneReadabilityPolicySchema.parse({
    ...input,
    policyFingerprint: computeSceneReadabilityPolicyFingerprint(input),
  });
};

const isRegionalIndicator = (codePoint: number) =>
  codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;

const isGraphemeContinuation = (codePoint: number) =>
  codePoint === 0x200d ||
  codePoint === 0x20e3 ||
  (codePoint >= 0x0300 && codePoint <= 0x036f) ||
  (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
  (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
  (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
  (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
  (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
  (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
  (codePoint >= 0xe0100 && codePoint <= 0xe01ef);

const splitCaptionGraphemes = (text: string) => {
  const codePoints = Array.from(text);
  const graphemes: string[] = [];
  let regionalIndicatorCount = 0;
  for (const codePointText of codePoints) {
    const codePoint = codePointText.codePointAt(0);
    if (codePoint === undefined) continue;
    const previous = graphemes.at(-1);
    const previousCodePoint = previous?.codePointAt(previous.length - 1);
    const append =
      previous !== undefined &&
      (isGraphemeContinuation(codePoint) ||
        previousCodePoint === 0x200d ||
        (isRegionalIndicator(codePoint) && regionalIndicatorCount % 2 === 1));
    if (append) graphemes[graphemes.length - 1] = previous + codePointText;
    else graphemes.push(codePointText);
    regionalIndicatorCount = isRegionalIndicator(codePoint)
      ? regionalIndicatorCount + 1
      : 0;
  }
  return graphemes;
};

export const countCaptionDisplayHalfUnits = (text: string) =>
  splitCaptionGraphemes(text).reduce(
    (total, grapheme) =>
      total +
      (Array.from(grapheme).every(
        (character) => (character.codePointAt(0) ?? 0x80) <= 0x7f,
      )
        ? 1
        : 2),
    0,
  );

export const validateCaptionDisplayBudget = ({
  chunkId,
  ttsText,
  maxDisplayHalfUnits = MAX_DISPLAY_HALF_UNITS,
}: {
  readonly chunkId: string;
  readonly ttsText: string;
  readonly maxDisplayHalfUnits?: number;
}) => {
  const displayHalfUnits = countCaptionDisplayHalfUnits(ttsText);
  if (displayHalfUnits > maxDisplayHalfUnits) {
    throw new Error(
      `TTS chunk ${chunkId} uses ${displayHalfUnits} half-units and exceeds the ${maxDisplayHalfUnits} half-units caption budget.`,
    );
  }
  return { chunkId, ttsText, displayHalfUnits } as const;
};

export const validateStoryCaptionReadability = ({
  story: rawStory,
  policy: rawPolicy,
}: {
  readonly story: StorySpec | unknown;
  readonly policy: SceneReadabilityPolicy | unknown;
}) => {
  const story = StorySpecSchema.parse(rawStory);
  const policy = SceneReadabilityPolicySchema.parse(rawPolicy);
  return story.beats.flatMap((beat) =>
    beat.kind === "narrated-scene"
      ? beat.ttsChunks.map((chunk) =>
          validateCaptionDisplayBudget({
            ...chunk,
            maxDisplayHalfUnits: policy.captionPolicy.maxDisplayHalfUnits,
          }),
        )
      : [],
  );
};

export type SceneReadabilityPolicy = z.infer<
  typeof SceneReadabilityPolicySchema
>;
