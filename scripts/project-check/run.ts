import {
  NARRATIVE_AUTO_CHECK_EVIDENCE_IDS,
  NARRATIVE_AUTO_CHECK_IDS,
  NARRATIVE_AUTO_CHECK_VERSION,
  NARRATIVE_CORE_VERSION,
  PROJECT_REGISTRY_GENERATOR_ID,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  createNarrativeAutoCheckEvidenceRefs,
  createNarrativeAutoCheckReport,
  validateNarrativeArtifactBundle,
  type NarrativeAutoCheckEvidenceId,
  type NarrativeAutoCheckId,
  type NarrativeAutoCheckReport,
  type NarrativeAutoCheckReportInput,
  type NarrativeProjectSource,
  type MasteredNarrationManifest,
  type SealedNarrationManifest,
  type SemanticTiming,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import {
  checkNarrativeBaselineEvidence,
  resolveCurrentNarrativeBaselineEntry,
  resolveNarrativeBaselineGeneratedRegistryChecksum,
  type ProcessRunner,
} from "../baseline/evidence";
import { checkM2NarrationArtifacts } from "../narration/check";
import { checkMasteredNarrationArtifacts } from "../narration/mastering";
import { loadNarrationProjectFiles } from "../narration/project-files";
import type { ValidatedProjectRegistrationEntry } from "../registry/domain";
import { createNarrativeCheckItem, orderNarrativeCheckItems } from "./domain";
import {
  checksumFile,
  getProjectCheckPaths,
  loadProjectCheckNarrativeBaselineReceipt,
  loadProjectCheckMasteredNarration,
  loadProjectCheckSealedNarration,
  loadProjectCheckSemanticTiming,
} from "./project-files";

const failDependency = (label: string) =>
  new Error(`${label} identity does not match.`);

export const checkNarrativeSourceHealth = async ({
  rootDir,
  projectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const paths = getProjectCheckPaths({ rootDir, projectId });
  let projectSource: NarrativeProjectSource;
  try {
    const loaded = await loadNarrationProjectFiles({
      rootDir,
      projectId: paths.storyId,
    });
    projectSource = loaded.projectSource;
  } catch (error) {
    throw new Error("Narrative source contracts are invalid.", {
      cause: error,
    });
  }

  const authoredFrames =
    projectSource.story.timingSource === "authored-frames" ||
    projectSource.narration === null;
  let sealedNarration: SealedNarrationManifest | null;
  let masteredNarration: MasteredNarrationManifest | null;
  let semanticTiming: SemanticTiming;
  try {
    sealedNarration =
      projectSource.story.timingSource === "authored-frames"
        ? null
        : await loadProjectCheckSealedNarration(paths.sealedNarration);
    masteredNarration =
      projectSource.story.timingSource === "authored-frames"
        ? null
        : await loadProjectCheckMasteredNarration(paths.masteredNarration);
    semanticTiming = await loadProjectCheckSemanticTiming(paths.semanticTiming);
    validateNarrativeArtifactBundle({
      projectSource,
      sealedNarration,
      semanticTiming,
    });
    if (authoredFrames) {
      if (masteredNarration !== null) {
        throw new Error("Visual project must not retain mastered narration.");
      }
    } else {
      if (sealedNarration === null || masteredNarration === null) {
        throw new Error(
          "Narrated project requires sealed and mastered narration.",
        );
      }
      const physicalCheckProjectSource = {
        ...projectSource,
        render: {
          ...projectSource.render,
          fps: semanticTiming.fps,
          leadInFrames: semanticTiming.leadInFrames,
          tailFrames: semanticTiming.tailFrames,
        },
      };
      const m2 = await checkM2NarrationArtifacts({
        rootDir,
        projectSource: physicalCheckProjectSource,
      });
      if (
        m2.generationInputFingerprint !==
          sealedNarration.generationInputFingerprint ||
        m2.sealedNarrationFingerprint !==
          sealedNarration.sealedNarrationFingerprint ||
        m2.completeAudioChecksum !== sealedNarration.completeAudio.checksum
      ) {
        throw new Error("M2 checker identity does not match sealed narration.");
      }
      const master = await checkMasteredNarrationArtifacts({
        rootDir,
        storyId: paths.storyId,
      });
      if (
        master.sealedNarrationFingerprint !==
          sealedNarration.sealedNarrationFingerprint ||
        master.masteredNarrationFingerprint !==
          masteredNarration.masteredNarrationFingerprint
      ) {
        throw new Error("Mastered narration identity does not match its seal.");
      }
    }
  } catch (error) {
    throw new Error(
      projectSource.story.timingSource === "authored-frames"
        ? "Authored-frame timing source is invalid."
        : "Sealed narration source is invalid.",
      { cause: error },
    );
  }

  try {
    const entry = await resolveCurrentNarrativeBaselineEntry(
      rootDir,
      paths.storyId,
    );
    if (!authoredFrames)
      await resolveNarrativeBaselineGeneratedRegistryChecksum({
        rootDir,
        storyId: paths.storyId,
        entry,
      });
    if (entry.descriptor.storyId !== paths.storyId) {
      throw failDependency("Narrative Baseline");
    }
  } catch (error) {
    throw new Error("Narrative registry source is invalid.", { cause: error });
  }

  return { storyId: paths.storyId, aggregateStatus: "pass" as const };
};

type Mutable<Input> = { -readonly [Key in keyof Input]: Input[Key] };

export const runNarrativeAutoCheck = async ({
  rootDir,
  projectId,
  runNarrativeBaselineEvidenceProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runNarrativeBaselineEvidenceProcess?: ProcessRunner;
}): Promise<NarrativeAutoCheckReport> => {
  const paths = getProjectCheckPaths({ rootDir, projectId });
  const checks = new Map<
    NarrativeAutoCheckId,
    NarrativeAutoCheckReportInput["checks"][number]
  >();
  const evidenceChecksums: Record<
    NarrativeAutoCheckEvidenceId,
    Sha256Digest | null
  > = Object.fromEntries(
    NARRATIVE_AUTO_CHECK_EVIDENCE_IDS.map((evidenceId) => [evidenceId, null]),
  ) as Record<NarrativeAutoCheckEvidenceId, Sha256Digest | null>;
  const identity: Mutable<NarrativeAutoCheckReportInput["inputIdentity"]> = {
    storyFingerprint: null,
    renderSpecFingerprint: null,
    generationInputFingerprint: null,
    sealedNarrationFingerprint: null,
    masteredNarrationFingerprint: null,
    semanticTimingFingerprint: null,
    projectRegistryGeneratorId: PROJECT_REGISTRY_GENERATOR_ID,
    generatedRegistryChecksum: null,
    generatedEntryChecksum: null,
    projectRegistryEntryFingerprint: null,
    narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    narrativeBaselineFingerprint: null,
    baselineEvidenceFingerprint: null,
  };
  let timingAlgorithmId: "authored-frames-v1" | undefined;
  const mark = (
    checkId: NarrativeAutoCheckId,
    status: NarrativeAutoCheckReportInput["checks"][number]["status"],
    error?: unknown,
  ) =>
    checks.set(
      checkId,
      createNarrativeCheckItem({ checkId, status, error, timingAlgorithmId }),
    );

  let projectSource: NarrativeProjectSource | undefined;
  let sealedNarration: SealedNarrationManifest | null | undefined;
  let masteredNarration: MasteredNarrationManifest | null | undefined;
  let semanticTiming: SemanticTiming | undefined;
  let entry: ValidatedProjectRegistrationEntry | undefined;

  try {
    const loaded = await loadNarrationProjectFiles({
      rootDir,
      projectId: paths.storyId,
    });
    projectSource = loaded.projectSource;
    if (projectSource.narration === null) {
      timingAlgorithmId = "authored-frames-v1";
    }
    identity.storyFingerprint = computeStoryFingerprint(projectSource.story);
    identity.renderSpecFingerprint = computeRenderSpecFingerprint(
      projectSource.render,
    );
    mark("source-contracts", "pass");
  } catch (error) {
    mark("source-contracts", "fail", error);
  }

  try {
    if (projectSource === undefined) {
      throw failDependency("Source contracts");
    }
    sealedNarration = await loadProjectCheckSealedNarration(
      paths.sealedNarration,
    );
    masteredNarration = await loadProjectCheckMasteredNarration(
      paths.masteredNarration,
    );
    evidenceChecksums["sealed-manifest"] = await checksumFile(
      paths.sealedNarration,
    );
    if (projectSource.narration === null) {
      if (sealedNarration !== null || masteredNarration !== null) {
        throw new Error(
          "Visual project must not retain sealed or mastered narration.",
        );
      }
    } else {
      if (sealedNarration === null || masteredNarration === null) {
        throw new Error(
          "Narrated project requires sealed and mastered narration.",
        );
      }
      identity.generationInputFingerprint =
        sealedNarration.generationInputFingerprint;
      identity.sealedNarrationFingerprint =
        sealedNarration.sealedNarrationFingerprint;
      identity.masteredNarrationFingerprint =
        masteredNarration.masteredNarrationFingerprint;
      const persistedTimingForPhysicalCheck =
        await loadProjectCheckSemanticTiming(paths.semanticTiming);
      const physicalCheckProjectSource = {
        ...projectSource,
        render: {
          ...projectSource.render,
          fps: persistedTimingForPhysicalCheck.fps,
          leadInFrames: persistedTimingForPhysicalCheck.leadInFrames,
          tailFrames: persistedTimingForPhysicalCheck.tailFrames,
        },
      };
      const m2 = await checkM2NarrationArtifacts({
        rootDir,
        projectSource: physicalCheckProjectSource,
      });
      const master = await checkMasteredNarrationArtifacts({
        rootDir,
        storyId: paths.storyId,
        ...(runNarrativeBaselineEvidenceProcess === undefined
          ? {}
          : {
              runProcess: async (command, args) => {
                const result = await runNarrativeBaselineEvidenceProcess(
                  command,
                  args,
                );
                return {
                  exitCode: result.status,
                  stdout: Buffer.from(result.stdout),
                  stderr: Buffer.from(result.stderr),
                };
              },
            }),
      });
      evidenceChecksums["complete-wav"] = await checksumFile(
        `${rootDir}/${master.outputAudioPath}`,
      );
      if (
        m2.generationInputFingerprint !==
          sealedNarration.generationInputFingerprint ||
        m2.sealedNarrationFingerprint !==
          sealedNarration.sealedNarrationFingerprint ||
        m2.completeAudioChecksum !== sealedNarration.completeAudio.checksum
      ) {
        throw new Error("M2 checker identity does not match sealed narration.");
      }
      if (
        master.sealedNarrationFingerprint !==
          sealedNarration.sealedNarrationFingerprint ||
        master.masteredNarrationFingerprint !==
          masteredNarration.masteredNarrationFingerprint ||
        master.outputAudioChecksum !== masteredNarration.outputAudio.checksum
      ) {
        throw new Error("Mastered narration checker identity does not match.");
      }
    }
    mark("sealed-narration", "pass");
  } catch (error) {
    mark("sealed-narration", "fail", error);
  }

  try {
    if (projectSource === undefined || sealedNarration === undefined) {
      throw failDependency("Sealed narration");
    }
    semanticTiming = await loadProjectCheckSemanticTiming(paths.semanticTiming);
    validateNarrativeArtifactBundle({
      projectSource,
      sealedNarration,
      semanticTiming,
    });
    identity.semanticTimingFingerprint = semanticTiming.fingerprint;
    evidenceChecksums["semantic-timing"] = await checksumFile(
      paths.semanticTiming,
    );
    mark("semantic-timing", "pass");
  } catch (error) {
    mark("semantic-timing", "fail", error);
  }

  try {
    entry = await resolveCurrentNarrativeBaselineEntry(rootDir, paths.storyId);
    identity.generatedRegistryChecksum =
      await resolveNarrativeBaselineGeneratedRegistryChecksum({
        rootDir,
        storyId: paths.storyId,
        entry,
      });
    identity.generatedEntryChecksum = entry.generatedEntryChecksum;
    identity.projectRegistryEntryFingerprint =
      entry.projectRegistryEntryFingerprint;
    identity.narrativeBaselineFingerprint = entry.narrativeBaselineFingerprint;
    evidenceChecksums["project-registry"] = identity.generatedRegistryChecksum;
    mark("project-registry", "pass");
  } catch (error) {
    mark("project-registry", "fail", error);
  }

  try {
    if (
      projectSource === undefined ||
      sealedNarration === undefined ||
      semanticTiming === undefined ||
      entry === undefined
    ) {
      throw failDependency("Narrative Baseline");
    }
    validateNarrativeArtifactBundle({
      projectSource,
      sealedNarration,
      semanticTiming,
    });
    if (entry.descriptor.storyId !== paths.storyId) {
      throw failDependency("Narrative Baseline");
    }
    mark("narrative-baseline", "pass");
  } catch (error) {
    mark("narrative-baseline", "fail", error);
  }

  try {
    if (projectSource === undefined) {
      throw failDependency("Source contracts");
    }
    if (projectSource.narration === null) {
      // This evidence proves narration/caption rendering only. Visual delivery
      // media is verified independently by the same four-file delivery gate.
      mark("baseline-evidence", "not-applicable");
    } else {
      const receipt = await checkNarrativeBaselineEvidence({
        rootDir,
        storyId: paths.storyId,
        runProcess: runNarrativeBaselineEvidenceProcess,
      });
      const persistedReceipt = await loadProjectCheckNarrativeBaselineReceipt(
        paths.narrativeBaselineReceipt,
      );
      if (
        persistedReceipt.evidenceFingerprint !== receipt.evidenceFingerprint
      ) {
        throw failDependency("Narrative baseline evidence");
      }
      identity.baselineEvidenceFingerprint = receipt.evidenceFingerprint;
      evidenceChecksums["baseline-receipt"] = await checksumFile(
        paths.narrativeBaselineReceipt,
      );
      mark("baseline-evidence", "pass");
    }
  } catch (error) {
    mark("baseline-evidence", "fail", error);
  }

  const orderedChecks = orderNarrativeCheckItems(checks);
  const aggregateStatus = orderedChecks.every(
    (check) => check.status !== "fail",
  )
    ? "pass"
    : "fail";
  return createNarrativeAutoCheckReport({
    schemaVersion: 2,
    reportVersion: NARRATIVE_AUTO_CHECK_VERSION,
    storyId: paths.storyId,
    level: "narrative",
    aggregateStatus,
    ...(timingAlgorithmId === undefined ? {} : { timingAlgorithmId }),
    inputIdentity: identity,
    evidenceRefs: createNarrativeAutoCheckEvidenceRefs({
      storyId: paths.storyId,
      sealedNarrationFingerprint: identity.sealedNarrationFingerprint,
      masteredNarrationFingerprint: identity.masteredNarrationFingerprint,
      checksums: evidenceChecksums,
    }),
    checks: NARRATIVE_AUTO_CHECK_IDS.map((checkId) =>
      orderedChecks.find((check) => check.checkId === checkId),
    ),
  });
};
