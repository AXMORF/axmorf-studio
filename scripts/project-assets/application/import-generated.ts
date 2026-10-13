import { extname, isAbsolute, join } from "node:path";

import {
  GeneratedArtworkImportInputSchema,
  StoryIdSchema,
  buildGeneratedArtworkRecord,
  buildProjectAssetManifest,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import {
  buildResourceCatalog,
  renderResourceCatalogJson,
} from "../../catalog/domain";
import { loadCatalogAuthorityDescriptors } from "../../catalog/project-files";
import type { resolveMediaToolCommand } from "../../shared/media-tool-command";
import {
  acquireImportLock,
  assertBeforeSceneFreeze,
  assertProjectDirectory,
  checksumBytes,
  promoteAssetImportFiles,
  readCandidateFile,
  readGeneratedArtworkEvidence,
  readOptionalFile,
  readRegularFile,
  type AssetImportFile,
} from "../adapters/filesystem";
import { inspectImageBytes } from "../domain/image";
import { validateRasterImageBytes } from "../adapters/raster-decoder";
import { inspectAuthoredSvgBytes } from "../domain/svg";
import {
  buildGeneratedArtworkDescriptor,
  createProjectGeneratedResourceId,
} from "../domain/model";
import { admitGeneratedArtwork } from "./admit-generated-artwork";
import { parseExistingManifest, type ProjectAssetCatalogSync } from "./import";

const sameBytes = (left: Uint8Array | null, right: Uint8Array | string) =>
  left !== null && Buffer.from(left).equals(Buffer.from(right));
const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

export const importGeneratedProjectAsset = async ({
  rootDir,
  projectId: rawProjectId,
  inputPath,
  syncCatalog: injectedSyncCatalog,
  resolveMediaTool,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly inputPath: string;
  readonly syncCatalog?: ProjectAssetCatalogSync;
  readonly resolveMediaTool?: typeof resolveMediaToolCommand;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  if (!isAbsolute(inputPath))
    throw new Error("Generated artwork input path must be absolute.");
  await assertProjectDirectory(rootDir, projectId);
  await assertBeforeSceneFreeze(rootDir, projectId);
  const input = GeneratedArtworkImportInputSchema.parse(
    JSON.parse(
      new TextDecoder().decode(
        await readRegularFile(inputPath, "Generated artwork input", 64 * 1024),
      ),
    ),
  );
  const candidate = await readCandidateFile({
    receiptPath: inputPath,
    relativePath: input.file,
  });
  const inspected =
    input.provenance.kind === "authored-svg"
      ? inspectAuthoredSvgBytes(candidate.bytes)
      : inspectImageBytes(candidate.bytes);
  const extension = extname(input.file).toLowerCase();
  if (
    extension !== `.${inspected.extension}` &&
    !(inspected.extension === "jpg" && extension === ".jpeg")
  )
    throw new Error("Generated artwork extension does not match its bytes.");
  const creation = buildGeneratedArtworkRecord({
    schemaVersion: 1,
    assetId: input.assetId,
    title: input.title,
    description: input.description,
    provenance: input.provenance,
    file: {
      mimeType: inspected.mimeType,
      width: inspected.width,
      height: inspected.height,
      sizeBytes: candidate.bytes.byteLength,
      sha256: checksumBytes(candidate.bytes),
    },
  });
  if (inspected.mimeType !== "image/svg+xml")
    await validateRasterImageBytes({
      rootDir,
      bytes: candidate.bytes,
      image: inspected,
      resolveMediaTool,
    });
  const resourceId = createProjectGeneratedResourceId(projectId, input.assetId);
  const publicPath = `public/projects/${projectId}/assets/${resourceId}.${inspected.extension}`;
  const evidencePath = `src/projects/${projectId}/sources/assets/${resourceId}/generated-artwork.json`;
  const manifestPath = `src/projects/${projectId}/assets.manifest.json`;
  const descriptor = buildGeneratedArtworkDescriptor({
    projectId,
    resourceId,
    creation,
    publicPath,
  });
  const entry = { resourceId, creation, evidencePath };
  const lock = await acquireImportLock(rootDir);
  try {
    await assertBeforeSceneFreeze(rootDir, projectId);
    const previousManifestBytes = await readOptionalFile(
      join(rootDir, manifestPath),
    );
    const previousManifest = parseExistingManifest(
      previousManifestBytes,
      projectId,
    );
    const existingDescriptor = previousManifest.assets.find(
      ({ id }) => id === resourceId,
    );
    const existingEntry = previousManifest.generatedAssets?.find(
      (value) => value.resourceId === resourceId,
    );
    const publicExisting = await readOptionalFile(join(rootDir, publicPath));
    const evidenceExisting = await readGeneratedArtworkEvidence(
      join(rootDir, evidencePath),
    );
    if (
      existingDescriptor !== undefined ||
      existingEntry !== undefined ||
      publicExisting !== null ||
      evidenceExisting !== null
    ) {
      if (
        existingDescriptor === undefined ||
        existingEntry === undefined ||
        serializeCanonicalJson(existingDescriptor) !==
          serializeCanonicalJson(descriptor) ||
        serializeCanonicalJson(existingEntry) !==
          serializeCanonicalJson(entry) ||
        !sameBytes(publicExisting, candidate.bytes) ||
        !sameBytes(evidenceExisting, jsonBytes(creation))
      )
        throw new Error(
          "Generated artwork identity conflicts with existing output.",
        );
    }
    const manifest = buildProjectAssetManifest({
      projectId,
      assets: [
        ...previousManifest.assets,
        ...(existingDescriptor === undefined ? [descriptor] : []),
      ],
      externalAssets: previousManifest.externalAssets,
      generatedAssets: [
        ...(previousManifest.generatedAssets ?? []),
        ...(existingEntry === undefined ? [entry] : []),
      ],
    });
    const manifestBytes = jsonBytes(manifest);
    const descriptors = await loadCatalogAuthorityDescriptors(rootDir);
    const projectPrefix = `src/projects/${projectId}/`;
    const belongsToProject = (path: string) => path.startsWith(projectPrefix);
    const previousProjectDescriptors = descriptors.filter(
      (value) =>
        !value.authority.repositoryPath.startsWith("src/projects/") ||
        belongsToProject(value.authority.repositoryPath),
    );
    const previousCatalog = buildResourceCatalog(previousProjectDescriptors);
    const importedDescriptors = manifest.assets.map((value) => ({
      ...value,
      authority: {
        ...value.authority,
        sourceChecksum: checksumBytes(new TextEncoder().encode(manifestBytes)),
      },
    }));
    const replaceManifest = (values: typeof descriptors) => [
      ...values.filter(
        (value) => value.authority.repositoryPath !== manifestPath,
      ),
      ...importedDescriptors,
    ];
    const catalog = buildResourceCatalog(
      replaceManifest(previousProjectDescriptors),
    );
    const aggregateCatalog = buildResourceCatalog(replaceManifest(descriptors));
    const authoring = await admitGeneratedArtwork({
      rootDir,
      projectId,
      input,
      resourceId,
      previousCatalog,
      catalog,
    });
    const files: AssetImportFile[] = [
      {
        path: publicPath,
        bytes: candidate.bytes,
        previousBytes: publicExisting,
      },
      {
        path: evidencePath,
        bytes: jsonBytes(creation),
        previousBytes: evidenceExisting,
      },
      {
        path: manifestPath,
        bytes: manifestBytes,
        previousBytes: previousManifestBytes,
      },
      ...authoring,
    ];
    for (const [path, value] of [
      [
        `src/projects/${projectId}/generated/resource-catalog.generated.json`,
        catalog,
      ],
      [
        "src/remotion/catalog/resource-catalog.generated.json",
        aggregateCatalog,
      ],
    ] as const)
      files.push({
        path,
        bytes: renderResourceCatalogJson(value),
        previousBytes: await readOptionalFile(join(rootDir, path)),
      });
    const syncCatalog =
      injectedSyncCatalog ??
      (await import("./catalog-sync")).syncProjectAssetCatalog;
    const verify = async () => {
      const checked = await syncCatalog({ rootDir, projectId, mode: "check" });
      if (checked.catalogFingerprint !== catalog.catalogFingerprint)
        throw new Error(
          "Generated artwork catalog identity drifted during import.",
        );
    };
    const result = {
      projectId,
      resourceId,
      publicPath,
      catalogFingerprint: catalog.catalogFingerprint,
      sceneMeaningIds: [...input.sceneMeaningIds].sort(),
    };
    if (files.every((file) => sameBytes(file.previousBytes, file.bytes))) {
      await verify();
      return { ...result, noOp: true } as const;
    }
    const promoted = await promoteAssetImportFiles(
      rootDir,
      files.filter((file) => !sameBytes(file.previousBytes, file.bytes)),
    );
    try {
      await verify();
    } catch (error) {
      await promoted.rollback();
      throw error;
    }
    await promoted.commit();
    return { ...result, noOp: false } as const;
  } finally {
    await lock.release();
  }
};
