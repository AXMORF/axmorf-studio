import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import {
  DependencyClosureManifestSchema,
  ExternalReferenceSnapshotSchema,
  LocalizationManifestSchema,
  StoryIdSchema,
  computeLocalizationFingerprint,
  serializeCanonicalJson,
  type LocalizationManifest,
} from "../../src/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "./project-files";

const listFiles = async (
  rootDir: string,
  directory = rootDir,
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(rootDir, path)));
    else if (entry.isFile()) files.push(relative(rootDir, path));
    else
      throw new Error(
        "Localization directories may contain regular files only.",
      );
  }
  return files;
};

const assertDirectoriesEqual = async (
  left: string,
  right: string,
): Promise<void> => {
  const [leftFiles, rightFiles] = await Promise.all([
    listFiles(left),
    listFiles(right),
  ]);
  if (JSON.stringify(leftFiles) !== JSON.stringify(rightFiles)) {
    throw new Error("Existing localization has a different file set.");
  }
  for (const file of leftFiles) {
    const [leftBytes, rightBytes] = await Promise.all([
      readFile(join(left, file)),
      readFile(join(right, file)),
    ]);
    if (
      checksumExternalBytes(leftBytes) !== checksumExternalBytes(rightBytes)
    ) {
      throw new Error(`Existing localized bytes differ: ${file}.`);
    }
  }
};

export const localizeShotRecipeClosure = async ({
  repositoryRoot,
  snapshotRoot,
  snapshot: rawSnapshot,
  closure: rawClosure,
  projectId: rawProjectId,
  meaningId: rawMeaningId,
  cardId: rawCardId,
}: {
  readonly repositoryRoot: string;
  readonly snapshotRoot: string;
  readonly snapshot: unknown;
  readonly closure: unknown;
  readonly projectId: unknown;
  readonly meaningId: unknown;
  readonly cardId: unknown;
}): Promise<LocalizationManifest> => {
  const snapshot = ExternalReferenceSnapshotSchema.parse(rawSnapshot);
  const closure = DependencyClosureManifestSchema.parse(rawClosure);
  const projectId = StoryIdSchema.parse(rawProjectId);
  const meaningId = StoryIdSchema.parse(rawMeaningId);
  const card = snapshot.index.cards.find((entry) => entry.cardId === rawCardId);
  if (!card || card.demoSourcePath !== closure.entryPath) {
    throw new Error(
      "Localization closure does not match the selected exact demo.",
    );
  }
  if (
    snapshot.sourceLicense.verificationStatus !== "verified" ||
    snapshot.sourceLicense.attributionText === null
  ) {
    throw new Error("Localization requires verified source authorization.");
  }
  const targetRoot = `src/projects/${projectId}/scenes/${meaningId}/shots/video-shotcraft/${card.cardId}`;
  const inputs = await Promise.all(
    closure.files.map(async (file) => {
      const bytes = await readExternalRegularFile(
        snapshotRoot,
        file.sourcePath,
      );
      if (checksumExternalBytes(bytes) !== file.checksum) {
        throw new Error(
          `Closure source checksum is stale: ${file.sourcePath}.`,
        );
      }
      return { file, bytes };
    }),
  );
  const licenseBytes = await readExternalRegularFile(snapshotRoot, "LICENSE");
  const licenseFile = snapshot.files.find(
    (file) => file.role === "source-license" && file.fixturePath === "LICENSE",
  );
  if (
    !licenseFile ||
    checksumExternalBytes(licenseBytes) !== licenseFile.checksum
  ) {
    throw new Error("Localization license bytes are stale.");
  }
  const files = [
    ...inputs.map(({ file, bytes }) => ({
      kind: "source" as const,
      sourcePath: file.sourcePath,
      sourceChecksum: file.checksum,
      destinationPath: `upstream/${file.sourcePath}`,
      localizedChecksum: checksumExternalBytes(bytes),
      dependencyReason: file.dependencyReason,
    })),
    {
      kind: "license" as const,
      sourcePath: "LICENSE",
      sourceChecksum: licenseFile.checksum,
      destinationPath: "LICENSE",
      localizedChecksum: checksumExternalBytes(licenseBytes),
      dependencyReason: "license" as const,
    },
  ].sort((left, right) =>
    left.destinationPath.localeCompare(right.destinationPath),
  );
  const input = {
    schemaVersion: 1 as const,
    projectId,
    meaningId,
    cardId: card.cardId,
    snapshotFingerprint: snapshot.snapshotFingerprint,
    closureFingerprint: closure.closureFingerprint,
    packageLockChecksum: closure.packageLockChecksum,
    targetRoot,
    licenseId: snapshot.sourceLicense.id,
    attributionText: snapshot.sourceLicense.attributionText,
    files,
  };
  const manifest = LocalizationManifestSchema.parse({
    ...input,
    localizationFingerprint: computeLocalizationFingerprint(input),
  });

  await mkdir(dirname(join(repositoryRoot, targetRoot)), { recursive: true });
  const temporary = await mkdtemp(
    `${join(repositoryRoot, dirname(targetRoot))}/.${card.cardId}-`,
  );
  try {
    for (const { file, bytes } of inputs) {
      const destination = join(temporary, `upstream/${file.sourcePath}`);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Uint8Array.from(bytes));
    }
    await cp(join(snapshotRoot, "LICENSE"), join(temporary, "LICENSE"));
    await writeFile(
      join(temporary, "localization-manifest.generated.json"),
      `${serializeCanonicalJson(manifest)}\n`,
      "utf8",
    );
    const destination = join(repositoryRoot, targetRoot);
    try {
      const stat = await lstat(destination);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error("Localization target must be a regular directory.");
      }
      await assertDirectoriesEqual(temporary, destination);
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, destination);
    return manifest;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};
