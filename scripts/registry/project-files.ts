import { lstat, readFile, readdir } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import ts from "typescript";

import {
  createProjectRegistrationDescriptor,
  parseNarrativeProjectSource,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  validateM1ArtifactBundle,
} from "../../src/contracts";
import {
  createValidatedProjectRegistrationEntry,
  type ValidatedProjectRegistrationEntry,
} from "./domain";

const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_COMPOSITION_PATTERN =
  /^src\/projects\/([a-z0-9]+(?:-[a-z0-9]+)*)\/Composition\.tsx$/;

const toPosixRelative = (rootDir: string, path: string) =>
  relative(rootDir, path).split(sep).join(posix.sep);

export const discoverProjectEntries = async (
  rootDir: string,
): Promise<readonly string[]> => {
  const projectsDirectory = join(rootDir, "src/projects");
  const directoryEntries = await readdir(projectsDirectory, {
    withFileTypes: true,
  });
  const discovered: string[] = [];
  for (const entry of directoryEntries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Project symbolic links are not allowed: ${entry.name}.`);
    }
    if (!entry.isDirectory()) continue;
    const compositionPath = join(
      projectsDirectory,
      entry.name,
      "Composition.tsx",
    );
    let compositionStat;
    try {
      compositionStat = await lstat(compositionPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!PROJECT_SLUG_PATTERN.test(entry.name)) {
      throw new Error(`Invalid project slug: ${entry.name}.`);
    }
    if (compositionStat.isSymbolicLink() || !compositionStat.isFile()) {
      throw new Error(
        `Project Composition must be a regular non-symbolic file: ${entry.name}.`,
      );
    }
    discovered.push(toPosixRelative(rootDir, compositionPath));
  }
  return discovered;
};

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));

const countDefaultExports = (source: string, fileName: string): number => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let count = 0;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      count += 1;
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      count += 1;
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        count += statement.exportClause.elements.filter(
          (element) => element.name.text === "default",
        ).length;
      }
    }
  }
  return count;
};

export const loadProjectRegistrationEntry = async ({
  rootDir,
  compositionPath,
}: {
  readonly rootDir: string;
  readonly compositionPath: string;
}): Promise<ValidatedProjectRegistrationEntry> => {
  const match = PROJECT_COMPOSITION_PATTERN.exec(compositionPath);
  if (!match) {
    throw new Error(
      "Composition path must use the fixed first-level convention.",
    );
  }
  const slug = match[1];
  const projectDirectory = join(rootDir, "src/projects", slug);
  const absoluteCompositionPath = join(projectDirectory, "Composition.tsx");
  const compositionStat = await lstat(absoluteCompositionPath);
  if (compositionStat.isSymbolicLink() || !compositionStat.isFile()) {
    throw new Error("Composition must be a regular non-symbolic file.");
  }

  const [brief, story, narration, render, rawManifest, rawTiming, source] =
    await Promise.all([
      readJson(join(projectDirectory, "brief.json")),
      readJson(join(projectDirectory, "story.json")),
      readJson(join(projectDirectory, "narration.json")),
      readJson(join(projectDirectory, "render.json")),
      readJson(
        join(projectDirectory, "generated/sealed-narration.generated.json"),
      ),
      readJson(
        join(projectDirectory, "generated/semantic-timing.generated.json"),
      ),
      readFile(absoluteCompositionPath, "utf8"),
    ]);
  if (countDefaultExports(source, absoluteCompositionPath) !== 1) {
    throw new Error(
      "Story Composition must contain exactly one default export.",
    );
  }
  const projectSource = parseNarrativeProjectSource({
    brief,
    story,
    narration,
    render,
  });
  if (projectSource.story.storyId !== slug) {
    throw new Error("Story ID must match the fixed project directory slug.");
  }
  const sealedNarration = SealedNarrationManifestSchema.parse(rawManifest);
  const semanticTiming = SemanticTimingSchema.parse(rawTiming);
  const artifactBundle = validateM1ArtifactBundle({
    projectSource,
    sealedNarration,
    semanticTiming,
  });
  const descriptor = createProjectRegistrationDescriptor({
    projectSource,
    semanticTiming,
    compositionModulePath: `./${slug}/Composition`,
  });
  return createValidatedProjectRegistrationEntry({
    descriptor,
    artifactBundle,
  });
};
