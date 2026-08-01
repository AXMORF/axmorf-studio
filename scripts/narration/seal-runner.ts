import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { serializeCanonicalJson } from "../../src/contracts/fingerprint";
import { validateM1ArtifactBundle } from "../../src/contracts/m1-validation";
import type { NarrativeProjectSource } from "../../src/contracts/project";
import {
  SealedNarrationManifestSchema,
  type SealedNarrationManifest,
} from "../../src/contracts/sealed-narration";
import {
  generateSemanticTiming,
  SemanticTimingSchema,
} from "../../src/contracts/semantic-timing";
import {
  validateStoryCheckReport,
  type StoryCheckReport,
} from "../../src/contracts/story-check";
import {
  createNarrationSealFileOperations,
  removeNarrationSealStaging,
  stageNarrationSealDirectory,
  withProjectSealLock,
  type NarrationSealFileOperations,
} from "./adapters/atomic-files";
import { checkM2NarrationArtifacts } from "./check";
import type { NarrationGenerationProgress } from "./domain/candidate-progress";
import { buildNarrationSeal } from "./domain/seal";

const readExistingManifest = async (
  path: string,
): Promise<SealedNarrationManifest | undefined> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return SealedNarrationManifestSchema.parse(
      JSON.parse(bytes.toString("utf8")),
    );
  } catch (error) {
    throw new Error("Existing active sealed narration receipt is invalid.", {
      cause: error,
    });
  }
};

const timingIsCurrent = async (
  path: string,
  expected: unknown,
): Promise<boolean> => {
  try {
    const current = SemanticTimingSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
    return serializeCanonicalJson(current) === serializeCanonicalJson(expected);
  } catch {
    return false;
  }
};

export const runNarrationSeal = async ({
  rootDir,
  projectSource,
  storyCheck,
  progress,
  normalizedChunks,
  supersedeFingerprint,
  fileOperations = createNarrationSealFileOperations(),
}: {
  readonly rootDir: string;
  readonly projectSource: NarrativeProjectSource;
  readonly storyCheck: StoryCheckReport;
  readonly progress: NarrationGenerationProgress;
  readonly normalizedChunks: ReadonlyMap<string, Buffer>;
  readonly supersedeFingerprint?: string;
  readonly fileOperations?: NarrationSealFileOperations;
}) => {
  const storyId = projectSource.story.storyId;
  const generatedDirectory = join(
    rootDir,
    "src/projects",
    storyId,
    "generated",
  );
  const activeManifestPath = join(
    generatedDirectory,
    "sealed-narration.generated.json",
  );
  const timingPath = join(
    generatedDirectory,
    "semantic-timing.generated.json",
  );
  const lockPath = join(generatedDirectory, ".narration-seal.lock");

  return withProjectSealLock(
    { lockPath, operation: "seal-narration" },
    async () => {
      const validatedStoryCheck = validateStoryCheckReport({
        story: projectSource.story,
        narration: projectSource.narration,
        report: storyCheck,
      });
      if (validatedStoryCheck.decision !== "proceed") {
        throw new Error("StoryCheck requires revision before narration seal.");
      }
      const seal = buildNarrationSeal({
        story: projectSource.story,
        narration: projectSource.narration,
        progress,
        normalizedChunks,
      });
      const timing = generateSemanticTiming({
        story: projectSource.story,
        narration: projectSource.narration,
        render: projectSource.render,
        sealedNarration: seal.manifest,
      });
      validateM1ArtifactBundle({
        projectSource,
        sealedNarration: seal.manifest,
        semanticTiming: timing,
      });

      const existingManifest = await readExistingManifest(activeManifestPath);
      const isSameSeal =
        existingManifest?.sealedNarrationFingerprint ===
        seal.manifest.sealedNarrationFingerprint;
      if (existingManifest !== undefined && !isSameSeal) {
        if (supersedeFingerprint === undefined) {
          throw new Error(
            "A different active seal exists; pass --supersede with its current sealed fingerprint.",
          );
        }
        if (
          supersedeFingerprint !==
          existingManifest.sealedNarrationFingerprint
        ) {
          throw new Error(
            "The --supersede value does not match the current sealed fingerprint.",
          );
        }
      }

      const { stagingDirectory, destinationDir } =
        await stageNarrationSealDirectory({ rootDir, seal });
      try {
        await fileOperations.commitImmutableDirectory({
          sourceDir: stagingDirectory,
          destinationDir,
        });
        if (!isSameSeal) {
          await fileOperations.writeJsonAtomic({
            destination: activeManifestPath,
            value: seal.manifest,
          });
        }
        if (!(await timingIsCurrent(timingPath, timing))) {
          await fileOperations.writeJsonAtomic({
            destination: timingPath,
            value: timing,
          });
        }
      } finally {
        await removeNarrationSealStaging(stagingDirectory);
      }

      return checkM2NarrationArtifacts({
        rootDir,
        projectSource,
        storyCheck,
      });
    },
  );
};
