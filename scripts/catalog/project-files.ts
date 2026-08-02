import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

import {
  ProducerAssetManifestSchema,
  ResourceAssetDescriptorSchema,
  ResourceDescriptorSchema,
  ResourceIdSchema,
  ResourceCatalogSchema,
  Sha256DigestSchema,
  type ResourceDescriptor,
  type ResourceCatalog,
} from "../../src/contracts";
import { capabilityDescriptorDeclarations } from "../../src/remotion/catalog/capability-descriptors";
import { styleDescriptorDeclarations } from "../../src/remotion/catalog/style-descriptors";
import { producerStyleProfileIds } from "../../src/remotion/capabilities/styles";

const checksumBytes = (bytes: Buffer) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex")}`,
  );

const readRegularFile = async (path: string): Promise<Buffer> => {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("Catalog authority must be a regular non-symbolic file.");
  }
  return readFile(path);
};

const collectExportNames = (source: string, fileName: string): Set<string> => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    const exported = ts
      .getModifiers(statement as ts.HasModifiers)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
    if (
      exported &&
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      }
    }
  }
  return names;
};

export const validateCapabilityDescriptorExports = async (
  rootDir: string,
  rawDescriptors: readonly unknown[],
): Promise<void> => {
  for (const rawDescriptor of rawDescriptors) {
    const descriptor = ResourceDescriptorSchema.parse(rawDescriptor);
    if (
      descriptor.kind !== "capability" &&
      descriptor.kind !== "style-profile"
    ) {
      throw new Error("Only source descriptors have export identities.");
    }
    const absolutePath = join(rootDir, descriptor.sourceFile);
    const source = (await readRegularFile(absolutePath)).toString("utf8");
    if (!collectExportNames(source, absolutePath).has(descriptor.exportName)) {
      throw new Error(`Catalog export identity is stale: ${descriptor.id}.`);
    }
  }
};

export const validateAssetDescriptorFiles = async (
  rootDir: string,
  rawDescriptors: readonly unknown[],
): Promise<void> => {
  for (const rawDescriptor of rawDescriptors) {
    const descriptor = ResourceAssetDescriptorSchema.parse(rawDescriptor);
    const bytes = await readRegularFile(join(rootDir, descriptor.localPath));
    if (checksumBytes(bytes) !== descriptor.checksum) {
      throw new Error(`Catalog asset checksum is stale: ${descriptor.id}.`);
    }
  }
};

const withAuthorityChecksum = async (
  rootDir: string,
  rawDescriptor: unknown,
): Promise<ResourceDescriptor> => {
  const descriptor = ResourceDescriptorSchema.parse(rawDescriptor);
  const bytes = await readRegularFile(
    join(rootDir, descriptor.authority.repositoryPath),
  );
  return ResourceDescriptorSchema.parse({
    ...descriptor,
    authority: {
      ...descriptor.authority,
      sourceChecksum: checksumBytes(bytes),
    },
  });
};

export const loadCatalogAuthorityDescriptors = async (
  rootDir: string,
): Promise<readonly ResourceDescriptor[]> => {
  const manifestPath = join(
    rootDir,
    "src/remotion/catalog/assets.manifest.json",
  );
  const rawManifest = JSON.parse(
    (await readRegularFile(manifestPath)).toString("utf8"),
  );
  const manifest = ProducerAssetManifestSchema.parse(rawManifest);
  await validateAssetDescriptorFiles(rootDir, manifest.assets);
  await validateCapabilityDescriptorExports(rootDir, [
    ...styleDescriptorDeclarations,
    ...capabilityDescriptorDeclarations,
  ]);
  const styleIds = styleDescriptorDeclarations.map(
    (descriptor) => descriptor.styleProfileId,
  );
  if (
    styleIds.length !== producerStyleProfileIds.length ||
    styleIds.some((id, index) => id !== producerStyleProfileIds[index])
  ) {
    throw new Error("Catalog style profile identities are stale.");
  }
  const descriptors = [
    ...manifest.assets,
    ...styleDescriptorDeclarations,
    ...capabilityDescriptorDeclarations,
  ];
  const enriched = await Promise.all(
    descriptors.map((descriptor) => withAuthorityChecksum(rootDir, descriptor)),
  );
  const ids = new Set<string>();
  for (const descriptor of enriched) {
    ResourceIdSchema.parse(descriptor.id);
    if (ids.has(descriptor.id)) {
      throw new Error(`Duplicate Resource Catalog ID: ${descriptor.id}.`);
    }
    ids.add(descriptor.id);
  }
  return enriched;
};

export const readGeneratedResourceCatalog = async (
  rootDir: string,
): Promise<ResourceCatalog> => {
  const path = join(
    rootDir,
    "src/remotion/catalog/resource-catalog.generated.json",
  );
  return ResourceCatalogSchema.parse(
    JSON.parse((await readRegularFile(path)).toString("utf8")),
  );
};
