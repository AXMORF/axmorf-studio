import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";

import {
  ProductionAgentWriteBoundarySchema,
  buildProductionAgentWriteBoundary,
  createFingerprint,
  serializeCanonicalJson,
  type ProductionAgentWriteBoundary,
  type ProductionAgentWriteScope,
} from "../../../src/contracts";
import { writeTextFileAtomic } from "../../shared/atomic-file";
import { getProductionRunPaths } from "./run-store";

const TOP_LEVEL_EXCLUSIONS = new Set([
  ".codegraph",
  ".git",
  ".narration-work",
  ".producer-runs",
  ".reference-workspaces",
  "build",
  "deliveries",
  "dist",
  "node_modules",
  "out",
  "private",
]);

const SECRET_METADATA_PATHS = [
  "private",
  "public/voice_profile",
  "voxcpm/voice_profile",
  "voxcpm/voxcpm.private.json",
] as const;

const isPrivateEnvironmentFile = (name: string) =>
  name === ".env" || (name.startsWith(".env.") && name !== ".env.example");

const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const pathState = async (path: string) => {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const scopeIdentity = ({ kind, repositoryPath }: ProductionAgentWriteScope) =>
  `${kind}:${repositoryPath}`;

export const normalizeAgentWriteScopes = (
  scopes: readonly ProductionAgentWriteScope[],
) =>
  [...scopes].sort((left, right) =>
    scopeIdentity(left).localeCompare(scopeIdentity(right)),
  );

const scopeAllowsPath = (
  repositoryPath: string,
  scope: ProductionAgentWriteScope,
) =>
  scope.kind === "file"
    ? repositoryPath === scope.repositoryPath
    : repositoryPath === scope.repositoryPath ||
      repositoryPath.startsWith(`${scope.repositoryPath}/`);

const isAllowed = (
  repositoryPath: string,
  scopes: readonly ProductionAgentWriteScope[],
) => scopes.some((scope) => scopeAllowsPath(repositoryPath, scope));

const isSecretMetadataPath = (repositoryPath: string) =>
  SECRET_METADATA_PATHS.some(
    (path) => repositoryPath === path || repositoryPath.startsWith(`${path}/`),
  );

type SnapshotEntry = Readonly<{
  repositoryPath: string;
  kind: "directory" | "file" | "symlink";
  identity: string;
}>;

const collectTree = async ({
  rootDir,
  repositoryPath,
  scopes,
  entries,
}: {
  readonly rootDir: string;
  readonly repositoryPath: string;
  readonly scopes: readonly ProductionAgentWriteScope[];
  readonly entries: SnapshotEntry[];
}): Promise<void> => {
  if (
    isAllowed(repositoryPath, scopes) ||
    isSecretMetadataPath(repositoryPath)
  ) {
    return;
  }
  const absolutePath = join(rootDir, repositoryPath);
  const metadata = await pathState(absolutePath);
  if (metadata === null) return;
  if (metadata.isSymbolicLink()) {
    entries.push({
      repositoryPath,
      kind: "symlink",
      identity: checksum(await readlink(absolutePath)),
    });
    return;
  }
  if (metadata.isDirectory()) {
    entries.push({ repositoryPath, kind: "directory", identity: "directory" });
    const children = await readdir(absolutePath, { withFileTypes: true });
    for (const child of children.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      await collectTree({
        rootDir,
        repositoryPath: `${repositoryPath}/${child.name}`,
        scopes,
        entries,
      });
    }
    return;
  }
  if (!metadata.isFile()) {
    throw new Error(
      "Agent write boundary found an unsupported filesystem entry.",
    );
  }
  entries.push({
    repositoryPath,
    kind: "file",
    identity: checksum(Uint8Array.from(await readFile(absolutePath))),
  });
};

const collectSecretMetadata = async ({
  rootDir,
  repositoryPath,
  entries,
}: {
  readonly rootDir: string;
  readonly repositoryPath: string;
  readonly entries: SnapshotEntry[];
}): Promise<void> => {
  const absolutePath = join(rootDir, repositoryPath);
  const metadata = await pathState(absolutePath);
  if (metadata === null) return;
  const kind = metadata.isDirectory()
    ? "directory"
    : metadata.isFile()
      ? "file"
      : "symlink";
  entries.push({
    repositoryPath: `protected:${checksum(repositoryPath)}`,
    kind,
    identity: `${metadata.size}:${metadata.mtimeNs}`,
  });
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) return;
  const children = await readdir(absolutePath, { withFileTypes: true });
  for (const child of children.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    await collectSecretMetadata({
      rootDir,
      repositoryPath: `${repositoryPath}/${child.name}`,
      entries,
    });
  }
};

export const computeAgentProtectedWorkspaceFingerprint = async ({
  rootDir,
  allowedWriteScopes,
}: {
  readonly rootDir: string;
  readonly allowedWriteScopes: readonly ProductionAgentWriteScope[];
}) => {
  const scopes = normalizeAgentWriteScopes(allowedWriteScopes);
  const entries: SnapshotEntry[] = [];
  const rootEntries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of rootEntries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (
      TOP_LEVEL_EXCLUSIONS.has(entry.name) ||
      entry.name === ".project-operation.lock"
    ) {
      continue;
    }
    if (isPrivateEnvironmentFile(entry.name)) {
      await collectSecretMetadata({
        rootDir,
        repositoryPath: entry.name,
        entries,
      });
      continue;
    }
    await collectTree({
      rootDir,
      repositoryPath: entry.name,
      scopes,
      entries,
    });
  }
  for (const repositoryPath of SECRET_METADATA_PATHS) {
    await collectSecretMetadata({ rootDir, repositoryPath, entries });
  }
  entries.sort((left, right) =>
    left.repositoryPath.localeCompare(right.repositoryPath),
  );
  return createFingerprint({
    namespace: "production-agent-protected-workspace",
    version: 1,
    value: entries,
  });
};

export const getAgentWriteBoundaryPath = ({
  rootDir,
  runId,
  phase,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly phase: ProductionAgentWriteBoundary["phase"];
}) =>
  join(
    getProductionRunPaths({ rootDir, runId }).artifacts,
    `agent-write-boundary-${phase}.generated.json`,
  );

export const writeAgentWriteBoundary = async ({
  rootDir,
  runId,
  storyId,
  phase,
  allowedWriteScopes,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly storyId: string;
  readonly phase: ProductionAgentWriteBoundary["phase"];
  readonly allowedWriteScopes: readonly ProductionAgentWriteScope[];
}) => {
  const scopes = normalizeAgentWriteScopes(allowedWriteScopes);
  const boundary = buildProductionAgentWriteBoundary({
    runId,
    storyId,
    phase,
    allowedWriteScopes: scopes,
    workspaceFingerprint: await computeAgentProtectedWorkspaceFingerprint({
      rootDir,
      allowedWriteScopes: scopes,
    }),
  });
  const destination = getAgentWriteBoundaryPath({ rootDir, runId, phase });
  await writeTextFileAtomic({
    destination,
    bytes: `${serializeCanonicalJson(boundary)}\n`,
    mode: "create",
  });
  return { boundary, destination } as const;
};

export const readAgentWriteBoundary = async ({
  rootDir,
  runId,
  phase,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly phase: ProductionAgentWriteBoundary["phase"];
}) => {
  const path = getAgentWriteBoundaryPath({ rootDir, runId, phase });
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error("Agent write boundary is missing or unreadable.", {
      cause: error,
    });
  }
  const boundary = ProductionAgentWriteBoundarySchema.parse(raw);
  if (boundary.runId !== runId || boundary.phase !== phase) {
    throw new Error("Agent write boundary identity is stale.");
  }
  return boundary;
};

export const checkAgentWriteBoundary = async ({
  rootDir,
  runId,
  phase,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly phase: ProductionAgentWriteBoundary["phase"];
}) => {
  const boundary = await readAgentWriteBoundary({ rootDir, runId, phase });
  const current = await computeAgentProtectedWorkspaceFingerprint({
    rootDir,
    allowedWriteScopes: boundary.allowedWriteScopes,
  });
  return {
    boundary,
    status:
      current === boundary.workspaceFingerprint
        ? ("current" as const)
        : ("violated" as const),
  };
};

export type AgentWriteBoundaryChecker = (
  request: Parameters<typeof checkAgentWriteBoundary>[0],
) => Promise<Readonly<{ status: "current" | "violated" }>>;
