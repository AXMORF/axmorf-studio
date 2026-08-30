import { readFile } from "node:fs/promises";
import { dirname, posix } from "node:path";

import {
  DependencyAllowlistSchema,
  DependencyClosureManifestSchema,
  computeDependencyClosureFingerprint,
  type DependencyAllowlist,
  type DependencyClosureManifest,
} from "@axmorf/studio/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "./project-files";
import { assertGuardedSource } from "./source-guard";

export const readExactDependencyAllowlist = async (
  repositoryRoot: string,
): Promise<DependencyAllowlist> => {
  const [lockBytes, packageBytes] = await Promise.all([
    readFile(`${repositoryRoot}/package-lock.json`),
    readFile(`${repositoryRoot}/package.json`),
  ]);
  const packageJson = JSON.parse(packageBytes.toString("utf8")) as {
    dependencies?: Record<string, unknown>;
  };
  const packages = [
    "@react-three/fiber",
    "@remotion/motion-blur",
    "react",
    "remotion",
    "three",
  ].map((packageName) => ({
    packageName,
    exactVersion: packageJson.dependencies?.[packageName],
  }));
  return DependencyAllowlistSchema.parse({
    schemaVersion: 1,
    packageLockChecksum: checksumExternalBytes(lockBytes),
    packages,
  });
};

const resolveImportFile = async (
  snapshotRoot: string,
  importerPath: string,
  importPath: string,
): Promise<string> => {
  const base = posix.normalize(posix.join(dirname(importerPath), importPath));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    try {
      await readExternalRegularFile(snapshotRoot, candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Static dependency cannot be resolved: ${importPath}.`);
};

export const buildDependencyClosure = async ({
  snapshotRoot,
  entryPath,
  allowlist: rawAllowlist,
}: {
  readonly snapshotRoot: string;
  readonly entryPath: string;
  readonly allowlist: unknown;
}): Promise<DependencyClosureManifest> => {
  const allowlist = DependencyAllowlistSchema.parse(rawAllowlist);
  const allowedPackages = new Map(
    allowlist.packages.map((entry) => [entry.packageName, entry.exactVersion]),
  );
  const pending = [entryPath];
  const sources = new Map<
    string,
    {
      readonly bytes: Buffer;
      readonly reason: "entry" | "static-relative-import";
    }
  >();
  const usedBareImports = new Set<string>();
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (sourcePath === undefined || sources.has(sourcePath)) continue;
    const bytes = await readExternalRegularFile(snapshotRoot, sourcePath);
    const guarded = assertGuardedSource({
      source: bytes.toString("utf8"),
      sourcePath,
      allowedBarePackages: allowedPackages,
      relativeRoot: "demos",
    });
    sources.set(sourcePath, {
      bytes,
      reason: sourcePath === entryPath ? "entry" : "static-relative-import",
    });
    guarded.bareImports.forEach((packageName) =>
      usedBareImports.add(packageName),
    );
    for (const importPath of guarded.relativeImports) {
      pending.push(
        await resolveImportFile(
          snapshotRoot,
          sourcePath,
          posix.relative(dirname(sourcePath), importPath),
        ),
      );
    }
  }
  const input = {
    schemaVersion: 1 as const,
    entryPath,
    packageLockChecksum: allowlist.packageLockChecksum,
    bareImports: allowlist.packages.filter((entry) =>
      usedBareImports.has(entry.packageName),
    ),
    files: [...sources.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourcePath, source]) => ({
        sourcePath,
        checksum: checksumExternalBytes(source.bytes),
        dependencyReason: source.reason,
      })),
  };
  return DependencyClosureManifestSchema.parse({
    ...input,
    closureFingerprint: computeDependencyClosureFingerprint(input),
  });
};
