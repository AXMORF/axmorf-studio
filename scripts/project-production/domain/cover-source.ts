import ts from "typescript";

import { assertGuardedSource } from "../../external-references/source-guard";

export type DeliveryCoverSourceRole =
  | "cover-4x3"
  | "cover-3x4"
  | "root"
  | "index";

const parseSource = (sourcePath: string, source: string) => {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diagnostics = (
    sourceFile as ts.SourceFile & {
      readonly parseDiagnostics: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (diagnostics.length > 0) {
    throw new Error(`Cover source is malformed: ${sourcePath}.`);
  }
  return sourceFile;
};

const importSpecifiers = (sourceFile: ts.SourceFile) =>
  sourceFile.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );

const hasDefaultExport = (sourceFile: ts.SourceFile) =>
  sourceFile.statements.some((statement) => {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) return true;
    if (!ts.canHaveModifiers(statement)) return false;
    const modifiers = ts.getModifiers(statement) ?? [];
    return (
      modifiers.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) &&
      modifiers.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword)
    );
  });

const jsxAttribute = (
  node: ts.JsxOpeningLikeElement,
  name: string,
  sourceFile: ts.SourceFile,
) => {
  const attribute = node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );
  if (attribute?.initializer === undefined) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression !== undefined
  ) {
    const expression = attribute.initializer.expression;
    if (ts.isNumericLiteral(expression)) return Number(expression.text);
    if (ts.isIdentifier(expression)) return expression.text;
  }
  return null;
};

export type CoverCompositionDeclaration = Readonly<{
  variantId: "cover-4x3" | "cover-3x4";
  compositionId: string;
  sourceFile: "Cover4x3.tsx" | "Cover3x4.tsx";
  width: number;
  height: number;
}>;

const collectCompositions = ({
  sourceFile,
  compositionId,
}: {
  readonly sourceFile: ts.SourceFile;
  readonly compositionId: string;
}) => {
  const declarations: Array<{
    readonly id: string;
    readonly component: string;
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly durationInFrames: number;
  }> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === "Composition"
    ) {
      const id = jsxAttribute(node, "id", sourceFile);
      const component = jsxAttribute(node, "component", sourceFile);
      const width = jsxAttribute(node, "width", sourceFile);
      const height = jsxAttribute(node, "height", sourceFile);
      const fps = jsxAttribute(node, "fps", sourceFile);
      const durationInFrames = jsxAttribute(
        node,
        "durationInFrames",
        sourceFile,
      );
      if (
        typeof id !== "string" ||
        typeof component !== "string" ||
        typeof width !== "number" ||
        typeof height !== "number" ||
        typeof fps !== "number" ||
        typeof durationInFrames !== "number"
      ) {
        throw new Error("Cover Composition attributes must be fixed literals.");
      }
      declarations.push({
        id,
        component,
        width,
        height,
        fps,
        durationInFrames,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const expected = [
    {
      id: `${compositionId}DeliveryCover4x3V2`,
      component: "Cover4x3",
      width: 1600,
      height: 1200,
      fps: 30,
      durationInFrames: 1,
      variantId: "cover-4x3" as const,
      sourceFile: "Cover4x3.tsx" as const,
    },
    {
      id: `${compositionId}DeliveryCover3x4V2`,
      component: "Cover3x4",
      width: 1200,
      height: 1600,
      fps: 30,
      durationInFrames: 1,
      variantId: "cover-3x4" as const,
      sourceFile: "Cover3x4.tsx" as const,
    },
  ];
  if (
    declarations.length !== expected.length ||
    declarations.some((declaration, index) => {
      const wanted = expected[index]!;
      return (
        declaration.id !== wanted.id ||
        declaration.component !== wanted.component ||
        declaration.width !== wanted.width ||
        declaration.height !== wanted.height ||
        declaration.fps !== wanted.fps ||
        declaration.durationInFrames !== wanted.durationInFrames
      );
    })
  ) {
    throw new Error(
      "Cover Root must register two independent fixed one-frame Compositions.",
    );
  }
  return expected.map(({ id, variantId, sourceFile: file, width, height }) => ({
    variantId,
    compositionId: id,
    sourceFile: file,
    width,
    height,
  })) as readonly CoverCompositionDeclaration[];
};

const assertForbiddenSource = (
  sourceFile: ts.SourceFile,
  source: string,
  role: DeliveryCoverSourceRole,
) => {
  if (
    /(?:\burl\s*\(|\b(?:image-set|cross-fade|paint)\s*\(|(?:data|blob|file|filesystem|ftp):|@font-face|@import|https?:\/\/|\b(?:animation|animationName|transition)\s*:)/iu.test(
      source,
    )
  ) {
    throw new Error(
      "Cover source cannot use assets, remote resources, fonts, or CSS animation.",
    );
  }
  const forbiddenIdentifiers = new Set([
    "Audio",
    "Html5Audio",
    "Video",
    "Html5Video",
    "OffthreadVideo",
    "AnimatedImage",
    "Img",
    "IFrame",
    "Image",
    "staticFile",
    "getStaticFiles",
    "fetch",
    "WebSocket",
    "XMLHttpRequest",
    "globalThis",
    "window",
    "self",
    "document",
    "navigator",
    "location",
    "process",
    "require",
    "module",
    "eval",
    "Function",
    "URL",
    "Blob",
    "FileReader",
    "Worker",
    "SharedWorker",
    "EventSource",
    "Request",
    "createImageBitmap",
    "OffscreenCanvas",
    "CSSStyleSheet",
    "importScripts",
    "Reflect",
    "Proxy",
    "WebAssembly",
    "FontFace",
    "loadFont",
    "ScenePackage",
    "SceneProductionResult",
    "GlobalVisualLayers",
    "GlobalVisualBaseLayer",
    "GlobalVisualDecorationLayers",
    "GlobalVisualPackage",
    "FinalAssembly",
    "SemanticTiming",
    "CaptionLayer",
    "NarrativeCore",
  ]);
  const forbiddenTags = new Set([
    "img",
    "image",
    "picture",
    "source",
    "object",
    "embed",
    "video",
    "audio",
    "iframe",
    "link",
    "meta",
    "script",
    "style",
    "use",
    "feimage",
  ]);
  const forbiddenJsxAttributes = new Set([
    "action",
    "data",
    "formAction",
    "href",
    "poster",
    "src",
    "srcSet",
    "xlinkHref",
  ]);
  const forbiddenCalls = new Set([
    "atob",
    "btoa",
    "concat",
    "createElement",
    "decodeURI",
    "decodeURIComponent",
    "eval",
    "fromCharCode",
    "join",
    "raw",
    "reduce",
    "replace",
    "replaceAll",
    "toString",
  ]);
  const forbiddenPropertyAccess = new Set([
    "__proto__",
    "constructor",
    "prototype",
  ]);
  const forbiddenStyleProperties = new Set([
    "backgroundImage",
    "borderImage",
    "clipPath",
    "cursor",
    "filter",
    "listStyleImage",
    "mask",
    "maskImage",
  ]);
  let violation: string | null = null;
  const isAllowedDeclarativeCall = (node: ts.CallExpression) => {
    if (
      (role === "cover-4x3" || role === "cover-3x4") &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "map" &&
      ts.isArrayLiteralExpression(node.expression.expression)
    ) {
      return true;
    }
    return (
      role === "index" &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "registerRoot" &&
      node.arguments.length === 1 &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[0].text === "CoverRoot"
    );
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text)) {
      violation = node.text;
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile).toLowerCase();
      if (forbiddenTags.has(tag)) violation = tag;
      for (const property of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(property)) {
          violation = "JSX spread attributes";
          continue;
        }
        const attributeName = property.name.getText(sourceFile);
        if (
          attributeName === "dangerouslySetInnerHTML" ||
          forbiddenJsxAttributes.has(attributeName)
        ) {
          violation = attributeName;
        }
      }
    }
    if (ts.isElementAccessExpression(node)) {
      violation = "computed property access";
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      forbiddenPropertyAccess.has(node.name.text)
    ) {
      violation = node.name.text;
    }
    if (ts.isNewExpression(node)) {
      violation = "runtime object construction";
    }
    if (
      ts.isVariableDeclarationList(node) &&
      (node.flags & ts.NodeFlags.Const) === 0
    ) {
      violation = "mutable variable declaration";
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
        (node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment))
    ) {
      violation = "dynamic expression or assignment";
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const callName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (callName !== null && forbiddenCalls.has(callName)) {
        violation = callName;
      }
      if (!isAllowedDeclarativeCall(node)) {
        violation = "non-declarative function call";
      }
    }
    if (ts.isTemplateExpression(node)) {
      const parent = node.parent;
      const propertyName =
        ts.isPropertyAssignment(parent) &&
        (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))
          ? parent.name.text
          : null;
      if (
        propertyName === null ||
        propertyName === "background" ||
        forbiddenStyleProperties.has(propertyName)
      ) {
        violation = "dynamic template expression";
      }
    }
    if (ts.isComputedPropertyName(node)) {
      violation = "computed property name";
    }
    if (ts.isSpreadAssignment(node)) {
      violation = "object spread";
    }
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) {
        violation = "computed property name";
        ts.forEachChild(node, visit);
        return;
      }
      if (
        !ts.isIdentifier(node.name) &&
        !ts.isStringLiteral(node.name) &&
        !ts.isNumericLiteral(node.name)
      ) {
        violation = "unsupported property name";
        ts.forEachChild(node, visit);
        return;
      }
      const propertyName = node.name.text;
      if (forbiddenStyleProperties.has(propertyName)) {
        violation = propertyName;
      }
      if (
        propertyName === "background" &&
        (ts.isTemplateExpression(node.initializer) ||
          ts.isTaggedTemplateExpression(node.initializer) ||
          ts.isCallExpression(node.initializer) ||
          ts.isElementAccessExpression(node.initializer) ||
          (ts.isBinaryExpression(node.initializer) &&
            node.initializer.operatorToken.kind === ts.SyntaxKind.PlusToken))
      ) {
        violation = "dynamic background";
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (violation !== null) {
    throw new Error(`Cover source crosses its code-only boundary: ${violation}.`);
  }
};

export const validateDeliveryCoverSource = ({
  sourcePath,
  source,
  role,
  compositionId,
}: {
  readonly sourcePath: string;
  readonly source: string;
  readonly role: DeliveryCoverSourceRole;
  readonly compositionId: string;
}) => {
  const sourceFile = parseSource(sourcePath, source);
  assertForbiddenSource(sourceFile, source, role);
  const guarded = assertGuardedSource({
    source,
    sourcePath,
    allowedBarePackages: new Map([
      ["react", "19.2.3"],
      ["remotion", "4.0.489"],
    ]),
    relativeRoot: "src",
  });
  const imports = importSpecifiers(sourceFile);
  if (role === "cover-4x3" || role === "cover-3x4") {
    if (!hasDefaultExport(sourceFile)) {
      throw new Error("Each Cover variant must own a default component export.");
    }
    if (guarded.relativeImports.length > 0) {
      throw new Error(
        "Cover variants must be independently authored and cannot share source.",
      );
    }
    return { compositions: [] as readonly CoverCompositionDeclaration[] };
  }
  if (role === "root") {
    if (
      JSON.stringify(imports) !==
      JSON.stringify(["remotion", "./Cover4x3", "./Cover3x4"])
    ) {
      throw new Error("Cover Root must import the two independent components directly.");
    }
    return {
      compositions: collectCompositions({ sourceFile, compositionId }),
    };
  }
  if (
    JSON.stringify(imports) !== JSON.stringify(["remotion", "./Root"])
  ) {
    throw new Error("Cover entry must register only the fixed Cover Root.");
  }
  let registersRoot = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "registerRoot" &&
      node.arguments.length === 1 &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[0].text === "CoverRoot"
    ) {
      registersRoot = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!registersRoot) {
    throw new Error("Cover entry must register CoverRoot exactly.");
  }
  return { compositions: [] as readonly CoverCompositionDeclaration[] };
};
