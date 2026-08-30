import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import type { BigIntStats, Dirent } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  MeaningIdSchema,
  StoryIdSchema,
} from "../../../packages/studio/src/contracts/primitives";
import {
  buildSceneOriginalityBaseline,
  buildSceneSourceGraph,
  SceneOriginalityBaselineSchema,
  type SceneOriginalityBaseline,
  type SceneOriginalityBaselineEntry,
} from "../../../packages/studio/src/contracts/scene-originality";
import { serializeCanonicalJson } from "../../../packages/studio/src/contracts/fingerprint";
import { writeTextFileAtomic } from "../../shared/atomic-file";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import {
  assertRealRepositoryDirectoryChain,
  readContainedRegularFile,
} from "../adapters/project-create-store";

export const SCENE_ORIGINALITY_BASELINE_PATH =
  "production/scene-originality-baseline.json" as const;

const baselineRepositoryPath = (storyId: string) =>
  `src/projects/${storyId}/${SCENE_ORIGINALITY_BASELINE_PATH}`;

type SnapshotMetadata = Pick<
  BigIntStats,
  "dev" | "ino" | "mode" | "size" | "mtimeNs" | "ctimeNs"
> &
  Readonly<{
    isDirectory: () => boolean;
    isFile: () => boolean;
    isSymbolicLink: () => boolean;
  }>;

type SnapshotDirectoryEntry = Pick<
  Dirent,
  "name" | "isDirectory" | "isFile" | "isSymbolicLink"
>;

export type SceneOriginalitySnapshotFileSystem = Readonly<{
  lstat: (path: string) => Promise<SnapshotMetadata>;
  readFile: (path: string) => Promise<Uint8Array>;
  readDirectory: (path: string) => Promise<readonly SnapshotDirectoryEntry[]>;
  realpath: (path: string) => Promise<string>;
}>;

export const nodeSceneOriginalitySnapshotFileSystem: SceneOriginalitySnapshotFileSystem =
  {
    lstat: (path) => lstat(path, { bigint: true }),
    readFile: async (path) => Uint8Array.from(await readFile(path)),
    readDirectory: (path) => readdir(path, { withFileTypes: true }),
    realpath,
  };

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

const optionalMetadata = async (
  fileSystem: SceneOriginalitySnapshotFileSystem,
  path: string,
) => {
  try {
    return await fileSystem.lstat(path);
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
};

const isContained = (root: string, target: string) => {
  const path = relative(root, target);
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  );
};

const assertContained = (root: string, target: string) => {
  if (!isContained(root, target)) {
    throw new Error("Scene originality snapshot path escapes the Workspace.");
  }
};

const sameMetadata = (left: SnapshotMetadata, right: SnapshotMetadata) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.mode === right.mode &&
  left.size === right.size &&
  left.mtimeNs === right.mtimeNs &&
  left.ctimeNs === right.ctimeNs;

const assertCanonicalPath = async ({
  fileSystem,
  workspaceRoot,
  path,
}: {
  readonly fileSystem: SceneOriginalitySnapshotFileSystem;
  readonly workspaceRoot: string;
  readonly path: string;
}) => {
  assertContained(workspaceRoot, path);
  const canonical = await fileSystem.realpath(path);
  if (canonical !== path || !isContained(workspaceRoot, canonical)) {
    throw new Error(
      "Scene originality snapshots reject symbolic or escaped paths.",
    );
  }
};

const assertStableDirectory = async ({
  fileSystem,
  workspaceRoot,
  path,
}: {
  readonly fileSystem: SceneOriginalitySnapshotFileSystem;
  readonly workspaceRoot: string;
  readonly path: string;
}) => {
  const metadata = await fileSystem.lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Scene originality snapshot requires a real directory.");
  }
  await assertCanonicalPath({ fileSystem, workspaceRoot, path });
  return metadata;
};

const assertDirectoryDidNotDrift = async ({
  before,
  fileSystem,
  workspaceRoot,
  path,
}: {
  readonly before: SnapshotMetadata;
  readonly fileSystem: SceneOriginalitySnapshotFileSystem;
  readonly workspaceRoot: string;
  readonly path: string;
}) => {
  const after = await assertStableDirectory({
    fileSystem,
    workspaceRoot,
    path,
  });
  if (!sameMetadata(before, after)) {
    throw new Error("Scene originality directory changed while being read.");
  }
};

const readStableSource = async ({
  fileSystem,
  workspaceRoot,
  path,
}: {
  readonly fileSystem: SceneOriginalitySnapshotFileSystem;
  readonly workspaceRoot: string;
  readonly path: string;
}) => {
  const before = await fileSystem.lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error("Scene originality source must be a regular file.");
  }
  await assertCanonicalPath({ fileSystem, workspaceRoot, path });
  const bytes = await fileSystem.readFile(path);
  const after = await fileSystem.lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    !sameMetadata(before, after)
  ) {
    throw new Error("Scene originality source changed while being read.");
  }
  await assertCanonicalPath({ fileSystem, workspaceRoot, path });
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("Scene originality source must be valid UTF-8.", {
      cause: error,
    });
  }
};

const assertSafeEntry = (entry: SnapshotDirectoryEntry) => {
  if (
    entry.name === "" ||
    entry.name === "." ||
    entry.name === ".." ||
    entry.name.includes("/") ||
    entry.name.includes("\\")
  ) {
    throw new Error("Scene originality snapshot found an invalid entry name.");
  }
  if (entry.isSymbolicLink()) {
    throw new Error("Scene originality snapshots reject symbolic links.");
  }
  if (!entry.isDirectory() && !entry.isFile()) {
    throw new Error("Scene originality snapshots reject special files.");
  }
};

const collectTypeScriptSources = async ({
  fileSystem,
  workspaceRoot,
  sceneRoot,
  current,
  logicalRoot,
}: {
  readonly fileSystem: SceneOriginalitySnapshotFileSystem;
  readonly workspaceRoot: string;
  readonly sceneRoot: string;
  readonly current: string;
  readonly logicalRoot: string;
}): Promise<readonly Readonly<{ path: string; source: string }>[]> => {
  assertContained(sceneRoot, current);
  const before = await assertStableDirectory({
    fileSystem,
    workspaceRoot,
    path: current,
  });
  const entries = [...(await fileSystem.readDirectory(current))].sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const sources: Readonly<{ path: string; source: string }>[] = [];
  for (const entry of entries) {
    assertSafeEntry(entry);
    const path = join(current, entry.name);
    assertContained(sceneRoot, path);
    const logicalPath =
      logicalRoot === "" ? entry.name : `${logicalRoot}/${entry.name}`;
    if (entry.isDirectory()) {
      sources.push(
        ...(await collectTypeScriptSources({
          fileSystem,
          workspaceRoot,
          sceneRoot,
          current: path,
          logicalRoot: logicalPath,
        })),
      );
    } else if (/\.[cm]?tsx?$/u.test(entry.name)) {
      sources.push({
        path: logicalPath,
        source: await readStableSource({ fileSystem, workspaceRoot, path }),
      });
    }
  }
  await assertDirectoryDidNotDrift({
    before,
    fileSystem,
    workspaceRoot,
    path: current,
  });
  return sources;
};

const resolveWorkspaceRoot = async ({
  rootDir,
  fileSystem,
}: {
  readonly rootDir: string;
  readonly fileSystem: SceneOriginalitySnapshotFileSystem;
}) => {
  const requestedRoot = resolve(rootDir);
  const requestedMetadata = await fileSystem.lstat(requestedRoot);
  if (requestedMetadata.isSymbolicLink() || !requestedMetadata.isDirectory()) {
    throw new Error(
      "Scene originality Workspace root must be a real directory.",
    );
  }
  const workspaceRoot = await fileSystem.realpath(requestedRoot);
  const canonicalMetadata = await fileSystem.lstat(workspaceRoot);
  if (
    canonicalMetadata.isSymbolicLink() ||
    !canonicalMetadata.isDirectory() ||
    !sameMetadata(requestedMetadata, canonicalMetadata)
  ) {
    throw new Error(
      "Scene originality Workspace root changed while being canonicalized.",
    );
  }
  return workspaceRoot;
};

export const snapshotSceneSourceGraph = async ({
  rootDir,
  storyId: rawStoryId,
  meaningId: rawMeaningId,
  fileSystem = nodeSceneOriginalitySnapshotFileSystem,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly meaningId: string;
  readonly fileSystem?: SceneOriginalitySnapshotFileSystem;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const meaningId = MeaningIdSchema.parse(rawMeaningId);
  const workspaceRoot = await resolveWorkspaceRoot({ rootDir, fileSystem });
  const sceneRoot = join(
    workspaceRoot,
    "src",
    "projects",
    storyId,
    "scenes",
    meaningId,
  );
  const sources = await collectTypeScriptSources({
    fileSystem,
    workspaceRoot,
    sceneRoot,
    current: sceneRoot,
    logicalRoot: "",
  });
  if (!sources.some(({ path }) => path === "Renderer.tsx")) {
    throw new Error("Scene originality source graph requires Renderer.tsx.");
  }
  return buildSceneSourceGraph(sources);
};

export const snapshotWorkspaceSceneOriginalityBaseline = async ({
  rootDir,
  subjectStoryId: rawSubjectStoryId,
  fileSystem = nodeSceneOriginalitySnapshotFileSystem,
}: {
  readonly rootDir: string;
  readonly subjectStoryId: string;
  readonly fileSystem?: SceneOriginalitySnapshotFileSystem;
}) => {
  const subjectStoryId = StoryIdSchema.parse(rawSubjectStoryId);
  const workspaceRoot = await resolveWorkspaceRoot({ rootDir, fileSystem });
  const projectsRoot = join(workspaceRoot, "src", "projects");
  const projectsMetadata = await optionalMetadata(fileSystem, projectsRoot);
  if (projectsMetadata === null) {
    return buildSceneOriginalityBaseline({ subjectStoryId, entries: [] });
  }
  const projectsBefore = await assertStableDirectory({
    fileSystem,
    workspaceRoot,
    path: projectsRoot,
  });
  const entries: SceneOriginalityBaselineEntry[] = [];
  const projects = [...(await fileSystem.readDirectory(projectsRoot))].sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const project of projects) {
    assertSafeEntry(project);
    if (!project.isDirectory()) continue;
    const storyId = StoryIdSchema.parse(project.name);
    if (storyId === subjectStoryId) continue;
    const scenesRoot = join(projectsRoot, storyId, "scenes");
    const scenesMetadata = await optionalMetadata(fileSystem, scenesRoot);
    if (scenesMetadata === null) continue;
    const scenesBefore = await assertStableDirectory({
      fileSystem,
      workspaceRoot,
      path: scenesRoot,
    });
    const scenes = [...(await fileSystem.readDirectory(scenesRoot))].sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const scene of scenes) {
      assertSafeEntry(scene);
      if (!scene.isDirectory()) continue;
      const meaningId = MeaningIdSchema.parse(scene.name);
      const rendererPath = join(scenesRoot, meaningId, "Renderer.tsx");
      if ((await optionalMetadata(fileSystem, rendererPath)) === null) continue;
      const sourceGraph = await snapshotSceneSourceGraph({
        rootDir: workspaceRoot,
        storyId,
        meaningId,
        fileSystem,
      });
      entries.push({
        owner: { storyId, meaningId },
        sourceGraphFingerprint: sourceGraph.sourceGraphFingerprint,
      });
    }
    await assertDirectoryDidNotDrift({
      before: scenesBefore,
      fileSystem,
      workspaceRoot,
      path: scenesRoot,
    });
  }
  await assertDirectoryDidNotDrift({
    before: projectsBefore,
    fileSystem,
    workspaceRoot,
    path: projectsRoot,
  });
  return buildSceneOriginalityBaseline({ subjectStoryId, entries });
};

export const parseCanonicalSceneOriginalityBaseline = ({
  bytes,
  subjectStoryId: rawSubjectStoryId,
}: {
  readonly bytes: Uint8Array;
  readonly subjectStoryId: string;
}) => {
  const subjectStoryId = StoryIdSchema.parse(rawSubjectStoryId);
  const text = new TextDecoder().decode(bytes);
  const baseline = SceneOriginalityBaselineSchema.parse(JSON.parse(text));
  if (baseline.subjectStoryId !== subjectStoryId) {
    throw new Error("Scene originality baseline is cross-bound.");
  }
  if (text !== `${serializeCanonicalJson(baseline)}\n`) {
    throw new Error(
      "Scene originality baseline must use canonical JSON bytes.",
    );
  }
  return baseline;
};

export const readProjectSceneOriginalityBaseline = async ({
  rootDir,
  subjectStoryId: rawSubjectStoryId,
}: {
  readonly rootDir: string;
  readonly subjectStoryId: string;
}): Promise<SceneOriginalityBaseline> => {
  const subjectStoryId = StoryIdSchema.parse(rawSubjectStoryId);
  let bytes: Uint8Array;
  try {
    bytes = await readContainedRegularFile({
      rootDir,
      relativePath: baselineRepositoryPath(subjectStoryId),
      label: "Scene originality baseline",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Scene originality baseline is missing for ${subjectStoryId}; run project:originality:freeze explicitly.`,
        { cause: error },
      );
    }
    throw error;
  }
  return parseCanonicalSceneOriginalityBaseline({ bytes, subjectStoryId });
};

export const freezeProjectSceneOriginalityBaseline = async ({
  rootDir: rawRootDir,
  subjectStoryId: rawSubjectStoryId,
  acquireLock = acquireRepositoryOperationLock,
}: {
  readonly rootDir: string;
  readonly subjectStoryId: string;
  readonly acquireLock?: typeof acquireRepositoryOperationLock;
}) => {
  const rootDir = resolve(rawRootDir);
  const subjectStoryId = StoryIdSchema.parse(rawSubjectStoryId);
  const lock = await acquireLock({
    rootDir,
    ownerId: "scene-originality-baseline-freeze",
  });
  try {
    await assertRealRepositoryDirectoryChain({
      rootDir,
      relativePath: `src/projects/${subjectStoryId}/production`,
    });
    try {
      const current = await readProjectSceneOriginalityBaseline({
        rootDir,
        subjectStoryId,
      });
      return {
        status: "scene-originality-baseline-current" as const,
        storyId: subjectStoryId,
        logicalPath: baselineRepositoryPath(subjectStoryId),
        entryCount: current.entries.length,
        baselineFingerprint: current.baselineFingerprint,
      };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("is missing")) {
        throw error;
      }
    }
    const baseline = await snapshotWorkspaceSceneOriginalityBaseline({
      rootDir,
      subjectStoryId,
    });
    const destination = join(rootDir, baselineRepositoryPath(subjectStoryId));
    await writeTextFileAtomic({
      destination,
      bytes: `${serializeCanonicalJson(baseline)}\n`,
      mode: "create",
    });
    const verified = await readProjectSceneOriginalityBaseline({
      rootDir,
      subjectStoryId,
    });
    return {
      status: "scene-originality-baseline-frozen" as const,
      storyId: subjectStoryId,
      logicalPath: baselineRepositoryPath(subjectStoryId),
      entryCount: verified.entries.length,
      baselineFingerprint: verified.baselineFingerprint,
    };
  } finally {
    await lock.release();
  }
};
