import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { checksumDeliveryBytes } from "../domain/checksum";

type DeliveryPathKind = "directory" | "file";

const state = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertRepositoryRoot = async (rootDir: string) => {
  const root = resolve(rootDir);
  const metadata = await state(root);
  if (
    metadata === null ||
    metadata.isSymbolicLink() ||
    !metadata.isDirectory()
  ) {
    throw new Error("Delivery repository root is unsafe.");
  }
  return root;
};

const deliveryRelativePath = (rootDir: string, path: string) => {
  const root = resolve(rootDir);
  const target = resolve(path);
  const fromRoot = relative(root, target);
  const deliveries = resolve(root, "deliveries");
  const fromDeliveries = relative(deliveries, target);
  if (
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromDeliveries) ||
    fromDeliveries === ".." ||
    fromDeliveries.startsWith(`..${sep}`)
  ) {
    throw new Error("Delivery path escapes the repository delivery root.");
  }
  return { root, target, fromRoot } as const;
};

export const assertDeliveryPath = async ({
  rootDir,
  path,
  kind,
  mustExist = false,
}: {
  readonly rootDir: string;
  readonly path: string;
  readonly kind: DeliveryPathKind;
  readonly mustExist?: boolean;
}) => {
  const { root, target, fromRoot } = deliveryRelativePath(rootDir, path);
  await assertRepositoryRoot(root);
  const parts = fromRoot === "" ? [] : fromRoot.split(sep);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const metadata = await state(current);
    if (metadata === null) {
      if (mustExist) throw new Error("Delivery path is missing or unsafe.");
      return;
    }
    const isLeaf = index === parts.length - 1;
    if (
      metadata.isSymbolicLink() ||
      (!isLeaf && !metadata.isDirectory()) ||
      (isLeaf && kind === "directory" && !metadata.isDirectory()) ||
      (isLeaf && kind === "file" && !metadata.isFile())
    ) {
      throw new Error("Delivery path parent chain is unsafe.");
    }
  }
  if (mustExist && (await state(target)) === null) {
    throw new Error("Delivery path is missing or unsafe.");
  }
};

export const ensureDeliveryDirectory = async ({
  rootDir,
  directory,
}: {
  readonly rootDir: string;
  readonly directory: string;
}) => {
  const { root, fromRoot } = deliveryRelativePath(rootDir, directory);
  await assertDeliveryPath({ rootDir, path: directory, kind: "directory" });
  let current = root;
  for (const part of fromRoot.split(sep)) {
    current = join(current, part);
    const metadata = await state(current);
    if (metadata === null) {
      const parent = dirname(current);
      if (parent === root) await assertRepositoryRoot(root);
      else {
        await assertDeliveryPath({
          rootDir,
          path: parent,
          kind: "directory",
          mustExist: true,
        });
      }
      try {
        await mkdir(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    await assertDeliveryPath({
      rootDir,
      path: current,
      kind: "directory",
      mustExist: true,
    });
  }
};

export const inspectDeliveryFile = async ({
  rootDir,
  path,
}: {
  readonly rootDir: string;
  readonly path: string;
}) => {
  await assertDeliveryPath({ rootDir, path, kind: "file", mustExist: true });
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error(
      `Delivery file must be a non-empty regular file: ${basename(path)}.`,
    );
  }
  const bytes = Uint8Array.from(await readFile(path));
  await assertDeliveryPath({ rootDir, path, kind: "file", mustExist: true });
  return {
    checksum: checksumDeliveryBytes(bytes),
    sizeBytes: metadata.size,
    bytes,
  } as const;
};

const guardedRename = async ({
  rootDir,
  source,
  destination,
  kind,
}: {
  readonly rootDir: string;
  readonly source: string;
  readonly destination: string;
  readonly kind: DeliveryPathKind;
}) => {
  await assertDeliveryPath({
    rootDir,
    path: source,
    kind,
    mustExist: true,
  });
  await assertDeliveryPath({ rootDir, path: destination, kind });
  await assertDeliveryPath({
    rootDir,
    path: dirname(destination),
    kind: "directory",
    mustExist: true,
  });
  await assertDeliveryPath({
    rootDir,
    path: source,
    kind,
    mustExist: true,
  });
  if ((await state(destination)) !== null) {
    throw new Error("Delivery rename destination is unsafe.");
  }
  await rename(source, destination);
  await assertDeliveryPath({
    rootDir,
    path: destination,
    kind,
    mustExist: true,
  });
};

const guardedRemoveDirectory = async ({
  rootDir,
  directory,
}: {
  readonly rootDir: string;
  readonly directory: string;
}) => {
  await assertDeliveryPath({ rootDir, path: directory, kind: "directory" });
  if ((await state(directory)) === null) return;
  await assertDeliveryPath({
    rootDir,
    path: directory,
    kind: "directory",
    mustExist: true,
  });
  await rm(directory, { recursive: true });
};

export const promoteDeliveryStaging = async ({
  rootDir,
  staging,
  destination,
  validate,
}: {
  readonly rootDir: string;
  readonly staging: string;
  readonly destination: string;
  readonly validate: (destination: string) => Promise<void>;
}) => {
  await assertDeliveryPath({
    rootDir,
    path: staging,
    kind: "directory",
    mustExist: true,
  });
  await assertDeliveryPath({ rootDir, path: destination, kind: "directory" });
  const current = await state(destination);
  if (current === null) {
    await guardedRename({
      rootDir,
      source: staging,
      destination,
      kind: "directory",
    });
    try {
      await assertDeliveryPath({
        rootDir,
        path: destination,
        kind: "directory",
        mustExist: true,
      });
      await validate(destination);
    } catch (error) {
      try {
        await guardedRename({
          rootDir,
          source: destination,
          destination: staging,
          kind: "directory",
        });
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "Delivery validation rollback failed.",
        );
      }
      throw error;
    }
    return;
  }
  if (!current.isDirectory() || current.isSymbolicLink()) {
    throw new Error("Delivery destination is unsafe.");
  }
  const backup = join(
    dirname(staging),
    `.replaced-${basename(destination)}-${randomUUID()}`,
  );
  await assertDeliveryPath({ rootDir, path: backup, kind: "directory" });
  await guardedRename({
    rootDir,
    source: destination,
    destination: backup,
    kind: "directory",
  });
  try {
    await guardedRename({
      rootDir,
      source: staging,
      destination,
      kind: "directory",
    });
    await assertDeliveryPath({
      rootDir,
      path: destination,
      kind: "directory",
      mustExist: true,
    });
    await validate(destination);
  } catch (error) {
    const restoreFailures: unknown[] = [];
    try {
      const promoted = await state(destination);
      if (promoted !== null) {
        await guardedRename({
          rootDir,
          source: destination,
          destination: staging,
          kind: "directory",
        });
      }
    } catch (restoreError) {
      restoreFailures.push(restoreError);
    }
    try {
      await guardedRename({
        rootDir,
        source: backup,
        destination,
        kind: "directory",
      });
    } catch (restoreError) {
      restoreFailures.push(restoreError);
    }
    if (restoreFailures.length > 0) {
      throw new AggregateError(
        [error, ...restoreFailures],
        "Delivery replacement rollback failed.",
      );
    }
    throw error;
  }
  await guardedRemoveDirectory({ rootDir, directory: backup });
};
