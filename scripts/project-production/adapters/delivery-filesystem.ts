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
import type { ProductionLocations } from "../domain/production-locations";

type DeliveryPathKind = "directory" | "file";

const state = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertDeliveryAuthorityRoot = async (rootDir: string) => {
  const root = resolve(rootDir);
  const metadata = await state(root);
  if (
    metadata === null ||
    metadata.isSymbolicLink() ||
    !metadata.isDirectory()
  ) {
    throw new Error("Delivery filesystem authority root is unsafe.");
  }
  return root;
};

const deliveryRelativePath = (locations: ProductionLocations, path: string) => {
  const root = resolve(locations.deliveryRoot);
  const deliveries = root;
  const target = resolve(path);
  const fromRoot = relative(root, target);
  const fromDeliveries = relative(deliveries, target);
  if (
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromDeliveries) ||
    fromDeliveries === ".." ||
    fromDeliveries.startsWith(`..${sep}`)
  ) {
    throw new Error("Delivery path escapes its configured delivery root.");
  }
  return { root, target, fromRoot } as const;
};

export const assertDeliveryPath = async ({
  locations,
  path,
  kind,
  mustExist = false,
}: {
  readonly locations: ProductionLocations;
  readonly path: string;
  readonly kind: DeliveryPathKind;
  readonly mustExist?: boolean;
}) => {
  const { root, target, fromRoot } = deliveryRelativePath(locations, path);
  await assertDeliveryAuthorityRoot(root);
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
  locations,
  directory,
}: {
  readonly locations: ProductionLocations;
  readonly directory: string;
}) => {
  const { root, fromRoot } = deliveryRelativePath(locations, directory);
  await assertDeliveryPath({ locations, path: directory, kind: "directory" });
  let current = root;
  for (const part of fromRoot.split(sep)) {
    current = join(current, part);
    const metadata = await state(current);
    if (metadata === null) {
      const parent = dirname(current);
      if (parent === root) await assertDeliveryAuthorityRoot(root);
      else {
        await assertDeliveryPath({
          locations,
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
      locations,
      path: current,
      kind: "directory",
      mustExist: true,
    });
  }
};

export const inspectDeliveryFile = async ({
  locations,
  path,
}: {
  readonly locations: ProductionLocations;
  readonly path: string;
}) => {
  await assertDeliveryPath({ locations, path, kind: "file", mustExist: true });
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error(
      `Delivery file must be a non-empty regular file: ${basename(path)}.`,
    );
  }
  const bytes = Uint8Array.from(await readFile(path));
  await assertDeliveryPath({ locations, path, kind: "file", mustExist: true });
  return {
    checksum: checksumDeliveryBytes(bytes),
    sizeBytes: metadata.size,
    bytes,
  } as const;
};

const guardedRename = async ({
  locations,
  source,
  destination,
  kind,
}: {
  readonly locations: ProductionLocations;
  readonly source: string;
  readonly destination: string;
  readonly kind: DeliveryPathKind;
}) => {
  await assertDeliveryPath({
    locations,
    path: source,
    kind,
    mustExist: true,
  });
  await assertDeliveryPath({ locations, path: destination, kind });
  await assertDeliveryPath({
    locations,
    path: dirname(destination),
    kind: "directory",
    mustExist: true,
  });
  await assertDeliveryPath({
    locations,
    path: source,
    kind,
    mustExist: true,
  });
  if ((await state(destination)) !== null) {
    throw new Error("Delivery rename destination is unsafe.");
  }
  await rename(source, destination);
  await assertDeliveryPath({
    locations,
    path: destination,
    kind,
    mustExist: true,
  });
};

const guardedRemoveDirectory = async ({
  locations,
  directory,
}: {
  readonly locations: ProductionLocations;
  readonly directory: string;
}) => {
  await assertDeliveryPath({ locations, path: directory, kind: "directory" });
  if ((await state(directory)) === null) return;
  await assertDeliveryPath({
    locations,
    path: directory,
    kind: "directory",
    mustExist: true,
  });
  await rm(directory, { recursive: true });
};

export const promoteDeliveryStaging = async ({
  locations,
  staging,
  destination,
  validate,
}: {
  readonly locations: ProductionLocations;
  readonly staging: string;
  readonly destination: string;
  readonly validate: (destination: string) => Promise<void>;
}) => {
  await assertDeliveryPath({
    locations,
    path: staging,
    kind: "directory",
    mustExist: true,
  });
  await assertDeliveryPath({ locations, path: destination, kind: "directory" });
  const current = await state(destination);
  if (current === null) {
    await guardedRename({
      locations,
      source: staging,
      destination,
      kind: "directory",
    });
    try {
      await assertDeliveryPath({
        locations,
        path: destination,
        kind: "directory",
        mustExist: true,
      });
      await validate(destination);
    } catch (error) {
      try {
        await guardedRename({
          locations,
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
  await assertDeliveryPath({ locations, path: backup, kind: "directory" });
  await guardedRename({
    locations,
    source: destination,
    destination: backup,
    kind: "directory",
  });
  try {
    await guardedRename({
      locations,
      source: staging,
      destination,
      kind: "directory",
    });
    await assertDeliveryPath({
      locations,
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
          locations,
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
        locations,
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
  await guardedRemoveDirectory({ locations, directory: backup });
};
