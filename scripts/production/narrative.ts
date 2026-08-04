import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  M3NarrativeBaselineEvidenceReceiptSchema,
  NarrativeAutoCheckReportSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  type ProductionRequirementsFreeze,
} from "../../src/contracts";
import {
  checkM3NarrativeBaselineEvidence,
  resolveCurrentM3Entry,
  resolveM3GeneratedRegistryChecksum,
  writeM3NarrativeBaselineEvidence,
  type ProcessRunner,
} from "../baseline/evidence";
import { runCli as runNarrationCli } from "../narration/cli";
import { runProjectCheckCli } from "../project-check/cli";
import { generateProjectRegistry } from "../registry/generate";
import { runProductionMediaProcess } from "./adapters/process-runner";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  readProductionRunStore,
} from "./adapters/run-store";
import { createProductionStageEvent } from "./domain/events";
import { createUnexpectedProductionError } from "./domain/errors";
import { loadCurrentProductionInputs } from "./start";

type GenerationResult = Readonly<{
  providerAttemptFingerprint: string;
  generationInputFingerprint: string;
}>;

type NarrationResult = Readonly<{
  generationInputFingerprint: string;
  sealedNarrationFingerprint: string;
  semanticTimingFingerprint: string;
  completeAudioChecksum: string;
}>;

type RegistryResult = Readonly<{
  compositionId: string;
  generatedRegistryChecksum: string;
  projectRegistryEntryFingerprint: string;
  narrativeBaselineFingerprint: string;
}>;

type BaselineMediaResult = Readonly<{
  transparentStillPath: string;
  transparentStillChecksum: string;
  captionStillPath: string;
  captionStillChecksum: string;
  renderPath: string;
  renderChecksum: string;
}>;

type EvidenceResult = Readonly<{ evidenceFingerprint: string }>;
type AutoCheckResult = Readonly<{ reportFingerprint: string }>;

type CommonStepRequest = Readonly<{
  rootDir: string;
  runId: string;
  storyId: string;
  requirements: ProductionRequirementsFreeze;
}>;

export type NarrativeProductionDependencies = Readonly<{
  generateNarration: (
    request: CommonStepRequest & Readonly<{ resume: true }>,
  ) => Promise<GenerationResult>;
  sealNarration: (
    request: CommonStepRequest &
      Readonly<{
        providerAttemptFingerprint: string;
        supersedeFingerprint?: string;
      }>,
  ) => Promise<NarrationResult>;
  checkNarration: (request: CommonStepRequest) => Promise<NarrationResult>;
  generateRegistry: (request: CommonStepRequest) => Promise<void>;
  checkRegistry: (request: CommonStepRequest) => Promise<RegistryResult>;
  listCompositions: (
    request: CommonStepRequest & Readonly<{ compositionId: string }>,
  ) => Promise<void>;
  renderBaseline: (
    request: CommonStepRequest & Readonly<{ compositionId: string }>,
  ) => Promise<BaselineMediaResult>;
  writeEvidence: (request: CommonStepRequest) => Promise<EvidenceResult>;
  checkEvidence: (request: CommonStepRequest) => Promise<EvidenceResult>;
  writeAutoCheck: (request: CommonStepRequest) => Promise<AutoCheckResult>;
  checkAutoCheck: (request: CommonStepRequest) => Promise<AutoCheckResult>;
}>;

const checksumFile = async (path: string) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(Uint8Array.from(await readFile(path)))
      .digest("hex")}`,
  );

const assertProcessSucceeded = (
  result: Awaited<ReturnType<ProcessRunner>>,
  label: string,
) => {
  if (result.status !== 0) {
    throw new Error(`${label} failed with a non-zero status.`);
  }
};

export const createDefaultNarrativeProductionDependencies = ({
  runProcess = runProductionMediaProcess,
}: {
  readonly runProcess?: ProcessRunner;
} = {}): NarrativeProductionDependencies => ({
  generateNarration: async ({ rootDir, storyId }) => {
    const result = await runNarrationCli(["generate", "--project", storyId], {
      rootDir,
      env: process.env,
      stdout: () => undefined,
      stderr: () => undefined,
      createGenerationDependencies: async ({ configPath, narration }) => {
        const { readVoxcpmPrivateConfig, resolveVoxcpmProfile } = await import(
          "../narration/adapters/private-config"
        );
        const { createVoxcpmChunkGenerator } = await import(
          "../narration/adapters/voxcpm-client"
        );
        const { normalizeProviderAudio } = await import(
          "../narration/adapters/ffmpeg-normalizer"
        );
        const { computeProviderAttemptFingerprint } = await import(
          "../narration/domain/provider-input"
        );
        const config = await readVoxcpmPrivateConfig({ configPath });
        const resolved = await resolveVoxcpmProfile({ config, narration });
        return {
          providerAttemptFingerprint: computeProviderAttemptFingerprint(
            resolved.safeDescriptor,
          ),
          generateChunk: createVoxcpmChunkGenerator({ resolved }),
          normalizePcm: (sourceBytes) =>
            normalizeProviderAudio({ sourceBytes }),
        };
      },
    });
    if (result.command !== "generate") {
      throw new Error("Narration generate returned the wrong command result.");
    }
    return {
      providerAttemptFingerprint: Sha256DigestSchema.parse(
        result.result.providerAttemptFingerprint,
      ),
      generationInputFingerprint: Sha256DigestSchema.parse(
        result.result.generationInputFingerprint,
      ),
    };
  },
  sealNarration: async ({
    rootDir,
    storyId,
    providerAttemptFingerprint,
  }) => {
    const result = await runNarrationCli(
      [
        "seal",
        "--project",
        storyId,
        "--attempt",
        providerAttemptFingerprint,
      ],
      {
        rootDir,
        env: process.env,
        stdout: () => undefined,
        stderr: () => undefined,
        createGenerationDependencies: async () => {
          throw new Error("Seal must not create narration provider dependencies.");
        },
      },
    );
    if (result.command !== "seal") {
      throw new Error("Narration seal returned the wrong command result.");
    }
    return result.result;
  },
  checkNarration: async ({ rootDir, storyId }) => {
    const result = await runNarrationCli(["check", "--project", storyId], {
      rootDir,
      env: process.env,
      stdout: () => undefined,
      stderr: () => undefined,
      createGenerationDependencies: async () => {
        throw new Error("Check must not create narration provider dependencies.");
      },
    });
    if (result.command !== "check") {
      throw new Error("Narration check returned the wrong command result.");
    }
    return result.result;
  },
  generateRegistry: async ({ rootDir }) => {
    await generateProjectRegistry({ rootDir, mode: "write" });
  },
  checkRegistry: async ({ rootDir, storyId }) => {
    await generateProjectRegistry({ rootDir, mode: "check" });
    const entry = await resolveCurrentM3Entry(rootDir, storyId);
    return {
      compositionId: entry.descriptor.id,
      generatedRegistryChecksum: await resolveM3GeneratedRegistryChecksum({
        rootDir,
        storyId,
        entry,
      }),
      projectRegistryEntryFingerprint: Sha256DigestSchema.parse(
        entry.projectRegistryEntryFingerprint,
      ),
      narrativeBaselineFingerprint: Sha256DigestSchema.parse(
        entry.narrativeBaselineFingerprint,
      ),
    };
  },
  listCompositions: async ({ rootDir }) => {
    const result = await runProcess(join(rootDir, "node_modules/.bin/remotion"), [
      "compositions",
      "src/index.ts",
      "--log=error",
    ]);
    assertProcessSucceeded(result, "Remotion compositions");
  },
  renderBaseline: async ({ rootDir, storyId, compositionId }) => {
    const timing = SemanticTimingSchema.parse(
      JSON.parse(
        await readFile(
          join(
            rootDir,
            "src/projects",
            storyId,
            "generated/semantic-timing.generated.json",
          ),
          "utf8",
        ),
      ),
    );
    const captionFrame = timing.captionCues.find(
      ({ text, startFrame, endFrame }) =>
        text.trim().length > 0 && endFrame > startFrame,
    )?.startFrame;
    if (captionFrame === undefined) {
      throw new Error("Narrative Baseline requires one visible CaptionCue.");
    }
    const outputDirectory = join(rootDir, "out", storyId);
    await mkdir(outputDirectory, { recursive: true });
    const transparentStillPath = `out/${storyId}/m3-transparent-frame-0.png`;
    const captionStillPath = `out/${storyId}/m3-caption-frame-${captionFrame}.png`;
    const renderPath = `out/${storyId}/m3-narrative-baseline.mp4`;
    const remotion = join(rootDir, "node_modules/.bin/remotion");
    for (const [label, args] of [
      [
        "transparent still",
        [
          "still",
          "src/index.ts",
          compositionId,
          transparentStillPath,
          "--frame=0",
          "--image-format=png",
          "--overwrite",
          "--log=error",
        ],
      ],
      [
        "caption still",
        [
          "still",
          "src/index.ts",
          compositionId,
          captionStillPath,
          `--frame=${captionFrame}`,
          "--image-format=png",
          "--overwrite",
          "--log=error",
        ],
      ],
      [
        "Narrative Baseline render",
        [
          "render",
          "src/index.ts",
          compositionId,
          renderPath,
          "--codec=h264",
          "--audio-codec=aac",
          "--overwrite",
          "--log=error",
        ],
      ],
    ] as const) {
      assertProcessSucceeded(await runProcess(remotion, args), label);
    }
    return {
      transparentStillPath,
      transparentStillChecksum: await checksumFile(
        join(rootDir, transparentStillPath),
      ),
      captionStillPath,
      captionStillChecksum: await checksumFile(join(rootDir, captionStillPath)),
      renderPath,
      renderChecksum: await checksumFile(join(rootDir, renderPath)),
    };
  },
  writeEvidence: async ({ rootDir, storyId }) => {
    const receipt = await writeM3NarrativeBaselineEvidence({
      rootDir,
      storyId,
      runProcess,
    });
    return { evidenceFingerprint: receipt.evidenceFingerprint };
  },
  checkEvidence: async ({ rootDir, storyId }) => {
    const receipt = M3NarrativeBaselineEvidenceReceiptSchema.parse(
      await checkM3NarrativeBaselineEvidence({ rootDir, storyId, runProcess }),
    );
    return { evidenceFingerprint: receipt.evidenceFingerprint };
  },
  writeAutoCheck: async ({ rootDir, storyId }) => {
    const report = NarrativeAutoCheckReportSchema.parse(
      await runProjectCheckCli(
        ["--project", storyId, "--level", "narrative", "--write-auto-check"],
        { rootDir, runM3EvidenceProcess: runProcess, stdout: () => undefined },
      ),
    );
    return { reportFingerprint: report.reportFingerprint };
  },
  checkAutoCheck: async ({ rootDir, storyId }) => {
    const report = NarrativeAutoCheckReportSchema.parse(
      await runProjectCheckCli(
        ["--project", storyId, "--level", "narrative"],
        { rootDir, runM3EvidenceProcess: runProcess, stdout: () => undefined },
      ),
    );
    return { reportFingerprint: report.reportFingerprint };
  },
});

const assertSameNarrationIdentity = (
  expected: NarrationResult,
  actual: NarrationResult,
) => {
  if (
    expected.generationInputFingerprint !== actual.generationInputFingerprint ||
    expected.sealedNarrationFingerprint !== actual.sealedNarrationFingerprint ||
    expected.semanticTimingFingerprint !== actual.semanticTimingFingerprint ||
    expected.completeAudioChecksum !== actual.completeAudioChecksum
  ) {
    throw new Error("Narration seal and checker identities do not match.");
  }
};

const assertSameFingerprint = (
  label: string,
  expected: string,
  actual: string,
) => {
  if (expected !== actual) throw new Error(`${label} identity is stale.`);
};

const verifyCurrentNarrative = async ({
  common,
  dependencies,
}: {
  readonly common: CommonStepRequest;
  readonly dependencies: NarrativeProductionDependencies;
}) => {
  await dependencies.checkNarration(common);
  const registry = await dependencies.checkRegistry(common);
  await dependencies.listCompositions({
    ...common,
    compositionId: registry.compositionId,
  });
  await dependencies.checkEvidence(common);
  await dependencies.checkAutoCheck(common);
};

export const runProductionNarrative = async ({
  rootDir,
  runId,
  clock = () => new Date(),
  dependencies = createDefaultNarrativeProductionDependencies(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly clock?: () => Date;
  readonly dependencies?: NarrativeProductionDependencies;
}) => {
  const initial = await readProductionRunStore({ rootDir, runId });
  if (initial.state.state === "baseline-ready") {
    const current = await loadCurrentProductionInputs({
      rootDir,
      projectId: initial.run.storyId,
    });
    if (
      current.requirements.requirementsFingerprint !==
      initial.run.requirementsFingerprint
    ) {
      throw new Error("Production run requirements are stale.");
    }
    const common = {
      rootDir,
      runId,
      storyId: initial.run.storyId,
      requirements: current.requirements,
    } as const;
    await verifyCurrentNarrative({ common, dependencies });
    return { runId, status: "baseline-ready", noOp: true } as const;
  }
  if (initial.state.state !== "initialized") {
    throw new Error("Production narrative can only start from initialized state.");
  }
  const now = clock();
  if (Number.isNaN(now.getTime())) throw new Error("Production clock is invalid.");
  const lock = await acquireProductionRunLock({
    rootDir,
    runId,
    ownerId: "production-narrative",
    acquiredAt: now.toISOString(),
  });
  let currentState = initial.state;
  try {
    const started = createProductionStageEvent({
      type: "stage-started",
      runId: initial.run.runId,
      storyId: initial.run.storyId,
      sequence: currentState.lastSequence + 1,
      eventId: `narrative-started-${currentState.lastSequence + 1}`,
      stageId: "narrative",
      attempt: 1,
      occurredAt: now.toISOString(),
      commandId: "production-narrative",
      previousStateFingerprint: currentState.stateFingerprint,
      inputFingerprints: [
        {
          artifactId: "requirements",
          fingerprint: initial.run.requirementsFingerprint,
        },
      ],
    });
    currentState = (
      await appendProductionRunEvent({
        rootDir,
        runId,
        event: started,
        lock,
      })
    ).state;
    try {
      const current = await loadCurrentProductionInputs({
        rootDir,
        projectId: initial.run.storyId,
      });
      if (
        current.requirements.requirementsFingerprint !==
        initial.run.requirementsFingerprint
      ) {
        throw new Error("Production run requirements are stale.");
      }
      const common = {
        rootDir,
        runId,
        storyId: initial.run.storyId,
        requirements: current.requirements,
      } as const;
      const generation = await dependencies.generateNarration({
        ...common,
        resume: true,
      });
      const sealed = await dependencies.sealNarration({
        ...common,
        providerAttemptFingerprint: generation.providerAttemptFingerprint,
      });
      assertSameFingerprint(
        "Generation input",
        generation.generationInputFingerprint,
        sealed.generationInputFingerprint,
      );
      const checked = await dependencies.checkNarration(common);
      assertSameNarrationIdentity(sealed, checked);
      await dependencies.generateRegistry(common);
      const registry = await dependencies.checkRegistry(common);
      await dependencies.listCompositions({
        ...common,
        compositionId: registry.compositionId,
      });
      const media = await dependencies.renderBaseline({
        ...common,
        compositionId: registry.compositionId,
      });
      const writtenEvidence = await dependencies.writeEvidence(common);
      const checkedEvidence = await dependencies.checkEvidence(common);
      assertSameFingerprint(
        "Narrative Baseline evidence",
        writtenEvidence.evidenceFingerprint,
        checkedEvidence.evidenceFingerprint,
      );
      const writtenAutoCheck = await dependencies.writeAutoCheck(common);
      const checkedAutoCheck = await dependencies.checkAutoCheck(common);
      assertSameFingerprint(
        "Narrative AutoCheck",
        writtenAutoCheck.reportFingerprint,
        checkedAutoCheck.reportFingerprint,
      );
      const succeeded = createProductionStageEvent({
        type: "stage-succeeded",
        runId: initial.run.runId,
        storyId: initial.run.storyId,
        sequence: currentState.lastSequence + 1,
        eventId: `narrative-succeeded-${currentState.lastSequence + 1}`,
        stageId: "narrative",
        attempt: 1,
        occurredAt: now.toISOString(),
        commandId: "production-narrative",
        previousStateFingerprint: currentState.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "requirements",
            fingerprint: current.requirements.requirementsFingerprint,
          },
          {
            artifactId: "generation-input",
            fingerprint: sealed.generationInputFingerprint,
          },
        ],
        outputArtifacts: [
          {
            artifactId: "sealed-narration",
            repositoryPath: `src/projects/${initial.run.storyId}/generated/sealed-narration.generated.json`,
            fingerprint: sealed.sealedNarrationFingerprint,
          },
          {
            artifactId: "semantic-timing",
            repositoryPath: `src/projects/${initial.run.storyId}/generated/semantic-timing.generated.json`,
            fingerprint: sealed.semanticTimingFingerprint,
          },
          {
            artifactId: "complete-narration-audio",
            repositoryPath: `public/projects/${initial.run.storyId}/narration/complete.wav`,
            fingerprint: sealed.completeAudioChecksum,
          },
          {
            artifactId: "project-registry",
            repositoryPath: "src/projects/project-registry.generated.ts",
            fingerprint: registry.generatedRegistryChecksum,
          },
          {
            artifactId: "narrative-transparent-still",
            repositoryPath: media.transparentStillPath,
            fingerprint: media.transparentStillChecksum,
          },
          {
            artifactId: "narrative-caption-still",
            repositoryPath: media.captionStillPath,
            fingerprint: media.captionStillChecksum,
          },
          {
            artifactId: "narrative-baseline-render",
            repositoryPath: media.renderPath,
            fingerprint: media.renderChecksum,
          },
          {
            artifactId: "narrative-baseline-evidence",
            repositoryPath: `src/projects/${initial.run.storyId}/generated/narrative-baseline-evidence.generated.json`,
            fingerprint: writtenEvidence.evidenceFingerprint,
          },
          {
            artifactId: "narrative-auto-check",
            repositoryPath: `src/projects/${initial.run.storyId}/generated/narrative-auto-check.generated.json`,
            fingerprint: writtenAutoCheck.reportFingerprint,
          },
        ],
      });
      const appended = await appendProductionRunEvent({
        rootDir,
        runId,
        event: succeeded,
        lock,
      });
      return { runId, status: appended.state.state, noOp: false } as const;
    } catch (error) {
      const failure = createUnexpectedProductionError({
        error,
        summary: "Narrative production failed.",
        stageId: "narrative",
        scope: "narrative",
        meaningId: null,
        commandId: "production-narrative",
        inputFingerprint: initial.run.requirementsFingerprint,
      });
      const failed = createProductionStageEvent({
        type: "stage-failed",
        runId: initial.run.runId,
        storyId: initial.run.storyId,
        sequence: currentState.lastSequence + 1,
        eventId: `narrative-failed-${currentState.lastSequence + 1}`,
        stageId: "narrative",
        attempt: 1,
        occurredAt: now.toISOString(),
        commandId: "production-narrative",
        previousStateFingerprint: currentState.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "requirements",
            fingerprint: initial.run.requirementsFingerprint,
          },
        ],
        error: failure,
      });
      await appendProductionRunEvent({
        rootDir,
        runId,
        event: failed,
        lock,
      });
      throw error;
    }
  } finally {
    await lock.release();
  }
};
