import { createHash } from "node:crypto";
import { extname, join } from "node:path";

import {
  ProjectAssetManifestSchema,
  buildProjectAssetManifest,
  buildProjectSoundPlan,
  computeResourceDescriptorFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  type ProducerConfig,
  type ProjectBackgroundMusicSelection,
  type ResourceDescriptor,
} from "@axmorf/studio/contracts";
import { writeBinaryFileAtomic } from "../../shared/atomic-file";
import { readContainedRegularFile } from "../adapters/project-create-store";
import {
  backgroundMusicCandidates,
  chooseBackgroundMusic,
} from "../domain/background-music";

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const OPERATOR_MEDIA_POLICY_DATE = "2026-08-16T00:00:00.000Z" as const;

export const prepareProjectSound = async ({
  rootDir,
  projectId,
  config,
  baseAssetManifest,
  backgroundMusic,
  descriptors = [],
  selectionText = "",
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly config: ProducerConfig;
  readonly baseAssetManifest: unknown;
  readonly backgroundMusic?: ProjectBackgroundMusicSelection;
  readonly descriptors?: readonly ResourceDescriptor[];
  readonly selectionText?: string;
}) => {
  const manifest = ProjectAssetManifestSchema.parse(baseAssetManifest);
  if (manifest.projectId !== projectId) {
    throw new Error("Project sound asset manifest identity is stale.");
  }
  const configured =
    backgroundMusic === undefined
      ? config.audioDefaults === undefined
        ? { mode: "auto" as const }
        : config.audioDefaults.globalBgm
      : backgroundMusic;
  const candidates = backgroundMusicCandidates(
    descriptors,
    configured !== null && "mode" in configured && configured.mode === "auto"
      ? configured.resourceIds
      : undefined,
  );
  const libraryAsset =
    configured !== null && "mode" in configured
      ? configured.mode === "selected"
        ? (candidates.find(({ id }) => id === configured.resourceId) ?? null)
        : chooseBackgroundMusic(candidates, selectionText)
      : null;
  if (
    configured !== null &&
    "mode" in configured &&
    configured.mode === "selected" &&
    libraryAsset === null
  ) {
    throw new Error(
      "Selected background music is unavailable; choose an approved global loop resource.",
    );
  }
  if (configured === null || ("mode" in configured && libraryAsset === null)) {
    return {
      plan: buildProjectSoundPlan({
        storyId: projectId,
        contributions: [],
        ...(backgroundMusic === null ? { sceneMusicPolicy: "mute" } : {}),
      }),
      assetManifest: manifest,
      localizedAsset: null,
      selection: {
        status:
          configured === null
            ? ("disabled" as const)
            : ("unavailable" as const),
        sourceResourceId: null,
        title: null,
        volume: null,
        reason:
          configured === null
            ? "Background music explicitly disabled."
            : "No approved global loop background music is available; continuous Project BGM is unavailable. Scene audio is retained.",
      },
    } as const;
  }
  const sourcePath =
    "sourcePath" in configured
      ? configured.sourcePath
      : libraryAsset!.localPath;
  const extension = extname(sourcePath).toLowerCase();
  if (!/^(?:\.aac|\.flac|\.m4a|\.mp3|\.ogg|\.wav)$/u.test(extension)) {
    throw new Error("Configured background music format is unsupported.");
  }
  const bytes = await readContainedRegularFile({
    rootDir,
    relativePath: sourcePath,
    label: "Configured background music",
  });
  const assetChecksum = checksum(bytes);
  if (libraryAsset !== null && libraryAsset.checksum !== assetChecksum) {
    throw new Error("Selected background music checksum is stale.");
  }
  const volume =
    configured.volume ?? config.audioDefaults?.globalBgm?.volume ?? 0.15;
  const resourceId = `asset.${projectId}.background-music` as const;
  const repositoryPath = `public/projects/${projectId}/sound/background-music${extension}`;
  const authorizationFingerprint = createFingerprint({
    namespace: "operator-provided-background-music",
    version: 1,
    value: {
      sourcePath,
      checksum: assetChecksum,
    },
  });
  const descriptor = {
    schemaVersion: 1,
    id: resourceId,
    kind: "asset",
    status: "approved",
    title: libraryAsset?.title ?? "Project background music",
    description:
      libraryAsset === null
        ? "Operator-provided background music localized for this Project."
        : `Approved global loop localized for this Project from ${libraryAsset.id}.`,
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
    license: libraryAsset?.license ?? {
      id: "operator-provided-local-media",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: OPERATOR_MEDIA_POLICY_DATE,
      sourceEvidenceFingerprint: authorizationFingerprint,
    },
    ...(libraryAsset?.media === undefined ? {} : { media: libraryAsset.media }),
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
          volume,
          loop: true,
          playbackScope: "composition",
        },
      ],
    }),
    assetManifest,
    localizedAsset: { repositoryPath, bytes },
    selection: {
      status: "selected" as const,
      sourceResourceId: libraryAsset?.id ?? null,
      title: descriptor.title,
      volume,
      reason:
        libraryAsset === null
          ? "Configured local file."
          : "Approved global loop selected and localized for continuous playback.",
    },
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
