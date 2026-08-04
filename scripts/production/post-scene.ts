import {
  ProductionPreviewAssemblySchema,
  ProductionPreviewEvidenceSchema,
  ProductionPreviewMechanicalCheckSchema,
  type ProductionPreviewAssembly,
  type ProductionPreviewEvidence,
  type ProductionPreviewMechanicalCheck,
} from "../../src/contracts";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  readProductionRunStore,
} from "./adapters/run-store";
import { createProductionStageEvent } from "./domain/events";
import { createUnexpectedProductionError } from "./domain/errors";
import { createDefaultPostSceneProductionDependencies } from "./post-scene-default";

type CommonPostSceneRequest = Readonly<{
  rootDir: string;
  runId: string;
  storyId: string;
  requirementsFingerprint: string;
}>;

type PreviewMediaIdentity = Readonly<{
  relativePath: string;
  checksum: string;
}>;

type PreviewReviewMedia = Readonly<{
  representativeStills: readonly Readonly<
    PreviewMediaIdentity & { frame: number }
  >[];
  contactSheet: PreviewMediaIdentity;
}>;

export type PostSceneProductionDependencies = Readonly<{
  assertCurrentFreeze: (request: CommonPostSceneRequest) => Promise<void>;
  preparePreview: (
    request: CommonPostSceneRequest & Readonly<{ mode: "write" | "check" }>,
  ) => Promise<ProductionPreviewAssembly>;
  projectRegistry: (
    request: CommonPostSceneRequest & Readonly<{ mode: "write" | "check" }>,
  ) => Promise<{
    readonly compositionId: string;
    readonly registryChecksum: string;
  }>;
  listCompositions: (
    request: CommonPostSceneRequest & Readonly<{ compositionId: string }>,
  ) => Promise<void>;
  renderPreview: (
    request: CommonPostSceneRequest &
      Readonly<{
        compositionId: string;
        assembly: ProductionPreviewAssembly;
      }>,
  ) => Promise<PreviewMediaIdentity>;
  generateReviewMedia: (
    request: CommonPostSceneRequest &
      Readonly<{
        compositionId: string;
        assembly: ProductionPreviewAssembly;
        fullPreview: PreviewMediaIdentity;
      }>,
  ) => Promise<PreviewReviewMedia>;
  previewEvidence: (
    request: CommonPostSceneRequest &
      Readonly<{
        mode: "write" | "check";
        assembly: ProductionPreviewAssembly;
        fullPreview: PreviewMediaIdentity;
        reviewMedia: PreviewReviewMedia;
      }>,
  ) => Promise<ProductionPreviewEvidence>;
  mechanicalCheck: (
    request: CommonPostSceneRequest &
      Readonly<{
        mode: "write" | "check";
        assembly: ProductionPreviewAssembly;
        evidence: ProductionPreviewEvidence;
      }>,
  ) => Promise<ProductionPreviewMechanicalCheck>;
  checkCurrentPreview: (request: CommonPostSceneRequest) => Promise<{
    readonly assembly: ProductionPreviewAssembly;
    readonly evidence: ProductionPreviewEvidence;
    readonly check: ProductionPreviewMechanicalCheck;
  }>;
}>;

const assertCurrentPreviewBindings = ({
  storyId,
  requirementsFingerprint,
  assembly: rawAssembly,
  evidence: rawEvidence,
  check: rawCheck,
}: {
  readonly storyId: string;
  readonly requirementsFingerprint: string;
  readonly assembly: ProductionPreviewAssembly;
  readonly evidence: ProductionPreviewEvidence;
  readonly check: ProductionPreviewMechanicalCheck;
}) => {
  const assembly = ProductionPreviewAssemblySchema.parse(rawAssembly);
  const evidence = ProductionPreviewEvidenceSchema.parse(rawEvidence);
  const check = ProductionPreviewMechanicalCheckSchema.parse(rawCheck);
  if (
    assembly.storyId !== storyId ||
    evidence.storyId !== storyId ||
    check.storyId !== storyId ||
    assembly.requirementsFingerprint !== requirementsFingerprint ||
    evidence.requirementsFingerprint !== requirementsFingerprint ||
    check.requirementsFingerprint !== requirementsFingerprint ||
    evidence.previewAssemblyFingerprint !== assembly.assemblyFingerprint ||
    check.previewAssemblyFingerprint !== assembly.assemblyFingerprint ||
    check.evidenceFingerprint !== evidence.evidenceFingerprint ||
    evidence.compositionId !== assembly.compositionId
  ) {
    throw new Error("Production preview artifacts are stale or mismatched.");
  }
  return { assembly, evidence, check } as const;
};

const previewResult = ({
  runId,
  artifacts,
  noOp,
}: {
  readonly runId: string;
  readonly artifacts: ReturnType<typeof assertCurrentPreviewBindings>;
  readonly noOp: boolean;
}) => ({
  runId,
  status: "preview-ready" as const,
  noOp,
  preview: artifacts.evidence.media.fullPreview,
  previewEvidenceFingerprint: artifacts.evidence.evidenceFingerprint,
  mechanicalCheckFingerprint: artifacts.check.checkFingerprint,
  statePath: `.producer-runs/${runId}/state.generated.json`,
  handoff: "awaiting explicit user preview decision" as const,
});

export const runProductionPostScene = async ({
  rootDir,
  runId,
  clock = () => new Date(),
  dependencies = createDefaultPostSceneProductionDependencies(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly clock?: () => Date;
  readonly dependencies?: PostSceneProductionDependencies;
}) => {
  const now = clock();
  if (Number.isNaN(now.getTime())) {
    throw new Error("Post-scene production clock is invalid.");
  }
  const lock = await acquireProductionRunLock({
    rootDir,
    runId,
    ownerId: "production-post-scene",
    acquiredAt: now.toISOString(),
  });
  let stageId: "post-scene" | "preview" = "post-scene";
  try {
    let loaded = await readProductionRunStore({ rootDir, runId });
    const common = {
      rootDir,
      runId,
      storyId: loaded.run.storyId,
      requirementsFingerprint: loaded.run.requirementsFingerprint,
    } as const;
    if (loaded.state.state === "preview-ready") {
      const current = assertCurrentPreviewBindings({
        ...common,
        ...(await dependencies.checkCurrentPreview(common)),
      });
      return previewResult({
        runId,
        artifacts: current,
        noOp: true,
      });
    }
    if (loaded.state.state !== "post-scene-running") {
      throw new Error("Post-scene production requires all Scene results.");
    }

    loaded = {
      ...loaded,
      state: (
        await appendProductionRunEvent({
          rootDir,
          runId,
          lock,
          event: createProductionStageEvent({
            type: "stage-started",
            runId: loaded.run.runId,
            storyId: loaded.run.storyId,
            sequence: loaded.state.lastSequence + 1,
            eventId: `post-scene-started-${loaded.state.lastSequence + 1}`,
            stageId: "post-scene",
            attempt: 1,
            occurredAt: now.toISOString(),
            commandId: "production-post-scene",
            previousStateFingerprint: loaded.state.stateFingerprint,
            inputFingerprints: [
              {
                artifactId: "requirements",
                fingerprint: loaded.run.requirementsFingerprint,
              },
            ],
          }),
        })
      ).state,
    };

    await dependencies.assertCurrentFreeze(common);
    const writtenAssembly = ProductionPreviewAssemblySchema.parse(
      await dependencies.preparePreview({ ...common, mode: "write" }),
    );
    const assembly = ProductionPreviewAssemblySchema.parse(
      await dependencies.preparePreview({ ...common, mode: "check" }),
    );
    if (writtenAssembly.assemblyFingerprint !== assembly.assemblyFingerprint) {
      throw new Error("Production PreviewAssembly write/check drifted.");
    }
    const writtenRegistry = await dependencies.projectRegistry({
      ...common,
      mode: "write",
    });
    const registry = await dependencies.projectRegistry({
      ...common,
      mode: "check",
    });
    if (
      writtenRegistry.compositionId !== registry.compositionId ||
      writtenRegistry.registryChecksum !== registry.registryChecksum ||
      registry.compositionId !== assembly.compositionId
    ) {
      throw new Error("ProjectRegistry identity drifted during post-scene.");
    }
    await dependencies.listCompositions({
      ...common,
      compositionId: registry.compositionId,
    });
    const fullPreview = await dependencies.renderPreview({
      ...common,
      compositionId: registry.compositionId,
      assembly,
    });
    const reviewMedia = await dependencies.generateReviewMedia({
      ...common,
      compositionId: registry.compositionId,
      assembly,
      fullPreview,
    });
    const writtenEvidence = ProductionPreviewEvidenceSchema.parse(
      await dependencies.previewEvidence({
        ...common,
        mode: "write",
        assembly,
        fullPreview,
        reviewMedia,
      }),
    );
    const evidence = ProductionPreviewEvidenceSchema.parse(
      await dependencies.previewEvidence({
        ...common,
        mode: "check",
        assembly,
        fullPreview,
        reviewMedia,
      }),
    );
    if (writtenEvidence.evidenceFingerprint !== evidence.evidenceFingerprint) {
      throw new Error("Production preview evidence write/check drifted.");
    }
    const writtenCheck = ProductionPreviewMechanicalCheckSchema.parse(
      await dependencies.mechanicalCheck({
        ...common,
        mode: "write",
        assembly,
        evidence,
      }),
    );
    const check = ProductionPreviewMechanicalCheckSchema.parse(
      await dependencies.mechanicalCheck({
        ...common,
        mode: "check",
        assembly,
        evidence,
      }),
    );
    if (writtenCheck.checkFingerprint !== check.checkFingerprint) {
      throw new Error(
        "Production preview mechanical check write/check drifted.",
      );
    }
    const artifacts = assertCurrentPreviewBindings({
      ...common,
      assembly,
      evidence,
      check,
    });

    loaded = {
      ...loaded,
      state: (
        await appendProductionRunEvent({
          rootDir,
          runId,
          lock,
          event: createProductionStageEvent({
            type: "stage-succeeded",
            runId: loaded.run.runId,
            storyId: loaded.run.storyId,
            sequence: loaded.state.lastSequence + 1,
            eventId: `post-scene-succeeded-${loaded.state.lastSequence + 1}`,
            stageId: "post-scene",
            attempt: 1,
            occurredAt: clock().toISOString(),
            commandId: "production-post-scene",
            previousStateFingerprint: loaded.state.stateFingerprint,
            inputFingerprints: [
              {
                artifactId: "requirements",
                fingerprint: loaded.run.requirementsFingerprint,
              },
            ],
            outputArtifacts: [
              {
                artifactId: "production-preview-assembly",
                repositoryPath: `src/projects/${loaded.run.storyId}/generated/production-preview-assembly.generated.json`,
                fingerprint: assembly.assemblyFingerprint,
              },
              {
                artifactId: "project-registry",
                repositoryPath: "src/projects/project-registry.generated.ts",
                fingerprint: registry.registryChecksum,
              },
            ],
          }),
        })
      ).state,
    };
    stageId = "preview";
    loaded = {
      ...loaded,
      state: (
        await appendProductionRunEvent({
          rootDir,
          runId,
          lock,
          event: createProductionStageEvent({
            type: "stage-started",
            runId: loaded.run.runId,
            storyId: loaded.run.storyId,
            sequence: loaded.state.lastSequence + 1,
            eventId: `preview-started-${loaded.state.lastSequence + 1}`,
            stageId: "preview",
            attempt: 1,
            occurredAt: clock().toISOString(),
            commandId: "production-post-scene",
            previousStateFingerprint: loaded.state.stateFingerprint,
            inputFingerprints: [
              {
                artifactId: "production-preview-assembly",
                fingerprint: assembly.assemblyFingerprint,
              },
            ],
          }),
        })
      ).state,
    };
    await appendProductionRunEvent({
      rootDir,
      runId,
      lock,
      event: createProductionStageEvent({
        type: "preview-ready",
        runId: loaded.run.runId,
        storyId: loaded.run.storyId,
        sequence: loaded.state.lastSequence + 1,
        eventId: `preview-ready-${loaded.state.lastSequence + 1}`,
        stageId: "preview",
        attempt: 1,
        occurredAt: clock().toISOString(),
        commandId: "production-post-scene",
        previousStateFingerprint: loaded.state.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "production-preview-assembly",
            fingerprint: assembly.assemblyFingerprint,
          },
          {
            artifactId: "production-preview-evidence",
            fingerprint: evidence.evidenceFingerprint,
          },
        ],
        outputArtifacts: [
          {
            artifactId: "production-preview-media",
            repositoryPath: evidence.media.fullPreview.relativePath,
            fingerprint: evidence.media.fullPreview.checksum,
          },
          {
            artifactId: "production-preview-contact-sheet",
            repositoryPath: evidence.media.contactSheet.relativePath,
            fingerprint: evidence.media.contactSheet.checksum,
          },
          {
            artifactId: "production-preview-evidence",
            repositoryPath: `src/projects/${loaded.run.storyId}/generated/production-preview-evidence.generated.json`,
            fingerprint: evidence.evidenceFingerprint,
          },
          {
            artifactId: "production-preview-mechanical-check",
            repositoryPath: `src/projects/${loaded.run.storyId}/generated/production-preview-mechanical-check.generated.json`,
            fingerprint: check.checkFingerprint,
          },
        ],
        status: "preview-ready",
        handoff: "awaiting explicit user preview decision",
      }),
    });
    return previewResult({
      runId,
      artifacts,
      noOp: false,
    });
  } catch (error) {
    const loaded = await readProductionRunStore({ rootDir, runId });
    if (loaded.state.state !== "failed") {
      const failure = createUnexpectedProductionError({
        error,
        summary:
          stageId === "post-scene"
            ? "Post-scene production failed."
            : "Production preview validation failed.",
        stageId,
        scope: stageId,
        meaningId: null,
        commandId: "production-post-scene",
        inputFingerprint: loaded.run.requirementsFingerprint,
      });
      await appendProductionRunEvent({
        rootDir,
        runId,
        lock,
        event: createProductionStageEvent({
          type: "stage-failed",
          runId: loaded.run.runId,
          storyId: loaded.run.storyId,
          sequence: loaded.state.lastSequence + 1,
          eventId: `${stageId}-failed-${loaded.state.lastSequence + 1}`,
          stageId,
          attempt: 1,
          occurredAt: clock().toISOString(),
          commandId: "production-post-scene",
          previousStateFingerprint: loaded.state.stateFingerprint,
          inputFingerprints: [
            {
              artifactId: "requirements",
              fingerprint: loaded.run.requirementsFingerprint,
            },
          ],
          error: failure,
        }),
      });
    }
    throw error;
  } finally {
    await lock.release();
  }
};
