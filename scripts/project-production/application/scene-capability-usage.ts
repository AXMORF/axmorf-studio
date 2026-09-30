import ts from "typescript";

import type { SceneSelectedResource } from "@axmorf/studio/contracts";
import { capabilityDescriptorDeclarations } from "../../../packages/studio/src/remotion/catalog/capability-descriptors";

export const validateSceneCapabilityUsage = ({
  sources,
  selectedResources,
}: {
  readonly sources: readonly Readonly<{
    logicalPath: string;
    source: string;
  }>[];
  readonly selectedResources: readonly SceneSelectedResource[];
}) => {
  const capabilities = capabilityDescriptorDeclarations;
  const ownerByExport = new Map(
    capabilities.flatMap((descriptor) =>
      (descriptor.authoring?.exports ?? [descriptor.exportName]).map(
        (name) => [name, descriptor.id] as const,
      ),
    ),
  );
  const selectedIds = new Set(
    selectedResources
      .filter(({ descriptor }) => descriptor.kind === "capability")
      .map(({ selected }) => selected.resourceId),
  );
  const usedIds = new Set<string>();
  for (const { logicalPath, source } of sources) {
    const file = ts.createSourceFile(
      logicalPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const named = new Map<string, string>();
    const namespaces = new Set<string>();
    for (const statement of file.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const moduleName = statement.moduleSpecifier.text;
      if (
        moduleName !== "@axmorf/studio/remotion" &&
        !/(?:^|\/)runtime\/capabilities(?:\.[cm]?tsx?)?$/u.test(moduleName)
      )
        continue;
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings))
        namespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings))
        for (const binding of bindings.elements) {
          if (!binding.isTypeOnly)
            named.set(
              binding.name.text,
              binding.propertyName?.text ?? binding.name.text,
            );
        }
    }
    const exportedName = (node: ts.Node): string | undefined => {
      if (ts.isIdentifier(node)) return named.get(node.text);
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        namespaces.has(node.expression.text)
      )
        return node.name.text;
      return undefined;
    };
    const record = (node: ts.Node) => {
      const name = exportedName(node);
      const owner = name === undefined ? undefined : ownerByExport.get(name);
      if (owner === undefined) return;
      if (!selectedIds.has(owner))
        throw new Error(
          `Scene invokes unselected capability ${owner} (${name}) in ${logicalPath}.`,
        );
      usedIds.add(owner);
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        record(node.tagName);
      if (ts.isCallExpression(node)) {
        record(node.expression);
        if (
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "createElement") ||
          (ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "createElement")
        ) {
          if (node.arguments[0]) record(node.arguments[0]);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  for (const id of selectedIds) {
    if (
      capabilities.some((descriptor) => descriptor.id === id) &&
      !usedIds.has(id)
    )
      throw new Error(
        `Scene declares capability ${id} without invoking it; an unused import is not usage.`,
      );
  }
};
