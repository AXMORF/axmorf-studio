import { lstat } from "node:fs/promises";
import { dirname, posix } from "node:path";
import ts from "typescript";

import {
  SceneCoverageMapSchema,
  ScenePackageSchema,
  StoryIdSchema,
  createFingerprint,
  type Sha256Digest,
  type ScenePackage,
} from "../../src/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "../external-references/project-files";
import { assertGuardedSource } from "../external-references/source-guard";

export const RENDERER_REGISTRY_GENERATOR_ID =
  "composition-local-renderer-registry-v1" as const;

export type RendererSourceGraph = {
  readonly rendererPath: string;
  readonly files: readonly {
    readonly sourcePath: string;
    readonly checksum: string;
  }[];
  readonly sourceGraphFingerprint: Sha256Digest;
};

const assertDirectory = async (absolutePath: string): Promise<void> => {
  const file = await lstat(absolutePath);
  if (file.isSymbolicLink() || !file.isDirectory()) {
    throw new Error(
      "Renderer project and Scene roots must be real directories.",
    );
  }
};

const resolveSourceFile = async (
  rootDir: string,
  importerPath: string,
  specifier: string,
): Promise<string> => {
  const base = posix.normalize(posix.join(dirname(importerPath), specifier));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    try {
      const candidateStat = await lstat(`${rootDir}/${candidate}`);
      if (candidateStat.isDirectory()) continue;
      await readExternalRegularFile(rootDir, candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Renderer static import cannot be resolved: ${specifier}.`);
};

const countDefaultExports = (file: ts.SourceFile): number => {
  let count = 0;
  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals)
      count += 1;
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      count += 1;
    }
  }
  return count;
};

const assertVisualOnlySource = (
  source: string,
  sourceFile: ts.SourceFile,
): void => {
  if (/\b(?:animation|animationName|transition)\s*:/u.test(source)) {
    throw new Error(
      "Scene Renderer source cannot use CSS animation or transition.",
    );
  }
  const forbidden = new Set([
    "Audio",
    "CaptionLayer",
    "NarrationAudioTrack",
    "Narration",
  ]);
  let violation: string | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && forbidden.has(node.text))
      violation = node.text;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (violation !== null) {
    throw new Error(`Scene Renderer must remain visual-only: ${violation}.`);
  }
};

export const collectRendererSourceGraph = async ({
  rootDir,
  projectId: rawProjectId,
  rendererPath,
}: {
  readonly rootDir: string;
  readonly projectId: unknown;
  readonly rendererPath: string;
}): Promise<RendererSourceGraph> => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const projectRoot = `src/projects/${projectId}`;
  const expectedPrefix = `${projectRoot}/scenes/`;
  if (
    !rendererPath.startsWith(expectedPrefix) ||
    !/^src\/projects\/[a-z0-9-]+\/scenes\/[a-z0-9-]+\/Renderer\.tsx$/u.test(
      rendererPath,
    )
  ) {
    throw new Error("Renderer entry must use the fixed project Scene depth.");
  }
  await assertDirectory(`${rootDir}/${projectRoot}`);
  await assertDirectory(`${rootDir}/${dirname(rendererPath)}`);
  const pending = [rendererPath];
  const files = new Map<string, Buffer>();
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (sourcePath === undefined || files.has(sourcePath)) continue;
    const bytes = await readExternalRegularFile(rootDir, sourcePath);
    const source = bytes.toString("utf8");
    const sourceFile = ts.createSourceFile(
      sourcePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    assertVisualOnlySource(source, sourceFile);
    const guarded = assertGuardedSource({
      source,
      sourcePath,
      allowedBarePackages: new Map([
        ["react", "19.2.3"],
        ["remotion", "4.0.489"],
      ]),
      relativeRoot: sourcePath.startsWith(projectRoot)
        ? "src"
        : sourcePath.startsWith("src/remotion/runtime/readability/")
          ? "src"
          : "src/remotion/capabilities",
    });
    if (sourcePath === rendererPath && countDefaultExports(sourceFile) !== 1) {
      throw new Error("Scene Renderer must have exactly one default export.");
    }
    const typeOnlyRelativeImports = new Set(
      sourceFile.statements.flatMap((statement) => {
        if (
          (!ts.isImportDeclaration(statement) &&
            !ts.isExportDeclaration(statement)) ||
          statement.moduleSpecifier === undefined ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          !statement.moduleSpecifier.text.startsWith(".")
        ) {
          return [];
        }
        const isTypeOnly = ts.isImportDeclaration(statement)
          ? statement.importClause?.isTypeOnly === true ||
            (statement.importClause?.name === undefined &&
              statement.importClause?.namedBindings !== undefined &&
              ts.isNamedImports(statement.importClause.namedBindings) &&
              statement.importClause.namedBindings.elements.every(
                (element) => element.isTypeOnly,
              ))
          : statement.isTypeOnly ||
            (statement.exportClause !== undefined &&
              ts.isNamedExports(statement.exportClause) &&
              statement.exportClause.elements.every(
                (element) => element.isTypeOnly,
              ));
        return isTypeOnly
          ? [
              posix.normalize(
                posix.join(
                  dirname(sourcePath),
                  statement.moduleSpecifier.text,
                ),
              ),
            ]
          : [];
      }),
    );
    files.set(sourcePath, bytes);
    for (const relativeImport of guarded.relativeImports) {
      if (typeOnlyRelativeImports.has(relativeImport)) continue;
      if (
        sourcePath.startsWith("src/remotion/runtime/readability/") &&
        (relativeImport === "src/contracts" ||
          relativeImport.startsWith("src/contracts/"))
      ) {
        continue;
      }
      const specifier = posix.relative(dirname(sourcePath), relativeImport);
      const dependencyPath = await resolveSourceFile(
        rootDir,
        sourcePath,
        specifier,
      );
      if (
        !dependencyPath.startsWith(`${projectRoot}/`) &&
        !dependencyPath.startsWith("src/remotion/capabilities/") &&
        !dependencyPath.startsWith("src/remotion/runtime/readability/")
      ) {
        throw new Error(
          "Renderer import escapes project-local or approved capability source.",
        );
      }
      pending.push(dependencyPath);
    }
  }
  const graphFiles = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, bytes]) => ({
      sourcePath,
      checksum: checksumExternalBytes(bytes),
    }));
  return {
    rendererPath,
    files: graphFiles,
    sourceGraphFingerprint: createFingerprint({
      namespace: "renderer-source-graph",
      version: 1,
      value: { rendererPath, files: graphFiles },
    }),
  };
};

export type BuiltRendererRegistry = {
  readonly source: string;
  readonly registryFingerprint: Sha256Digest;
  readonly sourceChecksum: Sha256Digest;
  readonly entries: readonly {
    readonly meaningId: string;
    readonly rendererId: string;
    readonly rendererPath: string;
    readonly sourceGraphFingerprint: Sha256Digest;
  }[];
};

export const buildRendererRegistry = async ({
  rootDir,
  projectId: rawProjectId,
  coverage: rawCoverage,
  packages: rawPackages,
}: {
  readonly rootDir: string;
  readonly projectId: unknown;
  readonly coverage: unknown;
  readonly packages: readonly unknown[];
}): Promise<BuiltRendererRegistry | null> => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const coverage = SceneCoverageMapSchema.parse(rawCoverage);
  if (coverage.storyId !== projectId) {
    throw new Error("Renderer coverage belongs to another project.");
  }
  const ready = coverage.entries.filter((entry) => entry.status === "ready");
  if (ready.length === 0) return null;
  const packages = rawPackages.map((value) => ScenePackageSchema.parse(value));
  const packageByMeaning = new Map<string, ScenePackage>();
  for (const scenePackage of packages) {
    if (
      scenePackage.storyId !== projectId ||
      packageByMeaning.has(scenePackage.meaningId)
    ) {
      throw new Error("Renderer package identity is unknown or duplicated.");
    }
    packageByMeaning.set(scenePackage.meaningId, scenePackage);
  }
  if (packages.length !== ready.length) {
    throw new Error("Only current ready packages may enter RendererRegistry.");
  }
  const entries = [];
  const rendererIds = new Set<string>();
  for (const coverageEntry of ready) {
    const scenePackage = packageByMeaning.get(coverageEntry.meaningId);
    if (
      !scenePackage ||
      scenePackage.packageFingerprint !== coverageEntry.packageFingerprint ||
      scenePackage.rendererBinding.rendererId !== coverageEntry.rendererId ||
      rendererIds.has(coverageEntry.rendererId)
    ) {
      throw new Error(
        "Ready coverage and ScenePackage renderer binding do not match.",
      );
    }
    rendererIds.add(coverageEntry.rendererId);
    const rendererPath = `src/projects/${projectId}/scenes/${coverageEntry.meaningId}/Renderer.tsx`;
    const graph = await collectRendererSourceGraph({
      rootDir,
      projectId,
      rendererPath,
    });
    if (
      graph.sourceGraphFingerprint !==
      scenePackage.rendererBinding.rendererSourceFingerprint
    ) {
      throw new Error(
        "ScenePackage renderer source graph fingerprint is stale.",
      );
    }
    entries.push({
      meaningId: coverageEntry.meaningId,
      rendererId: coverageEntry.rendererId,
      rendererPath,
      sourceGraphFingerprint: graph.sourceGraphFingerprint,
    });
  }
  entries.sort((left, right) =>
    left.rendererId.localeCompare(right.rendererId),
  );
  const registryFingerprint = createFingerprint({
    namespace: "renderer-registry",
    version: 1,
    value: {
      generatorId: RENDERER_REGISTRY_GENERATOR_ID,
      projectId,
      entries,
    },
  });
  const imports = entries.map(
    (entry, index) =>
      `import Renderer${index} from "./scenes/${entry.meaningId}/Renderer";`,
  );
  const graphEntries = entries.map(
    (entry) =>
      `  ${JSON.stringify(entry.rendererId)}: ${JSON.stringify(entry.sourceGraphFingerprint)},`,
  );
  const registryEntries = entries.map(
    (entry, index) =>
      `  ${JSON.stringify(entry.rendererId)}: Renderer${index},`,
  );
  const source = `${imports.join("\n")}\nimport type {SceneRendererRegistry} from "../../remotion/runtime/story-visual/types";\n\nexport const rendererRegistryFingerprint = ${JSON.stringify(registryFingerprint)};\nexport const rendererSourceGraphFingerprints = {\n${graphEntries.join("\n")}\n} as const;\nexport const rendererRegistry = {\n${registryEntries.join("\n")}\n} as const satisfies SceneRendererRegistry;\n`;
  return {
    source,
    registryFingerprint,
    sourceChecksum: checksumExternalBytes(Buffer.from(source, "utf8")),
    entries,
  };
};
