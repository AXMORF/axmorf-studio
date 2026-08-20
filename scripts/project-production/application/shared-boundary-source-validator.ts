import ts from "typescript";

import { createFingerprint } from "../../../src/contracts/fingerprint";
import { SCENE_COMPOSITION_BOUNDARY_VERSION } from "../../../src/contracts/authoring-requirements";

const parseTsx = (fileName: string, source: string) => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      readonly parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (parseDiagnostics !== undefined && parseDiagnostics.length > 0) {
    throw new Error(`Shared Scene boundary source is malformed: ${fileName}.`);
  }
  return sourceFile;
};

const importedLocalName = ({
  sourceFile,
  moduleSuffix,
  exportedName,
}: {
  readonly sourceFile: ts.SourceFile;
  readonly moduleSuffix: string;
  readonly exportedName: string;
}) => {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith(moduleSuffix)
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    const binding = bindings.elements.find(
      (element) => (element.propertyName ?? element.name).text === exportedName,
    );
    if (binding !== undefined) return binding.name.text;
  }
  return null;
};

const hasJsxTag = (sourceFile: ts.SourceFile, localName: string) => {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === localName
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

const hasNode = (root: ts.Node, predicate: (node: ts.Node) => boolean) => {
  let found = false;
  const visit = (node: ts.Node) => {
    if (predicate(node)) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
};

const hasPropertyName = (sourceFile: ts.SourceFile, name: string) =>
  hasNode(sourceFile, (node) => {
    if (ts.isPropertyAccessExpression(node)) return node.name.text === name;
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isBindingElement(node)) &&
      node.name !== undefined
    ) {
      const declaredName =
        ts.isBindingElement(node) && node.propertyName !== undefined
          ? node.propertyName
          : node.name;
      return declaredName.getText(sourceFile) === name;
    }
    return false;
  });

const unwrapExpression = (expression: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(expression) ||
  ts.isAsExpression(expression) ||
  ts.isSatisfiesExpression(expression)
    ? unwrapExpression(expression.expression)
    : expression;

const hasStringConstant = (
  sourceFile: ts.SourceFile,
  name: string,
  value: string,
) =>
  sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .some((declaration) => {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== name ||
        declaration.initializer === undefined
      ) {
        return false;
      }
      const initializer = unwrapExpression(declaration.initializer);
      return ts.isStringLiteral(initializer) && initializer.text === value;
    });

const bindingLocalName = (
  pattern: ts.ObjectBindingPattern,
  propertyName: string,
) => {
  const binding = pattern.elements.find((element) => {
    if (element.dotDotDotToken !== undefined) return false;
    return (element.propertyName ?? element.name).getText() === propertyName;
  });
  return binding !== undefined && ts.isIdentifier(binding.name)
    ? binding.name.text
    : null;
};

const bindingRestName = (pattern: ts.ObjectBindingPattern) => {
  const binding = pattern.elements.find(
    (element) => element.dotDotDotToken !== undefined,
  );
  return binding !== undefined && ts.isIdentifier(binding.name)
    ? binding.name.text
    : null;
};

const findObjectBinding = (
  statements: readonly ts.Statement[],
  propertyName: string,
  initializerName?: string,
) => {
  for (const statement of statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isObjectBindingPattern(declaration.name) ||
        declaration.initializer === undefined ||
        (initializerName !== undefined &&
          declaration.initializer.getText() !== initializerName)
      ) {
        continue;
      }
      const localName = bindingLocalName(declaration.name, propertyName);
      const restName = bindingRestName(declaration.name);
      if (localName !== null && restName !== null) {
        return { localName, restName } as const;
      }
    }
  }
  return null;
};

const findJsxAttributeExpression = (
  attributes: ts.JsxAttributes,
  name: string,
) => {
  const attribute = attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
  if (
    attribute === undefined ||
    !ts.isJsxAttribute(attribute) ||
    attribute.initializer === undefined ||
    !ts.isJsxExpression(attribute.initializer) ||
    attribute.initializer.expression === undefined
  ) {
    return null;
  }
  return attribute.initializer.expression.getText();
};

const hasJsxSpread = (attributes: ts.JsxAttributes, expressionName: string) =>
  attributes.properties.some(
    (property) =>
      ts.isJsxSpreadAttribute(property) &&
      property.expression.getText() === expressionName,
  );

const jsxRoot = (statement: ts.ReturnStatement) => {
  if (statement.expression === undefined) return null;
  const expression = unwrapExpression(statement.expression);
  return ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)
    ? expression
    : null;
};

const jsxAttributes = (node: ts.JsxElement | ts.JsxSelfClosingElement) =>
  ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;

const jsxTagName = (node: ts.JsxElement | ts.JsxSelfClosingElement) =>
  ts.isJsxElement(node)
    ? node.openingElement.tagName.getText()
    : node.tagName.getText();

const findJsxDescendant = (node: ts.Node, tagName: string) => {
  let found: ts.JsxElement | ts.JsxSelfClosingElement | null = null;
  const visit = (current: ts.Node) => {
    if (found !== null) return;
    if (
      (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) &&
      jsxTagName(current) === tagName
    ) {
      found = current;
      return;
    }
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
  return found;
};

const assertSceneSlotMountFlow = ({
  sourceFile,
  sceneSafeAreaLocal,
  boundaryVersionLocal,
}: {
  readonly sourceFile: ts.SourceFile;
  readonly sceneSafeAreaLocal: string;
  readonly boundaryVersionLocal: string;
}) => {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "renderSceneRendererMount",
  );
  const variable = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find(
      (candidate) =>
        ts.isIdentifier(candidate.name) &&
        candidate.name.text === "renderSceneRendererMount" &&
        candidate.initializer !== undefined &&
        (ts.isArrowFunction(candidate.initializer) ||
          ts.isFunctionExpression(candidate.initializer)),
    );
  const mount =
    declaration ??
    (variable?.initializer !== undefined &&
    (ts.isArrowFunction(variable.initializer) ||
      ts.isFunctionExpression(variable.initializer))
      ? variable.initializer
      : null);
  if (mount === null || mount.body === undefined || !ts.isBlock(mount.body)) {
    throw new Error("SceneSlot mount function is missing.");
  }
  const rendererName = mount.parameters[0]?.name;
  const frameName = mount.parameters[2]?.name;
  if (!ts.isIdentifier(rendererName) || !ts.isIdentifier(frameName)) {
    throw new Error("SceneSlot mount parameters are not statically named.");
  }
  const mountBinding = findObjectBinding(
    mount.body.statements,
    "sceneBoundaryVersion",
  );
  if (mountBinding === null) {
    throw new Error("SceneSlot boundary binding is missing.");
  }
  const policyBinding = findObjectBinding(
    mount.body.statements,
    "readabilityPolicy",
  );
  if (
    policyBinding === null ||
    policyBinding.restName !== mountBinding.restName
  ) {
    throw new Error("SceneSlot frozen policy binding is missing.");
  }
  const boundaryGuarded = mount.body.statements.some((statement) => {
    if (!ts.isIfStatement(statement)) return false;
    const condition = unwrapExpression(statement.expression);
    if (
      !ts.isBinaryExpression(condition) ||
      condition.operatorToken.kind !==
        ts.SyntaxKind.ExclamationEqualsEqualsToken
    ) {
      return false;
    }
    const left = condition.left.getText();
    const right = condition.right.getText();
    return (
      ((left === mountBinding.localName && right === boundaryVersionLocal) ||
        (right === mountBinding.localName && left === boundaryVersionLocal)) &&
      hasNode(statement.thenStatement, ts.isThrowStatement)
    );
  });
  const policyGuarded = mount.body.statements.some(
    (statement) =>
      ts.isIfStatement(statement) &&
      hasNode(
        statement.expression,
        (node) =>
          ts.isIdentifier(node) && node.text === policyBinding.localName,
      ) &&
      hasNode(statement.thenStatement, ts.isThrowStatement),
  );
  const wrappedReturns = mount.body.statements.filter(
    (statement): statement is ts.ReturnStatement =>
      ts.isReturnStatement(statement) && jsxRoot(statement) !== null,
  );
  if (wrappedReturns.length !== 1) {
    throw new Error("SceneSlot shared-boundary return is missing.");
  }
  const wrapper = jsxRoot(wrappedReturns[0]);
  if (
    wrapper === null ||
    jsxTagName(wrapper) !== sceneSafeAreaLocal ||
    findJsxAttributeExpression(jsxAttributes(wrapper), "policy") !==
      policyBinding.localName
  ) {
    throw new Error("SceneSlot shared-boundary policy wiring is stale.");
  }
  const wrappedRenderer = findJsxDescendant(wrapper, rendererName.text);
  if (
    !boundaryGuarded ||
    !policyGuarded ||
    wrappedRenderer === null ||
    !hasJsxSpread(jsxAttributes(wrappedRenderer), policyBinding.restName) ||
    findJsxAttributeExpression(jsxAttributes(wrappedRenderer), "sceneFrame") !==
      frameName.text
  ) {
    throw new Error("SceneSlot wrapped Renderer wiring is stale.");
  }
};

export const validateSharedSceneBoundarySources = ({
  sceneSlotSource,
  sceneSafeAreaSource,
  generatedRuntimeSource,
}: {
  readonly sceneSlotSource: string;
  readonly sceneSafeAreaSource: string;
  readonly generatedRuntimeSource: string;
}) => {
  const sceneSlot = parseTsx("SceneSlot.tsx", sceneSlotSource);
  const sceneSafeArea = parseTsx("SceneSafeArea.tsx", sceneSafeAreaSource);
  const generatedRuntime = parseTsx(
    "production-scene-runtime.generated.tsx",
    generatedRuntimeSource,
  );
  const sceneSafeAreaLocal = importedLocalName({
    sourceFile: sceneSlot,
    moduleSuffix: "/readability",
    exportedName: "SceneSafeArea",
  });
  const boundaryVersionLocal = importedLocalName({
    sourceFile: sceneSlot,
    moduleSuffix: "/contracts/authoring-requirements",
    exportedName: "SCENE_COMPOSITION_BOUNDARY_VERSION",
  });
  const providerLocal = importedLocalName({
    sourceFile: sceneSafeArea,
    moduleSuffix: "/SceneReadability",
    exportedName: "SceneReadabilityProvider",
  });
  const policySchemaLocal = importedLocalName({
    sourceFile: sceneSafeArea,
    moduleSuffix: "/contracts/scene-readability",
    exportedName: "SceneReadabilityPolicySchema",
  });
  if (sceneSafeAreaLocal === null || boundaryVersionLocal === null) {
    throw new Error("SceneSlot does not structurally own the shared boundary.");
  }
  assertSceneSlotMountFlow({
    sourceFile: sceneSlot,
    sceneSafeAreaLocal,
    boundaryVersionLocal,
  });
  if (
    providerLocal === null ||
    policySchemaLocal === null ||
    !hasJsxTag(sceneSafeArea, providerLocal) ||
    !hasPropertyName(sceneSafeArea, "sceneContentSafeAreaPx") ||
    !hasPropertyName(sceneSafeArea, "policyFingerprint") ||
    !hasPropertyName(sceneSafeArea, "inset") ||
    !hasPropertyName(sceneSafeArea, "clipPath") ||
    !hasStringConstant(
      sceneSafeArea,
      "SCENE_SAFE_AREA_COORDINATE_SPACE",
      "composition-full-frame",
    ) ||
    !hasNode(
      sceneSafeArea,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(sceneSafeArea) ===
          policySchemaLocal &&
        node.expression.name.text === "parse",
    )
  ) {
    throw new Error(
      "SceneSafeArea does not structurally enforce frozen policy.",
    );
  }
  if (
    !hasPropertyName(generatedRuntime, "readabilityPolicy") ||
    !hasPropertyName(generatedRuntime, "sceneBoundaryVersion") ||
    !hasPropertyName(generatedRuntime, "sceneCompositionBoundaryVersion")
  ) {
    throw new Error(
      "Generated Scene runtime does not bind the shared boundary contract.",
    );
  }
  return {
    boundarySourceFingerprint: createFingerprint({
      namespace: "production-shared-scene-boundary-structure",
      version: 2,
      value: {
        boundaryVersion: SCENE_COMPOSITION_BOUNDARY_VERSION,
        compositionOwnsSafeArea: true,
        coordinateSpace: "composition-full-frame",
        providerConsumesFrozenPolicy: true,
        generatedRuntimeBindsPolicyAndBoundary: true,
      },
    }),
  } as const;
};
