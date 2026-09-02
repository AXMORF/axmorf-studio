import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseRuntimePolicyManifest,
  type RuntimePolicyManifest,
} from "./policy-manifest";

export const RUNTIME_PACKAGE_NAME = "@axmorf/studio" as const;

export type RuntimeResources = Readonly<{
  packageRoot: string;
  packageVersion: string;
  assetsRoot: string;
  policyManifestPath: string;
  remotionPreflightEntry: string;
  sceneTemplatesRoot: string;
  workspaceSeedRoot: string;
  webRoot: string;
}>;

export class RuntimeResourceError extends Error {
  readonly code = "runtime-resource-invalid" as const;
}

const assertDirectory = async (path: string, label: string) => {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RuntimeResourceError(`${label} is missing.`);
    }
    throw error;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new RuntimeResourceError(
      `${label} must be a directory and cannot be a symbolic link.`,
    );
  }
  if ((await realpath(path)) !== resolve(path)) {
    throw new RuntimeResourceError(`${label} cannot contain symbolic links.`);
  }
};

const assertRegularFile = async (path: string, label: string) => {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RuntimeResourceError(`${label} must be a regular file.`);
    }
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new RuntimeResourceError(`${label} cannot be a symbolic link.`);
  }
  if (!metadata.isFile()) {
    throw new RuntimeResourceError(`${label} must be a regular file.`);
  }
  if ((await realpath(path)) !== resolve(path)) {
    throw new RuntimeResourceError(`${label} cannot contain symbolic links.`);
  }
};

const packageNameAt = async (directory: string) => {
  const packageJsonPath = join(directory, "package.json");
  let metadata;
  try {
    metadata = await lstat(packageJsonPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new RuntimeResourceError(
      "Runtime package manifest cannot be a symbolic link.",
    );
  }
  if (!metadata.isFile()) {
    throw new RuntimeResourceError(
      "Runtime package manifest must be a regular file.",
    );
  }
  let manifest: { readonly name?: unknown };
  try {
    manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      readonly name?: unknown;
    };
  } catch (error) {
    throw new RuntimeResourceError(
      "Runtime package manifest is not valid JSON.",
      { cause: error },
    );
  }
  return manifest.name === RUNTIME_PACKAGE_NAME;
};

const findPackageRoot = async (start: string) => {
  let current = start;
  const filesystemRoot = parse(current).root;
  while (true) {
    if (await packageNameAt(current)) return current;
    if (current === filesystemRoot) break;
    current = dirname(current);
  }
  throw new RuntimeResourceError(
    `Could not locate the ${RUNTIME_PACKAGE_NAME} package root.`,
  );
};

export const resolveRuntimeResources = async ({
  moduleUrl = import.meta.url,
  packageRoot,
}: {
  readonly moduleUrl?: string;
  readonly packageRoot?: string;
} = {}): Promise<RuntimeResources> => {
  const requestedRoot =
    packageRoot === undefined
      ? await findPackageRoot(dirname(fileURLToPath(moduleUrl)))
      : resolve(packageRoot);
  await assertDirectory(requestedRoot, "Runtime package root");
  if (!(await packageNameAt(requestedRoot))) {
    throw new RuntimeResourceError(
      `Runtime package manifest must declare ${RUNTIME_PACKAGE_NAME}.`,
    );
  }
  const packageManifest = JSON.parse(
    await readFile(join(requestedRoot, "package.json"), "utf8"),
  ) as { readonly version?: unknown };
  if (
    typeof packageManifest.version !== "string" ||
    packageManifest.version.length === 0
  ) {
    throw new RuntimeResourceError(
      "Runtime package manifest must declare a version.",
    );
  }
  const assetsRoot = join(requestedRoot, "dist", "assets");
  const policyManifestPath = join(assetsRoot, "policy", "runtime-policy.json");
  const sceneTemplatesRoot = join(assetsRoot, "scene-templates");
  const workspaceSeedRoot = join(assetsRoot, "workspace-seed");
  const remotionPreflightEntry = join(
    requestedRoot,
    "dist",
    "remotion-preflight.js",
  );
  const webRoot = join(requestedRoot, "dist", "web");
  await Promise.all([
    assertDirectory(assetsRoot, "Runtime assets root"),
    assertRegularFile(policyManifestPath, "Runtime policy manifest"),
    assertRegularFile(remotionPreflightEntry, "Remotion preflight entry"),
    assertDirectory(sceneTemplatesRoot, "Runtime Scene templates root"),
    assertDirectory(workspaceSeedRoot, "Runtime Workspace seed root"),
    assertDirectory(webRoot, "Runtime Web assets root"),
    assertRegularFile(
      join(webRoot, "index.html"),
      "Runtime Web index document",
    ),
  ]);
  return {
    packageRoot: requestedRoot,
    packageVersion: packageManifest.version,
    assetsRoot,
    policyManifestPath,
    remotionPreflightEntry,
    sceneTemplatesRoot,
    workspaceSeedRoot,
    webRoot,
  };
};

const isInside = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path.length > 0 && path !== ".." && !path.startsWith(`..${sep}`);
};

export const resolveRuntimeResource = async (
  resources: RuntimeResources,
  relativePath: string,
) => {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new RuntimeResourceError(
      "Runtime resources must resolve inside the package assets root.",
    );
  }
  const path = resolve(resources.assetsRoot, relativePath);
  if (!isInside(resources.assetsRoot, path)) {
    throw new RuntimeResourceError(
      "Runtime resources must resolve inside the package assets root.",
    );
  }
  await assertRegularFile(path, "Runtime resource");
  return path;
};

const resolvePolicyFile = (
  resources: RuntimeResources,
  logicalPath: string,
) => {
  if (logicalPath.startsWith("dist/")) {
    return resolve(resources.packageRoot, logicalPath);
  }
  if (logicalPath.startsWith("assets/")) {
    return resolve(resources.packageRoot, "dist", logicalPath);
  }
  throw new RuntimeResourceError(
    `Runtime policy file uses an unsupported logical root: ${logicalPath}.`,
  );
};

export const loadRuntimePolicyManifest = async (
  resources: RuntimeResources,
): Promise<RuntimePolicyManifest> => {
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(
      await readFile(resources.policyManifestPath, "utf8"),
    ) as unknown;
  } catch (error) {
    throw new RuntimeResourceError(
      "Runtime policy manifest is not valid JSON.",
      { cause: error },
    );
  }
  let manifest: RuntimePolicyManifest;
  try {
    manifest = parseRuntimePolicyManifest(rawManifest);
  } catch (error) {
    throw new RuntimeResourceError(
      "Runtime policy manifest does not satisfy its contract.",
      { cause: error },
    );
  }
  if (manifest.packageVersion !== resources.packageVersion) {
    throw new RuntimeResourceError(
      "Runtime policy manifest package version is stale.",
    );
  }
  for (const file of manifest.files) {
    const path = resolvePolicyFile(resources, file.logicalPath);
    if (!isInside(resources.packageRoot, path)) {
      throw new RuntimeResourceError(
        `Runtime policy file escapes the package root: ${file.logicalPath}.`,
      );
    }
    await assertRegularFile(path, `Runtime policy file ${file.logicalPath}`);
    const bytes = await readFile(path);
    const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.byteLength !== file.sizeBytes || checksum !== file.checksum) {
      throw new RuntimeResourceError(
        `Runtime policy file checksum is stale: ${file.logicalPath}.`,
      );
    }
  }
  return manifest;
};
