import { dirname, posix } from "node:path";
import ts from "typescript";

import { ExternalRepositoryPathSchema } from "../../src/contracts";

export type GuardedSourceResult = {
  readonly relativeImports: readonly string[];
  readonly bareImports: readonly string[];
};

const packageNameFor = (specifier: string): string => {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/", 1)[0];
};

export const assertGuardedSource = ({
  source,
  sourcePath,
  allowedBarePackages,
  relativeRoot,
}: {
  readonly source: string;
  readonly sourcePath: string;
  readonly allowedBarePackages: ReadonlyMap<string, string>;
  readonly relativeRoot: string;
}): GuardedSourceResult => {
  ExternalRepositoryPathSchema.parse(sourcePath);
  const root = ExternalRepositoryPathSchema.parse(relativeRoot);
  if (/https?:\/\//iu.test(source)) {
    throw new Error("Remote URLs are forbidden in localized source.");
  }
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const relativeImports = new Set<string>();
  const bareImports = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      throw new Error("Dynamic import and require are forbidden.");
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        throw new Error("Import specifiers must be string literals.");
      }
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith(".")) {
        const resolved = posix.normalize(
          posix.join(dirname(sourcePath), specifier),
        );
        if (
          resolved === root ||
          (!resolved.startsWith(`${root}/`) && !root.startsWith(`${resolved}/`))
        ) {
          throw new Error("Relative import escapes the approved source root.");
        }
        relativeImports.add(resolved);
      } else {
        if (specifier.startsWith("/") || specifier.includes("\\")) {
          throw new Error("Absolute imports are forbidden.");
        }
        const packageName = packageNameFor(specifier);
        if (!allowedBarePackages.has(packageName)) {
          throw new Error(
            `Bare package import is not approved: ${packageName}.`,
          );
        }
        bareImports.add(packageName);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    relativeImports: [...relativeImports].sort(),
    bareImports: [...bareImports].sort(),
  };
};
