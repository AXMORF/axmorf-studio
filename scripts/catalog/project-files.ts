import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
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
} from "@axmorf/studio/contracts";
import {
  WORKSPACE_CAPABILITY_FACADE_SOURCE,
  WORKSPACE_REMOTION_FACADE_PATH,
  capabilityDescriptorDeclarations,
} from "../../packages/studio/src/remotion/catalog/capability-descriptors";
import {
  WORKSPACE_STYLE_FACADE_PATH,
  WORKSPACE_STYLE_FACADE_SOURCE,
  styleDescriptorDeclarations,
} from "../../packages/studio/src/remotion/catalog/style-descriptors";
import { producerStyleProfileIds } from "../../packages/studio/src/remotion/capabilities/styles";
import { readLocalProjectRoot } from "../projects/root";

export const LOCAL_REFERENCE_ASSET_MANIFEST_PATH =
  "private/reference-assets/assets.manifest.json";
export const LOCAL_REFERENCE_ASSET_LICENSE_EVIDENCE_PATH =
  "private/reference-assets/MIXKIT_AUDIO_LICENSE.md";
export const CORE_ASSET_MANIFEST_PATH =
  "src/remotion/catalog/assets.manifest.json";

const LOCAL_REFERENCE_AUDIO_ROLES = new Set([
  "sound-effect",
  "background-music",
]);

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

const validateWorkspaceRuntimeFacades = async (rootDir: string) => {
  for (const [path, expected] of [
    [WORKSPACE_REMOTION_FACADE_PATH, WORKSPACE_CAPABILITY_FACADE_SOURCE],
    [WORKSPACE_STYLE_FACADE_PATH, WORKSPACE_STYLE_FACADE_SOURCE],
  ] as const) {
    const actual = await readRegularFile(join(rootDir, path));
    if (actual.toString("utf8") !== expected) {
      throw new Error(`Workspace runtime facade is stale: ${path}.`);
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

const toRepositoryPath = (rootDir: string, path: string) =>
  relative(rootDir, path).split(sep).join(posix.sep);

export const loadProjectResourceDescriptors = async (
  rootDir: string,
  projectId?: string,
): Promise<readonly ResourceDescriptor[]> => {
  const projectsRoot = join(rootDir, "src/projects");
  const projects = await readLocalProjectRoot(rootDir);
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
      const repositoryPath = toRepositoryPath(rootDir, manifestPath);
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
  await validateAssetDescriptorFiles(
    rootDir,
    descriptors.filter(({ kind }) => kind === "asset"),
  );
  return descriptors;
};

export const loadLocalReferenceAssetDescriptors = async (
  rootDir: string,
): Promise<readonly ResourceDescriptor[]> => {
  const manifestPath = join(rootDir, LOCAL_REFERENCE_ASSET_MANIFEST_PATH);
  let metadata;
  try {
    metadata = await lstat(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(
      "Local reference asset manifest must be a regular non-symbolic file.",
    );
  }
  const manifest = ProducerAssetManifestSchema.parse(
    JSON.parse((await readFile(manifestPath, "utf8")).toString()),
  );
  const licenseEvidenceChecksum = checksumBytes(
    await readRegularFile(
      join(rootDir, LOCAL_REFERENCE_ASSET_LICENSE_EVIDENCE_PATH),
    ),
  );
  for (const descriptor of manifest.assets) {
    if (
      descriptor.authority.repositoryPath !==
      LOCAL_REFERENCE_ASSET_MANIFEST_PATH
    ) {
      throw new Error(
        `Local reference asset authority is stale: ${descriptor.id}.`,
      );
    }
    if (
      descriptor.assetKind !== "audio" ||
      !LOCAL_REFERENCE_AUDIO_ROLES.has(descriptor.mediaRole) ||
      descriptor.allowedUse !== "localize-asset" ||
      !descriptor.localPath.startsWith("public/assets/library/")
    ) {
      throw new Error(
        `Local reference asset scope is invalid: ${descriptor.id}.`,
      );
    }
    if (
      descriptor.license.sourceEvidenceFingerprint !== licenseEvidenceChecksum
    ) {
      throw new Error(
        `Local reference asset license evidence is stale: ${descriptor.id}.`,
      );
    }
  }
  await validateAssetDescriptorFiles(rootDir, manifest.assets);
  return manifest.assets;
};

export const loadCatalogAuthorityDescriptors = async (
  rootDir: string,
  projectId?: string,
): Promise<readonly ResourceDescriptor[]> => {
  const [coreDescriptors, localReferenceDescriptors, projectDescriptors] =
    await Promise.all([
      loadCoreCatalogAuthorityDescriptors(rootDir),
      loadLocalReferenceAssetDescriptors(rootDir),
      loadProjectResourceDescriptors(rootDir, projectId),
    ]);
  const enrichedLocalDescriptors = await Promise.all(
    [...localReferenceDescriptors, ...projectDescriptors].map((descriptor) =>
      withAuthorityChecksum(rootDir, descriptor),
    ),
  );
  const descriptors = [...coreDescriptors, ...enrichedLocalDescriptors];
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

/**
 * Builds the same Catalog identity while routing repository-owned descriptors
 * and Project-owned descriptors through different filesystem roots. This is
 * used by isolated Project revision production; repositoryPath values remain
 * logical Workspace paths and therefore do not change content identity.
 */
export const loadScopedProjectCatalogAuthorityDescriptors = async ({
  runtimeRoot,
  projectRoot,
  projectId,
}: {
  readonly runtimeRoot: string;
  readonly projectRoot: string;
  readonly projectId: string;
}): Promise<readonly ResourceDescriptor[]> => {
  const [coreDescriptors, localReferenceDescriptors, projectDescriptors] =
    await Promise.all([
      loadCoreCatalogAuthorityDescriptors(runtimeRoot),
      loadLocalReferenceAssetDescriptors(runtimeRoot),
      loadProjectResourceDescriptors(projectRoot, projectId),
    ]);
  const [enrichedLocal, enrichedProject] = await Promise.all([
    Promise.all(
      localReferenceDescriptors.map((descriptor) =>
        withAuthorityChecksum(runtimeRoot, descriptor),
      ),
    ),
    Promise.all(
      projectDescriptors.map((descriptor) =>
        withAuthorityChecksum(projectRoot, descriptor),
      ),
    ),
  ]);
  const descriptors = [
    ...coreDescriptors,
    ...enrichedLocal,
    ...enrichedProject,
  ];
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

export const loadCoreCatalogAuthorityDescriptors = async (
  rootDir: string,
): Promise<readonly ResourceDescriptor[]> => {
  await validateWorkspaceRuntimeFacades(rootDir);
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
  const sourceDescriptors = [
    ...styleDescriptorDeclarations,
    ...capabilityDescriptorDeclarations,
  ];
  const manifestPath = join(rootDir, CORE_ASSET_MANIFEST_PATH);
  let assetDescriptors: readonly ResourceDescriptor[] = [];
  try {
    const metadata = await lstat(manifestPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(
        "Core asset manifest must be a regular non-symbolic file.",
      );
    }
    const manifest = ProducerAssetManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    for (const descriptor of manifest.assets) {
      if (
        descriptor.authority.repositoryPath !== CORE_ASSET_MANIFEST_PATH ||
        descriptor.allowedUse !== "runtime-approved" ||
        !descriptor.localPath.startsWith("public/assets/axmorf-shared/")
      ) {
        throw new Error(`Core asset scope is invalid: ${descriptor.id}.`);
      }
    }
    await validateAssetDescriptorFiles(rootDir, manifest.assets);
    assetDescriptors = manifest.assets;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return Promise.all(
    [...assetDescriptors, ...sourceDescriptors].map((descriptor) =>
      withAuthorityChecksum(rootDir, descriptor),
    ),
  );
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
