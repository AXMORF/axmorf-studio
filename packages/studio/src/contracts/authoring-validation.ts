import { z } from "zod";

import {
  CAPTION_DISPLAY_UNIT_ALGORITHM_ID,
  formatCaptionDisplayBudgetExceededMessage,
  measureCaptionDisplayBudget,
} from "./scene-readability";
import { StorySpecSchema } from "./story";

export const AUTHORING_VALIDATION_FAILURE_CODE =
  "authoring-validation-failed" as const;
export const CAPTION_DISPLAY_BUDGET_ISSUE_CODE =
  "caption-display-budget-exceeded" as const;

const JsonPathSchema = z.string().min(1).startsWith("$");

export const CaptionDisplayBudgetIssueDetailsSchema = z
  .object({
    algorithmId: z.literal(CAPTION_DISPLAY_UNIT_ALGORITHM_ID),
    chunkId: z.string().min(1),
    displayHalfUnits: z.number().int().nonnegative().safe(),
    maxDisplayHalfUnits: z.number().int().positive().safe(),
  })
  .strict()
  .readonly();

export const AuthoringFieldIssueSchema = z
  .object({
    path: JsonPathSchema,
    code: z.literal(CAPTION_DISPLAY_BUDGET_ISSUE_CODE),
    message: z.string().min(1),
    ownerAction: z.string().min(1),
    details: CaptionDisplayBudgetIssueDetailsSchema,
  })
  .strict()
  .readonly();

const AuthoringFieldIssuesSchema = z
  .array(AuthoringFieldIssueSchema)
  .min(1)
  .max(50)
  .readonly();

export const AuthoringValidationFailureSchema = z
  .object({
    status: z.literal("error"),
    code: z.literal(AUTHORING_VALIDATION_FAILURE_CODE),
    message: z.string().min(1),
    issues: AuthoringFieldIssuesSchema,
  })
  .strict()
  .readonly();

export type JsonPathSegment = string | number;

const isIdentifierSegment = (value: string) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value);

export const formatJsonPath = (segments: readonly JsonPathSegment[]) =>
  segments.reduce((path, segment) => {
    if (typeof segment === "number") {
      if (!Number.isSafeInteger(segment) || segment < 0) {
        throw new Error("JSONPath array indexes must be non-negative integers.");
      }
      return `${path}[${segment}]`;
    }
    return isIdentifierSegment(segment)
      ? `${path}.${segment}`
      : `${path}[${JSON.stringify(segment)}]`;
  }, "$" as string);

export const collectCaptionAuthoringIssues = ({
  story: rawStory,
  pathPrefix,
}: {
  readonly story: unknown;
  readonly pathPrefix: readonly JsonPathSegment[];
}): readonly AuthoringFieldIssue[] => {
  const story = StorySpecSchema.parse(rawStory);
  return story.beats.flatMap((beat, beatIndex) =>
    beat.kind === "narrated-scene"
      ? beat.ttsChunks.flatMap((chunk, chunkIndex) => {
          const measurement = measureCaptionDisplayBudget(chunk);
          if (!measurement.exceedsBudget) return [];
          return [
            AuthoringFieldIssueSchema.parse({
              path: formatJsonPath([
                ...pathPrefix,
                "beats",
                beatIndex,
                "ttsChunks",
                chunkIndex,
                "ttsText",
              ]),
              code: CAPTION_DISPLAY_BUDGET_ISSUE_CODE,
              message: formatCaptionDisplayBudgetExceededMessage(measurement),
              ownerAction:
                "Split this text into adjacent ttsChunks while preserving narration order, then validate the same raw input again.",
              details: {
                algorithmId: CAPTION_DISPLAY_UNIT_ALGORITHM_ID,
                chunkId: measurement.chunkId,
                displayHalfUnits: measurement.displayHalfUnits,
                maxDisplayHalfUnits: measurement.maxDisplayHalfUnits,
              },
            }),
          ];
        })
      : [],
  );
};

export class AuthoringValidationError extends Error {
  readonly code = AUTHORING_VALIDATION_FAILURE_CODE;
  readonly issues: readonly AuthoringFieldIssue[];

  constructor(
    issues: readonly AuthoringFieldIssue[],
    message = "Project authoring input failed validation.",
  ) {
    super(message);
    this.name = "AuthoringValidationError";
    this.issues = AuthoringFieldIssuesSchema.parse(issues);
  }
}

export const assertCaptionAuthoringValid = ({
  story,
  pathPrefix,
}: Parameters<typeof collectCaptionAuthoringIssues>[0]) => {
  const issues = collectCaptionAuthoringIssues({ story, pathPrefix });
  if (issues.length > 0) throw new AuthoringValidationError(issues);
};

export const buildAuthoringValidationFailure = (
  error: AuthoringValidationError,
) =>
  AuthoringValidationFailureSchema.parse({
    status: "error",
    code: error.code,
    message: error.message,
    issues: error.issues,
  });

export type AuthoringFieldIssue = z.infer<typeof AuthoringFieldIssueSchema>;
export type AuthoringValidationFailure = z.infer<
  typeof AuthoringValidationFailureSchema
>;
