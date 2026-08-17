import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  PRODUCTION_RUN_CONTRACT_VERSION,
  ProductionRunIdSchema,
} from "../../../src/contracts/production-run";
import { StoryIdSchema } from "../../../src/contracts/primitives";
import { loadCurrentDeliveryCoverAssignment } from "../../delivery/application/cover-inputs";
import { readOwnerReceipt } from "../adapters/owner-inbox";
import { readProductionRunStore } from "../adapters/run-store";
import { computeExpectedOwnerReceiptIdentities } from "../domain/expected-owner-identities";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

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

export const readProductionOwnerReceiptProgress = async ({
  rootDir,
  runId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly dependencies?: Readonly<{
    readRun?: typeof readProductionRunStore;
    resolveAssignments?: typeof resolveCurrentSceneAssignments;
    resolveCover?: typeof loadCurrentDeliveryCoverAssignment;
    readReceipt?: typeof readOwnerReceipt;
  }>;
}) => {
  const loaded = await (dependencies.readRun ?? readProductionRunStore)({
    rootDir,
    runId,
  });
  const frozenState = new Set([
    "scene-inputs-frozen",
    "waiting-for-owner-results",
    "render-ready-running",
    "render-ready",
  ]).has(loaded.state.state);
  const failedAfterFreeze =
    loaded.state.state === "failed" &&
    loaded.events.some(
      (event) =>
        event.stageId === "scene-freeze" && event.type === "stage-succeeded",
    );
  if (!frozenState && !failedAfterFreeze) {
    return {
      expectedRenderReadyReceipts: 0,
      receivedRenderReadyReceipts: 0,
      expectedSceneReceipts: 0,
      receivedSceneReceipts: 0,
      globalVisualReceipt: "not-frozen" as const,
      coverReceipt: "not-frozen" as const,
      latestReceiptAt: null,
    };
  }
  const [resolved, cover] = await Promise.all([
    (dependencies.resolveAssignments ?? resolveCurrentSceneAssignments)({
      rootDir,
      runId,
    }),
    (dependencies.resolveCover ?? loadCurrentDeliveryCoverAssignment)({
      rootDir,
      projectId: loaded.run.storyId,
    }),
  ]);
  if (resolved.globalVisualAssignment === null) {
    throw new Error("GlobalVisual assignment is missing.");
  }
  const expected = computeExpectedOwnerReceiptIdentities({
    sceneAssignments: resolved.assignments,
    globalVisualAssignment: resolved.globalVisualAssignment,
    coverAssignment: cover.assignment,
  });
  const receipts = await Promise.all(
    [...expected.renderReadyRequired, ...expected.deliveryOnly].map(
      async (identity) => ({
        identity,
        receipt: await (dependencies.readReceipt ?? readOwnerReceipt)({
          rootDir,
          runId,
          ...identity,
        }),
      }),
    ),
  );
  const current = receipts.filter(
    ({ identity, receipt }) =>
      receipt !== null &&
      receipt.ownerKind === identity.ownerKind &&
      receipt.meaningId === identity.meaningId &&
      receipt.assignmentFingerprint === identity.assignmentFingerprint &&
      receipt.taskInputFingerprint === identity.taskInputFingerprint &&
      receipt.requirementsFingerprint === identity.requirementsFingerprint,
  );
  const sceneRequired = expected.renderReadyRequired.filter(
    ({ ownerKind }) => ownerKind === "scene",
  );
  const coverReceipt = current.find(
    ({ identity }) => identity.ownerKind === "cover",
  )?.receipt;
  const globalVisualReceipt = current.find(
    ({ identity }) => identity.ownerKind === "global-visual",
  )?.receipt;
  const latestReceiptAt = current
    .map(({ receipt }) => receipt!.occurredAt)
    .sort()
    .at(-1);
  return {
    expectedRenderReadyReceipts: expected.renderReadyRequired.length,
    receivedRenderReadyReceipts: current.filter(({ identity }) =>
      expected.renderReadyRequired.some(
        (candidate) =>
          candidate.ownerKind === identity.ownerKind &&
          candidate.meaningId === identity.meaningId,
      ),
    ).length,
    expectedSceneReceipts: sceneRequired.length,
    receivedSceneReceipts: current.filter(
      ({ identity }) => identity.ownerKind === "scene",
    ).length,
    globalVisualReceipt:
      globalVisualReceipt?.status ?? ("missing" as const),
    coverReceipt: coverReceipt?.status ?? ("missing" as const),
    latestReceiptAt: latestReceiptAt ?? null,
  };
};
