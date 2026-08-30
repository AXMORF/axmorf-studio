import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import {
  ProjectAssetManifestSchema,
  buildProjectAssetManifest,
  buildProjectSoundPlan,
  computeResourceDescriptorFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  type ProducerConfig,
} from "@axmorf/studio/contracts";
import { writeBinaryFileAtomic } from "../../shared/atomic-file";

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const OPERATOR_MEDIA_POLICY_DATE = "2026-08-16T00:00:00.000Z" as const;

export const prepareProjectSound = async ({
  rootDir,
  projectId,
  config,
  baseAssetManifest,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly config: ProducerConfig;
  readonly baseAssetManifest: unknown;
}) => {
  const manifest = ProjectAssetManifestSchema.parse(baseAssetManifest);
  if (manifest.projectId !== projectId) {
    throw new Error("Project sound asset manifest identity is stale.");
  }
  const configured = config.audioDefaults?.globalBgm ?? null;
  if (configured === null) {
    return {
      plan: buildProjectSoundPlan({ storyId: projectId, contributions: [] }),
      assetManifest: manifest,
      localizedAsset: null,
    } as const;
  }
  const sourcePath = resolve(rootDir, configured.sourcePath);
  const metadata = await lstat(sourcePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Configured background music must be a regular file.");
  }
  const extension = extname(configured.sourcePath).toLowerCase();
  if (!/^(?:\.aac|\.flac|\.m4a|\.mp3|\.ogg|\.wav)$/u.test(extension)) {
    throw new Error("Configured background music format is unsupported.");
  }
  const bytes = await readFile(sourcePath);
  const assetChecksum = checksum(bytes);
  const resourceId = `asset.${projectId}.background-music` as const;
  const repositoryPath = `public/projects/${projectId}/sound/background-music${extension}`;
  const authorizationFingerprint = createFingerprint({
    namespace: "operator-provided-background-music",
    version: 1,
    value: {
      sourcePath: configured.sourcePath,
      checksum: assetChecksum,
    },
  });
  const descriptor = {
    schemaVersion: 1,
    id: resourceId,
    kind: "asset",
    status: "approved",
    title: "Project background music",
    description:
      "Operator-provided background music localized for this Project.",
    useCases: ["background music"],
    tags: ["background-music", "project-local"],
    authority: {
      kind: "repository-file",
      repositoryPath: `src/projects/${projectId}/assets.manifest.json`,
    },
    allowedUse: "runtime-approved",
    assetKind: "audio",
    mediaRole: "background-music",
    localPath: repositoryPath,
    checksum: assetChecksum,
    license: {
      id: "operator-provided-local-media",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: OPERATOR_MEDIA_POLICY_DATE,
      sourceEvidenceFingerprint: authorizationFingerprint,
    },
  } as const;
  const existing = manifest.assets.find(({ id }) => id === resourceId);
  if (
    existing !== undefined &&
    serializeCanonicalJson(existing) !== serializeCanonicalJson(descriptor)
  ) {
    throw new Error("Project background music asset identity conflicts.");
  }
  const assetManifest = buildProjectAssetManifest({
    projectId,
    assets: [
      ...manifest.assets.filter(({ id }) => id !== resourceId),
      descriptor,
    ],
    externalAssets: manifest.externalAssets,
  });
  const descriptorFingerprint = computeResourceDescriptorFingerprint({
    ...descriptor,
    authority: {
      ...descriptor.authority,
      sourceChecksum: checksum(
        Buffer.from(`${serializeCanonicalJson(assetManifest)}\n`),
      ),
    },
  });
  return {
    plan: buildProjectSoundPlan({
      storyId: projectId,
      contributions: [
        {
          contributionId: "background-music",
          resourceId,
          descriptorFingerprint,
          volume: configured.volume,
          loop: true,
          playbackScope: "narrated-content",
        },
      ],
    }),
    assetManifest,
    localizedAsset: { repositoryPath, bytes },
  } as const;
};

export const commitProjectSound = async ({
  rootDir,
  prepared,
}: {
  readonly rootDir: string;
  readonly prepared: Awaited<ReturnType<typeof prepareProjectSound>>;
}) => {
  if (prepared.localizedAsset === null) return;
  await writeBinaryFileAtomic({
    destination: join(rootDir, prepared.localizedAsset.repositoryPath),
    bytes: prepared.localizedAsset.bytes,
    mode: "create",
  });
};
