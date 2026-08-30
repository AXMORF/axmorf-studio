import { lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type NodeCliInvocation = Readonly<{
  command: string;
  argsPrefix: readonly string[];
}>;

export class PackageBinResolutionError extends Error {
  readonly code = "workspace-package-bin-invalid" as const;
}

const isInside = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path.length > 0 && path !== ".." && !path.startsWith(`..${sep}`);
};

const assertRegularCanonicalFile = async (path: string, label: string) => {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PackageBinResolutionError(`${label} must be a regular file.`);
    }
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new PackageBinResolutionError(`${label} cannot be a symbolic link.`);
  }
  if (!metadata.isFile()) {
    throw new PackageBinResolutionError(`${label} must be a regular file.`);
  }
  if ((await realpath(path)) !== resolve(path)) {
    throw new PackageBinResolutionError(
      `${label} cannot contain symbolic links.`,
    );
  }
};

const readBinPath = (
  manifest: { readonly bin?: unknown },
  packageName: string,
  binName: string,
) => {
  if (
    typeof manifest.bin === "string" &&
    packageName.split("/").at(-1) === binName
  ) {
    return manifest.bin;
  }
  if (
    manifest.bin !== null &&
    typeof manifest.bin === "object" &&
    !Array.isArray(manifest.bin)
  ) {
    const value = (manifest.bin as Record<string, unknown>)[binName];
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new PackageBinResolutionError(
    `${packageName} does not declare the ${binName} bin.`,
  );
};

export const resolvePackageBinCommand = async ({
  workspaceRoot,
  packageName,
  binName,
}: {
  readonly workspaceRoot: string;
  readonly packageName: string;
  readonly binName: string;
}): Promise<NodeCliInvocation> => {
  const canonicalWorkspaceRoot = await realpath(resolve(workspaceRoot));
  if (canonicalWorkspaceRoot !== resolve(workspaceRoot)) {
    throw new PackageBinResolutionError(
      "Workspace package resolution cannot use symbolic links.",
    );
  }
  const workspaceManifest = join(canonicalWorkspaceRoot, "package.json");
  await assertRegularCanonicalFile(workspaceManifest, "Workspace package.json");
  const requireFromWorkspace = createRequire(workspaceManifest);
  let packageJsonPath;
  try {
    packageJsonPath = requireFromWorkspace.resolve(
      `${packageName}/package.json`,
    );
  } catch (error) {
    throw new PackageBinResolutionError(
      `${packageName} is not installed in the Workspace.`,
      { cause: error },
    );
  }
  await assertRegularCanonicalFile(
    packageJsonPath,
    `${packageName} package manifest`,
  );
  if (!isInside(canonicalWorkspaceRoot, packageJsonPath)) {
    throw new PackageBinResolutionError(
      `${packageName} must be installed inside the Workspace.`,
    );
  }
  const packageRoot = dirname(packageJsonPath);
  let manifest: { readonly name?: unknown; readonly bin?: unknown };
  try {
    manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      readonly name?: unknown;
      readonly bin?: unknown;
    };
  } catch (error) {
    throw new PackageBinResolutionError(
      `${packageName} package manifest is not valid JSON.`,
      { cause: error },
    );
  }
  if (manifest.name !== packageName) {
    throw new PackageBinResolutionError(
      `Resolved package manifest does not declare ${packageName}.`,
    );
  }
  const declaredBin = readBinPath(manifest, packageName, binName);
  if (isAbsolute(declaredBin)) {
    throw new PackageBinResolutionError(
      `${packageName} ${binName} bin must stay inside its package root.`,
    );
  }
  const binPath = resolve(packageRoot, declaredBin);
  if (!isInside(packageRoot, binPath)) {
    throw new PackageBinResolutionError(
      `${packageName} ${binName} bin must stay inside its package root.`,
    );
  }
  await assertRegularCanonicalFile(binPath, `${packageName} ${binName} bin`);
  return { command: process.execPath, argsPrefix: [binPath] };
};
