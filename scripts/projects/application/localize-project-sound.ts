import { createHash } from "node:crypto";
import { extname, join } from "node:path";

import {
  ProjectAssetManifestSchema,
  buildProjectAssetManifest,
  buildProjectSoundPlan,
  computeResourceDescriptorFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  SynthesizedMusicTimelineSchema,
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
  fps,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly config: ProducerConfig;
  readonly baseAssetManifest: unknown;
  readonly backgroundMusic?: ProjectBackgroundMusicSelection;
  readonly descriptors?: readonly ResourceDescriptor[];
  readonly selectionText?: string;
  readonly fps?: number;
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
    configured !== null &&
    "mode" in configured &&
    configured.mode !== "synthesized"
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
  if (
    configured === null ||
    ("mode" in configured &&
      configured.mode !== "synthesized" &&
      libraryAsset === null)
  ) {
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
  const synthesizedMusic =
    configured !== null &&
    "mode" in configured &&
    configured.mode === "synthesized"
      ? SynthesizedMusicTimelineSchema.parse(
          JSON.parse(
            (
              await readContainedRegularFile({
                rootDir,
                relativePath: configured.timelinePath,
                label: "Synthesized music timeline",
              })
            ).toString("utf8"),
          ),
        )
      : undefined;
  if (synthesizedMusic !== undefined) {
    const samples = Math.round(
      (synthesizedMusic.durationInFrames / synthesizedMusic.fps) * 48_000,
    );
    if (
      synthesizedMusic.audioChecksum !== assetChecksum ||
      synthesizedMusic.fps !== fps ||
      bytes.length !== 44 + samples * 4 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.readUInt32LE(4) !== bytes.length - 8 ||
      bytes.toString("ascii", 8, 16) !== "WAVEfmt " ||
      bytes.readUInt32LE(16) !== 16 ||
      bytes.readUInt16LE(20) !== 1 ||
      bytes.readUInt16LE(22) !== 2 ||
      bytes.readUInt32LE(24) !== 48_000 ||
      bytes.readUInt32LE(28) !== 192_000 ||
      bytes.readUInt16LE(32) !== 4 ||
      bytes.readUInt16LE(34) !== 16 ||
      bytes.toString("ascii", 36, 40) !== "data" ||
      bytes.readUInt32LE(40) !== samples * 4
    ) {
      throw new Error(
        "Synthesized music checksum, fps or PCM duration is stale.",
      );
    }
  }
  if (libraryAsset !== null && libraryAsset.checksum !== assetChecksum) {
    throw new Error("Selected background music checksum is stale.");
  }
  const volume =
    configured.volume ?? config.audioDefaults?.globalBgm?.volume ?? 0.15;
  // Legacy producer-config music has no ducking; only explicit create input can request it.
  const underSpeechVolume =
    "underSpeechVolume" in configured
      ? configured.underSpeechVolume
      : undefined;
  if (underSpeechVolume !== undefined && underSpeechVolume > volume) {
    throw new Error(
      "backgroundMusic.underSpeechVolume must not exceed its volume.",
    );
  }
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
    title:
      synthesizedMusic === undefined
        ? (libraryAsset?.title ?? "Project background music")
        : "Code-synthesized Project score",
    description:
      synthesizedMusic !== undefined
        ? "Original score synthesized locally from the frozen musical timeline."
        : libraryAsset === null
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
      id:
        synthesizedMusic === undefined
          ? "operator-provided-local-media"
          : "code-generated-original",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: OPERATOR_MEDIA_POLICY_DATE,
      sourceEvidenceFingerprint:
        synthesizedMusic === undefined
          ? authorizationFingerprint
          : checksum(Buffer.from(serializeCanonicalJson(synthesizedMusic))),
    },
    ...(libraryAsset?.media === undefined ? {} : { media: libraryAsset.media }),
    ...(synthesizedMusic === undefined
      ? {}
      : {
          media: {
            mimeType: "audio/wav",
            sizeBytes: bytes.length,
            durationInSeconds: (bytes.length - 44) / 192_000,
            codec: "pcm_s16le",
            sampleRate: 48_000,
          },
        }),
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
    ...(manifest.generatedAssets === undefined
      ? {}
      : { generatedAssets: manifest.generatedAssets }),
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
      ...(synthesizedMusic === undefined
        ? {}
        : { synthesizedMusic, sceneMusicPolicy: "mute" }),
      contributions: [
        {
          contributionId: "background-music",
          resourceId,
          descriptorFingerprint,
          volume,
          loop: true,
          playbackScope:
            synthesizedMusic === undefined ? "content-window" : "composition",
          ...(synthesizedMusic === undefined
            ? {}
            : {
                fadeInFrames: Math.round(synthesizedMusic.fps * 0.15),
                fadeOutFrames: synthesizedMusic.fps,
              }),
          ...(underSpeechVolume === undefined
            ? {}
            : {
                speechDucking: {
                  volume: underSpeechVolume,
                  rampFrames: 8,
                },
              }),
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
        synthesizedMusic !== undefined
          ? "Original code-synthesized score frozen with its beat timeline; template BGM is suppressed and independent effects are retained."
          : libraryAsset === null
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
