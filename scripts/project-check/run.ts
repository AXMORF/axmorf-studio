import {
  NARRATIVE_AUTO_CHECK_EVIDENCE_IDS,
  NARRATIVE_AUTO_CHECK_IDS,
  NARRATIVE_AUTO_CHECK_VERSION,
  NARRATIVE_CORE_VERSION,
  PROJECT_REGISTRY_GENERATOR_ID,
  computeRenderSpecFingerprint,
  computeStoryCheckFingerprint,
  computeStoryFingerprint,
  createNarrativeAutoCheckEvidenceRefs,
  createNarrativeAutoCheckReport,
  validateM1ArtifactBundle,
  validateStoryCheckReport,
  type NarrativeAutoCheckEvidenceId,
  type NarrativeAutoCheckId,
  type NarrativeAutoCheckReport,
  type NarrativeAutoCheckReportInput,
  type NarrativeProjectSource,
  type SealedNarrationManifest,
  type SemanticTiming,
  type Sha256Digest,
  type StoryCheckReport,
} from "../../src/contracts";
import {
  checkM3NarrativeBaselineEvidence,
  resolveCurrentM3Entry,
  resolveM3GeneratedRegistryChecksum,
  type ProcessRunner,
} from "../baseline/evidence";
import { checkM2NarrationArtifacts } from "../narration/check";
import { loadNarrationProjectFiles } from "../narration/project-files";
import type { ValidatedProjectRegistrationEntry } from "../registry/domain";
import { createNarrativeCheckItem, orderNarrativeCheckItems } from "./domain";
import {
  checksumFile,
  getProjectCheckPaths,
  loadProjectCheckM3Receipt,
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
  let storyCheck: StoryCheckReport;
  try {
    const loaded = await loadNarrationProjectFiles({
      rootDir,
      projectId: paths.storyId,
    });
    projectSource = loaded.projectSource;
    storyCheck = loaded.storyCheck;
    const validated = validateStoryCheckReport({
      story: projectSource.story,
      narration: projectSource.narration,
      report: storyCheck,
    });
    if (validated.decision !== "proceed") {
      throw new Error("StoryCheck identity does not match an active project.");
    }
  } catch (error) {
    throw new Error("Narrative source contracts are invalid.", {
      cause: error,
    });
  }

  let sealedNarration: SealedNarrationManifest;
  let semanticTiming: SemanticTiming;
  try {
    sealedNarration = await loadProjectCheckSealedNarration(
      paths.sealedNarration,
    );
    semanticTiming = await loadProjectCheckSemanticTiming(paths.semanticTiming);
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
      storyCheck,
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
    validateM1ArtifactBundle({
      projectSource,
      sealedNarration,
      semanticTiming,
    });
  } catch (error) {
    throw new Error("Sealed narration source is invalid.", { cause: error });
  }

  try {
    const entry = await resolveCurrentM3Entry(rootDir, paths.storyId);
    await resolveM3GeneratedRegistryChecksum({
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
  runM3EvidenceProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runM3EvidenceProcess?: ProcessRunner;
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
    storyCheckFingerprint: null,
    generationInputFingerprint: null,
    sealedNarrationFingerprint: null,
    semanticTimingFingerprint: null,
    projectRegistryGeneratorId: PROJECT_REGISTRY_GENERATOR_ID,
    generatedRegistryChecksum: null,
    generatedEntryChecksum: null,
    projectRegistryEntryFingerprint: null,
    narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    narrativeBaselineFingerprint: null,
    m3EvidenceFingerprint: null,
  };
  const mark = (
    checkId: NarrativeAutoCheckId,
    status: "pass" | "fail",
    error?: unknown,
  ) =>
    checks.set(checkId, createNarrativeCheckItem({ checkId, status, error }));

  let projectSource: NarrativeProjectSource | undefined;
  let storyCheck: StoryCheckReport | undefined;
  let sealedNarration: SealedNarrationManifest | undefined;
  let semanticTiming: SemanticTiming | undefined;
  let entry: ValidatedProjectRegistrationEntry | undefined;

  try {
    const loaded = await loadNarrationProjectFiles({
      rootDir,
      projectId: paths.storyId,
    });
    projectSource = loaded.projectSource;
    storyCheck = loaded.storyCheck;
    identity.storyFingerprint = computeStoryFingerprint(projectSource.story);
    identity.renderSpecFingerprint = computeRenderSpecFingerprint(
      projectSource.render,
    );
    identity.storyCheckFingerprint = computeStoryCheckFingerprint(storyCheck);
    evidenceChecksums["story-check"] = await checksumFile(paths.storyCheck);
    mark("source-contracts", "pass");
  } catch (error) {
    mark("source-contracts", "fail", error);
  }

  try {
    if (projectSource === undefined || storyCheck === undefined) {
      throw failDependency("Source contracts");
    }
    const validated = validateStoryCheckReport({
      story: projectSource.story,
      narration: projectSource.narration,
      report: storyCheck,
    });
    if (validated.decision !== "proceed") {
      throw new Error("StoryCheck identity does not match an active project.");
    }
    mark("story-check", "pass");
  } catch (error) {
    mark("story-check", "fail", error);
  }

  try {
    if (projectSource === undefined || storyCheck === undefined) {
      throw failDependency("StoryCheck");
    }
    sealedNarration = await loadProjectCheckSealedNarration(
      paths.sealedNarration,
    );
    identity.generationInputFingerprint =
      sealedNarration.generationInputFingerprint;
    identity.sealedNarrationFingerprint =
      sealedNarration.sealedNarrationFingerprint;
    evidenceChecksums["sealed-manifest"] = await checksumFile(
      paths.sealedNarration,
    );
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
      storyCheck,
    });
    evidenceChecksums["complete-wav"] = await checksumFile(
      `${rootDir}/${sealedNarration.completeAudio.localPath}`,
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
    mark("sealed-narration", "pass");
  } catch (error) {
    mark("sealed-narration", "fail", error);
  }

  try {
    if (projectSource === undefined || sealedNarration === undefined) {
      throw failDependency("Sealed narration");
    }
    semanticTiming = await loadProjectCheckSemanticTiming(paths.semanticTiming);
    validateM1ArtifactBundle({
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
    entry = await resolveCurrentM3Entry(rootDir, paths.storyId);
    identity.generatedRegistryChecksum =
      await resolveM3GeneratedRegistryChecksum({
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
    validateM1ArtifactBundle({
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
    const receipt = await checkM3NarrativeBaselineEvidence({
      rootDir,
      storyId: paths.storyId,
      runProcess: runM3EvidenceProcess,
    });
    const persistedReceipt = await loadProjectCheckM3Receipt(paths.m3Receipt);
    if (persistedReceipt.evidenceFingerprint !== receipt.evidenceFingerprint) {
      throw failDependency("M3 evidence");
    }
    identity.m3EvidenceFingerprint = receipt.evidenceFingerprint;
    evidenceChecksums["m3-receipt"] = await checksumFile(paths.m3Receipt);
    mark("m3-evidence", "pass");
  } catch (error) {
    mark("m3-evidence", "fail", error);
  }

  const orderedChecks = orderNarrativeCheckItems(checks);
  const aggregateStatus = orderedChecks.every(
    (check) => check.status === "pass",
  )
    ? "pass"
    : "fail";
  return createNarrativeAutoCheckReport({
    schemaVersion: 1,
    reportVersion: NARRATIVE_AUTO_CHECK_VERSION,
    storyId: paths.storyId,
    level: "narrative",
    aggregateStatus,
    inputIdentity: identity,
    evidenceRefs: createNarrativeAutoCheckEvidenceRefs({
      storyId: paths.storyId,
      sealedNarrationFingerprint: identity.sealedNarrationFingerprint,
      checksums: evidenceChecksums,
    }),
    checks: NARRATIVE_AUTO_CHECK_IDS.map((checkId) =>
      orderedChecks.find((check) => check.checkId === checkId),
    ),
  });
};
