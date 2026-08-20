import { readFile, readdir } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

import ts from "typescript";

const toPosix = (value: string) => value.split(sep).join(posix.sep);

const listTypeScriptFiles = async (
  directory: string,
): Promise<readonly string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? listTypeScriptFiles(path)
        : /\.[cm]?tsx?$/u.test(entry.name)
          ? [path]
          : [];
    }),
  );
  return nested.flat().sort();
};

const moduleReferences = (source: string, fileName: string) => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const references: Array<{
    specifier: string;
    importedNames: readonly string[];
  }> = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const importedNames = ts.isImportDeclaration(node)
        ? node.importClause?.namedBindings !== undefined &&
          ts.isNamedImports(node.importClause.namedBindings)
          ? node.importClause.namedBindings.elements.map(
              (element) => element.propertyName?.text ?? element.name.text,
            )
          : []
        : node.exportClause !== undefined &&
            ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.map(
              (element) => element.propertyName?.text ?? element.name.text,
            )
          : [];
      references.push({
        specifier: node.moduleSpecifier.text,
        importedNames,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
};

const resolveLocalImport = (sourcePath: string, specifier: string) =>
  specifier.startsWith(".")
    ? posix.normalize(posix.join(posix.dirname(sourcePath), specifier))
    : null;

const layerOf = (sourcePath: string) => {
  const match =
    /^scripts\/(project-production|project-assets|projects)\/(application|domain|adapters)\//u.exec(
      sourcePath,
    );
  return (
    match?.[2] ??
    (/^scripts\/(project-production|project-assets|projects)\/(?:[a-z0-9-]+-)?cli(?:\.[cm]?tsx?)?$/u.test(
      sourcePath,
    )
      ? "cli"
      : null)
  );
};

const READ_ONLY_PRODUCTION_ENTRYPOINTS = new Set([
  "scripts/project-production/application/build-current-plan.ts",
  "scripts/project-production/application/inspect-production.ts",
]);

const readOnlyWriterDependency = ({
  target,
  importedNames,
}: {
  readonly target: string;
  readonly importedNames: readonly string[];
}) => {
  const writerModules = new Map<string, string>([
    [
      "scripts/project-production/application/prepare-production",
      "preparation writer",
    ],
    [
      "scripts/project-production/application/prepare-fixed-tasks",
      "provider/fixed writer",
    ],
    ["scripts/project-production/adapters/attempt-store", "attempt writer"],
    [
      "scripts/project-production/adapters/project-materializer",
      "materializer",
    ],
    [
      "scripts/project-production/adapters/task-workspace",
      "workspace writer",
    ],
    ["scripts/narration/generate-runner", "provider writer"],
    ["scripts/narration/adapters/provider-dispatcher", "provider writer"],
    ["scripts/narration/adapters/voxcpm-client", "provider writer"],
    ["scripts/narration/adapters/edge-tts-client", "provider writer"],
    ["scripts/narration/adapters/speech-sdk-client", "provider writer"],
  ]);
  const writerModule = writerModules.get(target);
  if (writerModule !== undefined) {
    return `${writerModule} ${importedNames.join(",") || "module"}`;
  }
  if (
    target === "scripts/project-production/adapters/artifact-store" &&
    (importedNames.includes("commitTaskArtifact") || importedNames.length === 0)
  ) {
    return "artifact writer commitTaskArtifact";
  }
  return null;
};

export const findScriptLayeringViolations = async (rootDir: string) => {
  const roots = [
    "scripts/project-production",
    "scripts/project-assets",
    "scripts/projects",
    "scripts/scene-templates",
    "scripts/shared",
  ] as const;
  const files = (
    await Promise.all(
      roots.map((root) => listTypeScriptFiles(join(rootDir, root))),
    )
  ).flat();
  const violations: string[] = [];
  const importGraph = new Map<string, string[]>();
  const writerDependencies = new Map<
    string,
    Array<{ readonly target: string; readonly writer: string }>
  >();
  for (const absolutePath of files) {
    const sourcePath = toPosix(relative(rootDir, absolutePath));
    const sourceLayer = layerOf(sourcePath);
    const source = await readFile(absolutePath, "utf8");
    for (const { specifier, importedNames } of moduleReferences(
      source,
      sourcePath,
    )) {
      const target = resolveLocalImport(sourcePath, specifier);
      if (target === null) continue;
      const targets = importGraph.get(sourcePath) ?? [];
      targets.push(target);
      importGraph.set(sourcePath, targets);
      const targetLayer = layerOf(target);
      const writer = readOnlyWriterDependency({ target, importedNames });
      if (writer !== null) {
        const dependencies = writerDependencies.get(sourcePath) ?? [];
        dependencies.push({ target, writer });
        writerDependencies.set(sourcePath, dependencies);
        if (READ_ONLY_PRODUCTION_ENTRYPOINTS.has(sourcePath)) {
          violations.push(
            `${sourcePath} -> ${target}: read-only planning depends on ${writer}`,
          );
        }
      }
      if (
        /^scripts\/(production|delivery|project-build)(?:\/|$)/u.test(target)
      ) {
        violations.push(
          `${sourcePath} -> ${target}: depends on removed workflow`,
        );
      }
      if (
        sourceLayer === "domain" &&
        (targetLayer === "application" ||
          targetLayer === "adapters" ||
          targetLayer === "cli")
      ) {
        violations.push(
          `${sourcePath} -> ${target}: domain dependency inversion`,
        );
      }
      if (
        sourceLayer === "adapters" &&
        (targetLayer === "application" || targetLayer === "cli")
      ) {
        violations.push(
          `${sourcePath} -> ${target}: adapter dependency inversion`,
        );
      }
      if (sourceLayer === "application" && targetLayer === "cli") {
        violations.push(
          `${sourcePath} -> ${target}: application depends on CLI`,
        );
      }
      if (
        sourcePath.startsWith("scripts/scene-templates/") &&
        target.startsWith("scripts/projects/")
      ) {
        violations.push(
          `${sourcePath} -> ${target}: Scene template projection depends on Project workflow`,
        );
      }
      if (
        sourcePath.startsWith("scripts/shared/") &&
        /^scripts\/(project-production|project-assets|projects|scene-templates)\//u.test(
          target,
        )
      ) {
        violations.push(
          `${sourcePath} -> ${target}: shared technical module depends on business workflow`,
        );
      }
      if (
        target === "scripts/baseline/evidence" &&
        importedNames.includes("ProcessRunner")
      ) {
        violations.push(
          `${sourcePath} -> ${target}: shared process port owned by baseline`,
        );
      }
    }
  }
  const sourceCandidates = (target: string) => [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.mts`,
    `${target}.cts`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
  ];
  const importedTargets = (target: string) =>
    sourceCandidates(target).flatMap(
      (candidate) => importGraph.get(candidate) ?? [],
    );
  const importedWriters = (target: string) =>
    sourceCandidates(target).flatMap(
      (candidate) => writerDependencies.get(candidate) ?? [],
    );
  for (const entrypoint of READ_ONLY_PRODUCTION_ENTRYPOINTS) {
    const queue = [...(importGraph.get(entrypoint) ?? [])];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      for (const { target, writer } of importedWriters(current)) {
        violations.push(
          `${entrypoint} -> ${target}: read-only planning indirectly depends on ${writer}`,
        );
      }
      queue.push(...importedTargets(current));
    }
  }
  return violations.sort();
};
