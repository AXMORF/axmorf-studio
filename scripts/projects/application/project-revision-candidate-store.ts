import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  PROJECT_REVISION_BASE_SNAPSHOT_SCOPES,
  ProjectRevisionCandidateRecordSchema,
  ProjectRevisionInputSchema,
  ProjectRevisionSnapshotLogicalPathSchema,
  buildProjectRevisionCandidateRecord,
  computeProjectRevisionCandidateId,
  type ProjectRevisionCandidateRecord,
  type ProjectRevisionSnapshotEntry,
} from "../../../packages/studio/src/contracts/project-revision";
import { Sha256DigestSchema } from "../../../packages/studio/src/contracts/primitives";
import { serializeCanonicalJson } from "../../../packages/studio/src/contracts/fingerprint";
import {
  assertProjectRevisionOwnedPath,
  type ProjectRevisionProductionScope,
} from "../../project-production/application/production-scope";

export type ProjectRevisionBaseDirectories = Readonly<
  Record<(typeof PROJECT_REVISION_BASE_SNAPSHOT_SCOPES)[number], string>
>;

type PathState = Awaited<ReturnType<typeof lstat>> | null;

const pathState = async (path: string): Promise<PathState> => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const syncDirectory = async (directory: string) => {
  let handle: FileHandle | undefined;
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

const assertRealDirectory = async (path: string, label: string) => {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
};

const ensureContainedDirectory = async ({
  root,
  directory,
}: {
  readonly root: string;
  readonly directory: string;
}) => {
  const resolvedRoot = resolve(root);
  const resolvedDirectory = resolve(directory);
  const fromRoot = relative(resolvedRoot, resolvedDirectory);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(
      "Project revision storage directory escapes the repository.",
    );
  }
  await assertRealDirectory(resolvedRoot, "Project revision repository root");
  let current = resolvedRoot;
  for (const segment of fromRoot.split(sep).filter(Boolean)) {
    current = join(current, segment);
    const state = await pathState(current);
    if (state === null) {
      await mkdir(current);
    }
    await assertRealDirectory(current, "Project revision storage path");
  }
};

const assertCandidateStorageChain = async (
  scope: ProjectRevisionProductionScope,
) => {
  const fromRepository = relative(scope.repositoryRoot, scope.candidateRoot);
  let current = scope.repositoryRoot;
  await assertRealDirectory(current, "Project revision repository root");
  for (const segment of fromRepository.split(sep).filter(Boolean)) {
    current = join(current, segment);
    await assertRealDirectory(current, "Project revision storage path");
  }
};

const fileIdentityMatches = (
  left: Awaited<ReturnType<FileHandle["stat"]>>,
  right: Awaited<ReturnType<FileHandle["stat"]>>,
) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs;

const writeAll = async (handle: FileHandle, bytes: Uint8Array) => {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
      null,
    );
    if (bytesWritten === 0) {
      throw new Error("Project revision candidate write made no progress.");
    }
    offset += bytesWritten;
  }
};

const copyRegularFile = async ({
  source,
  destination,
}: {
  readonly source: string;
  readonly destination: string;
}) => {
  const sourcePathState = await lstat(source);
  if (sourcePathState.isSymbolicLink() || !sourcePathState.isFile()) {
    throw new Error("Project revision base snapshot contains an unsafe file.");
  }
  const sourceHandle = await open(source, "r");
  let destinationHandle: FileHandle | undefined;
  try {
    const before = await sourceHandle.stat();
    if (
      !before.isFile() ||
      before.dev !== sourcePathState.dev ||
      before.ino !== sourcePathState.ino
    ) {
      throw new Error("Project revision base file changed before copying.");
    }
    destinationHandle = await open(destination, "wx");
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await sourceHandle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      const bytes = buffer.subarray(0, bytesRead);
      hash.update(bytes);
      await writeAll(destinationHandle, bytes);
      position += bytesRead;
    }
    await destinationHandle.sync();
    const after = await sourceHandle.stat();
    const sourcePathAfter = await lstat(source);
    if (
      !fileIdentityMatches(before, after) ||
      sourcePathAfter.isSymbolicLink() ||
      !sourcePathAfter.isFile() ||
      sourcePathAfter.dev !== after.dev ||
      sourcePathAfter.ino !== after.ino ||
      position !== before.size
    ) {
      throw new Error("Project revision base file changed while copying.");
    }
    return {
      checksum: Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`),
      sizeBytes: position,
    } as const;
  } finally {
    await destinationHandle?.close();
    await sourceHandle.close();
  }
};

export const copyProjectRevisionRegularTree = async ({
  sourceRoot,
  destinationRoot,
}: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
}): Promise<readonly ProjectRevisionSnapshotEntry[]> => {
  await assertRealDirectory(sourceRoot, "Project revision base snapshot root");
  await mkdir(destinationRoot);
  const entries: ProjectRevisionSnapshotEntry[] = [];
  const copyDirectory = async (
    sourceDirectory: string,
    destinationDirectory: string,
    relativeDirectory: string,
  ): Promise<void> => {
    const sourceDirectoryState = await lstat(sourceDirectory);
    if (
      sourceDirectoryState.isSymbolicLink() ||
      !sourceDirectoryState.isDirectory()
    ) {
      throw new Error(
        "Project revision base snapshot contains an unsafe directory.",
      );
    }
    const children = (
      await readdir(sourceDirectory, { withFileTypes: true })
    ).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const logicalPath = relativeDirectory
        ? `${relativeDirectory}/${child.name}`
        : child.name;
      const source = join(sourceDirectory, child.name);
      const destination = join(destinationDirectory, child.name);
      const state = await lstat(source);
      if (state.isSymbolicLink()) {
        throw new Error(
          "Project revision base snapshot contains a symbolic link.",
        );
      }
      if (state.isDirectory()) {
        await mkdir(destination);
        entries.push({ logicalPath, kind: "directory" });
        await copyDirectory(source, destination, logicalPath);
        continue;
      }
      if (!state.isFile()) {
        throw new Error(
          "Project revision base snapshot contains a special entry.",
        );
      }
      const file = await copyRegularFile({ source, destination });
      entries.push({ logicalPath, kind: "file", ...file });
    }
    const after = await lstat(sourceDirectory);
    const childrenAfter = (
      await readdir(sourceDirectory, { withFileTypes: true })
    )
      .map(({ name }) => name)
      .sort((left, right) => left.localeCompare(right));
    if (
      after.isSymbolicLink() ||
      !after.isDirectory() ||
      after.dev !== sourceDirectoryState.dev ||
      after.ino !== sourceDirectoryState.ino ||
      childrenAfter.length !== children.length ||
      childrenAfter.some((name, index) => name !== children[index]?.name)
    ) {
      throw new Error("Project revision base directory changed while copying.");
    }
  };
  await copyDirectory(sourceRoot, destinationRoot, "");
  return entries.sort((left, right) =>
    left.logicalPath.localeCompare(right.logicalPath),
  );
};

const checksumRegularFile = async (path: string) => {
  const pathMetadata = await lstat(path);
  if (pathMetadata.isSymbolicLink() || !pathMetadata.isFile()) {
    throw new Error("Project revision candidate contains an unsafe file.");
  }
  const handle = await open(path, "r");
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.dev !== pathMetadata.dev ||
      before.ino !== pathMetadata.ino
    ) {
      throw new Error(
        "Project revision candidate file changed before reading.",
      );
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (
      !fileIdentityMatches(before, after) ||
      pathAfter.isSymbolicLink() ||
      !pathAfter.isFile() ||
      pathAfter.dev !== after.dev ||
      pathAfter.ino !== after.ino ||
      position !== before.size
    ) {
      throw new Error("Project revision candidate file changed while reading.");
    }
    return {
      checksum: Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`),
      sizeBytes: position,
    } as const;
  } finally {
    await handle.close();
  }
};

export const inspectProjectRevisionRegularTree = async (
  root: string,
): Promise<readonly ProjectRevisionSnapshotEntry[]> => {
  await assertRealDirectory(root, "Project revision candidate snapshot root");
  const entries: ProjectRevisionSnapshotEntry[] = [];
  const inspectDirectory = async (
    directory: string,
    relativeDirectory: string,
  ): Promise<void> => {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((left, right) => left.name.localeCompare(right.name))) {
      const logicalPath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const path = join(directory, entry.name);
      const state = await lstat(path);
      if (state.isSymbolicLink()) {
        throw new Error("Project revision candidate contains a symbolic link.");
      }
      if (state.isDirectory()) {
        entries.push({ logicalPath, kind: "directory" });
        await inspectDirectory(path, logicalPath);
      } else if (state.isFile()) {
        entries.push({
          logicalPath,
          kind: "file",
          ...(await checksumRegularFile(path)),
        });
      } else {
        throw new Error("Project revision candidate contains a special entry.");
      }
    }
  };
  await inspectDirectory(root, "");
  return entries.sort((left, right) =>
    left.logicalPath.localeCompare(right.logicalPath),
  );
};

const assertExactNames = (
  actual: readonly string[],
  expected: readonly string[],
  label: string,
) => {
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index])
  ) {
    throw new Error(`${label} contains missing or unknown entries.`);
  }
};

const readCandidateRecord = async (path: string) => {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isFile()) {
    throw new Error(
      "Project revision candidate record must be a regular file.",
    );
  }
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    state.dev !== after.dev ||
    state.ino !== after.ino ||
    state.size !== after.size ||
    state.mtimeMs !== after.mtimeMs
  ) {
    throw new Error("Project revision candidate record changed while reading.");
  }
  const record = ProjectRevisionCandidateRecordSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (bytes.toString("utf8") !== `${serializeCanonicalJson(record)}\n`) {
    throw new Error("Project revision candidate record is not canonical.");
  }
  return record;
};

const assertRecordMatchesScope = (
  scope: ProjectRevisionProductionScope,
  record: ProjectRevisionCandidateRecord,
) => {
  if (
    record.input.storyId !== scope.storyId ||
    record.candidateId !== scope.candidateId
  ) {
    throw new Error(
      "Project revision candidate does not match its fixed scope.",
    );
  }
};

export const inspectProjectRevisionCandidateDefinition = async ({
  scope,
  directory = scope.definitionRoot,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly directory?: string;
}) => {
  assertProjectRevisionOwnedPath({ scope, path: directory });
  await assertCandidateStorageChain(scope);
  await assertRealDirectory(directory, "Project revision candidate definition");
  const rootEntries = (await readdir(directory, { withFileTypes: true }))
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right));
  assertExactNames(
    rootEntries,
    ["base", "candidate.json"],
    "Candidate definition",
  );
  const record = await readCandidateRecord(join(directory, "candidate.json"));
  assertRecordMatchesScope(scope, record);
  const baseRoot = join(directory, "base");
  await assertRealDirectory(baseRoot, "Project revision base snapshot");
  const baseEntries = (await readdir(baseRoot, { withFileTypes: true }))
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right));
  assertExactNames(
    baseEntries,
    PROJECT_REVISION_BASE_SNAPSHOT_SCOPES,
    "Candidate base snapshot",
  );
  for (const tree of record.baseSnapshot.trees) {
    const actualEntries = await inspectProjectRevisionRegularTree(
      join(baseRoot, tree.scope),
    );
    if (
      serializeCanonicalJson(actualEntries) !==
      serializeCanonicalJson(tree.entries)
    ) {
      throw new Error(
        `Project revision candidate ${tree.scope} snapshot bytes are stale.`,
      );
    }
  }
  return record;
};

const writeCandidateRecord = async ({
  path,
  record,
}: {
  readonly path: string;
  readonly record: ProjectRevisionCandidateRecord;
}) => {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(`${serializeCanonicalJson(record)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const stageProjectRevisionCandidateDefinition = async ({
  scope,
  input: rawInput,
  baseDirectories,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly input: unknown;
  readonly baseDirectories: ProjectRevisionBaseDirectories;
}) => {
  const input = ProjectRevisionInputSchema.parse(rawInput);
  if (
    input.storyId !== scope.storyId ||
    computeProjectRevisionCandidateId(input) !== scope.candidateId
  ) {
    throw new Error("Project revision input does not match its fixed scope.");
  }
  await ensureContainedDirectory({
    root: scope.repositoryRoot,
    directory: scope.candidateRoot,
  });
  const stagingDirectory = join(
    scope.candidateRoot,
    `.definition.staging-${randomUUID()}`,
  );
  assertProjectRevisionOwnedPath({ scope, path: stagingDirectory });
  await mkdir(stagingDirectory);
  try {
    const baseRoot = join(stagingDirectory, "base");
    await mkdir(baseRoot);
    const baseTrees = [];
    for (const snapshotScope of PROJECT_REVISION_BASE_SNAPSHOT_SCOPES) {
      baseTrees.push({
        scope: snapshotScope,
        entries: await copyProjectRevisionRegularTree({
          sourceRoot: baseDirectories[snapshotScope],
          destinationRoot: join(baseRoot, snapshotScope),
        }),
      });
    }
    const record = buildProjectRevisionCandidateRecord({ input, baseTrees });
    await writeCandidateRecord({
      path: join(stagingDirectory, "candidate.json"),
      record,
    });
    await syncDirectory(baseRoot);
    await syncDirectory(stagingDirectory);
    await inspectProjectRevisionCandidateDefinition({
      scope,
      directory: stagingDirectory,
    });
    return { stagingDirectory, record } as const;
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
};

const assertDefinitionsByteEqual = async (
  leftRoot: string,
  rightRoot: string,
) => {
  const leftEntries = await inspectProjectRevisionRegularTree(leftRoot);
  const rightEntries = await inspectProjectRevisionRegularTree(rightRoot);
  if (
    serializeCanonicalJson(leftEntries) !== serializeCanonicalJson(rightEntries)
  ) {
    throw new Error("Existing Project revision candidate bytes differ.");
  }
  for (const entry of leftEntries) {
    if (entry.kind !== "file") continue;
    const left = await readFile(
      join(leftRoot, ...entry.logicalPath.split("/")),
    );
    const right = await readFile(
      join(rightRoot, ...entry.logicalPath.split("/")),
    );
    if (!left.equals(right)) {
      throw new Error("Existing Project revision candidate bytes differ.");
    }
  }
};

const assertStagingPath = (
  scope: ProjectRevisionProductionScope,
  stagingDirectory: string,
) => {
  assertProjectRevisionOwnedPath({ scope, path: stagingDirectory });
  if (
    dirname(resolve(stagingDirectory)) !== resolve(scope.candidateRoot) ||
    !basename(stagingDirectory).startsWith(".definition.staging-")
  ) {
    throw new Error("Project revision staging path is outside its fixed slot.");
  }
};

export const installProjectRevisionCandidateDefinition = async ({
  scope,
  stagingDirectory,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly stagingDirectory: string;
}) => {
  assertStagingPath(scope, stagingDirectory);
  const stagedRecord = await inspectProjectRevisionCandidateDefinition({
    scope,
    directory: stagingDirectory,
  });
  const existing = await pathState(scope.definitionRoot);
  if (existing !== null) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error("Existing Project revision candidate is unsafe.");
    }
    const existingRecord = await inspectProjectRevisionCandidateDefinition({
      scope,
    });
    if (
      serializeCanonicalJson(existingRecord) !==
      serializeCanonicalJson(stagedRecord)
    ) {
      throw new Error(
        "Existing Project revision candidate base binding differs.",
      );
    }
    await assertDefinitionsByteEqual(stagingDirectory, scope.definitionRoot);
    await rm(stagingDirectory, { recursive: true });
    return {
      status: "project-revision-candidate-current",
      record: existingRecord,
    } as const;
  }
  try {
    await rename(stagingDirectory, scope.definitionRoot);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
    const existingRecord = await inspectProjectRevisionCandidateDefinition({
      scope,
    });
    if (
      serializeCanonicalJson(existingRecord) !==
      serializeCanonicalJson(stagedRecord)
    ) {
      throw new Error(
        "Concurrent Project revision candidate base binding differs.",
      );
    }
    await assertDefinitionsByteEqual(stagingDirectory, scope.definitionRoot);
    await rm(stagingDirectory, { recursive: true });
    return {
      status: "project-revision-candidate-current",
      record: existingRecord,
    } as const;
  }
  await syncDirectory(scope.candidateRoot);
  try {
    const record = await inspectProjectRevisionCandidateDefinition({ scope });
    return { status: "project-revision-candidate-installed", record } as const;
  } catch (error) {
    try {
      await rename(scope.definitionRoot, stagingDirectory);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Project revision candidate installation rollback failed.",
      );
    }
    throw error;
  }
};

export const createProjectRevisionCandidateDefinition = async (
  input: Parameters<typeof stageProjectRevisionCandidateDefinition>[0],
) => {
  const staged = await stageProjectRevisionCandidateDefinition(input);
  try {
    return await installProjectRevisionCandidateDefinition({
      scope: input.scope,
      stagingDirectory: staged.stagingDirectory,
    });
  } catch (error) {
    await rm(staged.stagingDirectory, { recursive: true, force: true });
    throw error;
  }
};

const assertScopeStagingPath = (
  scope: ProjectRevisionProductionScope,
  stagingDirectory: string,
) => {
  assertProjectRevisionOwnedPath({ scope, path: stagingDirectory });
  if (
    dirname(resolve(stagingDirectory)) !== resolve(scope.candidateRoot) ||
    !basename(stagingDirectory).startsWith(".scope.staging-")
  ) {
    throw new Error(
      "Project revision authoring staging path is outside its fixed slot.",
    );
  }
};

export const copyProjectRevisionBaseAuthoring = async ({
  scope,
  stagingDirectory,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly stagingDirectory: string;
}) => {
  assertScopeStagingPath(scope, stagingDirectory);
  await inspectProjectRevisionCandidateDefinition({ scope });
  const mappings = [
    {
      snapshotScope: "source" as const,
      destination: join(stagingDirectory, "src", "projects", scope.storyId),
    },
    {
      snapshotScope: "public" as const,
      destination: join(stagingDirectory, "public", "projects", scope.storyId),
    },
    {
      snapshotScope: "narration" as const,
      destination: join(stagingDirectory, ".narration-work", scope.storyId),
    },
  ];
  for (const mapping of mappings) {
    await mkdir(dirname(mapping.destination), { recursive: true });
    await copyProjectRevisionRegularTree({
      sourceRoot: join(scope.baseSnapshotRoot, mapping.snapshotScope),
      destinationRoot: mapping.destination,
    });
  }
};

export const stageProjectRevisionCandidateAuthoring = async ({
  scope,
  populate,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly populate: (stagingDirectory: string) => Promise<void>;
}) => {
  await assertCandidateStorageChain(scope);
  await inspectProjectRevisionCandidateDefinition({ scope });
  const stagingDirectory = join(
    scope.candidateRoot,
    `.scope.staging-${randomUUID()}`,
  );
  assertScopeStagingPath(scope, stagingDirectory);
  await mkdir(stagingDirectory);
  try {
    await copyProjectRevisionBaseAuthoring({ scope, stagingDirectory });
    await populate(stagingDirectory);
    const entries = await inspectProjectRevisionRegularTree(stagingDirectory);
    await syncDirectory(stagingDirectory);
    return { stagingDirectory, entries } as const;
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
};

const inspectRealParentChain = async ({
  root,
  logicalPath,
}: {
  readonly root: string;
  readonly logicalPath: string;
}) => {
  const directories = [root];
  let current = root;
  for (const segment of logicalPath.split("/").slice(0, -1)) {
    current = join(current, segment);
    directories.push(current);
  }
  const identities = [];
  for (const directory of directories) {
    const state = await lstat(directory);
    if (state.isSymbolicLink() || !state.isDirectory()) {
      throw new Error(
        `Project revision authored parent must be a real directory: ${logicalPath}.`,
      );
    }
    identities.push({ path: directory, dev: state.dev, ino: state.ino });
  }
  return identities;
};

const assertParentChainUnchanged = async (
  identities: readonly {
    readonly path: string;
    readonly dev: number;
    readonly ino: number;
  }[],
  logicalPath: string,
) => {
  for (const identity of identities) {
    const state = await lstat(identity.path);
    if (
      state.isSymbolicLink() ||
      !state.isDirectory() ||
      state.dev !== identity.dev ||
      state.ino !== identity.ino
    ) {
      throw new Error(
        `Project revision authored parent changed while reading: ${logicalPath}.`,
      );
    }
  }
};

export const installProjectRevisionCandidateAuthoring = async ({
  scope,
  stagingDirectory,
  ownedLogicalPaths: rawOwnedLogicalPaths,
}: {
  readonly scope: ProjectRevisionProductionScope;
  readonly stagingDirectory: string;
  readonly ownedLogicalPaths: readonly string[];
}) => {
  assertScopeStagingPath(scope, stagingDirectory);
  const stagedEntries =
    await inspectProjectRevisionRegularTree(stagingDirectory);
  const ownedLogicalPaths = rawOwnedLogicalPaths.map((logicalPath) =>
    ProjectRevisionSnapshotLogicalPathSchema.parse(logicalPath),
  );
  const sortedOwnedLogicalPaths = [...ownedLogicalPaths].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    ownedLogicalPaths.length === 0 ||
    new Set(ownedLogicalPaths).size !== ownedLogicalPaths.length ||
    ownedLogicalPaths.some(
      (logicalPath, index) => logicalPath !== sortedOwnedLogicalPaths[index],
    )
  ) {
    throw new Error(
      "Project revision authored paths must be non-empty, sorted, and unique.",
    );
  }
  const assertOwnedBytesEqual = async (existingRoot: string) => {
    for (const logicalPath of ownedLogicalPaths) {
      const segments = logicalPath.split("/");
      const stagedParents = await inspectRealParentChain({
        root: stagingDirectory,
        logicalPath,
      });
      const existingParents = await inspectRealParentChain({
        root: existingRoot,
        logicalPath,
      });
      const staged = await checksumRegularFile(
        join(stagingDirectory, ...segments),
      );
      const existingFile = await checksumRegularFile(
        join(existingRoot, ...segments),
      );
      await assertParentChainUnchanged(stagedParents, logicalPath);
      await assertParentChainUnchanged(existingParents, logicalPath);
      if (
        staged.checksum !== existingFile.checksum ||
        staged.sizeBytes !== existingFile.sizeBytes
      ) {
        throw new Error(
          `Existing Project revision authored bytes differ: ${logicalPath}.`,
        );
      }
    }
  };
  const existing = await pathState(scope.isolatedRoot);
  if (existing !== null) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error("Existing Project revision authoring is unsafe.");
    }
    await assertOwnedBytesEqual(scope.isolatedRoot);
    await rm(stagingDirectory, { recursive: true });
    return {
      status: "project-revision-candidate-current",
      entries: stagedEntries,
    } as const;
  }
  try {
    await rename(stagingDirectory, scope.isolatedRoot);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
    await assertOwnedBytesEqual(scope.isolatedRoot);
    await rm(stagingDirectory, { recursive: true });
    return {
      status: "project-revision-candidate-current",
      entries: stagedEntries,
    } as const;
  }
  await syncDirectory(scope.candidateRoot);
  try {
    const installedEntries = await inspectProjectRevisionRegularTree(
      scope.isolatedRoot,
    );
    if (
      serializeCanonicalJson(installedEntries) !==
      serializeCanonicalJson(stagedEntries)
    ) {
      throw new Error("Installed Project revision authoring bytes are stale.");
    }
    return {
      status: "project-revision-candidate-created",
      entries: installedEntries,
    } as const;
  } catch (error) {
    try {
      await rename(scope.isolatedRoot, stagingDirectory);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Project revision authoring installation rollback failed.",
      );
    }
    throw error;
  }
};
