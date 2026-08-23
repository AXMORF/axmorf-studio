import { pathToFileURL } from "node:url";

import { computeGenerationInputFingerprint } from "../../src/contracts/generation-input";
import type { NarrationSpec } from "../../src/contracts/narration";
import { Sha256DigestSchema } from "../../src/contracts/primitives";
import {
  loadVerifiedProgress,
  readCandidateBytes,
} from "./adapters/candidate-workspace";
import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../config/producer-config";
import { createChunkAudioGenerator } from "./adapters/provider-dispatcher";
import {
  normalizeProviderAudio,
  runHostProcess,
} from "./adapters/ffmpeg-normalizer";
import { normalizePromptAudio } from "./adapters/prompt-audio-normalizer";
import { resolveProducerNarrationExecution } from "../config/narration-execution";
import { checkM2NarrationArtifacts } from "./check";
import type {
  NarrationGenerationResult,
  PcmNormalizer,
} from "./domain/candidate-progress";
import type { ChunkAudioGenerator } from "./domain/provider-input";
import { runNarrationGeneration } from "./generate-runner";
import { loadNarrationProjectFiles } from "./project-files";
import { runNarrationSeal } from "./seal-runner";
import type { M2NarrationCheckResult } from "./check";
import {
  createRepositoryProductionLocations,
  type ProductionLocations,
} from "../project-production/application/production-locations";

type GenerationDependencies = {
  readonly providerAttemptFingerprint: string;
  readonly executionSnapshot: import("../../src/contracts").NarrationExecutionSnapshot;
  readonly generateChunk: ChunkAudioGenerator;
  readonly normalizePcm: PcmNormalizer;
};

export type NarrationCliContext = {
  readonly locations: ProductionLocations;
  readonly configurationRoot: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly createGenerationDependencies: (input: {
    readonly configurationRoot: string;
    readonly configPath: string;
    readonly temporaryRoot: string;
    readonly narration: NarrationSpec;
  }) => Promise<GenerationDependencies>;
};

export type NarrationCliResult =
  | { readonly command: "generate"; readonly result: NarrationGenerationResult }
  | { readonly command: "seal"; readonly result: M2NarrationCheckResult }
  | { readonly command: "check"; readonly result: M2NarrationCheckResult };

export const createDefaultGenerationDependencies: NarrationCliContext["createGenerationDependencies"] =
  async ({ configurationRoot, configPath, temporaryRoot, narration }) => {
    const resolvedExecution = await resolveProducerNarrationExecution({
      config: await readProducerConfig({ configPath }),
      privateConfigRoot: configurationRoot,
      narration,
      normalizePromptAudio: ({ sourceBytes }) =>
        normalizePromptAudio({
          sourceBytes,
          runProcess: runHostProcess,
          temporaryRoot,
        }),
    });
    const { resolved, snapshot } = resolvedExecution;
    return {
      providerAttemptFingerprint: snapshot.providerAttemptFingerprint,
      executionSnapshot: snapshot,
      generateChunk: createChunkAudioGenerator({ resolved, temporaryRoot }),
      normalizePcm: (sourceBytes) =>
        normalizeProviderAudio({
          sourceBytes,
          speechRate: snapshot.speechRate,
          runProcess: runHostProcess,
          temporaryRoot,
        }),
    };
  };

const createDefaultContext = (): NarrationCliContext => {
  const repositoryRoot = process.cwd();
  return {
    locations: createRepositoryProductionLocations({ repositoryRoot }),
    configurationRoot: repositoryRoot,
    env: process.env,
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    createGenerationDependencies: createDefaultGenerationDependencies,
  };
};

const parseProjectOnly = (args: readonly string[]) => {
  if (args.length !== 3 || args[1] !== "--project") {
    throw new Error("Invalid arguments; expected --project <project slug>.");
  }
  return args[2] ?? "";
};

const parseSealArguments = (args: readonly string[]) => {
  if (
    (args.length !== 5 && args.length !== 7) ||
    args[1] !== "--project" ||
    args[3] !== "--attempt" ||
    (args.length === 7 && args[5] !== "--supersede")
  ) {
    throw new Error(
      "Invalid seal arguments; expected --project <slug> --attempt <sha256> [--supersede <sha256>].",
    );
  }
  return {
    projectId: args[2] ?? "",
    attemptFingerprint: Sha256DigestSchema.parse(args[4]),
    ...(args.length === 7
      ? { supersedeFingerprint: Sha256DigestSchema.parse(args[6]) }
      : {}),
  };
};

const printResult = (
  context: NarrationCliContext,
  result: NarrationCliResult,
) => {
  context.stdout(JSON.stringify(result.result));
  return result;
};

export const runCli = async (
  args: readonly string[],
  context: NarrationCliContext = createDefaultContext(),
): Promise<NarrationCliResult> => {
  const command = args[0];
  if (command !== "generate" && command !== "seal" && command !== "check") {
    throw new Error("Narration command must be one of: generate, seal, check.");
  }

  if (command === "generate") {
    const projectId = parseProjectOnly(args);
    const { projectSource } = await loadNarrationProjectFiles({
      locations: context.locations,
      projectId,
    });
    const configPath = await resolveProducerConfigPathFromEnvironment({
      rootDir: context.configurationRoot,
      env: context.env,
    });
    const dependencies = await context.createGenerationDependencies({
      configurationRoot: context.configurationRoot,
      configPath,
      temporaryRoot: context.locations.disposableBuildRoot,
      narration: projectSource.narration,
    });
    context.stderr(
      `Generating narration candidates for ${projectSource.story.storyId}.`,
    );
    const result = await runNarrationGeneration({
      rootDir: context.locations.taskWorkspaceRoot,
      story: projectSource.story,
      narration: projectSource.narration,
      ...dependencies,
    });
    return printResult(context, { command, result });
  }

  if (command === "seal") {
    const { projectId, attemptFingerprint, supersedeFingerprint } =
      parseSealArguments(args);
    const { projectSource } = await loadNarrationProjectFiles({
      locations: context.locations,
      projectId,
    });
    const generationInputFingerprint = computeGenerationInputFingerprint(
      projectSource.story,
      projectSource.narration,
    );
    const workRoot = context.locations.taskWorkspaceRoot;
    const progress = await loadVerifiedProgress({
      rootDir: workRoot,
      storyId: projectSource.story.storyId,
      generationInputFingerprint,
      providerAttemptFingerprint: attemptFingerprint,
    });
    const normalizedChunks = new Map<string, Buffer>();
    for (const chunk of progress.chunks) {
      if (chunk.stage === "measured") {
        normalizedChunks.set(
          chunk.chunkId,
          await readCandidateBytes({
            rootDir: workRoot,
            progress,
            relativePath: chunk.normalizedRelativePath,
          }),
        );
      }
    }
    context.stderr(`Sealing narration for ${projectSource.story.storyId}.`);
    const result = await runNarrationSeal({
      locations: context.locations,
      projectSource,
      progress,
      normalizedChunks,
      ...(supersedeFingerprint === undefined ? {} : { supersedeFingerprint }),
    });
    return printResult(context, { command, result });
  }

  const projectId = parseProjectOnly(args);
  const { projectSource } = await loadNarrationProjectFiles({
    locations: context.locations,
    projectId,
  });
  context.stderr(
    `Checking sealed narration for ${projectSource.story.storyId}.`,
  );
  const result = await checkM2NarrationArtifacts({
    locations: context.locations,
    projectSource,
  });
  return printResult(context, { command, result });
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
