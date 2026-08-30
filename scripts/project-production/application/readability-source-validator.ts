import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

import {
  SceneViewportSchema,
  type SceneViewport,
} from "@axmorf/studio/contracts";

type StaticValue = number | string | ts.ObjectLiteralExpression;

const jsxTagName = (node: ts.JsxTagNameExpression) => node.getText();

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
};

const collectStaticValues = (sourceFiles: readonly ts.SourceFile[]) => {
  const values = new Map<string, StaticValue | null>();
  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        const initializer = unwrapExpression(node.initializer);
        let value: StaticValue | null = null;
        if (ts.isNumericLiteral(initializer)) value = Number(initializer.text);
        else if (
          ts.isStringLiteral(initializer) ||
          ts.isNoSubstitutionTemplateLiteral(initializer)
        ) {
          value = initializer.text;
        } else if (ts.isObjectLiteralExpression(initializer))
          value = initializer;
        if (values.has(node.name.text)) values.set(node.name.text, null);
        else values.set(node.name.text, value);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return values;
};

const resolveStaticValue = (
  expression: ts.Expression,
  values: ReadonlyMap<string, StaticValue | null>,
): StaticValue | null => {
  const current = unwrapExpression(expression);
  if (ts.isNumericLiteral(current)) return Number(current.text);
  if (
    ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    return current.text;
  }
  if (ts.isObjectLiteralExpression(current)) return current;
  if (
    ts.isPrefixUnaryExpression(current) &&
    ts.isNumericLiteral(current.operand)
  ) {
    const value = Number(current.operand.text);
    return current.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  if (ts.isIdentifier(current)) return values.get(current.text) ?? null;
  return null;
};

const propertyName = (name: ts.PropertyName) =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

const findObjectProperty = (
  object: ts.ObjectLiteralExpression,
  name: string,
) => {
  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      propertyName(property.name) === name
    ) {
      return property.initializer;
    }
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === name
    ) {
      return property.name;
    }
  }
  return null;
};

const findAttribute = (
  attributes: ts.JsxAttributes,
  name: string,
): ts.JsxAttribute | null =>
  attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  ) ?? null;

const attributeExpression = (
  attribute: ts.JsxAttribute,
): ts.Expression | null => {
  if (attribute.initializer === undefined) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer;
  return ts.isJsxExpression(attribute.initializer)
    ? (attribute.initializer.expression ?? null)
    : null;
};

const styleProperty = ({
  attributes,
  name,
  values,
}: {
  readonly attributes: ts.JsxAttributes;
  readonly name: string;
  readonly values: ReadonlyMap<string, StaticValue | null>;
}) => {
  const style = findAttribute(attributes, "style");
  if (style === null) return null;
  const expression = attributeExpression(style);
  if (expression === null) return null;
  const resolved = resolveStaticValue(expression, values);
  if (resolved === null || typeof resolved !== "object") return undefined;
  return findObjectProperty(resolved, name);
};

const parseFontSize = ({
  expression,
  allowUnitlessString,
  values,
}: {
  readonly expression: ts.Expression | null | undefined;
  readonly allowUnitlessString: boolean;
  readonly values: ReadonlyMap<string, StaticValue | null>;
}) => {
  if (expression === null || expression === undefined) return null;
  const resolved = resolveStaticValue(expression, values);
  if (typeof resolved === "number" && Number.isFinite(resolved))
    return resolved;
  if (typeof resolved !== "string") return null;
  const match = allowUnitlessString
    ? /^(\d+(?:\.\d+)?)(?:px)?$/u.exec(resolved)
    : /^(\d+(?:\.\d+)?)px$/u.exec(resolved);
  return match === null ? null : Number(match[1]);
};

const hasVisibleTextChild = (element: ts.JsxElement) =>
  element.children.some((child) => {
    if (ts.isJsxText(child)) return child.text.trim().length > 0;
    if (!ts.isJsxExpression(child) || child.expression === undefined)
      return false;
    return (
      !ts.isJsxElement(child.expression) &&
      !ts.isJsxSelfClosingElement(child.expression) &&
      !ts.isJsxFragment(child.expression)
    );
  });

const getAttributes = (node: ts.Node): ts.JsxAttributes | null => {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    return node.attributes;
  }
  if (ts.isJsxElement(node)) return node.openingElement.attributes;
  return null;
};

const parseScale = (
  value: StaticValue | null,
): { readonly found: boolean; readonly minimum: number | null } => {
  if (typeof value === "number") return { found: true, minimum: value };
  if (typeof value !== "string")
    return { found: value !== null, minimum: null };
  if (!/scale/iu.test(value)) return { found: false, minimum: 1 };
  const matches = [
    ...value.matchAll(
      /scale(?:x|y)?\(\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)/giu,
    ),
  ];
  if (matches.length === 0) return { found: true, minimum: null };
  return {
    found: true,
    minimum: Math.min(
      ...matches.flatMap((match) =>
        [match[1], match[2]]
          .filter((entry): entry is string => entry !== undefined)
          .map(Number),
      ),
    ),
  };
};

const assertNoUnreadableScale = (
  sourceFiles: readonly ts.SourceFile[],
  values: ReadonlyMap<string, StaticValue | null>,
) => {
  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node) => {
      const attributes = getAttributes(node);
      if (attributes !== null) {
        const transformAttribute = findAttribute(attributes, "transform");
        const transformExpression =
          transformAttribute === null
            ? null
            : attributeExpression(transformAttribute);
        const styleTransform = styleProperty({
          attributes,
          name: "transform",
          values,
        });
        const styleScale = styleProperty({ attributes, name: "scale", values });
        for (const expression of [
          transformExpression,
          styleTransform,
          styleScale,
        ]) {
          if (expression === null) continue;
          if (expression === undefined) {
            throw new Error(
              `Renderer transform must be statically provable in ${sourceFile.fileName}.`,
            );
          }
          const resolved = resolveStaticValue(expression, values);
          if (resolved === null) {
            throw new Error(
              `Renderer transform must be statically provable in ${sourceFile.fileName}.`,
            );
          }
          const parsed = parseScale(resolved);
          if (parsed.found && (parsed.minimum === null || parsed.minimum < 1)) {
            throw new Error(
              `Renderer scale must be statically proven not to shrink readable content in ${sourceFile.fileName}.`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
};

const resolveRendererRoot = (sourceFile: ts.SourceFile) => {
  const exportAssignment = sourceFile.statements.find(ts.isExportAssignment);
  if (
    exportAssignment === undefined ||
    !ts.isIdentifier(exportAssignment.expression)
  ) {
    throw new Error(
      "Policy-aware Renderer must default-export a named component.",
    );
  }
  const exportName = exportAssignment.expression.text;
  let initializer: ts.Expression | null = null;
  const visit = (node: ts.Node) => {
    if (
      initializer === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === exportName &&
      node.initializer !== undefined
    ) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const rendererInitializer = initializer as ts.Expression | null;
  if (
    rendererInitializer === null ||
    !ts.isArrowFunction(rendererInitializer)
  ) {
    throw new Error(
      "Policy-aware Renderer must use a statically inspectable component.",
    );
  }
  if (ts.isBlock(rendererInitializer.body)) {
    const returns = rendererInitializer.body.statements.filter(
      ts.isReturnStatement,
    );
    if (returns.length !== 1 || returns[0]?.expression === undefined) {
      throw new Error(
        "Policy-aware Renderer must have one inspectable return root.",
      );
    }
    return unwrapExpression(returns[0].expression);
  }
  return unwrapExpression(rendererInitializer.body);
};

const assertRendererRoot = (sourceFile: ts.SourceFile) => {
  const root = resolveRendererRoot(sourceFile);
  if (
    !ts.isJsxElement(root) &&
    !ts.isJsxSelfClosingElement(root) &&
    !ts.isJsxFragment(root)
  ) {
    throw new Error(
      "Scene Renderer must expose one statically inspectable semantic JSX root.",
    );
  }
};

const assertNoSharedBoundaryOwnership = (
  sourceFiles: readonly ts.SourceFile[],
) => {
  const forbidden = new Set([
    "SceneViewport",
    "SceneTypographyProvider",
    "SceneContentFrame",
    "SceneBackground",
    "CaptionLayer",
    "GlobalVisualLayers",
    "Audio",
    "Html5Audio",
    "readabilityPolicy",
    "sceneBoundaryVersion",
    "sceneContentSafeAreaPx",
    "safeAreaPx",
    "useVideoConfig",
  ]);
  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && forbidden.has(node.text)) {
        throw new Error(
          `Scene Renderer source graph must not own ${node.text}.`,
        );
      }
      if (
        (ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) &&
        node.name !== undefined &&
        (node.name.getText() === "animation" ||
          node.name.getText() === "transition")
      ) {
        throw new Error(
          "Scene Renderer source graph must not use CSS animation or transition.",
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
};

const assertTextSizes = ({
  sourceFiles,
  values,
  minimum,
}: {
  readonly sourceFiles: readonly ts.SourceFile[];
  readonly values: ReadonlyMap<string, StaticValue | null>;
  readonly minimum: number;
}) => {
  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node) &&
        (node.importClause?.namedBindings !== undefined
          ? node.importClause.namedBindings.getText().includes("CaptionLayer")
          : false)
      ) {
        throw new Error(
          "Scene Renderer source graph must not import CaptionLayer.",
        );
      }
      if (ts.isJsxElement(node)) {
        const tagName = jsxTagName(node.openingElement.tagName);
        if (tagName === "CaptionLayer") {
          throw new Error("Scene Renderer must not render CaptionLayer.");
        }
        const controlled =
          tagName === "SceneText" || tagName === "SceneSvgText";
        const visible = controlled || hasVisibleTextChild(node);
        if (visible) {
          const attributes = node.openingElement.attributes;
          let expression: ts.Expression | null | undefined;
          let allowUnitlessString = false;
          if (controlled) {
            const attribute = findAttribute(attributes, "fontSizePx");
            expression =
              attribute === null ? null : attributeExpression(attribute);
          } else if (tagName === "text") {
            const attribute = findAttribute(attributes, "fontSize");
            expression =
              attribute === null ? null : attributeExpression(attribute);
            allowUnitlessString = true;
          } else if (/^[a-z]/u.test(tagName)) {
            expression = styleProperty({
              attributes,
              name: "fontSize",
              values,
            });
          } else {
            expression = null;
          }
          if (controlled || tagName === "text" || /^[a-z]/u.test(tagName)) {
            const size = parseFontSize({
              expression,
              allowUnitlessString,
              values,
            });
            if (size === null) {
              throw new Error(
                `Visible text font size in ${sourceFile.fileName} is inherited, relative, or not statically provable.`,
              );
            }
            if (size < minimum) {
              throw new Error(
                `Visible text size ${size}px is below the frozen ${minimum}px minimum in ${sourceFile.fileName}.`,
              );
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
};

export const validateRendererReadabilitySourceGraph = async ({
  rootDir,
  rendererPath,
  sourcePaths,
  sceneViewport: rawSceneViewport,
}: {
  readonly rootDir: string;
  readonly rendererPath: string;
  readonly sourcePaths: readonly string[];
  readonly sceneViewport: SceneViewport | unknown;
}) => {
  const sceneViewport = SceneViewportSchema.parse(rawSceneViewport);
  const sortedPaths = [...sourcePaths].sort((left, right) =>
    left.localeCompare(right),
  );
  const sourceFiles = await Promise.all(
    sortedPaths.map(async (sourcePath) =>
      ts.createSourceFile(
        sourcePath,
        await readFile(join(rootDir, sourcePath), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    ),
  );
  const rendererSource = sourceFiles.find(
    (sourceFile) => sourceFile.fileName === rendererPath,
  );
  if (rendererSource === undefined) {
    throw new Error("Renderer source graph is missing its entry file.");
  }
  assertRendererRoot(rendererSource);
  assertNoSharedBoundaryOwnership(
    sourceFiles.filter(
      ({ fileName }) =>
        !fileName.startsWith("src/remotion/runtime/readability/"),
    ),
  );
  const values = collectStaticValues(sourceFiles);
  assertNoUnreadableScale(sourceFiles, values);
  assertTextSizes({
    sourceFiles: sourceFiles.filter(
      ({ fileName }) =>
        !fileName.startsWith("src/remotion/runtime/readability/"),
    ),
    values,
    minimum: sceneViewport.minFontSizePx,
  });
  return {
    viewportFingerprint: sceneViewport.viewportFingerprint,
    minimumEffectiveFontSizePx: sceneViewport.minFontSizePx,
  } as const;
};
