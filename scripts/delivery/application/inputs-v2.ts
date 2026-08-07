import {
  FinalAssemblyPlanSchema,
  FinalMechanicalCheckV2ReportSchema,
  FinalPreviewApprovalSchema,
  FinalPreviewEvidenceSchema,
  PublishingIntentSchema,
  SemanticTimingSchema,
  StorySpecSchema,
  createDeliverySpecificationV2,
  resolveCurrentPublishingIntent,
  type FinalMechanicalCheckV2Report,
} from "../../../src/contracts";
import { runProjectCheckCli } from "../../project-check/cli";
import {
  checksumDeliveryBytes,
  readDeliveryJson,
  readDeliveryRegularFile,
} from "../adapters/filesystem";
import { loadCurrentDeliveryCoverResult } from "./cover-inputs";
import type { DeliveryApplicationDependencies } from "./types";

const generatedPath = (projectId: string, fileName: string) =>
  `src/projects/${projectId}/generated/${fileName}`;

const defaultVerifyFinalProject = async ({
  rootDir,
  projectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}): Promise<FinalMechanicalCheckV2Report> => {
  const report = await runProjectCheckCli(
    ["--project", projectId, "--level", "final"],
    { rootDir, stdout: () => undefined },
  );
  return FinalMechanicalCheckV2ReportSchema.parse(report);
};

export const loadCurrentDeliveryInputsV2 = async ({
  rootDir,
  projectId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly dependencies?: DeliveryApplicationDependencies;
}) => {
  const verifyFinalProject =
    dependencies.verifyFinalProject ?? defaultVerifyFinalProject;
  const finalReport = FinalMechanicalCheckV2ReportSchema.parse(
    await verifyFinalProject({ rootDir, projectId }),
  );
  if (
    finalReport.storyId !== projectId ||
    finalReport.reportVersion !== "final-mechanical-check-v2" ||
    finalReport.aggregateStatus !== "pass"
  ) {
    throw new Error(
      "Delivery v2 requires a passing current final-mechanical-check-v2.",
    );
  }
  const [
    persistedFinalReport,
    finalAssembly,
    evidence,
    approval,
    story,
    semanticTiming,
    rawIntent,
    cover,
  ] = await Promise.all([
    readDeliveryJson({
      rootDir,
      relativePath: generatedPath(
        projectId,
        "final-mechanical-check.generated.json",
      ),
    }).then(FinalMechanicalCheckV2ReportSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: generatedPath(projectId, "final-assembly.generated.json"),
    }).then(FinalAssemblyPlanSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: generatedPath(
        projectId,
        "final-preview-evidence.generated.json",
      ),
    }).then(FinalPreviewEvidenceSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: generatedPath(
        projectId,
        "final-preview-approval.generated.json",
      ),
    }).then(FinalPreviewApprovalSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/story.json`,
    }).then(StorySpecSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: generatedPath(
        projectId,
        "semantic-timing.generated.json",
      ),
    }).then(SemanticTimingSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/publishing-intent.json`,
    }).then(PublishingIntentSchema.parse),
    loadCurrentDeliveryCoverResult({
      rootDir,
      projectId,
      ...(dependencies.runProcess === undefined
        ? {}
        : { runProcess: dependencies.runProcess }),
    }),
  ]);
  if (persistedFinalReport.reportFingerprint !== finalReport.reportFingerprint) {
    throw new Error("Delivery v2 final mechanical report is not current.");
  }
  const intent = resolveCurrentPublishingIntent({ story, intent: rawIntent });
  const preview = await readDeliveryRegularFile({
    rootDir,
    relativePath: evidence.media.fullPreview.relativePath,
  });
  const previewChecksum = checksumDeliveryBytes(preview.bytes);
  const sharedIdentity =
    finalAssembly.storyId === projectId &&
    story.storyId === projectId &&
    semanticTiming.storyId === projectId &&
    evidence.storyId === projectId &&
    approval.storyId === projectId &&
    cover.assignment.storyId === projectId &&
    finalAssembly.compositionId === evidence.compositionId &&
    evidence.compositionId === approval.compositionId &&
    evidence.finalAssemblyFingerprint ===
      finalAssembly.finalAssemblyFingerprint &&
    approval.finalAssemblyFingerprint ===
      finalAssembly.finalAssemblyFingerprint &&
    approval.evidenceFingerprint === evidence.evidenceFingerprint &&
    approval.previewChecksum === evidence.media.fullPreview.checksum &&
    previewChecksum === approval.previewChecksum &&
    finalReport.inputIdentity.finalAssemblyFingerprint ===
      finalAssembly.finalAssemblyFingerprint &&
    finalReport.inputIdentity.finalPreviewEvidenceFingerprint ===
      evidence.evidenceFingerprint &&
    finalReport.inputIdentity.finalPreviewApprovalFingerprint ===
      approval.approvalFingerprint;
  if (!sharedIdentity) {
    throw new Error(
      "Delivery v2 approval evidence assembly media or Cover identity is stale.",
    );
  }
  if (
    finalAssembly.fps !== evidence.technical.fpsNumerator ||
    evidence.technical.fpsDenominator !== 1 ||
    finalAssembly.width !== evidence.technical.width ||
    finalAssembly.height !== evidence.technical.height ||
    finalAssembly.durationInFrames !== evidence.technical.frameCount ||
    semanticTiming.fps !== finalAssembly.fps ||
    semanticTiming.durationInFrames !== finalAssembly.durationInFrames
  ) {
    throw new Error("Delivery v2 approved technical identity is stale.");
  }
  const specification = createDeliverySpecificationV2({
    storyId: projectId,
    compositionId: finalAssembly.compositionId,
    publishingIntentFingerprint: intent.intentFingerprint,
    coverResultFingerprint: cover.result.resultFingerprint,
  });
  return {
    finalReport,
    finalAssembly,
    evidence,
    approval,
    story,
    semanticTiming,
    intent,
    cover,
    specification,
    preview: {
      relativePath: evidence.media.fullPreview.relativePath,
      absolutePath: preview.absolutePath,
      checksum: previewChecksum,
      sizeBytes: preview.sizeBytes,
    },
  } as const;
};
