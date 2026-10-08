import { mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  StoryIdSchema,
  createFingerprint,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import type { RuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { inspectProjectVideo } from "../project-production/adapters/media";
import {
  resolveProductionScope,
  type ProductionScope,
  type ProjectRevisionProductionScope,
} from "../project-production/application/production-scope";
import { inspectProjectRevisionCandidateDefinition } from "../projects/application/project-revision-candidate-store";
import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";
import {
  PREVIEW_FILES,
  PREVIEW_VERSION,
  PreviewReceiptSchema,
  createPreviewBuildId,
  createPreviewProfile,
  type PreviewProfile,
  type PreviewReceipt,
} from "./domain";
import {
  assertPreviewDirectory,
  capturePreviewSnapshot,
  capturePreviewViewFingerprint,
  freezePreviewSnapshot,
  inspectPreviewFile,
  pathState,
  readPreviewReceipt,
  type PreviewSnapshot,
} from "./filesystem";
import { renderProjectPreview } from "./media";
import { prepareProjectPreviewView } from "./projection";
import {
  loadVerifiedPreviewSource,
  previewSourcesMatch,
  type VerifiedPreviewSource,
} from "./source";

export type ProjectPreviewDependencies = Readonly<{
  loadSource?: typeof loadVerifiedPreviewSource;
  inspectCandidate?: (input: {
    readonly scope: ProjectRevisionProductionScope;
  }) => Promise<unknown>;
  renderVideo?: typeof renderProjectPreview;
  inspectVideo?: typeof inspectProjectVideo;
  acquireLock?: typeof acquireRepositoryOperationLock;
  prepareView?: typeof prepareProjectPreviewView;
}>;

const previewEntrypoint = (
  projectId: string,
  source: VerifiedPreviewSource,
) => `import "./index.css";
import {Composition, registerRoot} from "remotion";
import ProjectComposition from ${JSON.stringify(`./projects/${projectId}/Composition`)};

const PreviewRoot = () => <Composition id=${JSON.stringify(source.render.compositionId)} component={ProjectComposition} width={${source.render.width}} height={${source.render.height}} fps={${source.render.fps}} durationInFrames={${source.frameCount}} defaultProps={{projectId: ${JSON.stringify(projectId)}}} />;
registerRoot(PreviewRoot);
`;

const inspectVideo = (
  dependency: typeof inspectProjectVideo,
  scope: ProductionScope,
  path: string,
  source: VerifiedPreviewSource,
  profile: PreviewProfile,
) =>
  dependency({
    rootDir: scope.shared.runtimeRoot,
    absolutePath: path,
    render: { ...source.render, width: profile.width, height: profile.height },
    frameCount: source.frameCount,
  });

const assertMediaMatchesProfile = (
  media: Awaited<ReturnType<typeof inspectProjectVideo>>,
  profile: PreviewProfile,
) => {
  if (
    media.width !== profile.width ||
    media.height !== profile.height ||
    media.fps !== profile.fps ||
    media.frameCount !== profile.frameCount ||
    media.audioChannels !== profile.audioChannels ||
    media.codec !== profile.videoCodec ||
    media.audioCodec !== profile.audioCodec ||
    media.decodedToEof !== true
  ) {
    throw new Error("Project preview media drifted from its profile.");
  }
};

const assertExactPreviewFiles = async (rootDir: string, directory: string) => {
  await assertPreviewDirectory({ root: rootDir, directory });
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort();
  if (
    serializeCanonicalJson(names) !== serializeCanonicalJson(PREVIEW_FILES) ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  ) {
    throw new Error(
      "Project preview contains missing, unsafe, or unknown artifacts.",
    );
  }
};

const assertPreviewFileCurrent = async (
  path: string,
  expected: Awaited<ReturnType<typeof inspectPreviewFile>>,
) => {
  const current = await inspectPreviewFile(path);
  if (
    current.checksum !== expected.checksum ||
    current.sizeBytes !== expected.sizeBytes
  ) {
    throw new Error("Project preview artifact changed during verification.");
  }
};

export const generateProjectPreview = async ({
  rootDir: rawRootDir,
  projectId: rawProjectId,
  candidateId,
  runtimePolicyManifest,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly candidateId?: string;
  readonly runtimePolicyManifest?: RuntimePolicyManifest;
  readonly dependencies?: ProjectPreviewDependencies;
}) => {
  const rootDir = resolve(rawRootDir);
  const projectId = StoryIdSchema.parse(rawProjectId);
  const scope = resolveProductionScope({
    rootDir,
    storyId: projectId,
    candidateId,
  });
  const lock = await (
    dependencies.acquireLock ?? acquireRepositoryOperationLock
  )({ rootDir, ownerId: "project-preview" });
  const loadSource = dependencies.loadSource ?? loadVerifiedPreviewSource;
  const inspectCandidate =
    dependencies.inspectCandidate ?? inspectProjectRevisionCandidateDefinition;
  const readVideo = dependencies.inspectVideo ?? inspectProjectVideo;
  const renderVideo = dependencies.renderVideo ?? renderProjectPreview;
  const prepareView = dependencies.prepareView ?? prepareProjectPreviewView;
  let staging: string | undefined;
  try {
    const verifyCandidate = async () => {
      if (scope.kind === "project-revision-candidate") {
        await inspectCandidate({ scope });
      }
    };
    await verifyCandidate();
    const snapshot = await capturePreviewSnapshot(scope);
    const sourceRequest = { rootDir, projectId, scope, runtimePolicyManifest };
    const source = await loadSource(sourceRequest);
    const assertSnapshotCurrent = async (expected: PreviewSnapshot) => {
      const current = await capturePreviewSnapshot(scope);
      if (current.fingerprint !== expected.fingerprint) {
        throw new Error("Project preview source changed during the build.");
      }
    };
    await assertSnapshotCurrent(snapshot);
    const profile = createPreviewProfile(source.render, source.frameCount);
    const sourceFingerprint = createFingerprint({
      namespace: "project-preview-source",
      version: 1,
      value: { bytes: snapshot.fingerprint, source, profile },
    });
    const previewBuildId = createPreviewBuildId({
      storyId: projectId,
      revisionId: source.revisionId,
      sourceFingerprint,
      profile,
    });
    const previewRoot = join(scope.outputRoot, projectId, "preview");
    const outputDir = join(previewRoot, previewBuildId);
    const assertSourceCurrent = async () => {
      await verifyCandidate();
      const current = await loadSource(sourceRequest);
      if (!previewSourcesMatch(source, current)) {
        throw new Error("Project preview source authority became stale.");
      }
      await assertSnapshotCurrent(snapshot);
    };
    const existing = await pathState(outputDir);
    let receipt: PreviewReceipt;
    let noOp = false;
    if (existing !== null) {
      await assertExactPreviewFiles(rootDir, outputDir);
      const receiptFile = await inspectPreviewFile(
        join(outputDir, "preview.json"),
      );
      receipt = PreviewReceiptSchema.parse(
        await readPreviewReceipt(join(outputDir, "preview.json")),
      );
      if (
        receipt.storyId !== projectId ||
        receipt.revisionId !== source.revisionId ||
        receipt.previewBuildId !== previewBuildId ||
        receipt.sourceFingerprint !== sourceFingerprint ||
        receipt.sourceSnapshotFingerprint !== snapshot.fingerprint ||
        receipt.artifactSetFingerprint !== source.artifactSetFingerprint ||
        serializeCanonicalJson(receipt.profile) !==
          serializeCanonicalJson(profile)
      ) {
        throw new Error(
          "Project preview receipt belongs to another source or profile.",
        );
      }
      const path = join(outputDir, "preview.mp4");
      const file = await inspectPreviewFile(path);
      const media = await inspectVideo(readVideo, scope, path, source, profile);
      assertMediaMatchesProfile(media, profile);
      if (
        file.checksum !== receipt.video.checksum ||
        file.sizeBytes !== receipt.video.sizeBytes ||
        serializeCanonicalJson(media) !==
          serializeCanonicalJson(receipt.video.media)
      ) {
        throw new Error(
          "Project preview receipt checksum or media binding drifted.",
        );
      }
      await assertSourceCurrent();
      await assertPreviewFileCurrent(path, file);
      await assertPreviewFileCurrent(
        join(outputDir, "preview.json"),
        receiptFile,
      );
      await assertExactPreviewFiles(rootDir, outputDir);
      noOp = true;
    } else {
      await assertPreviewDirectory({
        root: rootDir,
        directory: previewRoot,
        create: true,
      });
      staging = await mkdtemp(join(previewRoot, ".staging-"));
      const view = join(staging, "view");
      await freezePreviewSnapshot({ rootDir, destination: view, snapshot });
      await prepareView({
        request: sourceRequest,
        view,
        expectedSource: source,
      });
      const entryPoint = join(view, "src/index.tsx");
      await writeFile(entryPoint, previewEntrypoint(projectId, source), {
        flag: "wx",
      });
      const projectedFingerprint = await capturePreviewViewFingerprint({
        rootDir,
        view,
      });
      await assertSnapshotCurrent(snapshot);
      const outputPath = join(staging, "preview.mp4");
      await renderVideo({
        rootDir,
        entryPoint,
        publicDir: join(view, "public"),
        compositionId: source.render.compositionId,
        outputPath,
        profile,
      });
      const file = await inspectPreviewFile(outputPath);
      const media = await inspectVideo(
        readVideo,
        scope,
        outputPath,
        source,
        profile,
      );
      assertMediaMatchesProfile(media, profile);
      if (
        (await capturePreviewViewFingerprint({ rootDir, view })) !==
        projectedFingerprint
      ) {
        throw new Error(
          "Project preview frozen source/public changed during rendering.",
        );
      }
      await assertSourceCurrent();
      await assertPreviewFileCurrent(outputPath, file);
      await assertPreviewDirectory({ root: rootDir, directory: view });
      await rm(view, { recursive: true });
      receipt = PreviewReceiptSchema.parse({
        schemaVersion: 1,
        previewVersion: PREVIEW_VERSION,
        previewBuildId,
        storyId: projectId,
        revisionId: source.revisionId,
        sourceFingerprint,
        sourceSnapshotFingerprint: snapshot.fingerprint,
        artifactSetFingerprint: source.artifactSetFingerprint,
        profile,
        video: { file: "preview.mp4", ...file, media },
        assessment: {
          motion: "not-assessed",
          continuity: "not-assessed",
          listening: "not-assessed",
        },
      });
      await writeFile(
        join(staging, "preview.json"),
        `${serializeCanonicalJson(receipt)}\n`,
        { flag: "wx" },
      );
      await assertExactPreviewFiles(rootDir, staging);
      await assertPreviewDirectory({ root: rootDir, directory: previewRoot });
      if ((await pathState(outputDir)) !== null) {
        throw new Error(
          "Project preview output appeared during the locked build.",
        );
      }
      await rename(staging, outputDir);
      staging = undefined;
    }
    return {
      status: noOp
        ? ("project-preview-current" as const)
        : ("project-preview-ready" as const),
      projectId,
      previewBuildId,
      revisionId: source.revisionId,
      sourceFingerprint,
      sourceSnapshotFingerprint: snapshot.fingerprint,
      artifactSetFingerprint: source.artifactSetFingerprint,
      profile,
      outputDir,
      videoPath: join(outputDir, "preview.mp4"),
      receiptPath: join(outputDir, "preview.json"),
      noOp,
      assessment: receipt.assessment,
    };
  } finally {
    try {
      if (staging !== undefined) {
        await assertPreviewDirectory({ root: rootDir, directory: staging });
        await rm(staging, { recursive: true });
      }
    } finally {
      await lock.release();
    }
  }
};
