import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename } from "node:path";

import type { ProductionOwnerOutputFile } from "../../../src/contracts";
import {
  assertRegularOwnerPathChain,
  safeOwnerRelativePath,
} from "./owner-paths";

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const inspectFile = async ({
  rootDir,
  repositoryPath,
}: {
  readonly rootDir: string;
  readonly repositoryPath: string;
}): Promise<ProductionOwnerOutputFile> => {
  const absolutePath = await assertRegularOwnerPathChain({
    rootDir,
    relativePath: repositoryPath,
    allowMissing: false,
  });
  if (absolutePath === null) throw new Error("Owner output is missing.");
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Owner output manifest accepts regular files only.");
  }
  const bytes = Uint8Array.from(await readFile(absolutePath));
  return {
    repositoryPath,
    checksum: checksum(bytes) as ProductionOwnerOutputFile["checksum"],
    sizeBytes: metadata.size,
  };
};

const collectDirectory = async ({
  rootDir,
  relativeDirectory,
  allowMissing,
  excludedPrefixes,
}: {
  readonly rootDir: string;
  readonly relativeDirectory: string;
  readonly allowMissing: boolean;
  readonly excludedPrefixes: readonly string[];
}): Promise<readonly ProductionOwnerOutputFile[]> => {
  const absoluteDirectory = await assertRegularOwnerPathChain({
    rootDir,
    relativePath: relativeDirectory,
    allowMissing,
  });
  if (absoluteDirectory === null) return [];
  const metadata = await lstat(absoluteDirectory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Owner output root must be a regular directory.");
  }
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files: ProductionOwnerOutputFile[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error("Owner output tree must not contain symbolic links.");
    }
    const repositoryPath = `${relativeDirectory}/${entry.name}`;
    if (
      excludedPrefixes.some(
        (prefix) =>
          repositoryPath === prefix || repositoryPath.startsWith(`${prefix}/`),
      )
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(
        ...(await collectDirectory({
          rootDir,
          relativeDirectory: repositoryPath,
          allowMissing: false,
          excludedPrefixes,
        })),
      );
    } else if (entry.isFile()) {
      files.push(await inspectFile({ rootDir, repositoryPath }));
    } else {
      throw new Error(
        "Owner output tree contains an unknown filesystem entry.",
      );
    }
  }
  return files;
};

export type OwnerOutputScope = Readonly<{
  directories?: readonly string[];
  files?: readonly string[];
  requiredFiles?: readonly string[];
  coverSourceDirectory?: string;
  excludedPrefixes?: readonly string[];
}>;

export const collectOwnerOutputManifest = async ({
  rootDir,
  scope,
  allowMissing,
}: {
  readonly rootDir: string;
  readonly scope: OwnerOutputScope;
  readonly allowMissing: boolean;
}) => {
  const manifest: ProductionOwnerOutputFile[] = [];
  for (const directory of scope.directories ?? []) {
    manifest.push(
      ...(await collectDirectory({
        rootDir,
        relativeDirectory: safeOwnerRelativePath(directory),
        allowMissing,
        excludedPrefixes: scope.excludedPrefixes ?? [],
      })),
    );
  }
  for (const file of scope.files ?? []) {
    const path = safeOwnerRelativePath(file);
    const state = await assertRegularOwnerPathChain({
      rootDir,
      relativePath: path,
      allowMissing,
    });
    if (state !== null) {
      manifest.push(await inspectFile({ rootDir, repositoryPath: path }));
    }
  }
  for (const required of scope.requiredFiles ?? []) {
    if (!manifest.some(({ repositoryPath }) => repositoryPath === required)) {
      throw new Error(
        `Required owner output is missing: ${basename(required)}.`,
      );
    }
  }
  if (scope.coverSourceDirectory !== undefined) {
    const directory = await assertRegularOwnerPathChain({
      rootDir,
      relativePath: scope.coverSourceDirectory,
      allowMissing,
    });
    if (directory !== null) {
      const allowed = new Set([
        "assignment.generated.json",
        "Cover4x3.tsx",
        "Cover3x4.tsx",
        "Root.tsx",
        "index.ts",
        "results",
        ".staging",
      ]);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!allowed.has(entry.name) || entry.isSymbolicLink()) {
          throw new Error("Cover owner directory contains an unknown entry.");
        }
      }
    }
  }
  manifest.sort((left, right) =>
    left.repositoryPath.localeCompare(right.repositoryPath),
  );
  const paths = manifest.map(({ repositoryPath }) => repositoryPath);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Owner output scopes overlap.");
  }
  return manifest as readonly ProductionOwnerOutputFile[];
};

export const assertOwnerOutputManifestCurrent = async ({
  rootDir,
  scope,
  expected,
  allowMissing = false,
}: {
  readonly rootDir: string;
  readonly scope: OwnerOutputScope;
  readonly expected: readonly ProductionOwnerOutputFile[];
  readonly allowMissing?: boolean;
}) => {
  const current = await collectOwnerOutputManifest({
    rootDir,
    scope,
    allowMissing,
  });
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error(
      "Owner output manifest has unknown files or checksum drift.",
    );
  }
};
