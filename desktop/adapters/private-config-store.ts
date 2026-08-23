import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { ProducerConfigSchema, type ProducerConfig } from "../../src/contracts";

export type PrivateConfigCrypto = Readonly<{
  encrypt: (plaintext: string) => Uint8Array;
  decrypt: (ciphertext: Uint8Array) => string;
  available: () => boolean;
}>;

type FilesystemIdentity = Readonly<{
  path: string;
  device: bigint;
  inode: bigint;
}>;

type PrivateDirectoryChain = Readonly<{
  applicationSupport: FilesystemIdentity;
  privateDirectory: FilesystemIdentity;
}>;

export const resolvePrivateConfigPath = (applicationSupportRoot: string) =>
  join(resolve(applicationSupportRoot), "private", "producer-config.enc");

const assertContained = (root: string, candidate: string) => {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error("Desktop private config path escapes Application Support.");
  }
};

const currentUserOwns = (uid: number) =>
  typeof process.getuid !== "function" || uid === process.getuid();

const verifyDirectory = async ({
  path,
  ownerOnly,
}: {
  readonly path: string;
  readonly ownerOnly: boolean;
}): Promise<FilesystemIdentity> => {
  const metadata = await lstat(path, { bigint: true });
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !currentUserOwns(Number(metadata.uid)) ||
    (ownerOnly && (Number(metadata.mode) & 0o777) !== 0o700)
  ) {
    throw new Error(
      ownerOnly
        ? "Desktop private config directory is not an owner-only real directory."
        : "Desktop Application Support root is not a canonical real directory.",
    );
  }
  if ((await realpath(path)) !== path) {
    throw new Error("Desktop private config directory is not canonical.");
  }
  return { path, device: metadata.dev, inode: metadata.ino };
};

const sameIdentity = (
  left: FilesystemIdentity,
  right: FilesystemIdentity,
) =>
  left.path === right.path &&
  left.device === right.device &&
  left.inode === right.inode;

const verifyPrivateDirectoryChain = async (
  applicationSupportRoot: string,
): Promise<PrivateDirectoryChain> => {
  const root = resolve(applicationSupportRoot);
  const privateDirectory = join(root, "private");
  assertContained(root, privateDirectory);
  const applicationSupport = await verifyDirectory({
    path: root,
    ownerOnly: false,
  });
  const verifiedPrivateDirectory = await verifyDirectory({
    path: privateDirectory,
    ownerOnly: true,
  });
  assertContained(applicationSupport.path, verifiedPrivateDirectory.path);
  return { applicationSupport, privateDirectory: verifiedPrivateDirectory };
};

const revalidatePrivateDirectoryChain = async (
  chain: PrivateDirectoryChain,
) => {
  const current = await verifyPrivateDirectoryChain(chain.applicationSupport.path);
  if (
    !sameIdentity(chain.applicationSupport, current.applicationSupport) ||
    !sameIdentity(chain.privateDirectory, current.privateDirectory)
  ) {
    throw new Error("Desktop private config directory identity changed.");
  }
};

const verifyPrivateFile = async (
  path: string,
): Promise<FilesystemIdentity> => {
  const metadata = await lstat(path, { bigint: true });
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    !currentUserOwns(Number(metadata.uid)) ||
    (Number(metadata.mode) & 0o777) !== 0o600
  ) {
    throw new Error(
      "Desktop private config is not an owner-only regular file.",
    );
  }
  return { path, device: metadata.dev, inode: metadata.ino };
};

const verifyExpectedFileIdentity = async (expected: FilesystemIdentity) => {
  const current = await verifyPrivateFile(expected.path);
  if (!sameIdentity(expected, current)) {
    throw new Error("Desktop private config file identity changed.");
  }
};

const ensurePrivateDirectory = async (applicationSupportRoot: string) => {
  const root = resolve(applicationSupportRoot);
  await verifyDirectory({ path: root, ownerOnly: false });
  const privateDirectory = join(root, "private");
  assertContained(root, privateDirectory);
  try {
    await mkdir(privateDirectory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return verifyPrivateDirectoryChain(root);
};

const removeTemporaryIfStillOwned = async (
  temporary: FilesystemIdentity | null,
  chain: PrivateDirectoryChain | null,
) => {
  if (!temporary || !chain) return;
  try {
    await revalidatePrivateDirectoryChain(chain);
    await verifyExpectedFileIdentity(temporary);
    await rm(temporary.path);
  } catch {
    // Never follow a changed parent or remove a file whose identity is no longer ours.
  }
};

export const readPrivateProducerConfig = async ({
  applicationSupportRoot,
  crypto,
}: {
  readonly applicationSupportRoot: string;
  readonly crypto: PrivateConfigCrypto;
}): Promise<ProducerConfig | null> => {
  if (!crypto.available())
    throw new Error("Desktop credential encryption is unavailable.");
  const root = resolve(applicationSupportRoot);
  const expectedRoot = await verifyDirectory({ path: root, ownerOnly: false });
  const path = resolvePrivateConfigPath(root);
  let chain: PrivateDirectoryChain;
  try {
    chain = await verifyPrivateDirectoryChain(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!sameIdentity(expectedRoot, chain.applicationSupport)) {
    throw new Error("Desktop Application Support root identity changed.");
  }
  assertContained(chain.applicationSupport.path, path);
  let expectedFile: FilesystemIdentity;
  try {
    expectedFile = await verifyPrivateFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.dev !== expectedFile.device ||
      opened.ino !== expectedFile.inode
    ) {
      throw new Error("Desktop private config file identity changed.");
    }
    const bytes = await handle.readFile();
    await revalidatePrivateDirectoryChain(chain);
    await verifyExpectedFileIdentity(expectedFile);
    return ProducerConfigSchema.parse(JSON.parse(crypto.decrypt(bytes)));
  } finally {
    await handle.close();
  }
};

export const writePrivateProducerConfig = async ({
  applicationSupportRoot,
  crypto,
  value,
}: {
  readonly applicationSupportRoot: string;
  readonly crypto: PrivateConfigCrypto;
  readonly value: unknown;
}) => {
  if (!crypto.available())
    throw new Error("Desktop credential encryption is unavailable.");
  const config = ProducerConfigSchema.parse(value);
  const path = resolvePrivateConfigPath(applicationSupportRoot);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let chain: PrivateDirectoryChain | null = null;
  let temporary: FilesystemIdentity | null = null;
  try {
    chain = await ensurePrivateDirectory(applicationSupportRoot);
    assertContained(chain.applicationSupport.path, path);
    assertContained(chain.applicationSupport.path, temporaryPath);
    await revalidatePrivateDirectoryChain(chain);
    const handle = await open(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const created = await handle.stat({ bigint: true });
      temporary = {
        path: temporaryPath,
        device: created.dev,
        inode: created.ino,
      };
      await handle.chmod(0o600);
      await handle.writeFile(crypto.encrypt(`${JSON.stringify(config)}\n`));
      await handle.sync();
      const metadata = await handle.stat({ bigint: true });
      if (
        metadata.dev !== temporary.device ||
        metadata.ino !== temporary.inode
      ) {
        throw new Error("Desktop private config file identity changed.");
      }
    } finally {
      await handle.close();
    }
    await verifyExpectedFileIdentity(temporary);
    await revalidatePrivateDirectoryChain(chain);
    try {
      await verifyPrivateFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await revalidatePrivateDirectoryChain(chain);
    await rename(temporaryPath, path);
    const installed = { ...temporary, path };
    temporary = null;
    await revalidatePrivateDirectoryChain(chain);
    await verifyExpectedFileIdentity(installed);
  } finally {
    await removeTemporaryIfStillOwned(temporary, chain);
  }
  return config;
};
