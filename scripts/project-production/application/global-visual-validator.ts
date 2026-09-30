import { lstat } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import ts from "typescript";
import { VisualThemeSchema, createFingerprint } from "@axmorf/studio/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "../../external-references/project-files";
import { assertGuardedSource } from "../../external-references/source-guard";
import { compileTypeScriptImportGraph } from "./typescript-compile";

export type GlobalVisualSourceGraph = Readonly<{
  entryPath: string;
  files: readonly { readonly sourcePath: string; readonly checksum: string }[];
  sourceGraphFingerprint: string;
}>;

export const assertGlobalVisualLayersComponentInterface = ({
  rootDir,
  runtimeRootDir = rootDir,
  storyId,
  virtualEntrySource,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir?: string;
  readonly storyId: string;
  readonly virtualEntrySource?: string;
}) => {
  const sourceRoot = join(rootDir, "src/projects", storyId, "global-visual");
  const entryPath = join(sourceRoot, "GlobalVisualLayers.tsx");
  const rootPath = join(sourceRoot, "global-visual-interface.generated.tsx");
  const interfaceProof = `import type {GlobalVisualLayersComponent} from "@axmorf/studio/remotion";
import {GlobalVisualBaseLayer, GlobalVisualDecorationLayers} from "./GlobalVisualLayers";

const CheckedBaseLayer: GlobalVisualLayersComponent<typeof GlobalVisualBaseLayer> = GlobalVisualBaseLayer;
const CheckedDecorationLayers: GlobalVisualLayersComponent<typeof GlobalVisualDecorationLayers> = GlobalVisualDecorationLayers;
export const GlobalVisualLayersInterfaceProof = [CheckedBaseLayer, CheckedDecorationLayers] as const;
`;
  compileTypeScriptImportGraph({
    rootDir: runtimeRootDir,
    rootPath,
    label: "GlobalVisual layer component interface compile",
    ...(virtualEntrySource === undefined
      ? { virtualSource: interfaceProof }
      : {
          virtualSources: {
            [rootPath]: interfaceProof,
            [entryPath]: virtualEntrySource,
          },
        }),
  });
};

const resolveSourceFile = async (
  rootDir: string,
  importerPath: string,
  specifier: string,
) => {
  const base = posix.normalize(posix.join(dirname(importerPath), specifier));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    try {
      const metadata = await lstat(join(rootDir, candidate));
      if (metadata.isDirectory()) continue;
      await readExternalRegularFile(rootDir, candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    `GlobalVisual static import cannot be resolved: ${specifier}.`,
  );
};

type GlobalVisualComponentDefinition = Readonly<{
  body: ts.ConciseBody;
  parameters: readonly ts.ParameterDeclaration[];
}>;

const importedRemotionBindingNames = (
  sourceFile: ts.SourceFile,
  importedName: string,
) => {
  const bindings = new Set<string>();
  for (const statement of sourceFile.statements) {
    const namedBindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : undefined;
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "remotion" ||
      statement.importClause?.isTypeOnly === true ||
      namedBindings === undefined ||
      !ts.isNamedImports(namedBindings)
    ) {
      continue;
    }
    for (const element of namedBindings.elements) {
      if (
        !element.isTypeOnly &&
        (element.propertyName?.text ?? element.name.text) === importedName
      ) {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
};

const bindingNameIncludes = (
  name: ts.BindingName,
  expected: string,
): boolean =>
  ts.isIdentifier(name)
    ? name.text === expected
    : name.elements.some(
        (element) =>
          !ts.isOmittedExpression(element) &&
          bindingNameIncludes(element.name, expected),
      );

const nodeDeclaresBinding = (node: ts.Node, expected: string) => {
  if (
    ts.isVariableDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isBindingElement(node)
  ) {
    return bindingNameIncludes(node.name, expected);
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  ) {
    return node.name?.text === expected;
  }
  return false;
};

const componentDeclaresBinding = (
  component: GlobalVisualComponentDefinition,
  expected: string,
) => {
  if (
    component.parameters.some((parameter) =>
      bindingNameIncludes(parameter.name, expected),
    )
  ) {
    return true;
  }
  let declared = false;
  const visit = (node: ts.Node): void => {
    if (nodeDeclaresBinding(node, expected)) declared = true;
    if (node !== component.body && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(component.body);
  return declared;
};

const directlyCallsImportedFrameHook = ({
  component,
  importedBindings,
}: {
  readonly component: GlobalVisualComponentDefinition;
  readonly importedBindings: ReadonlySet<string>;
}) => {
  const shadowedBindings = new Set<string>();
  for (const parameter of component.parameters) {
    for (const binding of importedBindings) {
      if (bindingNameIncludes(parameter.name, binding)) {
        shadowedBindings.add(binding);
      }
    }
  }

  const calledBindings = new Set<string>();
  const visit = (node: ts.Node): void => {
    for (const binding of importedBindings) {
      if (nodeDeclaresBinding(node, binding)) shadowedBindings.add(binding);
    }
    if (node !== component.body && ts.isFunctionLike(node)) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      importedBindings.has(node.expression.text)
    ) {
      calledBindings.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(component.body);
  return [...calledBindings].some((binding) => !shadowedBindings.has(binding));
};

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
};

const isMechanicallyNonTextJsxChild = (expression: ts.Expression): boolean => {
  const unwrapped = unwrapExpression(expression);
  if (
    ts.isJsxElement(unwrapped) ||
    ts.isJsxSelfClosingElement(unwrapped) ||
    ts.isJsxFragment(unwrapped) ||
    unwrapped.kind === ts.SyntaxKind.NullKeyword ||
    unwrapped.kind === ts.SyntaxKind.TrueKeyword ||
    unwrapped.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return true;
  }
  if (ts.isConditionalExpression(unwrapped)) {
    return (
      isMechanicallyNonTextJsxChild(unwrapped.whenTrue) &&
      isMechanicallyNonTextJsxChild(unwrapped.whenFalse)
    );
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return unwrapped.elements.every(
      (element) =>
        ts.isOmittedExpression(element) ||
        (!ts.isSpreadElement(element) &&
          isMechanicallyNonTextJsxChild(element)),
    );
  }
  return false;
};

const jsxRootAttributes = (expression: ts.Expression) => {
  const root = unwrapExpression(expression);
  if (ts.isJsxSelfClosingElement(root)) {
    return { attributes: root.attributes, tagName: root.tagName } as const;
  }
  if (ts.isJsxElement(root)) {
    return {
      attributes: root.openingElement.attributes,
      tagName: root.openingElement.tagName,
    } as const;
  }
  return null;
};

const componentReturnExpressions = (body: ts.ConciseBody) => {
  if (!ts.isBlock(body)) return [body];
  const expressions: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      expressions.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return expressions;
};

const directlyReturnsNull = (component: GlobalVisualComponentDefinition) => {
  if (component.parameters.length !== 0) return false;
  const body = component.body;
  if (!ts.isBlock(body)) {
    return unwrapExpression(body).kind === ts.SyntaxKind.NullKeyword;
  }
  const statement = body.statements[0];
  return (
    body.statements.length === 1 &&
    statement !== undefined &&
    ts.isReturnStatement(statement) &&
    statement.expression !== undefined &&
    unwrapExpression(statement.expression).kind === ts.SyntaxKind.NullKeyword
  );
};

const hasInlinePointerTransparentRoot = ({
  component,
  absoluteFillBindings,
}: {
  readonly component: GlobalVisualComponentDefinition;
  readonly absoluteFillBindings: ReadonlySet<string>;
}) => {
  const returned = componentReturnExpressions(component.body);
  return (
    returned.length > 0 &&
    returned.every((expression) => {
      const root = jsxRootAttributes(expression);
      if (root === null || !ts.isIdentifier(root.tagName)) return false;
      const tagName = root.tagName.text;
      if (
        tagName[0] !== tagName[0]?.toLowerCase() &&
        (!absoluteFillBindings.has(tagName) ||
          componentDeclaresBinding(component, tagName))
      ) {
        return false;
      }
      const styleAttributes = root.attributes.properties.filter(
        (property): property is ts.JsxAttribute =>
          ts.isJsxAttribute(property) && property.name.getText() === "style",
      );
      if (styleAttributes.length !== 1) return false;
      const initializer = styleAttributes[0].initializer;
      if (
        initializer === undefined ||
        !ts.isJsxExpression(initializer) ||
        initializer.expression === undefined
      ) {
        return false;
      }
      const style = unwrapExpression(initializer.expression);
      if (
        !ts.isObjectLiteralExpression(style) ||
        style.properties.some((property) => ts.isSpreadAssignment(property))
      ) {
        return false;
      }
      const pointerEvents = style.properties.filter(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          ((ts.isIdentifier(property.name) &&
            property.name.text === "pointerEvents") ||
            (ts.isStringLiteral(property.name) &&
              property.name.text === "pointerEvents")),
      );
      return (
        pointerEvents.length === 1 &&
        ts.isStringLiteral(pointerEvents[0].initializer) &&
        pointerEvents[0].initializer.text === "none"
      );
    })
  );
};

const assertThemedCompositionOwnership = (sourceFile: ts.SourceFile) => {
  const browserGlobals = new Set([
    "window",
    "document",
    "globalThis",
    "self",
    "parent",
    "top",
    "frames",
  ]);
  const imperativeApis = new Set([
    "eval",
    "Function",
    "useEffect",
    "useLayoutEffect",
    "useInsertionEffect",
    "useRef",
    "createRef",
    "createPortal",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
    "queueMicrotask",
  ]);
  const forbiddenElements = new Set([
    "style",
    "script",
    "link",
    "iframe",
    "object",
    "embed",
    "foreignobject",
  ]);
  const forbiddenAttribute = (name: string) =>
    name === "ref" ||
    name === "dangerouslySetInnerHTML" ||
    /^on[a-z]/iu.test(name);
  const reject = (name: string): never => {
    throw new Error(
      `GlobalVisual source crosses themed Composition ownership: ${name}. Use frame-driven JSX/SVG and explicit local styles without DOM, CSS injection, effects, refs, events, or JSX attribute spreads.`,
    );
  };
  const staticName = (node: ts.Node): string | undefined => {
    if (
      ts.isIdentifier(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    )
      return node.text;
    if (ts.isComputedPropertyName(node)) return staticName(node.expression);
    return undefined;
  };
  const scopeFor = (node: ts.Node, functionScoped = false): ts.Node => {
    let scope = node.parent;
    while (
      !ts.isSourceFile(scope) &&
      !ts.isFunctionLike(scope) &&
      (functionScoped ||
        (!ts.isBlock(scope) &&
          !ts.isCatchClause(scope) &&
          !ts.isForStatement(scope) &&
          !ts.isForInStatement(scope) &&
          !ts.isForOfStatement(scope)))
    ) {
      scope = scope.parent;
    }
    return scope;
  };
  const localGlobals = new Map<ts.Node, Set<string>>();
  const elementFactories = new Set(["createElement"]);
  const bind = (name: ts.BindingName, scope: ts.Node) => {
    for (const global of browserGlobals) {
      if (!bindingNameIncludes(name, global)) continue;
      const names = localGlobals.get(scope) ?? new Set<string>();
      names.add(global);
      localGlobals.set(scope, names);
    }
  };
  const collectBindings = (node: ts.Node): void => {
    if (
      ts.isImportSpecifier(node) &&
      staticName(node.propertyName ?? node.name) === "createElement"
    ) {
      elementFactories.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node)) {
      bind(
        node.name,
        scopeFor(
          node,
          ts.isVariableDeclarationList(node.parent) &&
            (node.parent.flags & ts.NodeFlags.BlockScoped) === 0,
        ),
      );
    } else if (ts.isParameter(node)) {
      bind(node.name, node.parent);
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name !== undefined
    ) {
      bind(node.name, scopeFor(node));
    } else if (ts.isFunctionExpression(node) && node.name !== undefined) {
      bind(node.name, node);
    } else if (
      ts.isImportSpecifier(node) ||
      ts.isNamespaceImport(node) ||
      (ts.isImportClause(node) && node.name !== undefined)
    ) {
      bind(node.name!, sourceFile);
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(sourceFile);
  const isLocal = (node: ts.Node, name: string) => {
    let current: ts.Node | undefined = node;
    while (current !== undefined) {
      if (localGlobals.get(current)?.has(name)) return true;
      current = current.parent;
    }
    return false;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      if (imperativeApis.has(node.text)) reject(node.text);
      const parent = node.parent;
      const isPropertyName =
        ((ts.isPropertyAssignment(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyAccessExpression(parent) ||
          ts.isJsxAttribute(parent)) &&
          parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node);
      if (
        browserGlobals.has(node.text) &&
        !isPropertyName &&
        !isLocal(node, node.text)
      )
        reject(node.text);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(sourceFile).toLowerCase();
      if (forbiddenElements.has(name)) reject(`<${name}>`);
    }
    if (ts.isJsxSpreadAttribute(node)) reject("JSX attribute spread");
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      const factoryName = ts.isPropertyAccessExpression(callee)
        ? staticName(callee.name)
        : ts.isElementAccessExpression(callee)
          ? staticName(callee.argumentExpression)
          : staticName(callee);
      const element = node.arguments[0];
      if (
        factoryName !== undefined &&
        elementFactories.has(factoryName) &&
        element !== undefined &&
        ts.isStringLiteral(element) &&
        forbiddenElements.has(element.text.toLowerCase())
      ) {
        reject(`<${element.text}>`);
      }
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (forbiddenAttribute(name)) reject(name);
    }
    const propertyName =
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isMethodDeclaration(node)
        ? staticName(node.name)
        : ts.isBindingElement(node) && node.propertyName !== undefined
          ? staticName(node.propertyName)
          : ts.isElementAccessExpression(node)
            ? staticName(node.argumentExpression)
            : ts.isPropertyAccessExpression(node)
              ? staticName(node.name)
              : ts.isImportSpecifier(node)
                ? staticName(node.propertyName ?? node.name)
                : undefined;
    if (
      propertyName !== undefined &&
      (imperativeApis.has(propertyName) || forbiddenAttribute(propertyName))
    )
      reject(propertyName);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
};

export const assertGlobalVisualSource = ({
  source,
  sourcePath,
  entryPath,
  theme: rawTheme,
}: {
  readonly source: string;
  readonly sourcePath: string;
  readonly entryPath: string;
  readonly theme?: unknown;
}) => {
  const theme = VisualThemeSchema.optional().parse(rawTheme);
  if (/\b(?:animation|animationName|transition)\s*:/u.test(source)) {
    throw new Error(
      "GlobalVisual source cannot use CSS animation or transition.",
    );
  }
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (theme !== undefined) assertThemedCompositionOwnership(sourceFile);
  const forbidden = new Set([
    "Audio",
    "CaptionLayer",
    "NarrativeCore",
    "NarrationAudioTrack",
    "ScenePackage",
    "SceneProductionResult",
    "StoryBeat",
    "SoundContribution",
    "fetch",
    "WebSocket",
    "XMLHttpRequest",
  ]);
  let violation: string | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      if (forbidden.has(node.text)) violation = node.text;
    }
    if (ts.isJsxText(node) && node.getText(sourceFile).trim().length > 0) {
      violation = "visible text";
    }
    if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      !isMechanicallyNonTextJsxChild(node.expression)
    ) {
      violation = "visible text or unproven JSX child expression";
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sourceFile).toLowerCase() === "text") {
        violation = "visible text";
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (violation !== null) {
    throw new Error(
      `GlobalVisual source crosses its visual-only boundary: ${violation}.`,
    );
  }
  if (sourcePath === entryPath) {
    const frameHookBindings = importedRemotionBindingNames(
      sourceFile,
      "useCurrentFrame",
    );
    const absoluteFillBindings = importedRemotionBindingNames(
      sourceFile,
      "AbsoluteFill",
    );
    const componentNames = [
      "GlobalVisualBaseLayer",
      "GlobalVisualDecorationLayers",
    ] as const;
    const componentExportCounts = new Map([
      ["GlobalVisualBaseLayer", 0],
      ["GlobalVisualDecorationLayers", 0],
    ]);
    const components = new Map<string, GlobalVisualComponentDefinition>();
    sourceFile.statements.forEach((statement) => {
      const exported =
        ts.canHaveModifiers(statement) &&
        ts
          .getModifiers(statement)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) return;
      if (ts.isFunctionDeclaration(statement)) {
        const name = statement.name?.text;
        if (name !== undefined && componentExportCounts.has(name)) {
          componentExportCounts.set(
            name,
            (componentExportCounts.get(name) ?? 0) + 1,
          );
          if (statement.body !== undefined) {
            components.set(name, {
              body: statement.body,
              parameters: statement.parameters,
            });
          }
        }
        return;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            componentExportCounts.has(declaration.name.text)
          ) {
            componentExportCounts.set(
              declaration.name.text,
              (componentExportCounts.get(declaration.name.text) ?? 0) + 1,
            );
            const initializer = declaration.initializer;
            if (
              initializer !== undefined &&
              (ts.isArrowFunction(initializer) ||
                ts.isFunctionExpression(initializer))
            ) {
              components.set(declaration.name.text, {
                body: initializer.body,
                parameters: initializer.parameters,
              });
            }
          }
        }
      }
    });
    if ([...componentExportCounts.values()].some((count) => count !== 1)) {
      throw new Error(
        "GlobalVisual entry must export GlobalVisualBaseLayer and GlobalVisualDecorationLayers exactly once each.",
      );
    }
    for (const componentName of componentNames) {
      const component = components.get(componentName);
      if (component === undefined) {
        throw new Error(
          `${componentName} must use a statically inspectable function body.`,
        );
      }
      if (componentName === "GlobalVisualBaseLayer" && theme !== undefined) {
        if (!directlyReturnsNull(component)) {
          throw new Error(
            "Themed GlobalVisualBaseLayer must directly return null without parameters; Composition owns theme.background.",
          );
        }
        continue;
      }
      if (
        !hasInlinePointerTransparentRoot({
          component,
          absoluteFillBindings,
        })
      ) {
        throw new Error(
          `${componentName} root must declare pointerEvents none through one inline root style property without spreads.`,
        );
      }
      if (
        componentName === "GlobalVisualDecorationLayers" &&
        !directlyCallsImportedFrameHook({
          component,
          importedBindings: frameHookBindings,
        })
      ) {
        throw new Error(
          "GlobalVisualDecorationLayers must directly call useCurrentFrame imported from remotion without a local shadow or proxy.",
        );
      }
    }
  }
};

export const collectGlobalVisualSourceGraph = async ({
  rootDir,
  runtimeRootDir = rootDir,
  storyId,
  theme,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir?: string;
  readonly storyId: string;
  readonly theme?: unknown;
}): Promise<GlobalVisualSourceGraph> => {
  const entryPath = `src/projects/${storyId}/global-visual/GlobalVisualLayers.tsx`;
  const ownedRoot = `src/projects/${storyId}/global-visual`;
  const pending = [entryPath];
  const files = new Map<string, Buffer>();
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (sourcePath === undefined || files.has(sourcePath)) continue;
    const bytes = await readExternalRegularFile(rootDir, sourcePath);
    const source = bytes.toString("utf8");
    assertGlobalVisualSource({ source, sourcePath, entryPath, theme });
    const guarded = assertGuardedSource({
      source,
      sourcePath,
      allowedBarePackages: new Map([
        ["@axmorf/studio", "workspace"],
        ["react", "19.2.3"],
        ["remotion", "4.0.489"],
      ]),
      allowedBareSpecifiers: new Set([
        "@axmorf/studio/contracts",
        "@axmorf/studio/remotion",
        "react",
        "remotion",
      ]),
      relativeRoot: "src",
    });
    files.set(sourcePath, bytes);
    for (const relativeImport of guarded.relativeImports) {
      const specifier = posix.relative(dirname(sourcePath), relativeImport);
      const dependencyPath = await resolveSourceFile(
        rootDir,
        sourcePath,
        specifier,
      );
      if (
        !dependencyPath.startsWith(`${ownedRoot}/`) &&
        !dependencyPath.startsWith("src/remotion/capabilities/")
      ) {
        throw new Error(
          "GlobalVisual import escapes owned or approved shared source.",
        );
      }
      if (dependencyPath.includes("/scenes/")) {
        throw new Error("GlobalVisual cannot import Scene source.");
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
  assertGlobalVisualLayersComponentInterface({
    rootDir,
    runtimeRootDir,
    storyId,
  });
  return {
    entryPath,
    files: graphFiles,
    sourceGraphFingerprint: createFingerprint({
      namespace: "global-visual-renderer-source-graph",
      version: 1,
      value: { entryPath, files: graphFiles },
    }),
  };
};
