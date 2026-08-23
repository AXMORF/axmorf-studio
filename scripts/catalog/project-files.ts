import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

import {
  ProducerAssetManifestSchema,
  ProjectAssetManifestSchema,
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
import { readProjectSourceRoot } from "../projects/root";
import {
  createWorkspaceProjectStorageLocations,
  resolveProjectOwnedLogicalPath,
  type ProjectStorageLocations,
} from "../projects/project-locations";
import type { ProductionLocations } from "../project-production/application/production-locations";

export const checksumBytes = (bytes: Buffer) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex")}`,
  );

export const readRegularFile = async (path: string): Promise<Buffer> => {
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

const validateAssetDescriptorFilesWithResolver = async (
  rawDescriptors: readonly unknown[],
  resolveLogicalPath: (logicalPath: string) => string,
): Promise<void> => {
  for (const rawDescriptor of rawDescriptors) {
    const descriptor = ResourceAssetDescriptorSchema.parse(rawDescriptor);
    const bytes = await readRegularFile(
      resolveLogicalPath(descriptor.localPath),
    );
    if (checksumBytes(bytes) !== descriptor.checksum) {
      throw new Error(`Catalog asset checksum is stale: ${descriptor.id}.`);
    }
  }
};

const withAuthorityChecksumAt = async (
  rawDescriptor: unknown,
  resolveLogicalPath: (logicalPath: string) => string,
): Promise<ResourceDescriptor> => {
  const descriptor = ResourceDescriptorSchema.parse(rawDescriptor);
  const bytes = await readRegularFile(
    resolveLogicalPath(descriptor.authority.repositoryPath),
  );
  return ResourceDescriptorSchema.parse({
    ...descriptor,
    authority: {
      ...descriptor.authority,
      sourceChecksum: checksumBytes(bytes),
    },
  });
};

export const loadProjectResourceDescriptorsFromStorage = async ({
  storage,
  projectId,
}: {
  readonly storage: ProjectStorageLocations;
  readonly projectId?: string;
}): Promise<readonly ResourceDescriptor[]> => {
  const projectsRoot = storage.projectSourceRoot;
  const projects = await readProjectSourceRoot(projectsRoot);
  const descriptors: ResourceDescriptor[] = [];
  for (const project of projects) {
    if (projectId !== undefined && project.name !== projectId) continue;
    if (project.isSymbolicLink()) {
      throw new Error(
        `Project symbolic links are not allowed: ${project.name}.`,
      );
    }
    if (!project.isDirectory()) continue;
    for (const fileName of ["assets.manifest.json", "resource-catalog.json"]) {
      const manifestPath = join(projectsRoot, project.name, fileName);
      let metadata;
      try {
        metadata = await lstat(manifestPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("Project Catalog authority must be a regular file.");
      }
      const raw = JSON.parse(await readFile(manifestPath, "utf8"));
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Project Catalog manifest is malformed.");
      }
      const record = raw as Record<string, unknown>;
      let declarations: unknown;
      if (fileName === "assets.manifest.json" && record.schemaVersion === 2) {
        const manifest = ProjectAssetManifestSchema.parse(raw);
        if (manifest.projectId !== project.name) {
          throw new Error("Project Catalog manifest identity is stale.");
        }
        declarations = manifest.assets;
      } else {
        if (
          record.schemaVersion !== 1 ||
          (record.projectId !== undefined && record.projectId !== project.name)
        ) {
          throw new Error("Project Catalog manifest identity is stale.");
        }
        declarations =
          fileName === "assets.manifest.json"
            ? record.assets
            : record.descriptors;
      }
      if (!Array.isArray(declarations)) {
        throw new Error("Project Catalog descriptor list is missing.");
      }
      const repositoryPath = `src/projects/${project.name}/${fileName}`;
      for (const declaration of declarations) {
        const descriptor = ResourceDescriptorSchema.parse(declaration);
        if (descriptor.authority.repositoryPath !== repositoryPath) {
          throw new Error(
            `Project Catalog authority is stale: ${descriptor.id}.`,
          );
        }
        descriptors.push(descriptor);
      }
    }
  }
  await validateAssetDescriptorFilesWithResolver(
    descriptors.filter(({ kind }) => kind === "asset"),
    (logicalPath) => resolveProjectOwnedLogicalPath({ storage, logicalPath }),
  );
  return descriptors;
};

export const loadWorkspaceCatalogAuthorityDescriptors = async ({
  locations,
  projectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId?: string;
}): Promise<readonly ResourceDescriptor[]> => {
  if (locations.layoutKind !== "workspace") {
    throw new Error("Workspace Catalog requires Workspace locations.");
  }
  const runtimeSourceRoot = join(locations.runtimeResources, "source");
  const runtimeSharedAssetsRoot = join(
    locations.runtimeResources,
    "shared-assets",
  );
  const storage = createWorkspaceProjectStorageLocations(locations);
  const [coreDescriptors, projectDescriptors] = await Promise.all([
    loadCoreCatalogAuthorityDescriptorsFromRuntimePack({
      sourceRoot: runtimeSourceRoot,
      sharedAssetsRoot: runtimeSharedAssetsRoot,
    }),
    loadProjectResourceDescriptorsFromStorage({ storage, projectId }),
  ]);
  const enrichedProjects = await Promise.all(
    projectDescriptors.map((descriptor) =>
      withAuthorityChecksumAt(descriptor, (logicalPath) =>
        resolveProjectOwnedLogicalPath({ storage, logicalPath }),
      ),
    ),
  );
  const descriptors = [...coreDescriptors, ...enrichedProjects];
  const ids = new Set<string>();
  for (const descriptor of descriptors) {
    ResourceIdSchema.parse(descriptor.id);
    if (ids.has(descriptor.id)) {
      throw new Error(`Duplicate Resource Catalog ID: ${descriptor.id}.`);
    }
    ids.add(descriptor.id);
  }
  return descriptors;
};

export const loadCoreCatalogAuthorityDescriptorsFromRuntimePack = async ({
  sourceRoot,
  sharedAssetsRoot,
}: {
  readonly sourceRoot: string;
  readonly sharedAssetsRoot: string;
}): Promise<readonly ResourceDescriptor[]> => {
  const manifestPath = join(
    sourceRoot,
    "src/remotion/catalog/assets.manifest.json",
  );
  const manifest = ProducerAssetManifestSchema.parse(
    JSON.parse((await readRegularFile(manifestPath)).toString("utf8")),
  );
  await validateAssetDescriptorFilesWithResolver(
    manifest.assets,
    (logicalPath) => {
      const prefix = "public/assets/";
      if (!logicalPath.startsWith(prefix)) {
        throw new Error("Runtime Pack asset path is outside shared assets.");
      }
      return join(sharedAssetsRoot, logicalPath.slice(prefix.length));
    },
  );
  await validateCapabilityDescriptorExports(sourceRoot, [
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
  return Promise.all(
    [
      ...manifest.assets,
      ...styleDescriptorDeclarations,
      ...capabilityDescriptorDeclarations,
    ].map((descriptor) =>
      withAuthorityChecksumAt(descriptor, (logicalPath) =>
        join(sourceRoot, logicalPath),
      ),
    ),
  );
};

export const readGeneratedResourceCatalogFromStorage = async (
  storage: ProjectStorageLocations,
): Promise<ResourceCatalog> => {
  const path = storage.catalogProjectionPath;
  return ResourceCatalogSchema.parse(
    JSON.parse((await readRegularFile(path)).toString("utf8")),
  );
};

export const readWorkspaceGeneratedResourceCatalog = async (
  locations: ProductionLocations,
) =>
  readGeneratedResourceCatalogFromStorage(
    createWorkspaceProjectStorageLocations(locations),
  );
