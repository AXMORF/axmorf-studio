import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";

export const FINAL_MECHANICAL_CHECK_VERSION =
  "final-mechanical-check-v1" as const;

export const FINAL_MECHANICAL_CHECK_IDS = [
  "narrative",
  "visual-style",
  "resource-catalog",
  "external-references",
  "reference-fidelity",
  "scene-coverage",
  "scene-packages",
  "renderer-registry",
  "scene-projections",
  "composition-assembly",
] as const;

export const FINAL_MECHANICAL_FAILURE_CODES = [
  "missing",
  "malformed",
  "stale",
  "checksum-mismatch",
  "identity-mismatch",
  "registry-drift",
  "unexpected",
] as const;

export type FinalMechanicalCheckId =
  (typeof FINAL_MECHANICAL_CHECK_IDS)[number];

const SafeMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (message) =>
      !/(?:\/home\/|\/data\/|\/srv\/|Bearer\s|token|endpoint|https?:|\.reference-workspaces|\bstack\b|\bcause\b)/i.test(
        message,
      ),
    "Final check failures must contain safe fixed text only.",
  );

const FailureReasonSchema = z
  .object({
    code: z.enum(FINAL_MECHANICAL_FAILURE_CODES),
    message: SafeMessageSchema,
  })
  .strict()
  .readonly();

const CheckItemSchema = z
  .object({
    checkId: z.enum(FINAL_MECHANICAL_CHECK_IDS),
    status: z.enum(["pass", "fail", "not-applicable"]),
    failureReasons: z.array(FailureReasonSchema).max(1).readonly(),
  })
  .strict()
  .readonly();

const ReferenceModeSchema = z.enum([
  "empty",
  "inspiration-only",
  "exact-demo-localized",
]);

const FinalInputIdentitySchema = z
  .object({
    narrativeReportFingerprint: Sha256DigestSchema.nullable(),
    visualStyleFingerprint: Sha256DigestSchema.nullable(),
    resourceCatalogFingerprint: Sha256DigestSchema.nullable(),
    referenceModes: z.array(ReferenceModeSchema).max(256).readonly(),
    externalSnapshotFingerprints: z
      .array(Sha256DigestSchema)
      .max(256)
      .readonly(),
    fidelityReceiptFingerprints: z
      .array(Sha256DigestSchema)
      .max(256)
      .readonly(),
    sceneCoverageFingerprint: Sha256DigestSchema.nullable(),
    scenePackageFingerprints: z.array(Sha256DigestSchema).max(256).readonly(),
    rendererRegistryFingerprint: Sha256DigestSchema.nullable(),
    storyVisualProjectionFingerprint: Sha256DigestSchema.nullable(),
    soundDesignProjectionFingerprint: Sha256DigestSchema.nullable(),
    compositionAssemblyChecksum: Sha256DigestSchema.nullable(),
  })
  .strict()
  .readonly();

const FinalReportInputObject = z
  .object({
    schemaVersion: z.literal(1),
    reportVersion: z.literal(FINAL_MECHANICAL_CHECK_VERSION),
    storyId: StoryIdSchema,
    level: z.literal("final"),
    aggregateStatus: z.enum(["pass", "fail"]),
    inputIdentity: FinalInputIdentitySchema,
    checks: z
      .array(CheckItemSchema)
      .length(FINAL_MECHANICAL_CHECK_IDS.length)
      .readonly(),
  })
  .strict();

type FinalReportInput = z.infer<typeof FinalReportInputObject>;

const addFinalReportIssues = (
  report: FinalReportInput,
  context: z.RefinementCtx,
) => {
  report.checks.forEach((check, index) => {
    if (check.checkId !== FINAL_MECHANICAL_CHECK_IDS[index]) {
      context.addIssue({
        code: "custom",
        message: "Final mechanical checks must use the fixed order.",
        path: ["checks", index, "checkId"],
      });
    }
    if ((check.status === "fail") !== (check.failureReasons.length === 1)) {
      context.addIssue({
        code: "custom",
        message: "Only failed final checks carry one safe reason.",
        path: ["checks", index, "failureReasons"],
      });
    }
  });
  const checkById = new Map(
    report.checks.map((check) => [check.checkId, check]),
  );
  const everyReferenceIsEmpty =
    report.inputIdentity.referenceModes.length > 0 &&
    report.inputIdentity.referenceModes.every((mode) => mode === "empty");
  const hasExactReference = report.inputIdentity.referenceModes.includes(
    "exact-demo-localized",
  );
  const hasReadyPackage =
    report.inputIdentity.scenePackageFingerprints.length > 0;
  if (report.aggregateStatus === "pass") {
    const requiredIdentity = [
      report.inputIdentity.narrativeReportFingerprint,
      report.inputIdentity.visualStyleFingerprint,
      report.inputIdentity.resourceCatalogFingerprint,
      report.inputIdentity.sceneCoverageFingerprint,
      report.inputIdentity.compositionAssemblyChecksum,
    ];
    if (
      report.checks.some((check) => check.status === "fail") ||
      requiredIdentity.some((value) => value === null) ||
      report.inputIdentity.referenceModes.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Final pass requires every applicable check and identity.",
        path: ["aggregateStatus"],
      });
    }
    const externalStatus = checkById.get("external-references")?.status;
    const fidelityStatus = checkById.get("reference-fidelity")?.status;
    if (
      (everyReferenceIsEmpty
        ? externalStatus !== "not-applicable" ||
          report.inputIdentity.externalSnapshotFingerprints.length !== 0
        : externalStatus !== "pass" ||
          report.inputIdentity.externalSnapshotFingerprints.length === 0) ||
      (hasExactReference
        ? fidelityStatus !== "pass" ||
          report.inputIdentity.fidelityReceiptFingerprints.length === 0
        : fidelityStatus !== "not-applicable" ||
          report.inputIdentity.fidelityReceiptFingerprints.length !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Final reference applicability does not match its identities.",
        path: ["inputIdentity", "referenceModes"],
      });
    }
    const packageStatus = checkById.get("scene-packages")?.status;
    const registryStatus = checkById.get("renderer-registry")?.status;
    const projectionStatus = checkById.get("scene-projections")?.status;
    if (
      hasReadyPackage
        ? packageStatus !== "pass" ||
          registryStatus !== "pass" ||
          projectionStatus !== "pass" ||
          report.inputIdentity.rendererRegistryFingerprint === null ||
          report.inputIdentity.storyVisualProjectionFingerprint === null ||
          report.inputIdentity.soundDesignProjectionFingerprint === null
        : packageStatus !== "not-applicable" ||
          registryStatus !== "not-applicable" ||
          projectionStatus !== "not-applicable" ||
          report.inputIdentity.rendererRegistryFingerprint !== null ||
          report.inputIdentity.storyVisualProjectionFingerprint !== null ||
          report.inputIdentity.soundDesignProjectionFingerprint !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Final Scene package applicability is inconsistent.",
        path: ["inputIdentity", "scenePackageFingerprints"],
      });
    }
  }
  for (const values of [
    report.inputIdentity.externalSnapshotFingerprints,
    report.inputIdentity.fidelityReceiptFingerprints,
    report.inputIdentity.scenePackageFingerprints,
  ]) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "Final identity lists must not contain duplicates.",
        path: ["inputIdentity"],
      });
    }
  }
};

export const FinalMechanicalCheckReportInputSchema =
  FinalReportInputObject.superRefine(addFinalReportIssues).readonly();

export const computeFinalMechanicalCheckReportFingerprint = (
  rawInput: unknown,
) => {
  const input = FinalMechanicalCheckReportInputSchema.parse(rawInput);
  return createFingerprint({
    namespace: "final-mechanical-check-report",
    version: 1,
    value: input,
  });
};

export const FinalMechanicalCheckReportSchema = FinalReportInputObject.extend({
  reportFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((report, context) => {
    addFinalReportIssues(report, context);
    const { reportFingerprint, ...input } = report;
    try {
      if (
        reportFingerprint !==
        computeFinalMechanicalCheckReportFingerprint(input)
      ) {
        context.addIssue({
          code: "custom",
          message: "Final mechanical report fingerprint is stale.",
          path: ["reportFingerprint"],
        });
      }
    } catch {
      return;
    }
  })
  .readonly();

export const createFinalMechanicalCheckReport = (rawInput: unknown) => {
  const input = FinalMechanicalCheckReportInputSchema.parse(rawInput);
  return FinalMechanicalCheckReportSchema.parse({
    ...input,
    reportFingerprint: computeFinalMechanicalCheckReportFingerprint(input),
  });
};

export type FinalMechanicalCheckReport = z.infer<
  typeof FinalMechanicalCheckReportSchema
>;
export type FinalMechanicalCheckReportInput = z.infer<
  typeof FinalMechanicalCheckReportInputSchema
>;

export const FINAL_MECHANICAL_CHECK_V2_VERSION =
  "final-mechanical-check-v2" as const;

export const FINAL_MECHANICAL_CHECK_V2_IDS = [
  ...FINAL_MECHANICAL_CHECK_IDS,
  "global-visual",
  "final-assembly",
] as const;

export type FinalMechanicalCheckV2Id =
  (typeof FINAL_MECHANICAL_CHECK_V2_IDS)[number];

const FinalV2CheckItemSchema = z
  .object({
    checkId: z.enum(FINAL_MECHANICAL_CHECK_V2_IDS),
    status: z.enum(["pass", "fail", "not-applicable"]),
    failureReasons: z.array(FailureReasonSchema).max(1).readonly(),
  })
  .strict()
  .readonly();

const FinalV2InputIdentitySchema = FinalInputIdentitySchema.unwrap()
  .extend({
    globalVisualPlanFingerprint: Sha256DigestSchema.nullable(),
    globalVisualProjectionFingerprint: Sha256DigestSchema.nullable(),
    finalAssemblyFingerprint: Sha256DigestSchema.nullable(),
  })
  .strict()
  .readonly();

const FinalV2ReportInputObject = z
  .object({
    schemaVersion: z.literal(2),
    reportVersion: z.literal(FINAL_MECHANICAL_CHECK_V2_VERSION),
    storyId: StoryIdSchema,
    level: z.literal("final"),
    aggregateStatus: z.enum(["pass", "fail"]),
    inputIdentity: FinalV2InputIdentitySchema,
    checks: z
      .array(FinalV2CheckItemSchema)
      .length(FINAL_MECHANICAL_CHECK_V2_IDS.length)
      .readonly(),
  })
  .strict();

type FinalV2ReportInput = z.infer<typeof FinalV2ReportInputObject>;

const addFinalV2ReportIssues = (
  report: FinalV2ReportInput,
  context: z.RefinementCtx,
) => {
  report.checks.forEach((check, index) => {
    if (check.checkId !== FINAL_MECHANICAL_CHECK_V2_IDS[index]) {
      context.addIssue({
        code: "custom",
        message: "Final v2 mechanical checks must use the fixed order.",
        path: ["checks", index, "checkId"],
      });
    }
    if ((check.status === "fail") !== (check.failureReasons.length === 1)) {
      context.addIssue({
        code: "custom",
        message: "Only failed final v2 checks carry one safe reason.",
        path: ["checks", index, "failureReasons"],
      });
    }
  });

  const baseInput: FinalReportInput = {
    schemaVersion: 1,
    reportVersion: FINAL_MECHANICAL_CHECK_VERSION,
    storyId: report.storyId,
    level: "final",
    aggregateStatus: report.aggregateStatus,
    inputIdentity: {
      narrativeReportFingerprint:
        report.inputIdentity.narrativeReportFingerprint,
      visualStyleFingerprint: report.inputIdentity.visualStyleFingerprint,
      resourceCatalogFingerprint:
        report.inputIdentity.resourceCatalogFingerprint,
      referenceModes: report.inputIdentity.referenceModes,
      externalSnapshotFingerprints:
        report.inputIdentity.externalSnapshotFingerprints,
      fidelityReceiptFingerprints:
        report.inputIdentity.fidelityReceiptFingerprints,
      sceneCoverageFingerprint: report.inputIdentity.sceneCoverageFingerprint,
      scenePackageFingerprints: report.inputIdentity.scenePackageFingerprints,
      rendererRegistryFingerprint:
        report.inputIdentity.rendererRegistryFingerprint,
      storyVisualProjectionFingerprint:
        report.inputIdentity.storyVisualProjectionFingerprint,
      soundDesignProjectionFingerprint:
        report.inputIdentity.soundDesignProjectionFingerprint,
      compositionAssemblyChecksum:
        report.inputIdentity.compositionAssemblyChecksum,
    },
    checks: report.checks.slice(
      0,
      FINAL_MECHANICAL_CHECK_IDS.length,
    ) as z.infer<typeof CheckItemSchema>[],
  };
  addFinalReportIssues(baseInput, context);

  if (report.aggregateStatus === "pass") {
    const assemblyIdentities = [
      report.inputIdentity.globalVisualPlanFingerprint,
      report.inputIdentity.globalVisualProjectionFingerprint,
      report.inputIdentity.finalAssemblyFingerprint,
    ];
    const assemblyChecks = report.checks.slice(
      FINAL_MECHANICAL_CHECK_IDS.length,
    );
    if (
      assemblyIdentities.some((identity) => identity === null) ||
      assemblyChecks.some((check) => check.status !== "pass")
    ) {
      context.addIssue({
        code: "custom",
        message: "Final v2 pass requires current Final assembly identities.",
        path: ["aggregateStatus"],
      });
    }
  }
};

export const FinalMechanicalCheckV2ReportInputSchema =
  FinalV2ReportInputObject.superRefine(addFinalV2ReportIssues).readonly();

export const computeFinalMechanicalCheckV2ReportFingerprint = (
  rawInput: unknown,
) => {
  const input = FinalMechanicalCheckV2ReportInputSchema.parse(rawInput);
  return createFingerprint({
    namespace: "final-mechanical-check-report",
    version: 2,
    value: input,
  });
};

export const FinalMechanicalCheckV2ReportSchema =
  FinalV2ReportInputObject.extend({ reportFingerprint: Sha256DigestSchema })
    .strict()
    .superRefine((report, context) => {
      addFinalV2ReportIssues(report, context);
      const { reportFingerprint, ...input } = report;
      try {
        if (
          reportFingerprint !==
          computeFinalMechanicalCheckV2ReportFingerprint(input)
        ) {
          context.addIssue({
            code: "custom",
            message: "Final v2 mechanical report fingerprint is stale.",
            path: ["reportFingerprint"],
          });
        }
      } catch {
        return;
      }
    })
    .readonly();

export const createFinalMechanicalCheckV2Report = (rawInput: unknown) => {
  const input = FinalMechanicalCheckV2ReportInputSchema.parse(rawInput);
  return FinalMechanicalCheckV2ReportSchema.parse({
    ...input,
    reportFingerprint: computeFinalMechanicalCheckV2ReportFingerprint(input),
  });
};

export const AnyFinalMechanicalCheckReportSchema = z.union([
  FinalMechanicalCheckReportSchema,
  FinalMechanicalCheckV2ReportSchema,
]);

export type FinalMechanicalCheckV2Report = z.infer<
  typeof FinalMechanicalCheckV2ReportSchema
>;
export type FinalMechanicalCheckV2ReportInput = z.infer<
  typeof FinalMechanicalCheckV2ReportInputSchema
>;
export type AnyFinalMechanicalCheckReport = z.infer<
  typeof AnyFinalMechanicalCheckReportSchema
>;
