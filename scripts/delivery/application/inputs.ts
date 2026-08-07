import {
  AuthoredDeliverySpecificationSchema,
  FinalAssemblyPlanSchema,
  FinalMechanicalCheckV2ReportSchema,
  FinalPreviewApprovalSchema,
  FinalPreviewEvidenceSchema,
  createDeliverySpecification,
  type FinalMechanicalCheckV2Report,
} from "../../../src/contracts";
import { runProjectCheckCli } from "../../project-check/cli";
import {
  checksumDeliveryBytes,
  readDeliveryJson,
  readDeliveryRegularFile,
} from "../adapters/filesystem";

export type VerifyFinalProject = (request: {
  readonly rootDir: string;
  readonly projectId: string;
}) => Promise<FinalMechanicalCheckV2Report>;

const defaultVerifyFinalProject: VerifyFinalProject = async ({
  rootDir,
  projectId,
}) =>
  FinalMechanicalCheckV2ReportSchema.parse(
    await runProjectCheckCli(["--project", projectId, "--level", "final"], {
      rootDir,
      stdout: () => undefined,
    }),
  );

const generatedPath = (projectId: string, fileName: string) =>
  `src/projects/${projectId}/generated/${fileName}`;

export const loadCurrentDeliveryInputs = async ({
  rootDir,
  projectId,
  verifyFinalProject = defaultVerifyFinalProject,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly verifyFinalProject?: VerifyFinalProject;
}) => {
  const finalReport = FinalMechanicalCheckV2ReportSchema.parse(
    await verifyFinalProject({ rootDir, projectId }),
  );
  if (
    finalReport.storyId !== projectId ||
    finalReport.reportVersion !== "final-mechanical-check-v2" ||
    finalReport.aggregateStatus !== "pass"
  ) {
    throw new Error(
      "Delivery requires a passing current final-mechanical-check-v2.",
    );
  }
  const persistedFinalReport = FinalMechanicalCheckV2ReportSchema.parse(
    await readDeliveryJson({
      rootDir,
      relativePath: generatedPath(
        projectId,
        "final-mechanical-check.generated.json",
      ),
    }),
  );
  if (
    persistedFinalReport.reportFingerprint !== finalReport.reportFingerprint
  ) {
    throw new Error("Delivery final mechanical report is not current.");
  }
  const finalAssembly = FinalAssemblyPlanSchema.parse(
    await readDeliveryJson({
      rootDir,
      relativePath: generatedPath(projectId, "final-assembly.generated.json"),
    }),
  );
  const evidence = FinalPreviewEvidenceSchema.parse(
    await readDeliveryJson({
      rootDir,
      relativePath: generatedPath(
        projectId,
        "final-preview-evidence.generated.json",
      ),
    }),
  );
  const approval = FinalPreviewApprovalSchema.parse(
    await readDeliveryJson({
      rootDir,
      relativePath: generatedPath(
        projectId,
        "final-preview-approval.generated.json",
      ),
    }),
  );
  const authoredSpecification = AuthoredDeliverySpecificationSchema.parse(
    await readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/delivery/delivery-spec.json`,
    }),
  );
  const coverSourceFiles = await Promise.all(
    ["Covers.tsx", "Root.tsx", "index.ts"].map(async (fileName) => {
      const relativePath = `src/projects/${projectId}/delivery/${fileName}`;
      const source = await readDeliveryRegularFile({ rootDir, relativePath });
      return {
        relativePath,
        checksum: checksumDeliveryBytes(source.bytes),
      };
    }),
  );
  const specification = createDeliverySpecification({
    authored: authoredSpecification,
    coverSourceFiles,
  });
  const preview = await readDeliveryRegularFile({
    rootDir,
    relativePath: evidence.media.fullPreview.relativePath,
  });
  const previewChecksum = checksumDeliveryBytes(preview.bytes);
  const sharedIdentity =
    finalAssembly.storyId === projectId &&
    evidence.storyId === projectId &&
    approval.storyId === projectId &&
    specification.storyId === projectId &&
    finalAssembly.compositionId === evidence.compositionId &&
    evidence.compositionId === approval.compositionId &&
    approval.compositionId === specification.compositionId &&
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
      "Delivery approval evidence assembly or media identity is stale.",
    );
  }
  if (
    finalAssembly.fps !== evidence.technical.fpsNumerator ||
    evidence.technical.fpsDenominator !== 1 ||
    finalAssembly.width !== evidence.technical.width ||
    finalAssembly.height !== evidence.technical.height ||
    finalAssembly.durationInFrames !== evidence.technical.frameCount
  ) {
    throw new Error("Delivery approved preview technical identity is stale.");
  }
  return {
    finalReport,
    finalAssembly,
    evidence,
    approval,
    specification,
    preview: {
      relativePath: evidence.media.fullPreview.relativePath,
      absolutePath: preview.absolutePath,
      checksum: previewChecksum,
      sizeBytes: preview.sizeBytes,
    },
  } as const;
};
