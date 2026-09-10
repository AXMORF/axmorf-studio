import ts from "typescript";

const unwrapReadabilityExpression = (
  expression: ts.Expression,
): ts.Expression => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapReadabilityExpression(expression.expression);
  }
  return expression;
};

const isBoolean = (expression: ts.Expression): boolean => {
  const node = unwrapReadabilityExpression(expression);
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken) ||
    (ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
        ts.SyntaxKind.InKeyword,
        ts.SyntaxKind.InstanceOfKeyword,
      ].includes(node.operatorToken.kind))
  );
};

const graphicTags = new Set([
  "svg",
  "g",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
]);
const nonVisibleAncestors = new Set([
  "defs",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "symbol",
  "foreignObject",
]);

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

/** Bounded syntax proofs. Symbols resolve lexical bindings; no authored code is executed. */
export const createReadabilityExpressionProof = (
  sourceFiles: readonly ts.SourceFile[],
  rendererSource: ts.SourceFile,
) => {
  const files = new Map(sourceFiles.map((file) => [file.fileName, file]));
  const program = ts.createProgram(
    [...files.keys()],
    { noLib: true, noResolve: true },
    {
      getSourceFile: (name) => files.get(name),
      getDefaultLibFileName: () => "",
      writeFile: () => {},
      getCurrentDirectory: () => "",
      getDirectories: () => [],
      fileExists: (name) => files.has(name),
      readFile: (name) => files.get(name)?.text,
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
    },
  );
  const checker = program.getTypeChecker();
  const symbolAt = (identifier: ts.Identifier) =>
    ts.isShorthandPropertyAssignment(identifier.parent) &&
    identifier.parent.name === identifier
      ? checker.getShorthandAssignmentValueSymbol(identifier.parent)
      : checker.getSymbolAtLocation(identifier);
  const constantDeclaration = (identifier: ts.Identifier) => {
    const declarations = symbolAt(identifier)?.declarations;
    const declaration =
      declarations?.length === 1 ? declarations[0] : undefined;
    return declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      ts.isVariableDeclarationList(declaration.parent) &&
      (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
      declaration.initializer !== undefined
      ? declaration
      : null;
  };
  const hasOnlyReferences = (
    declaration:
      | ts.VariableDeclaration
      | ts.ParameterDeclaration
      | ts.BindingElement,
    accept: (reference: ts.Identifier) => boolean,
  ) => {
    const symbol = checker.getSymbolAtLocation(declaration.name);
    let safe = true;
    const visit = (reference: ts.Node) => {
      if (
        ts.isIdentifier(reference) &&
        reference !== declaration.name &&
        symbolAt(reference) === symbol
      ) {
        if (!accept(reference)) safe = false;
      }
      if (safe) ts.forEachChild(reference, visit);
    };
    visit(declaration.getSourceFile());
    return safe;
  };
  const inspectableMapCallback = (
    call: ts.CallExpression,
  ): ts.ArrowFunction | null => {
    const callback = call.arguments[0];
    return call.arguments.length === 1 &&
      callback !== undefined &&
      ts.isArrowFunction(callback) &&
      callback.parameters.length <= 2 &&
      !callback.parameters.some(
        (parameter) => parameter.dotDotDotToken !== undefined,
      ) &&
      !callback.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
      )
      ? callback
      : null;
  };
  const isLiteralArray = (expression: ts.Expression): boolean => {
    const node = unwrapReadabilityExpression(expression);
    if (ts.isArrayLiteralExpression(node)) return true;
    if (!ts.isIdentifier(node)) return false;
    const declaration = constantDeclaration(node);
    if (
      declaration?.initializer === undefined ||
      !ts.isArrayLiteralExpression(
        unwrapReadabilityExpression(declaration.initializer),
      )
    )
      return false;
    return hasOnlyReferences(declaration, (reference) => {
      const parent = reference.parent;
      return (
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === reference &&
        ((parent.name.text === "map" &&
          ts.isCallExpression(parent.parent) &&
          parent.parent.expression === parent &&
          inspectableMapCallback(parent.parent) !== null) ||
          (parent.name.text === "length" && !isWritten(reference)))
      );
    });
  };

  const styleObject = (
    expression: ts.Expression,
  ): ts.ObjectLiteralExpression | null => {
    const node = unwrapReadabilityExpression(expression);
    if (ts.isObjectLiteralExpression(node)) return node;
    if (!ts.isIdentifier(node)) return null;
    const declaration = constantDeclaration(node);
    if (
      declaration?.initializer === undefined ||
      !hasOnlyReferences(declaration, (reference) => {
        const parent = reference.parent;
        return (
          (ts.isJsxExpression(parent) &&
            ts.isJsxAttribute(parent.parent) &&
            parent.parent.name.getText() === "style") ||
          ((ts.isSpreadAssignment(parent) || ts.isJsxSpreadAttribute(parent)) &&
            parent.expression === reference)
        );
      })
    )
      return null;
    const initializer = unwrapReadabilityExpression(declaration.initializer);
    return ts.isObjectLiteralExpression(initializer) ? initializer : null;
  };
  const styleProperty = (
    expression: ts.Expression,
    name: string,
    seen = new Set<ts.Node>(),
  ): ts.Expression | null | undefined => {
    const object = styleObject(expression);
    if (object === null || seen.has(object)) return undefined;
    const next = new Set(seen).add(object);
    for (const property of [...object.properties].reverse()) {
      // An unknown spread may replace either transform or scale. Do not infer
      // safe values from an earlier property or from a different lexical binding.
      if (ts.isSpreadAssignment(property)) {
        const nested = styleProperty(property.expression, name, next);
        if (nested !== null) return nested;
        continue;
      }
      if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
        return undefined;
      if (property.name.text !== name) continue;
      if (ts.isPropertyAssignment(property)) return property.initializer;
      if (ts.isShorthandPropertyAssignment(property)) return property.name;
      return undefined;
    }
    return null;
  };

  const jsxProperty = (
    attributes: ts.JsxAttributes,
    name: string,
  ): ts.Expression | null | undefined => {
    for (const property of [...attributes.properties].reverse()) {
      if (ts.isJsxSpreadAttribute(property)) {
        const nested = styleProperty(property.expression, name);
        if (nested !== null) return nested;
        continue;
      }
      if (property.name.getText() !== name) continue;
      if (property.initializer === undefined) return undefined;
      if (ts.isStringLiteral(property.initializer)) return property.initializer;
      return ts.isJsxExpression(property.initializer)
        ? property.initializer.expression
        : undefined;
    }
    return null;
  };
  const childrenAre = (
    children: readonly ts.JsxChild[],
    acceptElement: (node: JsxNode) => boolean,
  ): boolean =>
    children.every((child) => {
      if (ts.isJsxText(child)) return child.text.trim().length === 0;
      if (ts.isJsxExpression(child))
        return (
          child.expression === undefined ||
          expressionIs(child.expression, acceptElement)
        );
      if (ts.isJsxFragment(child))
        return childrenAre(child.children, acceptElement);
      return acceptElement(child);
    });
  const blockReturnsAre = (
    block: ts.Block,
    acceptElement: (node: JsxNode) => boolean,
  ): boolean => {
    const statementIs = (statement: ts.Statement): boolean => {
      if (ts.isReturnStatement(statement))
        return (
          statement.expression === undefined ||
          expressionIs(statement.expression, acceptElement)
        );
      if (ts.isBlock(statement)) return statement.statements.every(statementIs);
      if (ts.isIfStatement(statement))
        return (
          statementIs(statement.thenStatement) &&
          (statement.elseStatement === undefined ||
            statementIs(statement.elseStatement))
        );
      return (
        ts.isVariableStatement(statement) ||
        ts.isExpressionStatement(statement) ||
        ts.isEmptyStatement(statement)
      );
    };
    // Unsupported control flow is not inferred. Falling off the block returns undefined.
    return block.statements.every(statementIs);
  };
  const expressionIs = (
    expression: ts.Expression,
    acceptElement: (node: JsxNode) => boolean,
  ): boolean => {
    const node = unwrapReadabilityExpression(expression);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
      return acceptElement(node);
    if (ts.isJsxFragment(node))
      return childrenAre(node.children, acceptElement);
    if (
      node.kind === ts.SyntaxKind.NullKeyword ||
      isBoolean(node) ||
      ts.isVoidExpression(node)
    )
      return true;
    if (ts.isConditionalExpression(node))
      return (
        expressionIs(node.whenTrue, acceptElement) &&
        expressionIs(node.whenFalse, acceptElement)
      );
    if (ts.isArrayLiteralExpression(node))
      return node.elements.every(
        (element) =>
          !ts.isSpreadElement(element) && expressionIs(element, acceptElement),
      );
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return isBoolean(node.left) && expressionIs(node.right, acceptElement);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "map" &&
      isLiteralArray(node.expression.expression)
    ) {
      const callback = inspectableMapCallback(node);
      if (callback === null) return false;
      return ts.isBlock(callback.body)
        ? blockReturnsAre(callback.body, acceptElement)
        : expressionIs(callback.body, acceptElement);
    }
    return false;
  };
  const isGraphicElement = (node: JsxNode): boolean => {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (
      !graphicTags.has(opening.tagName.getText()) ||
      opening.attributes.properties.some(
        (attribute) =>
          ts.isJsxSpreadAttribute(attribute) ||
          ["children", "dangerouslySetInnerHTML", "ref"].includes(
            attribute.name.getText(),
          ),
      )
    )
      return false;
    return (
      !ts.isJsxElement(node) || childrenAre(node.children, isGraphicElement)
    );
  };
  const isGraphicsOnly = (node: JsxNode): boolean => {
    for (
      let parent: ts.Node | undefined = node.parent;
      parent !== undefined;
      parent = parent.parent
    ) {
      if (
        ts.isJsxElement(parent) &&
        nonVisibleAncestors.has(parent.openingElement.tagName.getText())
      )
        return false;
    }
    return isGraphicElement(node);
  };
  const importedName = (
    identifier: ts.Identifier,
    module: string,
  ): string | null => {
    const declarations = symbolAt(identifier)?.declarations;
    const declaration =
      declarations?.length === 1 ? declarations[0] : undefined;
    if (declaration === undefined || !ts.isImportSpecifier(declaration))
      return null;
    const imported = declaration.parent.parent.parent;
    return ts.isImportDeclaration(imported) &&
      ts.isStringLiteral(imported.moduleSpecifier) &&
      imported.moduleSpecifier.text === module
      ? (declaration.propertyName ?? declaration.name).text
      : null;
  };
  const isWritten = (reference: ts.Identifier): boolean => {
    let current: ts.Node = reference;
    for (
      let parent = current.parent;
      parent !== undefined &&
      !ts.isFunctionLike(parent) &&
      !ts.isStatement(parent) &&
      !ts.isSourceFile(parent);
      current = parent, parent = parent.parent
    ) {
      if (
        ts.isBinaryExpression(parent) &&
        parent.left === current &&
        parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      )
        return true;
      if (
        (ts.isPrefixUnaryExpression(parent) ||
          ts.isPostfixUnaryExpression(parent)) &&
        (parent.operator === ts.SyntaxKind.PlusPlusToken ||
          parent.operator === ts.SyntaxKind.MinusMinusToken)
      )
        return true;
    }
    return false;
  };
  const isSceneParameter = (parameter: ts.ParameterDeclaration): boolean => {
    if (
      parameter.getSourceFile() !== rendererSource ||
      parameter.type === undefined ||
      !ts.isTypeReferenceNode(parameter.type) ||
      !ts.isIdentifier(parameter.type.typeName) ||
      importedName(parameter.type.typeName, "@axmorf/studio/remotion") !==
        "SceneRendererProps"
    )
      return false;
    const renderer = parameter.parent;
    if (
      !ts.isArrowFunction(renderer) ||
      !ts.isVariableDeclaration(renderer.parent)
    )
      return false;
    const exported = parameter
      .getSourceFile()
      .statements.find(ts.isExportAssignment);
    return (
      exported !== undefined &&
      ts.isIdentifier(exported.expression) &&
      checker.getSymbolAtLocation(exported.expression) ===
        checker.getSymbolAtLocation(renderer.parent.name)
    );
  };
  const numericSceneFields = new Set([
    "sceneFrame",
    "durationInFrames",
    "fps",
    "viewportWidth",
    "viewportHeight",
  ]);
  const isSceneNumber = (node: ts.Expression): boolean => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const declaration = checker.getSymbolAtLocation(
        node.expression,
      )?.valueDeclaration;
      return (
        numericSceneFields.has(node.name.text) &&
        declaration !== undefined &&
        ts.isParameter(declaration) &&
        isSceneParameter(declaration) &&
        hasOnlyReferences(
          declaration,
          (reference) =>
            ts.isPropertyAccessExpression(reference.parent) &&
            reference.parent.expression === reference &&
            !isWritten(reference),
        )
      );
    }
    if (!ts.isIdentifier(node)) return false;
    const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
    if (
      declaration === undefined ||
      !ts.isBindingElement(declaration) ||
      declaration.dotDotDotToken !== undefined ||
      !ts.isObjectBindingPattern(declaration.parent) ||
      !ts.isParameter(declaration.parent.parent)
    )
      return false;
    const field = declaration.propertyName ?? declaration.name;
    return (
      ts.isIdentifier(field) &&
      numericSceneFields.has(field.text) &&
      declaration.initializer === undefined &&
      isSceneParameter(declaration.parent.parent) &&
      hasOnlyReferences(declaration, (reference) => !isWritten(reference))
    );
  };
  const isNumeric = (
    expression: ts.Expression,
    seen = new Set<ts.Node>(),
  ): boolean => {
    const node = unwrapReadabilityExpression(expression);
    if (seen.has(node)) return false;
    const next = new Set(seen).add(node);
    if (ts.isNumericLiteral(node) || isSceneNumber(node)) return true;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["interpolate", "spring"].includes(
        importedName(node.expression, "remotion") ?? "",
      )
    )
      return true;
    if (ts.isPrefixUnaryExpression(node))
      return [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.TildeToken,
      ].includes(node.operator);
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken)
        return isNumeric(node.left, next) && isNumeric(node.right, next);
      return [
        ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.AsteriskToken,
        ts.SyntaxKind.SlashToken,
        ts.SyntaxKind.PercentToken,
        ts.SyntaxKind.AsteriskAsteriskToken,
        ts.SyntaxKind.AmpersandToken,
        ts.SyntaxKind.BarToken,
        ts.SyntaxKind.CaretToken,
        ts.SyntaxKind.LessThanLessThanToken,
        ts.SyntaxKind.GreaterThanGreaterThanToken,
        ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
      ].includes(node.operatorToken.kind);
    }
    if (ts.isConditionalExpression(node))
      return isNumeric(node.whenTrue, next) && isNumeric(node.whenFalse, next);
    const initializer = ts.isIdentifier(node)
      ? constantDeclaration(node)?.initializer
      : undefined;
    return initializer !== undefined && isNumeric(initializer, next);
  };
  const staticValue = (
    expression: ts.Expression,
    seen = new Set<ts.Node>(),
  ): string | number | null => {
    const node = unwrapReadabilityExpression(expression);
    if (seen.has(node)) return null;
    const next = new Set(seen).add(node);
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      return node.text;
    if (
      ts.isPrefixUnaryExpression(node) &&
      ts.isNumericLiteral(node.operand) &&
      (node.operator === ts.SyntaxKind.PlusToken ||
        node.operator === ts.SyntaxKind.MinusToken)
    ) {
      return (
        Number(node.operand.text) *
        (node.operator === ts.SyntaxKind.MinusToken ? -1 : 1)
      );
    }
    const initializer = ts.isIdentifier(node)
      ? constantDeclaration(node)?.initializer
      : undefined;
    return initializer === undefined ? null : staticValue(initializer, next);
  };
  const transformText = (
    expression: ts.Expression,
    seen = new Set<ts.Node>(),
  ): string | null => {
    const node = unwrapReadabilityExpression(expression);
    if (seen.has(node)) return null;
    const next = new Set(seen).add(node);
    const literal = staticValue(node);
    if (literal !== null)
      return String(literal).includes("@") ? null : String(literal);
    if (ts.isTemplateExpression(node)) {
      if (
        node.head.text.includes("@") ||
        !node.templateSpans.every(
          (span) =>
            !span.literal.text.includes("@") && isNumeric(span.expression),
        )
      )
        return null;
      // A reserved numeric marker distinguishes dynamic magnitudes from literal
      // scale values. Authored strings cannot supply or inject this token.
      return (
        node.head.text +
        node.templateSpans.map((span) => `@${span.literal.text}`).join("")
      );
    }
    const initializer = ts.isIdentifier(node)
      ? constantDeclaration(node)?.initializer
      : undefined;
    return initializer === undefined ? null : transformText(initializer, next);
  };
  return {
    hasVisibleTextChild: (node: JsxNode) => {
      if (
        ts.isJsxElement(node) &&
        node.children.some((child) =>
          ts.isJsxText(child)
            ? child.text.trim().length > 0
            : !ts.isJsxExpression(child) || child.expression !== undefined,
        )
      )
        return !childrenAre(node.children, () => true);
      const attributes = ts.isJsxElement(node)
        ? node.openingElement.attributes
        : node.attributes;
      const child = jsxProperty(attributes, "children");
      return (
        child === undefined ||
        (child !== null && !expressionIs(child, () => true))
      );
    },
    jsxProperty,
    isGraphicsOnly,
    transformText,
    styleProperty,
    staticValue,
  };
};
