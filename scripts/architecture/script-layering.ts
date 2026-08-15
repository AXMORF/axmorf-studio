import { readFile, readdir } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

import ts from "typescript";

const toPosix = (value: string) => value.split(sep).join(posix.sep);

const listTypeScriptFiles = async (
  directory: string,
): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
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
    /^scripts\/(production|delivery|project-assets|projects)\/(application|domain|adapters)\//u.exec(
      sourcePath,
    );
  return (
    match?.[2] ??
    (/^scripts\/(production|delivery|project-assets|projects)\/(?:[a-z0-9-]+-)?cli(?:\.[cm]?tsx?)?$/u.test(
      sourcePath,
    )
      ? "cli"
      : null)
  );
};

export const findScriptLayeringViolations = async (rootDir: string) => {
  const roots = [
    "scripts/production",
    "scripts/delivery",
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
      const targetLayer = layerOf(target);
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
        sourcePath.startsWith("scripts/delivery/") &&
        target.startsWith("scripts/production/adapters/")
      ) {
        violations.push(
          `${sourcePath} -> ${target}: delivery reuses production adapter`,
        );
      }
      if (
        sourcePath.startsWith("scripts/projects/") &&
        target.startsWith("scripts/production/adapters/") &&
        !(
          sourcePath === "scripts/projects/delete.ts" &&
          target === "scripts/production/adapters/run-store" &&
          importedNames.length === 1 &&
          importedNames[0] === "acquireProductionRunLock"
        )
      ) {
        violations.push(
          `${sourcePath} -> ${target}: Project workflow reuses production adapter`,
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
        /^scripts\/(production|delivery|project-assets|projects|scene-templates)\//u.test(
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
  return violations.sort();
};
