import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Sha256DigestSchema } from "@axmorf/studio/contracts";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";

export const checksumBytes = (bytes: Uint8Array) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );

const assertContained = (root: string, target: string) => {
  const path = relative(resolve(root), resolve(target));
  if (
    path === "" ||
    path === ".." ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path)
  ) {
    throw new Error("Asset path escapes its required containment root.");
  }
};

export const readRegularFile = async (
  path: string,
  label: string,
  maxBytes = 64 * 1024 * 1024,
) => {
  if ((await realpath(path)) !== resolve(path)) {
    throw new Error(`${label} path must not traverse a symbolic link.`);
  }
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  if (metadata.size <= 0 || metadata.size > maxBytes)
    throw new Error(`${label} exceeds its supported size limit.`);
  return Uint8Array.from(await readFile(path));
};

export const readProviderReceipt = async (receiptPath: string) => {
  if (!isAbsolute(receiptPath)) {
    throw new Error("Provider receipt path must be absolute.");
  }
  const bytes = await readRegularFile(receiptPath, "Provider receipt");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("Provider receipt contains malformed JSON.", {
      cause: error,
    });
  }
  return { bytes, value } as const;
};

export const readCandidateFile = async ({
  receiptPath,
  relativePath,
}: {
  readonly receiptPath: string;
  readonly relativePath: string;
}) => {
  const receiptDirectory = dirname(receiptPath);
  const candidatePath = resolve(receiptDirectory, relativePath);
  assertContained(receiptDirectory, candidatePath);
  const bytes = await readRegularFile(candidatePath, "Candidate image");
  return { bytes, candidatePath } as const;
};

const pathState = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const repositoryParts = (rootDir: string, target: string) => {
  const normalizedRoot = resolve(rootDir);
  const normalizedTarget = resolve(target);
  assertContained(normalizedRoot, normalizedTarget);
  return relative(normalizedRoot, normalizedTarget).split(sep);
};

export const assertSafeTargetParent = async (
  rootDir: string,
  target: string,
) => {
  const parts = repositoryParts(rootDir, dirname(target));
  let current = resolve(rootDir);
  for (const part of parts) {
    current = join(current, part);
    const metadata = await pathState(current);
    if (metadata === null) return;
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Project asset path chain is unsafe.");
    }
  }
};

const ensureSafeDirectory = async (rootDir: string, directory: string) => {
  const parts = repositoryParts(rootDir, directory);
  const created: string[] = [];
  let current = resolve(rootDir);
  for (const part of parts) {
    current = join(current, part);
    let metadata = await pathState(current);
    if (metadata === null) {
      try {
        await mkdir(current);
        created.push(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      metadata = await lstat(current);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Project asset directory chain is unsafe.");
    }
  }
  return created;
};

export const assertProjectDirectory = async (
  rootDir: string,
  projectId: string,
) => {
  const projectRoot = join(rootDir, "src/projects", projectId);
  await assertSafeTargetParent(rootDir, projectRoot);
  const metadata = await pathState(projectRoot);
  if (
    metadata === null ||
    metadata.isSymbolicLink() ||
    !metadata.isDirectory()
  ) {
    throw new Error(
      "Project asset import requires an existing regular Project directory.",
    );
  }
  return projectRoot;
};

export const assertBeforeSceneFreeze = async (
  rootDir: string,
  projectId: string,
) => {
  if (resolve(rootDir).split(sep).includes(".producer-revisions"))
    throw new Error(
      "Asset import cannot admit new media into a revision candidate.",
    );
  for (const path of [
    join(rootDir, "src/projects", projectId, "production/scene-assignments"),
    join(
      rootDir,
      "src/projects",
      projectId,
      "production/global-visual-assignment.generated.json",
    ),
    join(
      rootDir,
      "src/projects",
      projectId,
      "production/scene-production-brief.json",
    ),
    join(rootDir, ".producer-attempts", projectId),
    join(rootDir, "deliveries", projectId),
  ]) {
    if ((await pathState(path)) !== null) {
      throw new Error("Project asset import is forbidden after Scene freeze.");
    }
  }
};

export const readOptionalFile = async (path: string) => {
  const metadata = await pathState(path);
  if (metadata === null) return null;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(
      "Project asset target must be a regular non-symbolic file.",
    );
  }
  return readRegularFile(path, "Project asset target");
};

export const readGeneratedArtworkEvidence = async (path: string) => {
  const metadata = await pathState(dirname(path));
  if (metadata === null) return null;
  if (metadata.isSymbolicLink() || !metadata.isDirectory())
    throw new Error("Generated artwork evidence directory is unsafe.");
  const entries = await readdir(dirname(path), { withFileTypes: true });
  if (
    entries.length !== 1 ||
    entries[0]!.name !== "generated-artwork.json" ||
    !entries[0]!.isFile() ||
    entries[0]!.isSymbolicLink()
  )
    throw new Error(
      "Generated artwork evidence directory has unknown entries.",
    );
  return readRegularFile(path, "Generated artwork evidence");
};

export const readExactEvidenceDirectory = async (path: string) => {
  const metadata = await pathState(path);
  if (metadata === null) return null;
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Project asset evidence target is unsafe.");
  }
  const entries = await readdir(path, { withFileTypes: true });
  if (
    entries.length !== 2 ||
    entries.some(
      (entry) =>
        entry.isSymbolicLink() ||
        !entry.isFile() ||
        !["external-asset-acquisition.json", "provider-receipt.json"].includes(
          entry.name,
        ),
    )
  ) {
    throw new Error("Project asset evidence directory has unknown entries.");
  }
  return {
    acquisition: Uint8Array.from(
      await readFile(join(path, "external-asset-acquisition.json")),
    ),
    receipt: Uint8Array.from(
      await readFile(join(path, "provider-receipt.json")),
    ),
  } as const;
};

const writeExclusive = async (path: string, bytes: Uint8Array | string) => {
  const handle = await open(path, "wx", 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const createImportStaging = async ({
  rootDir,
  publicPath,
  evidencePath,
  manifestPath,
  publicBytes,
  receiptBytes,
  acquisitionBytes,
  manifestBytes,
}: {
  readonly rootDir: string;
  readonly publicPath: string;
  readonly evidencePath: string;
  readonly manifestPath: string;
  readonly publicBytes: Uint8Array;
  readonly receiptBytes: Uint8Array;
  readonly acquisitionBytes: string;
  readonly manifestBytes: string;
}) => {
  const transactionId = randomUUID();
  const publicTarget = join(rootDir, publicPath);
  const evidenceTarget = join(rootDir, evidencePath);
  const manifestTarget = join(rootDir, manifestPath);
  await ensureSafeDirectory(rootDir, dirname(publicTarget));
  await ensureSafeDirectory(rootDir, dirname(evidenceTarget));
  await ensureSafeDirectory(rootDir, dirname(manifestTarget));
  const publicStaging = `${publicTarget}.${transactionId}.tmp`;
  const evidenceStaging = `${evidenceTarget}.${transactionId}.tmp`;
  const manifestStaging = `${manifestTarget}.${transactionId}.tmp`;
  await mkdir(evidenceStaging);
  try {
    await Promise.all([
      writeExclusive(publicStaging, publicBytes),
      writeExclusive(
        join(evidenceStaging, "provider-receipt.json"),
        receiptBytes,
      ),
      writeExclusive(
        join(evidenceStaging, "external-asset-acquisition.json"),
        acquisitionBytes,
      ),
      writeExclusive(manifestStaging, manifestBytes),
    ]);
  } catch (error) {
    await Promise.all([
      rm(publicStaging, { force: true }),
      rm(evidenceStaging, { recursive: true, force: true }),
      rm(manifestStaging, { force: true }),
    ]);
    throw error;
  }
  return {
    publicTarget,
    evidenceTarget,
    manifestTarget,
    publicStaging,
    evidenceStaging,
    manifestStaging,
  } as const;
};

export const acquireImportLock = async (rootDir: string) => {
  return acquireRepositoryOperationLock({
    rootDir,
    ownerId: "project-asset-import",
  });
};

export const promoteImportStaging = async ({
  staging,
  previousManifest,
}: {
  readonly staging: Awaited<ReturnType<typeof createImportStaging>>;
  readonly previousManifest: Uint8Array | null;
}) => {
  if (
    (await pathState(staging.publicTarget)) !== null ||
    (await pathState(staging.evidenceTarget)) !== null
  ) {
    throw new Error("Project asset identity conflicts with existing output.");
  }
  const backup = `${staging.manifestTarget}.${randomUUID()}.backup`;
  let manifestBackedUp = false;
  let publicPromoted = false;
  let evidencePromoted = false;
  let manifestPromoted = false;
  try {
    if (previousManifest !== null) {
      await rename(staging.manifestTarget, backup);
      manifestBackedUp = true;
    }
    await rename(staging.publicStaging, staging.publicTarget);
    publicPromoted = true;
    await rename(staging.evidenceStaging, staging.evidenceTarget);
    evidencePromoted = true;
    await rename(staging.manifestStaging, staging.manifestTarget);
    manifestPromoted = true;
    return {
      commit: async () => {
        if (manifestBackedUp) await rm(backup, { force: true });
      },
      rollback: async () => {
        if (manifestPromoted) await rm(staging.manifestTarget, { force: true });
        if (manifestBackedUp) await rename(backup, staging.manifestTarget);
        if (evidencePromoted)
          await rm(staging.evidenceTarget, { recursive: true, force: true });
        if (publicPromoted) await rm(staging.publicTarget, { force: true });
      },
    } as const;
  } catch (error) {
    if (manifestPromoted) await rm(staging.manifestTarget, { force: true });
    if (manifestBackedUp) await rename(backup, staging.manifestTarget);
    if (evidencePromoted)
      await rm(staging.evidenceTarget, { recursive: true, force: true });
    if (publicPromoted) await rm(staging.publicTarget, { force: true });
    throw error;
  } finally {
    await Promise.all([
      rm(staging.publicStaging, { force: true }),
      rm(staging.evidenceStaging, { recursive: true, force: true }),
      rm(staging.manifestStaging, { force: true }),
    ]);
  }
};

export const writeTextAtomic = async ({
  rootDir,
  path,
  bytes,
}: {
  readonly rootDir: string;
  readonly path: string;
  readonly bytes: string;
}) => {
  await ensureSafeDirectory(rootDir, dirname(path));
  const staging = `${path}.${randomUUID()}.tmp`;
  await writeExclusive(staging, bytes);
  await rename(staging, path);
};

export type AssetImportFile = Readonly<{
  path: string;
  bytes: Uint8Array | string;
  previousBytes: Uint8Array | null;
}>;

/** Stage the asset, provenance and dependent authoring together, then retain backups until revalidation. */
export const promoteAssetImportFiles = async (
  rootDir: string,
  files: readonly AssetImportFile[],
) => {
  const id = randomUUID();
  if (new Set(files.map(({ path }) => path)).size !== files.length)
    throw new Error("Asset import has duplicate transaction targets.");
  const entries = files.map((file) => ({
    ...file,
    target: join(rootDir, file.path),
    staged: join(rootDir, `${file.path}.${id}.tmp`),
    backup: join(rootDir, `${file.path}.${id}.backup`),
    backedUp: false,
    promoted: false,
  }));
  const createdDirectories: string[] = [];
  const rollback = async () => {
    for (const entry of [...entries].reverse()) {
      if (entry.promoted) {
        await rm(entry.target, { force: true });
        entry.promoted = false;
      }
      if (entry.backedUp) {
        await rename(entry.backup, entry.target);
        entry.backedUp = false;
      }
    }
    for (const entry of entries) await rm(entry.staged, { force: true });
    for (const path of [...createdDirectories].reverse()) await rmdir(path);
  };
  try {
    for (const entry of entries) {
      await assertSafeTargetParent(rootDir, entry.target);
      const current = await readOptionalFile(entry.target);
      if (
        (current === null) !== (entry.previousBytes === null) ||
        (current !== null &&
          entry.previousBytes !== null &&
          !Buffer.from(current).equals(Buffer.from(entry.previousBytes)))
      )
        throw new Error("Asset import target changed before promotion.");
    }
    for (const entry of entries) {
      createdDirectories.push(
        ...(await ensureSafeDirectory(rootDir, dirname(entry.target))),
      );
      await writeExclusive(entry.staged, entry.bytes);
    }
    for (const entry of entries) {
      if (entry.previousBytes !== null) {
        await rename(entry.target, entry.backup);
        entry.backedUp = true;
      }
      await rename(entry.staged, entry.target);
      entry.promoted = true;
    }
    return {
      rollback,
      commit: async () => {
        for (const entry of entries) if (entry.backedUp) await rm(entry.backup);
      },
    };
  } catch (error) {
    await rollback();
    throw error;
  } finally {
    for (const entry of entries) await rm(entry.staged, { force: true });
  }
};
