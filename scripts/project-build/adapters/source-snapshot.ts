import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import {
  StoryIdSchema,
  createFingerprint,
  type Sha256Digest,
} from "../../../src/contracts";

export type ProjectSourceSnapshot = Readonly<{
  fingerprint: Sha256Digest;
  files: readonly Readonly<{
    repositoryPath: string;
    checksum: Sha256Digest;
    sizeBytes: number;
  }>[];
}>;

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;

const toPosix = (value: string) => value.split(sep).join("/");

const PROCESS_ONLY_PROJECT_PATHS = [
  /\/delivery\/cover\/assignment\.generated\.json$/u,
  /\/delivery\/cover\/results(?:\/|$)/u,
  /\/generated\/global-visual-projection\.generated\.json$/u,
  /\/generated\/narrative-auto-check\.generated\.json$/u,
  /\/generated\/production-render-plan\.generated\.json$/u,
  /\/generated\/production-render-ready\.generated\.json$/u,
  /\/global-visual\/generated\/global-visual-package\.generated\.json$/u,
  /\/production\/global-visual-assignment\.generated\.json$/u,
  /\/production\/scene-assignments(?:\/|$)/u,
  /\/scenes\/[^/]+\/generated\/scene-package\.generated\.json$/u,
] as const;

const isProcessOnlyProjectPath = (repositoryPath: string) =>
  PROCESS_ONLY_PROJECT_PATHS.some((pattern) => pattern.test(repositoryPath));

const readTree = async ({
  rootDir,
  repositoryRoot,
  required,
  projectRoot,
}: {
  readonly rootDir: string;
  readonly repositoryRoot: string;
  readonly required: boolean;
  readonly projectRoot: boolean;
}) => {
  const absoluteRoot = join(rootDir, repositoryRoot);
  let rootMetadata;
  try {
    rootMetadata = await lstat(absoluteRoot);
  } catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error(`Project build source root is unsafe: ${repositoryRoot}.`);
  }
  const pending = [absoluteRoot];
  const files: Array<{
    repositoryPath: string;
    checksum: Sha256Digest;
    sizeBytes: number;
  }> = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) continue;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const repositoryPath = toPosix(relative(rootDir, absolutePath));
      if (
        repositoryPath.length === 0 ||
        repositoryPath.startsWith("../") ||
        isAbsolute(repositoryPath)
      ) {
        throw new Error("Project build source path escapes the repository.");
      }
      if (projectRoot && isProcessOnlyProjectPath(repositoryPath)) continue;
      if (entry.isSymbolicLink()) {
        throw new Error(`Project build source rejects symbolic links: ${repositoryPath}.`);
      }
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Project build source must be a regular file: ${repositoryPath}.`);
      }
      const bytes = Uint8Array.from(await readFile(absolutePath));
      files.push({
        repositoryPath,
        checksum: checksum(bytes),
        sizeBytes: bytes.byteLength,
      });
    }
  }
  return files;
};

export const collectProjectSourceSnapshot = async ({
  rootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}): Promise<ProjectSourceSnapshot> => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const roots = [
    {
      repositoryRoot: `src/projects/${projectId}`,
      required: true,
      projectRoot: true,
    },
    {
      repositoryRoot: `public/projects/${projectId}`,
      required: false,
      projectRoot: false,
    },
    {
      repositoryRoot: `public/assets/library/${projectId}`,
      required: false,
      projectRoot: false,
    },
    { repositoryRoot: "src/contracts", required: true, projectRoot: false },
    { repositoryRoot: "src/remotion", required: true, projectRoot: false },
  ] as const;
  const files = (
    await Promise.all(
      roots.map((root) => readTree({ rootDir, ...root })),
    )
  ).flat();
  for (const repositoryPath of [
    "src/Root.tsx",
    "src/index.css",
    "src/index.ts",
    "package.json",
    "package-lock.json",
    "remotion.config.ts",
  ]) {
    const absolutePath = join(rootDir, repositoryPath);
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Project build source file is unsafe: ${repositoryPath}.`);
    }
    const bytes = Uint8Array.from(await readFile(absolutePath));
    files.push({
      repositoryPath,
      checksum: checksum(bytes),
      sizeBytes: bytes.byteLength,
    });
  }
  files.sort((left, right) =>
    left.repositoryPath.localeCompare(right.repositoryPath),
  );
  if (files.length === 0) throw new Error("Project build source snapshot is empty.");
  if (new Set(files.map(({ repositoryPath }) => repositoryPath)).size !== files.length) {
    throw new Error("Project build source snapshot contains duplicate paths.");
  }
  return {
    files,
    fingerprint: createFingerprint({
      namespace: "project-authoring-source-snapshot",
      version: 1,
      value: { storyId: projectId, files },
    }),
  };
};
