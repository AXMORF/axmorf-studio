import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  PRODUCTION_RUN_CONTRACT_VERSION,
  ProductionRunIdSchema,
} from "../../../src/contracts/production-run";
import { StoryIdSchema } from "../../../src/contracts/primitives";
import {
  ProductionWatcherLaunchIntentSchema,
  ProductionWatcherLaunchReceiptSchema,
} from "../../../src/contracts/production-owner";
import {
  getProductionRunPaths,
  readProductionRunStore,
} from "../adapters/run-store";

const readOptionalJson = async (path: string, label: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${label} must be a regular file.`);
    }
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const readRequiredJson = async (path: string, label: string) => {
  const raw = await readOptionalJson(path, label);
  if (raw === null) throw new Error(`${label} is missing.`);
  return raw;
};

export const discoverLatestProductionProgressRuns = async (rootDir: string) => {
  const runsRoot = join(rootDir, ".producer-runs");
  let entries;
  try {
    entries = await readdir(runsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        latestRunIds: new Map<string, string>(),
        invalidProjectIds: new Set<string>(),
      };
    }
    throw error;
  }
  const invalidProjectIds = new Set<string>();
  const runs = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error("Production runs root contains an unsafe entry.");
      }
      const runId = ProductionRunIdSchema.parse(entry.name);
      const raw = await readRequiredJson(
        join(runsRoot, runId, "run.json"),
        "Production run manifest",
      );
      if (
        raw === null ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        (raw as Record<string, unknown>).contractVersion !==
          PRODUCTION_RUN_CONTRACT_VERSION
      ) {
        return null;
      }
      const identity = raw as Record<string, unknown>;
      const storyId = StoryIdSchema.parse(identity.storyId);
      if (
        identity.runId !== runId ||
        typeof identity.createdAt !== "string" ||
        Number.isNaN(Date.parse(identity.createdAt))
      ) {
        invalidProjectIds.add(storyId);
        return null;
      }
      return {
        runId,
        storyId,
        createdAtMs: Date.parse(identity.createdAt),
      };
    }),
  );
  const currentRuns = runs.filter((run) => run !== null);
  const latestByProject = new Map<string, (typeof currentRuns)[number]>();
  for (const run of currentRuns) {
    const previous = latestByProject.get(run.storyId);
    if (
      previous === undefined ||
      run.createdAtMs > previous.createdAtMs ||
      (run.createdAtMs === previous.createdAtMs &&
        run.runId.localeCompare(previous.runId) > 0)
    ) {
      latestByProject.set(run.storyId, run);
    }
  }
  return {
    latestRunIds: new Map(
      [...latestByProject].map(([projectId, run]) => [projectId, run.runId]),
    ),
    invalidProjectIds,
  };
};

export const readProductionProgressRun = async (input: {
  readonly rootDir: string;
  readonly runId: string;
}) => {
  const { run, events, state } = await readProductionRunStore(input);
  return { run, events, state } as const;
};

export const readProductionWatcherProgress = async ({
  rootDir,
  runId,
  storyId,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly storyId: string;
}) => {
  const paths = getProductionRunPaths({ rootDir, runId });
  const [rawIntent, rawReceipt] = await Promise.all([
    readOptionalJson(paths.watcherLaunchIntent, "Watcher launch intent"),
    readOptionalJson(paths.watcherLaunchReceipt, "Watcher launch receipt"),
  ]);
  if (rawReceipt !== null && rawIntent === null) {
    throw new Error("Watcher launch receipt exists without its intent.");
  }
  if (rawIntent === null) {
    return { status: "pending" as const, startedAt: null };
  }
  const intent = ProductionWatcherLaunchIntentSchema.parse(rawIntent);
  if (intent.runId !== runId || intent.storyId !== storyId) {
    throw new Error("Watcher launch intent is stale.");
  }
  if (rawReceipt === null) {
    return { status: "attention" as const, startedAt: null };
  }
  const receipt = ProductionWatcherLaunchReceiptSchema.parse(rawReceipt);
  if (
    receipt.runId !== runId ||
    receipt.storyId !== storyId ||
    receipt.intentFingerprint !== intent.intentFingerprint
  ) {
    throw new Error("Watcher launch receipt is stale.");
  }
  return { status: "running" as const, startedAt: receipt.startedAt };
};
