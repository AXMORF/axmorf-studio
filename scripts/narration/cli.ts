import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { computeGenerationInputFingerprint } from "../../src/contracts/generation-input";
import type { NarrationSpec } from "../../src/contracts/narration";
import { Sha256DigestSchema } from "../../src/contracts/primitives";
import {
  loadVerifiedProgress,
  readCandidateBytes,
} from "./adapters/candidate-workspace";
import { resolveProducerConfigPathFromEnvironment } from "../config/producer-config";
import { createVoxcpmChunkGenerator } from "./adapters/voxcpm-client";
import { normalizeProviderAudio } from "./adapters/ffmpeg-normalizer";
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

type GenerationDependencies = {
  readonly providerAttemptFingerprint: string;
  readonly executionSnapshot: import("../../src/contracts").NarrationExecutionSnapshot;
  readonly generateChunk: ChunkAudioGenerator;
  readonly normalizePcm: PcmNormalizer;
};

export type NarrationCliContext = {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly createGenerationDependencies: (input: {
    readonly rootDir: string;
    readonly configPath: string;
    readonly narration: NarrationSpec;
  }) => Promise<GenerationDependencies>;
};

export type NarrationCliResult =
  | { readonly command: "generate"; readonly result: NarrationGenerationResult }
  | { readonly command: "seal"; readonly result: M2NarrationCheckResult }
  | { readonly command: "check"; readonly result: M2NarrationCheckResult };

export const createDefaultGenerationDependencies: NarrationCliContext["createGenerationDependencies"] =
  async ({ rootDir, configPath, narration }) => {
    const resolvedExecution = await resolveProducerNarrationExecution({
      rootDir,
      env: { RSP_PRODUCER_CONFIG: configPath },
      narration,
    });
    const { resolved, snapshot } = resolvedExecution;
    return {
      providerAttemptFingerprint: snapshot.providerAttemptFingerprint,
      executionSnapshot: snapshot,
      generateChunk: createVoxcpmChunkGenerator({ resolved }),
      normalizePcm: (sourceBytes) =>
        normalizeProviderAudio({
          sourceBytes,
          speechRate: snapshot.speechRate,
        }),
    };
  };

const createDefaultContext = (): NarrationCliContext => ({
  rootDir: process.cwd(),
  env: process.env,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  createGenerationDependencies: createDefaultGenerationDependencies,
});

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
      rootDir: context.rootDir,
      projectId,
    });
    const configPath = await resolveProducerConfigPathFromEnvironment(context);
    const dependencies = await context.createGenerationDependencies({
      rootDir: context.rootDir,
      configPath,
      narration: projectSource.narration,
    });
    context.stderr(
      `Generating narration candidates for ${projectSource.story.storyId}.`,
    );
    const result = await runNarrationGeneration({
      rootDir: join(context.rootDir, ".narration-work"),
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
      rootDir: context.rootDir,
      projectId,
    });
    const generationInputFingerprint = computeGenerationInputFingerprint(
      projectSource.story,
      projectSource.narration,
    );
    const workRoot = join(context.rootDir, ".narration-work");
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
      rootDir: context.rootDir,
      projectSource,
      progress,
      normalizedChunks,
      ...(supersedeFingerprint === undefined ? {} : { supersedeFingerprint }),
    });
    return printResult(context, { command, result });
  }

  const projectId = parseProjectOnly(args);
  const { projectSource } = await loadNarrationProjectFiles({
    rootDir: context.rootDir,
    projectId,
  });
  context.stderr(
    `Checking sealed narration for ${projectSource.story.storyId}.`,
  );
  const result = await checkM2NarrationArtifacts({
    rootDir: context.rootDir,
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
