import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  ProductionRunIdSchema,
  ProductionRunManifestSchema,
  ProductionRunStateSchema,
  ProductionStageEventSchema,
  serializeCanonicalJson,
  type ProductionFingerprintRef,
  type ProductionRunManifest,
  type ProductionRunState,
  type ProductionStageEvent,
} from "../../../src/contracts";
import {
  createInitialProductionRunState,
  projectProductionRunState,
} from "../domain/projection";

export type ProductionAtomicWriter = (request: {
  readonly destination: string;
  readonly bytes: string;
  readonly mode: "create" | "replace";
}) => Promise<{ readonly written: boolean }>;

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

const readExistingBytes = async (
  destination: string,
): Promise<string | null> => {
  try {
    return await readFile(destination, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const writeProductionFileAtomic: ProductionAtomicWriter = async ({
  destination,
  bytes,
  mode,
}) => {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const existing = await readExistingBytes(destination);
  if (existing === bytes) return { written: false };
  if (mode === "create" && existing !== null) {
    throw new Error(
      `Immutable production file conflicts: ${basename(destination)}.`,
    );
  }

  const temporaryPath = join(
    parent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let installed = false;
  try {
    const handle = await open(temporaryPath, "wx");
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (mode === "create") {
      try {
        await link(temporaryPath, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const racedBytes = await readExistingBytes(destination);
        if (racedBytes !== bytes) {
          throw new Error(
            `Immutable production file conflicts: ${basename(destination)}.`,
          );
        }
        return { written: false };
      }
      await unlink(temporaryPath);
    } else {
      await rename(temporaryPath, destination);
    }
    installed = true;
    await syncDirectory(parent);
    return { written: true };
  } finally {
    if (!installed) {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
};

const serializeProductionJson = (value: unknown) =>
  `${serializeCanonicalJson(value)}\n`;

export const getProductionRunPaths = ({
  rootDir,
  runId: rawRunId,
}: {
  readonly rootDir: string;
  readonly runId: string;
}) => {
  const runId = ProductionRunIdSchema.parse(rawRunId);
  const root = join(rootDir, ".producer-runs", runId);
  return {
    root,
    run: join(root, "run.json"),
    events: join(root, "events"),
    sceneResults: join(root, "scene-results"),
    globalVisualResult: join(root, "global-visual-result.json"),
    state: join(root, "state.generated.json"),
    lock: join(root, "lock"),
  } as const;
};

const readJson = async (path: string, label: string): Promise<unknown> => {
  let bytes: string;
  try {
    bytes = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
};

const eventFileName = (event: ProductionStageEvent) =>
  `${String(event.sequence).padStart(6, "0")}-${event.eventId}.json`;

const readEvents = async (
  eventsDirectory: string,
): Promise<readonly ProductionStageEvent[]> => {
  let entries;
  try {
    entries = await readdir(eventsDirectory, { withFileTypes: true });
  } catch (error) {
    throw new Error("Production event directory is missing or unreadable.", {
      cause: error,
    });
  }
  const files = entries
    .map((entry) => {
      if (!entry.isFile() || !/^\d{6}-[a-z0-9-]+\.json$/u.test(entry.name)) {
        throw new Error(
          "Production event directory contains an unknown entry.",
        );
      }
      return entry.name;
    })
    .sort();
  const events = [];
  for (const file of files) {
    const event = ProductionStageEventSchema.parse(
      await readJson(join(eventsDirectory, file), `Production event ${file}`),
    );
    if (eventFileName(event) !== file) {
      throw new Error("Production event filename does not match its identity.");
    }
    events.push(event);
  }
  return events;
};

const readStoredRun = async (path: string) =>
  ProductionRunManifestSchema.parse(
    await readJson(path, "Production run manifest"),
  );

const readStoredState = async (path: string) =>
  ProductionRunStateSchema.parse(await readJson(path, "Production run state"));

export const initializeProductionRunStore = async ({
  rootDir,
  run: rawRun,
  writeAtomic = writeProductionFileAtomic,
}: {
  readonly rootDir: string;
  readonly run: ProductionRunManifest;
  readonly writeAtomic?: ProductionAtomicWriter;
}): Promise<{
  readonly run: ProductionRunManifest;
  readonly state: ProductionRunState;
}> => {
  const run = ProductionRunManifestSchema.parse(rawRun);
  const paths = getProductionRunPaths({ rootDir, runId: run.runId });
  await mkdir(join(rootDir, ".producer-runs"), { recursive: true });
  try {
    await mkdir(paths.root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Production runId collision: ${run.runId}.`, {
        cause: error,
      });
    }
    throw error;
  }
  try {
    await mkdir(paths.events);
    await mkdir(paths.sceneResults);
    const state = createInitialProductionRunState(run);
    await writeAtomic({
      destination: paths.run,
      bytes: serializeProductionJson(run),
      mode: "create",
    });
    await writeAtomic({
      destination: paths.state,
      bytes: serializeProductionJson(state),
      mode: "create",
    });
    return { run, state };
  } catch (error) {
    await rm(paths.root, { recursive: true, force: true });
    throw error;
  }
};

export const readProductionRunStore = async ({
  rootDir,
  runId,
  currentInputFingerprints,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly currentInputFingerprints?: readonly ProductionFingerprintRef[];
}) => {
  const paths = getProductionRunPaths({ rootDir, runId });
  const run = await readStoredRun(paths.run);
  if (run.runId !== ProductionRunIdSchema.parse(runId)) {
    throw new Error("Production run manifest path and identity do not match.");
  }
  const events = await readEvents(paths.events);
  const storedState = await readStoredState(paths.state);
  const projectedState = projectProductionRunState({
    run,
    events,
    currentInputFingerprints,
  });
  const storedBytes = await readFile(paths.state, "utf8");
  if (
    storedBytes !== serializeProductionJson(projectedState) ||
    serializeProductionJson(storedState) !==
      serializeProductionJson(projectedState)
  ) {
    throw new Error("Production state projection drift was detected.");
  }
  return { run, events, state: projectedState, paths } as const;
};

type LockRecord = Readonly<{
  schemaVersion: 1;
  runId: string;
  ownerId: string;
  acquiredAt: string;
  token: string;
}>;

export type ProductionRunLock = Readonly<{
  rootDir: string;
  runId: string;
  ownerId: string;
  token: string;
  assertCurrent: () => Promise<void>;
  release: () => Promise<void>;
}>;

const readLockRecord = async (path: string): Promise<LockRecord> => {
  const raw = await readJson(path, "Production writer lock");
  if (
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    (raw as Record<string, unknown>).schemaVersion !== 1 ||
    typeof (raw as Record<string, unknown>).runId !== "string" ||
    typeof (raw as Record<string, unknown>).ownerId !== "string" ||
    typeof (raw as Record<string, unknown>).acquiredAt !== "string" ||
    typeof (raw as Record<string, unknown>).token !== "string" ||
    Object.keys(raw as Record<string, unknown>).length !== 5
  ) {
    throw new Error("Production writer lock is malformed.");
  }
  return raw as LockRecord;
};

export const acquireProductionRunLock = async ({
  rootDir,
  runId: rawRunId,
  ownerId,
  acquiredAt,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ownerId: string;
  readonly acquiredAt: string;
}): Promise<ProductionRunLock> => {
  const runId = ProductionRunIdSchema.parse(rawRunId);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(ownerId)) {
    throw new Error("Production writer ownerId is invalid.");
  }
  if (Number.isNaN(Date.parse(acquiredAt))) {
    throw new Error("Production writer acquiredAt is invalid.");
  }
  const paths = getProductionRunPaths({ rootDir, runId });
  const token = randomUUID();
  const record: LockRecord = {
    schemaVersion: 1,
    runId,
    ownerId,
    acquiredAt,
    token,
  };
  let handle;
  try {
    handle = await open(paths.lock, "wx");
    await handle.writeFile(serializeProductionJson(record), "utf8");
    await handle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Production run already has an active writer lock.", {
        cause: error,
      });
    }
    throw error;
  } finally {
    await handle?.close();
  }
  let released = false;
  const assertCurrent = async () => {
    const current = await readLockRecord(paths.lock);
    if (
      current.runId !== runId ||
      current.ownerId !== ownerId ||
      current.token !== token
    ) {
      throw new Error("Production writer lock ownership changed.");
    }
  };
  const release = async () => {
    if (released) return;
    await assertCurrent();
    await unlink(paths.lock);
    released = true;
  };
  return { rootDir, runId, ownerId, token, assertCurrent, release };
};

const assertProvidedLock = async ({
  lock,
  rootDir,
  runId,
}: {
  readonly lock: ProductionRunLock;
  readonly rootDir: string;
  readonly runId: string;
}) => {
  if (lock.rootDir !== rootDir || lock.runId !== runId) {
    throw new Error("Production writer lock does not belong to this run.");
  }
  await lock.assertCurrent();
};

export const appendProductionRunEvent = async ({
  rootDir,
  runId: rawRunId,
  event: rawEvent,
  currentInputFingerprints,
  writeAtomic = writeProductionFileAtomic,
  lock: providedLock,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly event: ProductionStageEvent;
  readonly currentInputFingerprints?: readonly ProductionFingerprintRef[];
  readonly writeAtomic?: ProductionAtomicWriter;
  readonly lock?: ProductionRunLock;
}) => {
  const runId = ProductionRunIdSchema.parse(rawRunId);
  const event = ProductionStageEventSchema.parse(rawEvent);
  const acquiredLock =
    providedLock ??
    (await acquireProductionRunLock({
      rootDir,
      runId,
      ownerId: `command-${process.pid}-${randomUUID()}`,
      acquiredAt: new Date().toISOString(),
    }));
  const release = providedLock === undefined;
  try {
    await assertProvidedLock({ lock: acquiredLock, rootDir, runId });
    const current = await readProductionRunStore({
      rootDir,
      runId,
      currentInputFingerprints,
    });
    if (event.runId !== current.run.runId) {
      throw new Error("Production event runId does not match the store.");
    }
    const destination = join(current.paths.events, eventFileName(event));
    const eventBytes = serializeProductionJson(event);
    const existing = await readExistingBytes(destination);
    if (existing !== null) {
      if (existing !== eventBytes) {
        throw new Error("Conflicting production event already exists.");
      }
      return { written: false, state: current.state, event } as const;
    }
    const state = projectProductionRunState({
      run: current.run,
      events: [...current.events, event],
      currentInputFingerprints,
    });
    const eventWrite = await writeAtomic({
      destination,
      bytes: eventBytes,
      mode: "create",
    });
    if (!eventWrite.written) {
      throw new Error(
        "Production event write did not create the expected file.",
      );
    }
    await writeAtomic({
      destination: current.paths.state,
      bytes: serializeProductionJson(state),
      mode: "replace",
    });
    return { written: true, state, event } as const;
  } finally {
    if (release) await acquiredLock.release();
  }
};
