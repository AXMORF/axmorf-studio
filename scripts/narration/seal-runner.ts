import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { serializeCanonicalJson } from "../../src/contracts/fingerprint";
import { validateNarrativeArtifactBundle } from "../../src/contracts/narrative-artifact-bundle";
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
  createNarrationSealFileOperations,
  removeNarrationSealStaging,
  stageNarrationSealDirectory,
  withProjectSealLock,
  type NarrationSealFileOperations,
} from "./adapters/atomic-files";
import { checkM2NarrationArtifacts } from "./check";
import type { NarrationGenerationProgress } from "./domain/candidate-progress";
import { buildNarrationSeal } from "./domain/seal";
import type { ProductionLocations } from "../project-production/application/production-locations";
import { resolveNarrationProjectRoot } from "./production-paths";

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

export const authorizeNarrationSealPromotion = ({
  existingFingerprint,
  nextFingerprint,
  supersedeFingerprint,
}: {
  readonly existingFingerprint: string | undefined;
  readonly nextFingerprint: string;
  readonly supersedeFingerprint: string | undefined;
}) => {
  const isSameSeal = existingFingerprint === nextFingerprint;
  if (supersedeFingerprint !== undefined) {
    if (existingFingerprint === undefined) {
      throw new Error(
        "Cannot supersede because no active sealed fingerprint exists.",
      );
    }
    if (supersedeFingerprint !== existingFingerprint) {
      throw new Error(
        "The --supersede value does not match the current sealed fingerprint.",
      );
    }
  }
  if (
    existingFingerprint !== undefined &&
    !isSameSeal &&
    supersedeFingerprint === undefined
  ) {
    throw new Error(
      "A different active seal exists; pass --supersede with its current sealed fingerprint.",
    );
  }
  return isSameSeal;
};

export const runNarrationSeal = async ({
  locations,
  projectSource,
  progress,
  normalizedChunks,
  supersedeFingerprint,
  fileOperations = createNarrationSealFileOperations(),
}: {
  readonly locations: ProductionLocations;
  readonly projectSource: NarrativeProjectSource;
  readonly progress: NarrationGenerationProgress;
  readonly normalizedChunks: ReadonlyMap<string, Buffer>;
  readonly supersedeFingerprint?: string;
  readonly fileOperations?: NarrationSealFileOperations;
}) => {
  const storyId = projectSource.story.storyId;
  const generatedDirectory = join(
    resolveNarrationProjectRoot({ locations, storyId }),
    "generated",
  );
  const activeManifestPath = join(
    generatedDirectory,
    "sealed-narration.generated.json",
  );
  const timingPath = join(generatedDirectory, "semantic-timing.generated.json");
  const lockPath = join(generatedDirectory, ".narration-seal.lock");

  return withProjectSealLock(
    { lockPath, operation: "seal-narration" },
    async () => {
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
      validateNarrativeArtifactBundle({
        projectSource,
        sealedNarration: seal.manifest,
        semanticTiming: timing,
      });

      const existingManifest = await readExistingManifest(activeManifestPath);
      const isSameSeal = authorizeNarrationSealPromotion({
        existingFingerprint: existingManifest?.sealedNarrationFingerprint,
        nextFingerprint: seal.manifest.sealedNarrationFingerprint,
        supersedeFingerprint,
      });

      const { stagingDirectory, destinationDir } =
        await stageNarrationSealDirectory({ locations, seal });
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
        locations,
        projectSource,
      });
    },
  );
};
