import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, posix } from "node:path";
import ts from "typescript";

import {
  ExternalReferenceSnapshotSchema,
  LocalizationManifestSchema,
  ReferenceFidelityEvidenceSchema,
  ReferenceFidelityReceiptSchema,
  ShotRecipeSelectionSchema,
  buildNotApplicableFidelityReceipt,
  buildPassFidelityReceipt,
  serializeCanonicalJson,
  type ReferenceFidelityReceipt,
} from "../../src/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "./project-files";
import { assertGuardedSource } from "./source-guard";

const containsIdentifier = (node: ts.Node, name: string): boolean => {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child) && child.text === name) found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
};

const resolveImportSpecifier = (
  importerPath: string,
  specifier: string,
): string => posix.normalize(posix.join(dirname(importerPath), specifier));

const matchesSourcePath = (resolved: string, expected: string): boolean =>
  resolved === expected ||
  `${resolved}.tsx` === expected ||
  `${resolved}.ts` === expected ||
  `${resolved}/index.tsx` === expected ||
  `${resolved}/index.ts` === expected;

export const proveRendererFrameBinding = ({
  rendererPath,
  rendererSource,
  adaptedShotPath,
  adaptedShotSource,
}: {
  readonly rendererPath: string;
  readonly rendererSource: string;
  readonly adaptedShotPath: string;
  readonly adaptedShotSource: string;
}) => {
  const allowedPackages = new Map([
    ["react", "19.2.3"],
    ["remotion", "4.0.489"],
  ]);
  assertGuardedSource({
    source: rendererSource,
    sourcePath: rendererPath,
    allowedBarePackages: allowedPackages,
    relativeRoot: dirname(rendererPath),
  });
  assertGuardedSource({
    source: adaptedShotSource,
    sourcePath: adaptedShotPath,
    allowedBarePackages: allowedPackages,
    relativeRoot: dirname(adaptedShotPath),
  });
  const rendererFile = ts.createSourceFile(
    rendererPath,
    rendererSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const matchingImports: Array<{
    readonly identifier: string;
    readonly specifier: string;
  }> = [];
  for (const statement of rendererFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !matchesSourcePath(
        resolveImportSpecifier(rendererPath, statement.moduleSpecifier.text),
        adaptedShotPath,
      )
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      throw new Error("Renderer must use an unambiguous named Shot import.");
    }
    for (const element of bindings.elements) {
      if (
        element.propertyName &&
        element.propertyName.text !== element.name.text
      ) {
        throw new Error(
          "Aliased Shot imports are not accepted as fidelity proof.",
        );
      }
      matchingImports.push({
        identifier: element.name.text,
        specifier: statement.moduleSpecifier.text,
      });
    }
  }
  if (matchingImports.length !== 1) {
    throw new Error(
      "Renderer must statically import exactly one adapted Shot binding.",
    );
  }
  const [{ identifier: componentIdentifier, specifier: importSpecifier }] =
    matchingImports;
  let derivedFrameProved = false;
  let jsxBindingCount = 0;
  const visitRenderer = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "shotFrame" &&
      node.initializer &&
      containsIdentifier(node.initializer, "sceneFrame")
    ) {
      derivedFrameProved = true;
    }
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === componentIdentifier
    ) {
      const attribute = node.attributes.properties.find(
        (property): property is ts.JsxAttribute =>
          ts.isJsxAttribute(property) &&
          property.name.getText() === "shotFrame",
      );
      if (
        attribute?.initializer &&
        ts.isJsxExpression(attribute.initializer) &&
        attribute.initializer.expression &&
        ts.isIdentifier(attribute.initializer.expression) &&
        attribute.initializer.expression.text === "shotFrame"
      ) {
        jsxBindingCount += 1;
      }
    }
    ts.forEachChild(node, visitRenderer);
  };
  visitRenderer(rendererFile);
  if (!derivedFrameProved || jsxBindingCount !== 1) {
    throw new Error(
      "Renderer must derive shotFrame from sceneFrame and pass it to one real Shot JSX instance.",
    );
  }

  const shotFile = ts.createSourceFile(
    adaptedShotPath,
    adaptedShotSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let framePropDeclared = false;
  let renderCriticalFrameUse = false;
  const visitShot = (node: ts.Node): void => {
    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "shotFrame"
    ) {
      framePropDeclared = true;
    }
    if (
      ts.isJsxAttribute(node) &&
      !node.name.getText().startsWith("data-") &&
      node.initializer &&
      containsIdentifier(node.initializer, "shotFrame")
    ) {
      renderCriticalFrameUse = true;
    }
    ts.forEachChild(node, visitShot);
  };
  visitShot(shotFile);
  if (!framePropDeclared || !renderCriticalFrameUse) {
    throw new Error(
      "Adapted Shot must consume its explicit frame prop in rendered state.",
    );
  }
  return {
    importSpecifier,
    componentIdentifier,
    sceneFrameIdentifier: "sceneFrame" as const,
    derivedFrameIdentifier: "shotFrame" as const,
    frameProp: "shotFrame" as const,
  };
};

const assertCurrentArtifact = async (
  repositoryRoot: string,
  artifact: { readonly artifactPath: string; readonly checksum: string },
) => {
  const bytes = await readExternalRegularFile(
    repositoryRoot,
    artifact.artifactPath,
  );
  if (checksumExternalBytes(bytes) !== artifact.checksum) {
    throw new Error(`Fidelity evidence is stale: ${artifact.artifactPath}.`);
  }
};

export const generateReferenceFidelityReceipt = async (rawInput: {
  readonly repositoryRoot: string;
  readonly snapshot: unknown;
  readonly localization: unknown;
  readonly selection: unknown;
  readonly evidence: unknown;
  readonly rendererPath: string;
  readonly rendererSource: string;
  readonly adaptedShotPath: string;
  readonly adaptedShotSource: string;
}): Promise<ReferenceFidelityReceipt> => {
  const selection = ShotRecipeSelectionSchema.parse(rawInput.selection);
  if (selection.selections.length === 0) {
    return buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: "empty",
    });
  }
  if (
    selection.selections.every((entry) => entry.mode === "inspiration-only")
  ) {
    return buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: "inspiration-only",
    });
  }
  if (
    !selection.selections.every(
      (entry) => entry.mode === "exact-demo-localized",
    )
  ) {
    throw new Error("Exact fidelity cannot mix selection modes.");
  }
  const snapshot = ExternalReferenceSnapshotSchema.parse(rawInput.snapshot);
  const localization = LocalizationManifestSchema.parse(rawInput.localization);
  const evidence = ReferenceFidelityEvidenceSchema.parse(rawInput.evidence);
  if (evidence.selectionFingerprint !== selection.selectionFingerprint) {
    throw new Error("Fidelity evidence targets a stale recipe selection.");
  }
  if (
    snapshot.sourceLicense.verificationStatus !== "verified" ||
    snapshot.previewMediaLicense.verificationStatus !== "verified" ||
    snapshot.sourceLicense.attributionText === null ||
    snapshot.previewMediaLicense.attributionText === null ||
    snapshot.sourceLicense.sourceEvidenceFingerprint === null ||
    snapshot.previewMediaLicense.sourceEvidenceFingerprint === null
  ) {
    throw new Error("Current code and preview authorization is required.");
  }
  if (
    evidence.items.length !== selection.selections.length ||
    selection.selections.length !== 1
  ) {
    throw new Error(
      "Reference fidelity requires one ordered evidence item per exact selection.",
    );
  }
  const rendererBytes = await readExternalRegularFile(
    rawInput.repositoryRoot,
    rawInput.rendererPath,
  );
  const adaptedShotBytes = await readExternalRegularFile(
    rawInput.repositoryRoot,
    rawInput.adaptedShotPath,
  );
  if (
    rendererBytes.toString("utf8") !== rawInput.rendererSource ||
    adaptedShotBytes.toString("utf8") !== rawInput.adaptedShotSource
  ) {
    throw new Error(
      "Fidelity source inputs are not the current repository bytes.",
    );
  }
  if (
    !rawInput.adaptedShotPath.startsWith(
      `${dirname(rawInput.rendererPath)}/shots/`,
    )
  ) {
    throw new Error(
      "Adapted Shot must remain inside the owning Scene directory.",
    );
  }
  const binding = proveRendererFrameBinding(rawInput);
  const localizedSourceChecksums = [];
  for (const file of localization.files.filter(
    (entry) => entry.kind === "source",
  )) {
    const sourcePath = `${localization.targetRoot}/${file.destinationPath}`;
    const bytes = await readExternalRegularFile(
      rawInput.repositoryRoot,
      sourcePath,
    );
    const checksum = checksumExternalBytes(bytes);
    if (checksum !== file.localizedChecksum) {
      throw new Error(`Localized baseline source is stale: ${sourcePath}.`);
    }
    localizedSourceChecksums.push({ sourcePath, checksum });
  }
  const entry = selection.selections[0];
  const card = snapshot.index.cards.find(
    (candidate) =>
      candidate.cardId === entry.cardId &&
      candidate.styleKey === entry.styleKey,
  );
  if (
    !card ||
    entry.snapshotFingerprint !== snapshot.snapshotFingerprint ||
    entry.cardFingerprint !== card.cardFingerprint ||
    entry.styleFingerprint !== card.styleFingerprint ||
    entry.cardDocumentChecksum !== card.cardDocumentChecksum ||
    entry.demoSourceChecksum !== card.demoSourceChecksum ||
    entry.previewChecksum !== card.previewChecksum ||
    entry.closureFingerprint !== localization.closureFingerprint ||
    entry.localizationFingerprint !== localization.localizationFingerprint ||
    localization.snapshotFingerprint !== snapshot.snapshotFingerprint
  ) {
    throw new Error("Exact recipe lineage or localized identity is stale.");
  }
  const evidenceItem = evidence.items[0];
  if (evidenceItem.sourcePreview.checksum !== entry.previewChecksum) {
    throw new Error(
      "Source preview evidence does not match the exact selection.",
    );
  }
  await Promise.all([
    assertCurrentArtifact(rawInput.repositoryRoot, evidenceItem.sourcePreview),
    assertCurrentArtifact(
      rawInput.repositoryRoot,
      evidenceItem.adaptationPreview,
    ),
    ...evidenceItem.phasePairs.flatMap((pair) => [
      assertCurrentArtifact(rawInput.repositoryRoot, pair.sourceEvidence),
      assertCurrentArtifact(rawInput.repositoryRoot, pair.adaptationEvidence),
    ]),
  ]);
  return buildPassFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    items: [
      {
        selectionIndex: 0,
        snapshotFingerprint: entry.snapshotFingerprint,
        cardFingerprint: entry.cardFingerprint,
        styleFingerprint: entry.styleFingerprint,
        cardDocumentChecksum: entry.cardDocumentChecksum,
        demoSourceChecksum: entry.demoSourceChecksum,
        previewChecksum: entry.previewChecksum,
        closureFingerprint: entry.closureFingerprint,
        localizationFingerprint: entry.localizationFingerprint,
        localizedSourceChecksums,
        sourceLicenseEvidenceFingerprint:
          snapshot.sourceLicense.sourceEvidenceFingerprint,
        previewLicenseEvidenceFingerprint:
          snapshot.previewMediaLicense.sourceEvidenceFingerprint,
        rendererBinding: {
          rendererPath: rawInput.rendererPath,
          rendererSourceChecksum: checksumExternalBytes(rendererBytes),
          adaptedShotPath: rawInput.adaptedShotPath,
          adaptedShotSourceChecksum: checksumExternalBytes(adaptedShotBytes),
          ...binding,
        },
        evidenceItemFingerprint: evidenceItem.itemFingerprint,
      },
    ],
  });
};

export const writeReferenceFidelityReceiptAtomic = async ({
  destination,
  receipt: rawReceipt,
}: {
  readonly destination: string;
  readonly receipt: unknown;
}): Promise<void> => {
  const receipt = ReferenceFidelityReceiptSchema.parse(rawReceipt);
  const contents = `${serializeCanonicalJson(receipt)}\n`;
  try {
    if ((await readFile(destination, "utf8")) === contents) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};
