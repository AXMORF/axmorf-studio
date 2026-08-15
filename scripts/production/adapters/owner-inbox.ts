import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

import {
  ProductionOwnerReceiptSchema,
  ProductionOwnerResultSchema,
  serializeCanonicalJson,
  type ProductionOwnerKind,
  type ProductionOwnerReceipt,
  type ProductionOwnerResult,
} from "../../../src/contracts";
import { assertRegularOwnerPathChain, ownerPathState } from "./owner-paths";
import { getProductionRunPaths, writeProductionFileAtomic } from "./run-store";

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
    const resolved = await assertRegularOwnerPathChain({
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

export const readOwnerReceipt = async (
  request: Parameters<typeof getOwnerReceiptPath>[0],
) => {
  const raw = await readOptionalJson({
    rootDir: request.rootDir,
    path: getOwnerReceiptPath(request),
  });
  return raw === null ? null : ProductionOwnerReceiptSchema.parse(raw);
};

export const readOwnerResult = async (
  request: Parameters<typeof getOwnerResultPath>[0],
) => {
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
    if (
      !new Set(["EINVAL", "ENOTSUP", "EBADF"]).has(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
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
  await assertRegularOwnerPathChain({
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
  const pending = join(
    dirname(destination),
    `.${basename(destination)}.pending`,
  );
  const pendingState = await ownerPathState(pending);
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
  ownerMeaningIds,
  sceneResultMeaningIds = ownerMeaningIds,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ownerMeaningIds: ReadonlySet<string>;
  readonly sceneResultMeaningIds?: ReadonlySet<string>;
}) => {
  const paths = getProductionRunPaths({ rootDir, runId });
  const sceneFiles = new Set(
    [...ownerMeaningIds].map((id) => `${id}.json`),
  );
  const sceneResultFiles = new Set(
    [...sceneResultMeaningIds].map((id) => `${id}.json`),
  );
  for (const [directory, allowed] of [
    [
      paths.ownerReceipts,
      new Set(["scene", "global-visual.json", "cover.json"]),
    ],
    [join(paths.ownerReceipts, "scene"), sceneFiles],
    [
      paths.ownerResults,
      new Set(["scene", "global-visual.json", "cover.json"]),
    ],
    [join(paths.ownerResults, "scene"), sceneFiles],
    [paths.sceneResults, sceneResultFiles],
  ] as const) {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(
        "Owner receipt/result storage must be a regular directory.",
      );
    }
    const allowedFiles = [...allowed].filter((name) => name.endsWith(".json"));
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name.endsWith(".pending")) {
        if (
          !allowedFiles.some((name) => entry.name === `.${name}.pending`) ||
          !entry.isFile() ||
          entry.isSymbolicLink()
        ) {
          throw new Error(
            "Owner receipt pending entry is unknown or non-regular.",
          );
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
          throw new Error(
            "Owner receipt temporary entry is unknown or non-regular.",
          );
        }
        continue;
      }
      if (
        !allowed.has(entry.name) ||
        (entry.name === "scene" ? !entry.isDirectory() : !entry.isFile()) ||
        entry.isSymbolicLink()
      ) {
        throw new Error(
          "Owner receipt/result storage contains an unknown entry.",
        );
      }
    }
  }
};
