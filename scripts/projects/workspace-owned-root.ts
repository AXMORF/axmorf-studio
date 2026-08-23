import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { ProductionLocations } from "../project-production/application/production-locations";

const containedOrEqual = (root: string, candidate: string) => {
  const scope = relative(root, candidate);
  return scope === "" || (scope !== ".." && !scope.startsWith(`..${sep}`));
};

const assertCanonicalAbsolute = (path: string, label: string) => {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`${label} must be an absolute canonical path.`);
  }
};

const assertRealCanonicalDirectory = async (path: string, label: string) => {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error(`${label} ownership chain is symbolic or not a directory.`);
  }
  if ((await realpath(path)) !== path) {
    throw new Error(`${label} ownership chain is not canonical.`);
  }
};

const state = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertDirectorySegments = async ({
  root,
  target,
  allowMissing,
  label,
}: {
  readonly root: string;
  readonly target: string;
  readonly allowMissing: boolean;
  readonly label: string;
}) => {
  if (!containedOrEqual(root, target)) {
    throw new Error(`${label} escapes its ownership chain.`);
  }
  const scope = relative(root, target);
  if (scope === "") return true;
  let current = root;
  for (const segment of scope.split(sep)) {
    current = resolve(current, segment);
    const metadata = await state(current);
    if (metadata === null) {
      if (allowMissing) return false;
      throw new Error(`${label} ownership chain is missing.`);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`${label} ownership chain is symbolic or not a directory.`);
    }
    if ((await realpath(current)) !== current) {
      throw new Error(`${label} ownership chain is not canonical.`);
    }
  }
  return true;
};

export const assertWorkspaceOwnedDirectoryChain = async ({
  locations,
  ownedRoot,
  targetDirectory = ownedRoot,
  allowMissingOwnedRoot = false,
  allowMissingTarget = false,
}: {
  readonly locations: ProductionLocations;
  readonly ownedRoot: string;
  readonly targetDirectory?: string;
  readonly allowMissingOwnedRoot?: boolean;
  readonly allowMissingTarget?: boolean;
}) => {
  if (locations.layoutKind !== "workspace") {
    throw new Error("Workspace ownership validation requires Workspace locations.");
  }
  const workspaceRoot = dirname(locations.projectSourceRoot);
  if (dirname(locations.projectMediaRoot) !== workspaceRoot) {
    throw new Error("Workspace Project roots do not share one authority root.");
  }
  for (const [path, label] of [
    [workspaceRoot, "Workspace root"],
    [ownedRoot, "Workspace owned root"],
    [targetDirectory, "Workspace owned target"],
  ] as const) {
    assertCanonicalAbsolute(path, label);
  }
  await assertRealCanonicalDirectory(workspaceRoot, "Workspace root");

  const cacheRoot = locations.disposableBuildRoot;
  const authorityRoot = containedOrEqual(workspaceRoot, ownedRoot)
    ? workspaceRoot
    : containedOrEqual(cacheRoot, ownedRoot)
      ? cacheRoot
      : null;
  if (authorityRoot === null) {
    throw new Error("Workspace owned root escapes its authority roots.");
  }
  if (authorityRoot !== workspaceRoot) {
    assertCanonicalAbsolute(authorityRoot, "Workspace cache root");
    await assertRealCanonicalDirectory(authorityRoot, "Workspace cache root");
  }
  const ownedRootExists = await assertDirectorySegments({
    root: authorityRoot,
    target: ownedRoot,
    allowMissing: allowMissingOwnedRoot,
    label: "Workspace owned root",
  });
  if (!ownedRootExists) return false;
  return assertDirectorySegments({
    root: ownedRoot,
    target: targetDirectory,
    allowMissing: allowMissingTarget,
    label: "Workspace owned target",
  });
};
