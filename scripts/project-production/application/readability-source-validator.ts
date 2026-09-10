import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

import {
  SceneViewportSchema,
  type SceneViewport,
} from "@axmorf/studio/contracts";

import { createReadabilityExpressionProof } from "./readability-expression-proof";

const sourceError = (
  node: ts.Node,
  rule: string,
  message: string,
  correction: string,
) => {
  const sourceFile = node.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return new Error(
    `${message} ${sourceFile.fileName}:${line + 1}:${character + 1} [${rule}] ${correction}`,
  );
};

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

const styleProperty = ({
  attributes,
  name,
  proof,
}: {
  readonly attributes: ts.JsxAttributes;
  readonly name: string;
  readonly proof: ReturnType<typeof createReadabilityExpressionProof>;
}) => {
  const expression = proof.jsxProperty(attributes, "style");
  return expression === null || expression === undefined
    ? expression
    : proof.styleProperty(expression, name);
};

const parseFontSize = ({
  expression,
  allowUnitlessString,
  proof,
}: {
  readonly expression: ts.Expression | null | undefined;
  readonly allowUnitlessString: boolean;
  readonly proof: ReturnType<typeof createReadabilityExpressionProof>;
}) => {
  if (expression === null || expression === undefined) return null;
  const resolved = proof.staticValue(expression);
  if (typeof resolved === "number" && Number.isFinite(resolved))
    return resolved;
  if (typeof resolved !== "string") return null;
  const match = allowUnitlessString
    ? /^(\d+(?:\.\d+)?)(?:px)?$/u.exec(resolved)
    : /^(\d+(?:\.\d+)?)px$/u.exec(resolved);
  return match === null ? null : Number(match[1]);
};

const getAttributes = (node: ts.Node): ts.JsxAttributes | null => {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    return node.attributes;
  }
  if (ts.isJsxElement(node)) return node.openingElement.attributes;
  return null;
};

const numberToken = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const numericToken = new RegExp(`^(?:${numberToken}|@)$`, "u");
const cssLengthToken = new RegExp(
  `^(?:${numberToken}|@)(?:px|%)$|^[+-]?0(?:\\.0*)?$`,
  "u",
);
const cssAngleToken = new RegExp(
  `^(?:${numberToken}|@)(?:deg|rad|grad|turn)$|^[+-]?0(?:\\.0*)?$`,
  "u",
);

const parseTransform = (
  text: string,
  syntax: "css" | "svg" | "scale",
): "valid" | "scale" | "unknown" => {
  if (text === "none") return "valid";
  if (syntax === "scale") {
    const parts = text.trim().split(/\s+/u);
    return parts.length >= 1 &&
      parts.length <= 2 &&
      parts.every(
        (part) => numericToken.test(part) && part !== "@" && Number(part) >= 1,
      )
      ? "valid"
      : "scale";
  }
  const functions = [...text.matchAll(/([a-zA-Z]+)\(([^()]*)\)/gu)];
  if (
    functions.length === 0 ||
    text.replace(/[a-zA-Z]+\([^()]*\)/gu, "").trim().length > 0
  )
    return "unknown";
  for (const match of functions) {
    const name = match[1]!;
    const raw = match[2]!.trim();
    const parts =
      syntax === "svg" ? raw.split(/(?:\s*,\s*|\s+)/u) : raw.split(/\s*,\s*/u);
    const count = parts.length;
    if (
      name === "scale" ||
      (syntax === "css" && (name === "scaleX" || name === "scaleY"))
    ) {
      if (
        (name === "scale" ? count < 1 || count > 2 : count !== 1) ||
        !parts.every(
          (part) =>
            numericToken.test(part) && part !== "@" && Number(part) >= 1,
        )
      )
        return "scale";
    } else if (
      name === "translate" ||
      (syntax === "css" && (name === "translateX" || name === "translateY"))
    ) {
      if (
        (name === "translate" ? count < 1 || count > 2 : count !== 1) ||
        !parts.every((part) =>
          (syntax === "svg" ? numericToken : cssLengthToken).test(part),
        )
      )
        return "unknown";
    } else if (name === "rotate") {
      if (
        syntax === "svg"
          ? (count !== 1 && count !== 3) ||
            !parts.every((part) => numericToken.test(part))
          : count !== 1 || !cssAngleToken.test(parts[0]!)
      )
        return "unknown";
    } else return "unknown";
  }
  return "valid";
};

const svgTransformTags = new Set([
  "svg",
  "g",
  "text",
  "tspan",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "polyline",
  "use",
  "foreignObject",
  "defs",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "symbol",
]);

const assertNoUnreadableScale = (
  sourceFiles: readonly ts.SourceFile[],
  proof: ReturnType<typeof createReadabilityExpressionProof>,
) => {
  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node) => {
      // Inspect each JSX element once. Only explicit native SVG graphics can
      // avoid a text-scale check; unknown descendants/attributes remain checked.
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const attributes = getAttributes(node)!;
        if (!proof.isGraphicsOnly(node)) {
          const opening = ts.isJsxElement(node) ? node.openingElement : node;
          const cssTransform = styleProperty({
            attributes,
            name: "transform",
            proof,
          });
          const svgTransform =
            !svgTransformTags.has(opening.tagName.getText()) ||
            cssTransform !== null
              ? null
              : proof.jsxProperty(attributes, "transform");
          const expressions = [
            [svgTransform, "svg"],
            [cssTransform, "css"],
            [styleProperty({ attributes, name: "scale", proof }), "scale"],
          ] as const;
          for (const [expression, syntax] of expressions) {
            if (expression === null) continue;
            const resolved =
              expression === undefined ? null : proof.transformText(expression);
            const verdict =
              resolved === null ? "unknown" : parseTransform(resolved, syntax);
            if (verdict === "valid") continue;
            if (verdict === "scale") {
              throw sourceError(
                expression ?? attributes,
                "readability-scale",
                `Renderer scale must be statically proven not to shrink readable content in ${sourceFile.fileName}.`,
                "Remove shrinking or dynamic scale from text and its ancestors; use a literal scale of at least 1 or a numeric translate/rotate.",
              );
            }
            throw sourceError(
              expression ?? attributes,
              "readability-transform",
              `Renderer transform must be statically provable in ${sourceFile.fileName}.`,
              "Use a complete CSS/SVG 2D translate/rotate with numeric expressions, or a literal scale of at least 1. Unknown transforms cannot prove text readability; numeric left/top or SVG x/y are also supported.",
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
    "GlobalVisualBaseLayer",
    "GlobalVisualDecorationLayers",
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
        const correction =
          node.text === "useVideoConfig"
            ? " Use SceneRendererProps: sceneFrame, durationInFrames, fps, viewportWidth, and viewportHeight."
            : "";
        throw new Error(
          `Scene Renderer source graph must not own ${node.text}.${correction}`,
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
  proof,
  minimum,
}: {
  readonly sourceFiles: readonly ts.SourceFile[];
  readonly proof: ReturnType<typeof createReadabilityExpressionProof>;
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
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tagName = jsxTagName(opening.tagName);
        if (tagName === "CaptionLayer") {
          throw new Error("Scene Renderer must not render CaptionLayer.");
        }
        const controlled =
          tagName === "SceneText" || tagName === "SceneSvgText";
        const visible = controlled || proof.hasVisibleTextChild(node);
        if (visible) {
          const attributes = opening.attributes;
          let expression: ts.Expression | null | undefined;
          let allowUnitlessString = false;
          if (controlled) {
            expression = proof.jsxProperty(attributes, "fontSizePx");
          } else if (tagName === "text") {
            const styledSize = styleProperty({
              attributes,
              name: "fontSize",
              proof,
            });
            const attribute = proof.jsxProperty(attributes, "fontSize");
            // Inline CSS overrides the SVG presentation attribute.
            expression = styledSize !== null ? styledSize : attribute;
            allowUnitlessString = styledSize === null;
          } else if (/^[a-z]/u.test(tagName)) {
            expression = styleProperty({
              attributes,
              name: "fontSize",
              proof,
            });
          } else {
            expression = null;
          }
          if (controlled || tagName === "text" || /^[a-z]/u.test(tagName)) {
            const size = parseFontSize({
              expression,
              allowUnitlessString,
              proof,
            });
            if (size === null) {
              throw sourceError(
                expression ?? opening,
                "readability-font-size",
                `Visible text font size in ${sourceFile.fileName} is inherited, relative, or not statically provable.`,
                `Set an explicit pixel size on <${tagName}>: ${controlled ? `fontSizePx={${minimum}}` : tagName === "text" ? `fontSize={${minimum}}` : `style={{fontSize: ${minimum}}}`} or larger. Inherited sizes and unknown JSX child expressions cannot prove readability.`,
              );
            }
            if (size < minimum) {
              throw sourceError(
                expression ?? opening,
                "readability-font-minimum",
                `Visible text size ${size}px is below the frozen ${minimum}px minimum in ${sourceFile.fileName}.`,
                `Increase the explicit size on <${tagName}> to at least ${minimum}px without a shrinking transform.`,
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
  const proof = createReadabilityExpressionProof(sourceFiles, rendererSource);
  assertNoUnreadableScale(sourceFiles, proof);
  assertTextSizes({
    sourceFiles: sourceFiles.filter(
      ({ fileName }) =>
        !fileName.startsWith("src/remotion/runtime/readability/"),
    ),
    proof,
    minimum: sceneViewport.minFontSizePx,
  });
  return {
    viewportFingerprint: sceneViewport.viewportFingerprint,
    minimumEffectiveFontSizePx: sceneViewport.minFontSizePx,
  } as const;
};
