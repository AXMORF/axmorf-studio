import { lstat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  ProductionWatcherLaunchIntentSchema,
  ProductionWatcherLaunchReceiptSchema,
  buildProductionWatcherLaunchIntent,
  buildProductionWatcherLaunchReceipt,
  serializeCanonicalJson,
} from "../../../src/contracts";
import { loadCurrentDeliveryCoverAssignment } from "../../delivery/application/cover-inputs";
import { launchDetachedProductionWatcher } from "../adapters/watcher-launch";
import {
  getProductionRunPaths,
  readProductionRunStore,
  writeProductionFileAtomic,
} from "../adapters/run-store";
import { resolveCurrentSceneAssignments } from "./scene-freeze";
import { assertOwnerAssignmentsIsolated } from "./owner-receipt";

const readOptionalJson = async (path: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Watcher launch artifact must be a regular file.");
    }
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const startProductionWatcher = async ({
  rootDir,
  runId,
  command = process.execPath,
  launch = launchDetachedProductionWatcher,
  validateInputs,
  clock = () => new Date(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly command?: string;
  readonly launch?: typeof launchDetachedProductionWatcher;
  readonly validateInputs?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly storyId: string;
  }) => Promise<void>;
  readonly clock?: () => Date;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  if (
    loaded.state.state !== "scene-inputs-frozen" &&
    loaded.state.state !== "waiting-for-owner-results" &&
    loaded.state.state !== "render-ready-running" &&
    loaded.state.state !== "render-ready"
  ) {
    throw new Error("Detached watcher requires frozen owner assignments.");
  }
  if (validateInputs !== undefined) {
    await validateInputs({ rootDir, runId, storyId: loaded.run.storyId });
  } else {
    const [resolved, cover] = await Promise.all([
      resolveCurrentSceneAssignments({ rootDir, runId }),
      loadCurrentDeliveryCoverAssignment({
        rootDir,
        projectId: loaded.run.storyId,
      }),
    ]);
    if (resolved.globalVisualAssignment === null) {
      throw new Error("GlobalVisual assignment is missing.");
    }
    assertOwnerAssignmentsIsolated([
      ...resolved.assignments.map((assignment) => ({
        ownerKind: "scene" as const,
        assignment,
      })),
      {
        ownerKind: "global-visual" as const,
        assignment: resolved.globalVisualAssignment,
      },
      { ownerKind: "cover" as const, assignment: cover.assignment },
    ]);
  }
  const paths = getProductionRunPaths({ rootDir, runId });
  const args = [
    "--import",
    "tsx",
    "scripts/production/cli.ts",
    "watch-worker",
    "--run",
    runId,
  ] as const;
  const intent = buildProductionWatcherLaunchIntent({
    runId,
    storyId: loaded.run.storyId,
    command,
    args,
    cwd: ".",
    logPath: relative(rootDir, paths.watcherLog).split("\\").join("/"),
    launchPolicy: "detached-spawn-acknowledgement-v1",
  });
  const [rawIntent, rawReceipt] = await Promise.all([
    readOptionalJson(paths.watcherLaunchIntent),
    readOptionalJson(paths.watcherLaunchReceipt),
  ]);
  if (rawReceipt !== null && rawIntent === null) {
    throw new Error("Watcher launch receipt exists without its intent.");
  }
  if (rawIntent !== null) {
    const storedIntent = ProductionWatcherLaunchIntentSchema.parse(rawIntent);
    if (storedIntent.intentFingerprint !== intent.intentFingerprint) {
      throw new Error("Watcher launch intent conflicts with current fixed inputs.");
    }
    if (rawReceipt === null) {
      throw new Error(
        "Watcher launch is ambiguous: intent exists without a receipt; refusing to retry.",
      );
    }
    const receipt = ProductionWatcherLaunchReceiptSchema.parse(rawReceipt);
    if (
      receipt.runId !== runId ||
      receipt.storyId !== loaded.run.storyId ||
      receipt.intentFingerprint !== intent.intentFingerprint
    ) {
      throw new Error("Watcher launch receipt is stale.");
    }
    return {
      runId,
      storyId: loaded.run.storyId,
      status: "watcher-started" as const,
      noOp: true as const,
      intentFingerprint: intent.intentFingerprint,
      receiptFingerprint: receipt.receiptFingerprint,
      logPath: intent.logPath,
    };
  }
  const intentWrite = await writeProductionFileAtomic({
    destination: paths.watcherLaunchIntent,
    bytes: `${serializeCanonicalJson(intent)}\n`,
    mode: "create",
  });
  if (!intentWrite.written) {
    const racedReceipt = await readOptionalJson(paths.watcherLaunchReceipt);
    if (racedReceipt === null) {
      throw new Error(
        "Watcher launch is ambiguous: another caller installed the intent; refusing to spawn or retry.",
      );
    }
    const receipt = ProductionWatcherLaunchReceiptSchema.parse(racedReceipt);
    if (
      receipt.runId !== runId ||
      receipt.storyId !== loaded.run.storyId ||
      receipt.intentFingerprint !== intent.intentFingerprint
    ) {
      throw new Error("Watcher launch receipt is stale.");
    }
    return {
      runId,
      storyId: loaded.run.storyId,
      status: "watcher-started" as const,
      noOp: true as const,
      intentFingerprint: intent.intentFingerprint,
      receiptFingerprint: receipt.receiptFingerprint,
      logPath: intent.logPath,
    };
  }
  await launch({
    rootDir,
    command,
    args,
    logPath: join(rootDir, intent.logPath),
  });
  const now = clock();
  if (Number.isNaN(now.getTime())) throw new Error("Watcher launch receipt clock is invalid.");
  const receipt = buildProductionWatcherLaunchReceipt({
    runId,
    storyId: loaded.run.storyId,
    intentFingerprint: intent.intentFingerprint,
    startedAt: now.toISOString(),
    acknowledgementPolicy: "os-spawn-event-v1",
  });
  await writeProductionFileAtomic({
    destination: paths.watcherLaunchReceipt,
    bytes: `${serializeCanonicalJson(receipt)}\n`,
    mode: "create",
  });
  return {
    runId,
    storyId: loaded.run.storyId,
    status: "watcher-started" as const,
    noOp: false as const,
    intentFingerprint: intent.intentFingerprint,
    receiptFingerprint: receipt.receiptFingerprint,
    logPath: intent.logPath,
  };
};
