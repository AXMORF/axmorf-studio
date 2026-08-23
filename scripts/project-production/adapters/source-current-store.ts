import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  SourceCurrentAttestationSchema,
  buildSourceCurrentAttestation,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type SourceCurrentAttestation,
} from "../../../src/contracts";
import type { ProductionLocations } from "../domain/production-locations";
import { checksumBytes } from "./project-input-snapshot";

const isContained = (root: string, candidate: string) => {
  const result = relative(root, candidate);
  return result === "" || (result !== ".." && !result.startsWith(`..${sep}`));
};

const compareCanonicalText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const currentPath = (locations: ProductionLocations, storyId: string) => {
  const root = resolve(locations.sourceCurrentRoot);
  const path = join(root, `${storyId}.json`);
  if (!isContained(root, path) || dirname(path) !== root) {
    throw new Error("Source current path escaped its store.");
  }
  return path;
};

const syncDirectory = async (directory: string) => {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") {
      throw error;
    }
  } finally {
    await handle?.close();
  }
};

const collectTree = async ({
  root,
  scope,
}: {
  readonly root: string;
  readonly scope: "project" | "public";
}) => {
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`Source current ${scope} root is unsafe.`);
  }
  const files: Array<{
    logicalPath: string;
    checksum: string;
    sizeBytes: number;
  }> = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) {
        throw new Error("Source current cannot attest symlinks.");
      }
      if (metadata.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!metadata.isFile()) {
        throw new Error("Source current cannot attest special files.");
      }
      const before = await stat(path);
      const bytes = await readFile(path);
      const after = await stat(path);
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs
      ) {
        throw new Error("Source current file changed while it was read.");
      }
      const relativePath = relative(root, path).split(sep).join("/");
      files.push({
        logicalPath: `${scope}/${relativePath}`,
        checksum: checksumBytes(bytes),
        sizeBytes: bytes.byteLength,
      });
    }
  };
  await visit(root);
  return files;
};

export const collectSourceCurrentFiles = async ({
  locations,
  storyId,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
}) => {
  const files = (
    await Promise.all([
      collectTree({
        root: join(locations.projectSourceRoot, storyId),
        scope: "project",
      }),
      collectTree({
        root: join(locations.projectMediaRoot, storyId),
        scope: "public",
      }),
    ])
  )
    .flat()
    .sort((left, right) =>
      compareCanonicalText(left.logicalPath, right.logicalPath),
    );
  return files;
};

export const createSourceCurrentAttestation = async ({
  locations,
  storyId,
  revisionId,
  artifacts,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly revisionId: string;
  readonly artifacts: readonly ArtifactAttestation[];
}) =>
  buildSourceCurrentAttestation({
    storyId,
    revisionId,
    artifacts: artifacts
      .map(({ taskRevision, artifactFingerprint }) => ({
        taskRevision,
        artifactFingerprint,
      }))
      .sort((left, right) =>
        compareCanonicalText(left.taskRevision, right.taskRevision),
      ),
    files: await collectSourceCurrentFiles({ locations, storyId }),
    validators: [
      {
        id: "artifact-attestation",
        version: "producer-artifact-v1",
      },
      {
        id: "source-materialization",
        version: "source-materialization-v1",
      },
    ],
  });

export const writeSourceCurrent = async ({
  locations,
  attestation,
}: {
  readonly locations: ProductionLocations;
  readonly attestation: SourceCurrentAttestation;
}) => {
  const current = SourceCurrentAttestationSchema.parse(attestation);
  await mkdir(locations.sourceCurrentRoot, { recursive: true, mode: 0o700 });
  await chmod(locations.sourceCurrentRoot, 0o700);
  const destination = currentPath(locations, current.storyId);
  const staging = `${destination}.${randomUUID()}.tmp`;
  const bytes = `${serializeCanonicalJson(current)}\n`;
  try {
    await writeFile(staging, bytes, { flag: "wx", mode: 0o600 });
    await chmod(staging, 0o600);
    await rename(staging, destination);
    await syncDirectory(locations.sourceCurrentRoot);
  } finally {
    await rm(staging, { force: true });
  }
  return current;
};

export const readSourceCurrent = async ({
  locations,
  storyId,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
}) => {
  const path = currentPath(locations, storyId);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error("Source current record is unsafe.");
  }
  const text = await readFile(path, "utf8");
  const current = SourceCurrentAttestationSchema.parse(JSON.parse(text));
  if (
    current.storyId !== storyId ||
    text !== `${serializeCanonicalJson(current)}\n`
  ) {
    throw new Error("Source current record is stale.");
  }
  return current;
};

export const inspectSourceCurrent = async ({
  locations,
  expected,
}: {
  readonly locations: ProductionLocations;
  readonly expected: SourceCurrentAttestation;
}) => {
  const current = await readSourceCurrent({
    locations,
    storyId: expected.storyId,
  });
  if (current === null) return null;
  if (serializeCanonicalJson(current) !== serializeCanonicalJson(expected)) {
    throw new Error("Source current record is stale.");
  }
  const files = await collectSourceCurrentFiles({
    locations,
    storyId: expected.storyId,
  });
  if (serializeCanonicalJson(files) !== serializeCanonicalJson(expected.files)) {
    throw new Error("Source current materialized bytes drifted.");
  }
  return current;
};
