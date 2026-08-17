import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  NARRATIVE_CORE_VERSION,
  PROJECT_REGISTRY_GENERATOR_ID,
} from "./narrative-baseline";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { RenderSpecSchema, type RenderSpec } from "./render";

export const NARRATIVE_AUTO_CHECK_VERSION = "narrative-auto-check-v4" as const;

export const NARRATIVE_AUTO_CHECK_IDS = [
  "source-contracts",
  "sealed-narration",
  "semantic-timing",
  "project-registry",
  "narrative-baseline",
  "baseline-evidence",
] as const;

export const NARRATIVE_AUTO_CHECK_EVIDENCE_IDS = [
  "sealed-manifest",
  "complete-wav",
  "semantic-timing",
  "project-registry",
  "baseline-receipt",
] as const;

export const NARRATIVE_AUTO_CHECK_FAILURE_CODES = [
  "missing",
  "malformed",
  "stale",
  "checksum-mismatch",
  "identity-mismatch",
  "registry-drift",
  "media-invalid",
  "unexpected",
] as const;

export type NarrativeAutoCheckId = (typeof NARRATIVE_AUTO_CHECK_IDS)[number];
export type NarrativeAutoCheckEvidenceId =
  (typeof NARRATIVE_AUTO_CHECK_EVIDENCE_IDS)[number];

const SAFE_REPORT_TEXT_PATTERN =
  /(?:\/home\/|\/data\/|\/srv\/|Bearer\s|token|endpoint|referenceAudio|\.narration-work|(?:^|\/)out\/|\bstack\b|\bcause\b)/i;

const SafeFailureMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (message) => !SAFE_REPORT_TEXT_PATTERN.test(message),
    "Failure messages must not contain private or non-repository diagnostics.",
  );

const NarrativeAutoCheckFailureReasonSchema = z
  .object({
    code: z.enum(NARRATIVE_AUTO_CHECK_FAILURE_CODES),
    message: SafeFailureMessageSchema,
  })
  .strict()
  .readonly();

const NarrativeAutoCheckItemSchema = z
  .object({
    checkId: z.enum(NARRATIVE_AUTO_CHECK_IDS),
    status: z.enum(["pass", "fail"]),
    evidenceIds: z.array(z.enum(NARRATIVE_AUTO_CHECK_EVIDENCE_IDS)).readonly(),
    failureReasons: z.array(NarrativeAutoCheckFailureReasonSchema).readonly(),
  })
  .strict()
  .readonly();

const NarrativeAutoCheckInputIdentitySchema = z
  .object({
    storyFingerprint: Sha256DigestSchema.nullable(),
    renderSpecFingerprint: Sha256DigestSchema.nullable(),
    generationInputFingerprint: Sha256DigestSchema.nullable(),
    sealedNarrationFingerprint: Sha256DigestSchema.nullable(),
    masteredNarrationFingerprint: Sha256DigestSchema.nullable(),
    semanticTimingFingerprint: Sha256DigestSchema.nullable(),
    projectRegistryGeneratorId: z
      .literal(PROJECT_REGISTRY_GENERATOR_ID)
      .nullable(),
    generatedRegistryChecksum: Sha256DigestSchema.nullable(),
    generatedEntryChecksum: Sha256DigestSchema.nullable(),
    projectRegistryEntryFingerprint: Sha256DigestSchema.nullable(),
    narrativeCoreVersion: z.literal(NARRATIVE_CORE_VERSION).nullable(),
    narrativeBaselineFingerprint: Sha256DigestSchema.nullable(),
    baselineEvidenceFingerprint: Sha256DigestSchema.nullable(),
  })
  .strict()
  .readonly();

const NarrativeAutoCheckEvidenceRefSchema = z
  .object({
    evidenceId: z.enum(NARRATIVE_AUTO_CHECK_EVIDENCE_IDS),
    repositoryPath: z
      .string()
      .min(1)
      .refine(
        (path) =>
          !path.startsWith("/") &&
          !path.includes("\\") &&
          !path.includes("..") &&
          !SAFE_REPORT_TEXT_PATTERN.test(path),
        "Evidence paths must be safe repository-relative paths.",
      ),
    checksum: Sha256DigestSchema.nullable(),
  })
  .strict()
  .readonly();

const NarrativeAutoCheckReportInputObject = z
  .object({
    schemaVersion: z.literal(2),
    reportVersion: z.literal(NARRATIVE_AUTO_CHECK_VERSION),
    storyId: StoryIdSchema,
    level: z.literal("narrative"),
    aggregateStatus: z.enum(["pass", "fail"]),
    inputIdentity: NarrativeAutoCheckInputIdentitySchema,
    evidenceRefs: z
      .array(NarrativeAutoCheckEvidenceRefSchema)
      .length(NARRATIVE_AUTO_CHECK_EVIDENCE_IDS.length)
      .readonly(),
    checks: z
      .array(NarrativeAutoCheckItemSchema)
      .length(NARRATIVE_AUTO_CHECK_IDS.length)
      .readonly(),
  })
  .strict();

const expectedEvidencePaths = ({
  storyId,
  sealedNarrationFingerprint,
  masteredNarrationFingerprint,
}: {
  readonly storyId: string;
  readonly sealedNarrationFingerprint: string | null;
  readonly masteredNarrationFingerprint: string | null;
}) => {
  const sealDirectory =
    sealedNarrationFingerprint?.slice("sha256:".length) ?? "unavailable";
  const masterDirectory =
    masteredNarrationFingerprint?.slice("sha256:".length) ?? "unavailable";
  return [
    `src/projects/${storyId}/generated/sealed-narration.generated.json`,
    `public/projects/${storyId}/narration-mastered/${sealDirectory}/${masterDirectory}/complete.wav`,
    `src/projects/${storyId}/generated/semantic-timing.generated.json`,
    "src/projects/project-registry.generated.ts",
    `src/projects/${storyId}/generated/narrative-baseline-evidence.generated.json`,
  ] as const;
};

const EXPECTED_CHECK_EVIDENCE = {
  "source-contracts": [],
  "sealed-narration": ["sealed-manifest", "complete-wav"],
  "semantic-timing": ["semantic-timing"],
  "project-registry": ["project-registry"],
  "narrative-baseline": [],
  "baseline-evidence": ["baseline-receipt"],
} as const satisfies Record<
  NarrativeAutoCheckId,
  readonly NarrativeAutoCheckEvidenceId[]
>;

type ReportInputShape = z.infer<typeof NarrativeAutoCheckReportInputObject>;

const addReportIssues = (
  report: ReportInputShape,
  context: z.RefinementCtx,
) => {
  const expectedPaths = expectedEvidencePaths({
    storyId: report.storyId,
    sealedNarrationFingerprint: report.inputIdentity.sealedNarrationFingerprint,
    masteredNarrationFingerprint:
      report.inputIdentity.masteredNarrationFingerprint,
  });
  report.evidenceRefs.forEach((reference, index) => {
    if (reference.evidenceId !== NARRATIVE_AUTO_CHECK_EVIDENCE_IDS[index]) {
      context.addIssue({
        code: "custom",
        message: "AutoCheck evidence references must use the fixed order.",
        path: ["evidenceRefs", index, "evidenceId"],
      });
    }
    if (reference.repositoryPath !== expectedPaths[index]) {
      context.addIssue({
        code: "custom",
        message: "AutoCheck evidence reference path is not current.",
        path: ["evidenceRefs", index, "repositoryPath"],
      });
    }
  });

  report.checks.forEach((check, index) => {
    if (check.checkId !== NARRATIVE_AUTO_CHECK_IDS[index]) {
      context.addIssue({
        code: "custom",
        message: "AutoCheck items must contain every fixed check in order.",
        path: ["checks", index, "checkId"],
      });
    }
    if (
      JSON.stringify(check.evidenceIds) !==
      JSON.stringify(EXPECTED_CHECK_EVIDENCE[check.checkId])
    ) {
      context.addIssue({
        code: "custom",
        message: "AutoCheck item evidence references are not fixed.",
        path: ["checks", index, "evidenceIds"],
      });
    }
    if (check.status === "pass" && check.failureReasons.length !== 0) {
      context.addIssue({
        code: "custom",
        message: "Passing AutoCheck items cannot contain failure reasons.",
        path: ["checks", index, "failureReasons"],
      });
    }
    if (check.status === "fail" && check.failureReasons.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Failing AutoCheck items require a safe failure reason.",
        path: ["checks", index, "failureReasons"],
      });
    }
  });

  const everyCheckPassed = report.checks.every(
    (check) => check.status === "pass",
  );
  const everyIdentityPresent = Object.values(report.inputIdentity).every(
    (value) => value !== null,
  );
  const everyEvidencePresent = report.evidenceRefs.every(
    (reference) => reference.checksum !== null,
  );
  const canPass =
    everyCheckPassed && everyIdentityPresent && everyEvidencePresent;
  if ((report.aggregateStatus === "pass") !== canPass) {
    context.addIssue({
      code: "custom",
      message:
        "AutoCheck aggregate passes exactly when every check and identity passes.",
      path: ["aggregateStatus"],
    });
  }
};

export const NarrativeAutoCheckReportInputSchema =
  NarrativeAutoCheckReportInputObject.superRefine(addReportIssues).readonly();

export type NarrativeAutoCheckReportInput = z.infer<
  typeof NarrativeAutoCheckReportInputSchema
>;

const NarrativeAutoCheckReportObject =
  NarrativeAutoCheckReportInputObject.extend({
    reportFingerprint: Sha256DigestSchema,
  }).strict();

export const computeNarrativeAutoCheckReportFingerprint = (
  rawInput: unknown,
) => {
  const input = NarrativeAutoCheckReportInputSchema.parse(rawInput);
  return createFingerprint({
    namespace: "narrative-auto-check-report",
    version: 3,
    value: input,
  });
};

export const NarrativeAutoCheckReportSchema =
  NarrativeAutoCheckReportObject.superRefine((report, context) => {
    addReportIssues(report, context);
    const { reportFingerprint, ...input } = report;
    let expectedFingerprint;
    try {
      expectedFingerprint = computeNarrativeAutoCheckReportFingerprint(input);
    } catch {
      return;
    }
    if (reportFingerprint !== expectedFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Narrative AutoCheck report fingerprint is stale.",
        path: ["reportFingerprint"],
      });
    }
  }).readonly();

export type NarrativeAutoCheckReport = z.infer<
  typeof NarrativeAutoCheckReportSchema
>;

export const computeRenderSpecFingerprint = (rawRender: RenderSpec) =>
  createFingerprint({
    namespace: "render-spec",
    version: 1,
    value: RenderSpecSchema.parse(rawRender),
  });

export const createNarrativeAutoCheckEvidenceRefs = ({
  storyId: rawStoryId,
  sealedNarrationFingerprint: rawSealedNarrationFingerprint,
  masteredNarrationFingerprint: rawMasteredNarrationFingerprint,
  checksums,
}: {
  readonly storyId: string;
  readonly sealedNarrationFingerprint: string | null;
  readonly masteredNarrationFingerprint: string | null;
  readonly checksums: Readonly<
    Record<NarrativeAutoCheckEvidenceId, string | null>
  >;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const sealedNarrationFingerprint =
    rawSealedNarrationFingerprint === null
      ? null
      : Sha256DigestSchema.parse(rawSealedNarrationFingerprint);
  const masteredNarrationFingerprint =
    rawMasteredNarrationFingerprint === null
      ? null
      : Sha256DigestSchema.parse(rawMasteredNarrationFingerprint);
  const paths = expectedEvidencePaths({
    storyId,
    sealedNarrationFingerprint,
    masteredNarrationFingerprint,
  });
  return NARRATIVE_AUTO_CHECK_EVIDENCE_IDS.map((evidenceId, index) =>
    NarrativeAutoCheckEvidenceRefSchema.parse({
      evidenceId,
      repositoryPath: paths[index],
      checksum:
        checksums[evidenceId] === null
          ? null
          : Sha256DigestSchema.parse(checksums[evidenceId]),
    }),
  );
};

export const createNarrativeAutoCheckReport = (
  rawInput: unknown,
): NarrativeAutoCheckReport => {
  const input = NarrativeAutoCheckReportInputSchema.parse(rawInput);
  return NarrativeAutoCheckReportSchema.parse({
    ...input,
    reportFingerprint: computeNarrativeAutoCheckReportFingerprint(input),
  });
};
