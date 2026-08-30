import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  NarrativeAutoCheckReportSchema,
  type NarrativeAutoCheckReport,
} from "@axmorf/studio/contracts";
import { getProjectCheckPaths } from "./project-files";

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonValue(entry)]),
    );
  }
  return value;
};

export const serializeNarrativeAutoCheckReport = (rawReport: unknown) => {
  const report = NarrativeAutoCheckReportSchema.parse(rawReport);
  return `${JSON.stringify(sortJsonValue(report), null, 2)}\n`;
};

const syncDirectory = async (directory: string): Promise<void> => {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") {
      throw error;
    }
  } finally {
    await handle?.close();
  }
};

export type NarrativeAutoCheckAtomicWriter = (
  destination: string,
  bytes: string,
) => Promise<void>;

export const writeNarrativeAutoCheckAtomic: NarrativeAutoCheckAtomicWriter =
  async (destination, bytes) => {
    const parent = dirname(destination);
    await mkdir(parent, { recursive: true });
    const temporaryPath = join(
      parent,
      `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let renamed = false;
    try {
      const handle = await open(temporaryPath, "wx");
      try {
        await handle.writeFile(bytes, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, destination);
      renamed = true;
      await syncDirectory(parent);
    } finally {
      if (!renamed) {
        await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
  };

export const writeNarrativeAutoCheckIfPassed = async ({
  rootDir,
  report: rawReport,
  writeAtomic = writeNarrativeAutoCheckAtomic,
}: {
  readonly rootDir: string;
  readonly report: unknown;
  readonly writeAtomic?: NarrativeAutoCheckAtomicWriter;
}): Promise<{ readonly destination: string; readonly written: boolean }> => {
  const report = NarrativeAutoCheckReportSchema.parse(rawReport);
  if (report.aggregateStatus !== "pass") {
    throw new Error("Only a passing Narrative AutoCheck may be persisted.");
  }
  const bytes = serializeNarrativeAutoCheckReport(report);
  const destination = getProjectCheckPaths({
    rootDir,
    projectId: report.storyId,
  }).autoCheck;
  try {
    if ((await readFile(destination, "utf8")) === bytes) {
      return { destination, written: false };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeAtomic(destination, bytes);
  return { destination, written: true };
};

export const checkPersistedNarrativeAutoCheck = async ({
  rootDir,
  expectedReport: rawExpectedReport,
}: {
  readonly rootDir: string;
  readonly expectedReport: unknown;
}): Promise<NarrativeAutoCheckReport> => {
  const expectedReport =
    NarrativeAutoCheckReportSchema.parse(rawExpectedReport);
  if (expectedReport.aggregateStatus !== "pass") {
    throw new Error("Current Narrative AutoCheck did not pass.");
  }
  const destination = getProjectCheckPaths({
    rootDir,
    projectId: expectedReport.storyId,
  }).autoCheck;
  let persistedBytes: string;
  try {
    persistedBytes = await readFile(destination, "utf8");
  } catch (error) {
    throw new Error("Persisted Narrative AutoCheck is missing or unreadable.", {
      cause: error,
    });
  }
  let rawPersisted: unknown;
  try {
    rawPersisted = JSON.parse(persistedBytes);
  } catch (error) {
    throw new Error("Persisted Narrative AutoCheck contains malformed JSON.", {
      cause: error,
    });
  }
  const persisted = NarrativeAutoCheckReportSchema.parse(rawPersisted);
  if (
    persistedBytes !== serializeNarrativeAutoCheckReport(expectedReport) ||
    serializeNarrativeAutoCheckReport(persisted) !==
      serializeNarrativeAutoCheckReport(expectedReport)
  ) {
    throw new Error("Persisted Narrative AutoCheck bytes are stale.");
  }
  return persisted;
};
