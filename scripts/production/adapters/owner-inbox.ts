import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  sep,
} from "node:path";

import {
  ProductionOwnerReceiptSchema,
  ProductionOwnerResultSchema,
  serializeCanonicalJson,
  type ProductionOwnerKind,
  type ProductionOwnerOutputFile,
  type ProductionOwnerReceipt,
  type ProductionOwnerResult,
} from "../../../src/contracts";
import {
  getProductionRunPaths,
  writeProductionFileAtomic,
} from "./run-store";

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const safeRelativePath = (value: string) => {
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("://") ||
    value.split("/").some((part) => part === "" || part === "..")
  ) {
    throw new Error("Owner output path is unsafe.");
  }
  return value;
};

const assertInsideRoot = (rootDir: string, absolutePath: string) => {
  const resolved = relative(rootDir, absolutePath);
  if (
    resolved === "" ||
    resolved === ".." ||
    resolved.startsWith(`..${sep}`) ||
    isAbsolute(resolved)
  ) {
    throw new Error("Owner output path escapes the repository root.");
  }
};

const pathState = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertRegularPathChain = async ({
  rootDir,
  relativePath,
  allowMissing,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly allowMissing: boolean;
}) => {
  safeRelativePath(relativePath);
  const rootMetadata = await lstat(rootDir);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Owner repository root must be a regular directory.");
  }
  const rootRealpath = await realpath(rootDir);
  let current = rootDir;
  for (const part of relativePath.split("/")) {
    current = join(current, part);
    assertInsideRoot(rootDir, current);
    const metadata = await pathState(current);
    if (metadata === null) {
      if (allowMissing) return null;
      throw new Error(`Owner output is missing: ${basename(relativePath)}.`);
    }
    if (metadata.isSymbolicLink()) {
      throw new Error("Owner output path must not contain symbolic links.");
    }
  }
  const resolved = await realpath(current);
  const fromRoot = relative(rootRealpath, resolved);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error("Owner output resolves outside the repository root.");
  }
  return current;
};

const inspectFile = async ({
  rootDir,
  repositoryPath,
}: {
  readonly rootDir: string;
  readonly repositoryPath: string;
}): Promise<ProductionOwnerOutputFile> => {
  const absolutePath = await assertRegularPathChain({
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
  const absoluteDirectory = await assertRegularPathChain({
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
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) {
      throw new Error("Owner output tree must not contain symbolic links.");
    }
    const repositoryPath = `${relativeDirectory}/${entry.name}`;
    if (
      excludedPrefixes.some(
        (prefix) => repositoryPath === prefix || repositoryPath.startsWith(`${prefix}/`),
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
      throw new Error("Owner output tree contains an unknown filesystem entry.");
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
        relativeDirectory: safeRelativePath(directory),
        allowMissing,
        excludedPrefixes: scope.excludedPrefixes ?? [],
      })),
    );
  }
  for (const file of scope.files ?? []) {
    const path = safeRelativePath(file);
    const state = await assertRegularPathChain({
      rootDir,
      relativePath: path,
      allowMissing,
    });
    if (state !== null) manifest.push(await inspectFile({ rootDir, repositoryPath: path }));
  }
  for (const required of scope.requiredFiles ?? []) {
    if (!manifest.some(({ repositoryPath }) => repositoryPath === required)) {
      throw new Error(`Required owner output is missing: ${basename(required)}.`);
    }
  }
  if (scope.coverSourceDirectory !== undefined) {
    const directory = await assertRegularPathChain({
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
  manifest.sort((left, right) => left.repositoryPath.localeCompare(right.repositoryPath));
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
    throw new Error("Owner output manifest has unknown files or checksum drift.");
  }
};

export const getOwnerReceiptPath = ({
  rootDir,
  runId,
  ownerKind,
  meaningId,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ownerKind: ProductionOwnerKind;
  readonly meaningId: string | null;
}) => {
  const paths = getProductionRunPaths({ rootDir, runId });
  return ownerKind === "scene"
    ? join(paths.ownerReceipts, "scene", `${meaningId}.json`)
    : join(paths.ownerReceipts, `${ownerKind}.json`);
};

export const getOwnerResultPath = ({
  rootDir,
  runId,
  ownerKind,
  meaningId,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ownerKind: ProductionOwnerKind;
  readonly meaningId: string | null;
}) => {
  const paths = getProductionRunPaths({ rootDir, runId });
  return ownerKind === "scene"
    ? join(paths.ownerResults, "scene", `${meaningId}.json`)
    : join(paths.ownerResults, `${ownerKind}.json`);
};

const readOptionalJson = async ({
  rootDir,
  path,
}: {
  readonly rootDir: string;
  readonly path: string;
}) => {
  try {
    const repositoryPath = relative(rootDir, path).split(sep).join("/");
    const resolved = await assertRegularPathChain({
      rootDir,
      relativePath: repositoryPath,
      allowMissing: true,
    });
    if (resolved === null) return null;
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Owner inbox artifact must be a regular file.");
    }
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const readOwnerReceipt = async (request: Parameters<typeof getOwnerReceiptPath>[0]) => {
  const raw = await readOptionalJson({
    rootDir: request.rootDir,
    path: getOwnerReceiptPath(request),
  });
  return raw === null ? null : ProductionOwnerReceiptSchema.parse(raw);
};

export const readOwnerResult = async (request: Parameters<typeof getOwnerResultPath>[0]) => {
  const raw = await readOptionalJson({
    rootDir: request.rootDir,
    path: getOwnerResultPath(request),
  });
  return raw === null ? null : ProductionOwnerResultSchema.parse(raw);
};

const syncDirectory = async (directory: string) => {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EBADF"]).has((error as NodeJS.ErrnoException).code ?? "")) {
      throw error;
    }
  } finally {
    await handle.close();
  }
};

const comparableReceiptBytes = (receipt: ProductionOwnerReceipt) => {
  const record: Record<string, unknown> = { ...receipt };
  delete record.occurredAt;
  delete record.receiptFingerprint;
  return serializeCanonicalJson(record);
};

const assertCompatibleReceipt = ({
  stored,
  requested,
}: {
  readonly stored: ProductionOwnerReceipt;
  readonly requested: ProductionOwnerReceipt;
}) => {
  if (comparableReceiptBytes(stored) !== comparableReceiptBytes(requested)) {
    throw new Error("Owner receipt identity already has conflicting content.");
  }
};

export const writeOwnerReceiptAtomic = async ({
  rootDir,
  receipt: rawReceipt,
}: {
  readonly rootDir: string;
  readonly receipt: ProductionOwnerReceipt;
}) => {
  const requestedReceipt = ProductionOwnerReceiptSchema.parse(rawReceipt);
  let receipt = requestedReceipt;
  const destination = getOwnerReceiptPath({
    rootDir,
    runId: requestedReceipt.runId,
    ownerKind: requestedReceipt.ownerKind,
    meaningId: requestedReceipt.meaningId,
  });
  let bytes = `${serializeCanonicalJson(receipt)}\n`;
  await mkdir(dirname(destination), { recursive: true });
  await assertRegularPathChain({
    rootDir,
    relativePath: relative(rootDir, dirname(destination)).split(sep).join("/"),
    allowMissing: false,
  });
  const existing = await readOptionalJson({ rootDir, path: destination });
  if (existing !== null) {
    const parsed = ProductionOwnerReceiptSchema.parse(existing);
    assertCompatibleReceipt({ stored: parsed, requested: requestedReceipt });
    return { receipt: parsed, written: false, path: destination } as const;
  }
  const pending = join(dirname(destination), `.${basename(destination)}.pending`);
  const pendingState = await pathState(pending);
  if (
    pendingState !== null &&
    (!pendingState.isFile() || pendingState.isSymbolicLink())
  ) {
    throw new Error("Owner receipt pending artifact must be a regular file.");
  }
  const adoptPending = (raw: unknown) => {
    const parsed = ProductionOwnerReceiptSchema.parse(raw);
    assertCompatibleReceipt({ stored: parsed, requested: requestedReceipt });
    receipt = parsed;
    bytes = `${serializeCanonicalJson(parsed)}\n`;
  };
  const existingPending = await readOptionalJson({ rootDir, path: pending });
  if (existingPending !== null) {
    adoptPending(existingPending);
  } else {
    try {
      await writeProductionFileAtomic({
        destination: pending,
        bytes,
        mode: "create",
      });
    } catch (error) {
      const racedPending = await readOptionalJson({ rootDir, path: pending });
      if (racedPending !== null) {
        adoptPending(racedPending);
      } else {
        const racedDestination = await readOptionalJson({
          rootDir,
          path: destination,
        });
        if (racedDestination === null) throw error;
        const parsed = ProductionOwnerReceiptSchema.parse(racedDestination);
        assertCompatibleReceipt({
          stored: parsed,
          requested: requestedReceipt,
        });
        return {
          receipt: parsed,
          written: false,
          path: destination,
        } as const;
      }
    }
  }
  try {
    const raced = await readOptionalJson({ rootDir, path: destination });
    if (raced !== null) {
      const parsed = ProductionOwnerReceiptSchema.parse(raced);
      assertCompatibleReceipt({ stored: parsed, requested: requestedReceipt });
      await unlink(pending);
      await syncDirectory(dirname(destination));
      return { receipt: parsed, written: false, path: destination } as const;
    }
    await rename(pending, destination);
    await syncDirectory(dirname(destination));
    return { receipt, written: true, path: destination } as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const raced = await readOptionalJson({ rootDir, path: destination });
    if (raced === null) throw error;
    const parsed = ProductionOwnerReceiptSchema.parse(raced);
    assertCompatibleReceipt({ stored: parsed, requested: requestedReceipt });
    return { receipt: parsed, written: false, path: destination } as const;
  }
};

export const writeOwnerResult = async ({
  rootDir,
  result: rawResult,
}: {
  readonly rootDir: string;
  readonly result: ProductionOwnerResult;
}) => {
  const result = ProductionOwnerResultSchema.parse(rawResult);
  const destination = getOwnerResultPath({
    rootDir,
    runId: result.runId,
    ownerKind: result.ownerKind,
    meaningId: result.meaningId,
  });
  const write = await writeProductionFileAtomic({
    destination,
    bytes: `${serializeCanonicalJson(result)}\n`,
    mode: "create",
  });
  return { result, path: destination, written: write.written } as const;
};

export const assertOnlyExpectedOwnerInboxEntries = async ({
  rootDir,
  runId,
  meaningIds,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningIds: ReadonlySet<string>;
}) => {
  const paths = getProductionRunPaths({ rootDir, runId });
  const sceneFiles = new Set([...meaningIds].map((id) => `${id}.json`));
  for (const [directory, allowed] of [
    [paths.ownerReceipts, new Set(["scene", "global-visual.json", "cover.json"])],
    [join(paths.ownerReceipts, "scene"), sceneFiles],
    [paths.ownerResults, new Set(["scene", "global-visual.json", "cover.json"])],
    [join(paths.ownerResults, "scene"), sceneFiles],
    [paths.sceneResults, sceneFiles],
  ] as const) {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Owner receipt/result storage must be a regular directory.");
    }
    const allowedFiles = [...allowed].filter((name) => name.endsWith(".json"));
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name.endsWith(".pending")) {
        if (
          !allowedFiles.some((name) => entry.name === `.${name}.pending`) ||
          !entry.isFile() ||
          entry.isSymbolicLink()
        ) {
          throw new Error("Owner receipt pending entry is unknown or non-regular.");
        }
        continue;
      }
      if (entry.name.startsWith(".") && entry.name.endsWith(".tmp")) {
        if (
          !allowedFiles.some(
            (name) =>
              entry.name.startsWith(`.${name}.`) ||
              entry.name.startsWith(`..${name}.pending.`),
          ) ||
          !entry.isFile() ||
          entry.isSymbolicLink()
        ) {
          throw new Error("Owner receipt temporary entry is unknown or non-regular.");
        }
        continue;
      }
      if (!allowed.has(entry.name) || (entry.name === "scene" ? !entry.isDirectory() : !entry.isFile()) || entry.isSymbolicLink()) {
        throw new Error("Owner receipt/result storage contains an unknown entry.");
      }
    }
  }
};
