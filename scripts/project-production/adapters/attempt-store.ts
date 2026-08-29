import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import {
  EXECUTION_ATTEMPT_VERSION,
  EXECUTION_ATTEMPT_EVENT_VERSION,
  EXECUTION_ATTEMPT_PROGRESS_VERSION,
  ExecutionAttemptTerminalResultSchema,
  ExecutionAttemptEventSchema,
  ExecutionAttemptProgressSchema,
  ExecutionAttemptSchema,
  ExecutionAttemptTaskOutcomeSchema,
  ProducerPlanSchema,
  ProducerTaskSpecSchema,
  StoryIdSchema,
  serializeCanonicalJson,
  type ExecutionAttempt,
  type ExecutionAttemptTerminalResult,
  type ExecutionAttemptEvent,
  type ExecutionAttemptProgress,
  type ExecutionAttemptTaskOutcome,
  type ProducerPlan,
  type ProducerTaskSpec,
} from "../../../src/contracts";
import {
  TaskDiagnosticSnapshotListSchema,
  type TaskDiagnosticSnapshot,
} from "../../../src/contracts/execution-attempt";
import type {
  ActualProductionCost,
  EstimatedProductionCost,
} from "../../../src/contracts/production-inspection";
import {
  readOptionalTextFile,
  writeTextFileAtomic,
} from "../../shared/atomic-file";
import type { ProductionLocations } from "../domain/production-locations";
import { inspectCurrentDelivery } from "./current-delivery-inspection";

const attemptsRoot = (attemptStoreRoot: string, storyId: string) =>
  join(attemptStoreRoot, StoryIdSchema.parse(storyId));

const attemptRoot = (
  attemptStoreRoot: string,
  storyId: string,
  attemptId: string,
) =>
  join(
    attemptsRoot(attemptStoreRoot, storyId),
    z.string().uuid().parse(attemptId),
  );

const inspectRealDirectory = async (directory: string) => {
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Execution attempt parent is unsafe.");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const assertAttemptParents = async ({
  attemptStoreRoot,
  storyId: rawStoryId,
  create,
}: {
  readonly attemptStoreRoot: string;
  readonly storyId: string;
  readonly create: boolean;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const storage = attemptStoreRoot;
  if (!(await inspectRealDirectory(storage))) {
    if (!create) return false;
    try {
      await mkdir(storage);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (!(await inspectRealDirectory(storage))) {
      throw new Error("Execution attempt parent is unsafe.");
    }
  }

  const story = attemptsRoot(attemptStoreRoot, storyId);
  if (!(await inspectRealDirectory(story))) {
    if (!create) return false;
    try {
      await mkdir(story);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (!(await inspectRealDirectory(story))) {
      throw new Error("Execution attempt parent is unsafe.");
    }
  }
  return true;
};

const assertAttemptDirectory = async ({
  attemptStoreRoot,
  storyId,
  attemptId,
}: {
  readonly attemptStoreRoot: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  if (
    !(await assertAttemptParents({ attemptStoreRoot, storyId, create: false }))
  ) {
    return false;
  }
  const directory = attemptRoot(attemptStoreRoot, storyId, attemptId);
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Execution attempt directory is unsafe.");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const assertAttemptEventsDirectory = async ({
  attemptStoreRoot,
  storyId,
  attemptId,
}: {
  readonly attemptStoreRoot: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  if (
    !(await assertAttemptDirectory({ attemptStoreRoot, storyId, attemptId }))
  ) {
    return false;
  }
  try {
    const metadata = await lstat(
      join(attemptRoot(attemptStoreRoot, storyId, attemptId), "events"),
    );
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Execution attempt events directory is unsafe.");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const missingAttemptError = () => {
  const error = new Error(
    "Execution attempt is missing.",
  ) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
};

const writeCanonicalJson = (path: string, value: unknown, flag?: "wx") =>
  writeFile(path, `${serializeCanonicalJson(value)}\n`, { flag });

const emptyTaskOutcomeSummary = {
  committedTaskCount: 0,
  currentTaskCount: 0,
  failedTaskCount: 0,
} as const;

const pendingTerminal = {
  status: "pending",
  sourceCurrentId: null,
  deliveryBuildId: null,
  diagnosticCode: null,
  deliveryMedia: [],
} as const;

const eventPath = (
  attemptStoreRoot: string,
  storyId: string,
  attemptId: string,
  eventId: string,
) =>
  join(
    attemptRoot(attemptStoreRoot, storyId, attemptId),
    "events",
    `${eventId}.json`,
  );

const continuationClaimPath = (
  attemptStoreRoot: string,
  storyId: string,
  attemptId: string,
) =>
  join(
    attemptRoot(attemptStoreRoot, storyId, attemptId),
    "continuation.claim.json",
  );

const deterministicEventId = (scope: string) => {
  const hex = createHash("sha256").update(scope).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const buildOpenedEvent = (attempt: ExecutionAttempt): ExecutionAttemptEvent =>
  ExecutionAttemptEventSchema.parse({
    schemaVersion: 4,
    contractVersion: EXECUTION_ATTEMPT_EVENT_VERSION,
    eventId: randomUUID(),
    eventKind: "attempt-opened",
    recordedAt: attempt.createdAt,
    attemptId: attempt.attemptId,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    taskOutcome: null,
    terminalResult: null,
  });

const baseProgress = (
  attempt: ExecutionAttempt,
  eventCount: number,
): ExecutionAttemptProgress =>
  ExecutionAttemptProgressSchema.parse({
    schemaVersion: 4,
    contractVersion: EXECUTION_ATTEMPT_PROGRESS_VERSION,
    attemptId: attempt.attemptId,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    planFingerprint: attempt.planFingerprint,
    artifactSetFingerprint: attempt.artifactSetFingerprint,
    taskExplanations: attempt.taskExplanations,
    taskSnapshots: attempt.taskSnapshots,
    estimatedCost: attempt.estimatedCost,
    actualCost: attempt.actualCost,
    state: attempt.state,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    dirtyTaskRevisions: attempt.dirtyTaskRevisions,
    taskSummary: attempt.taskSummary,
    diagnosticCode: attempt.diagnosticCode,
    eventCount,
    taskOutcomes: [],
    taskOutcomeSummary: emptyTaskOutcomeSummary,
    terminalResult: pendingTerminal,
  });

const assertEventIdentity = (
  event: ExecutionAttemptEvent,
  attempt: Pick<ExecutionAttempt, "attemptId" | "storyId" | "revisionId">,
) => {
  if (
    event.attemptId !== attempt.attemptId ||
    event.storyId !== attempt.storyId ||
    event.revisionId !== attempt.revisionId
  ) {
    throw new Error("Execution attempt event identity is cross-bound.");
  }
};

const readEvents = async ({
  attemptStoreRoot,
  attempt,
}: {
  readonly attemptStoreRoot: string;
  readonly attempt: ExecutionAttempt;
}) => {
  if (
    !(await assertAttemptEventsDirectory({
      attemptStoreRoot,
      storyId: attempt.storyId,
      attemptId: attempt.attemptId,
    }))
  ) {
    return [];
  }
  const directory = join(
    attemptRoot(attemptStoreRoot, attempt.storyId, attempt.attemptId),
    "events",
  );
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const events: ExecutionAttemptEvent[] = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      !entry.name.endsWith(".json")
    ) {
      throw new Error("Execution attempt events contain an unsafe entry.");
    }
    const event = ExecutionAttemptEventSchema.parse(
      JSON.parse(await readFile(join(directory, entry.name), "utf8")),
    );
    if (`${event.eventId}.json` !== entry.name) {
      throw new Error("Execution attempt event filename is stale.");
    }
    assertEventIdentity(event, attempt);
    events.push(event);
  }
  return events.sort(
    (left, right) =>
      left.recordedAt.localeCompare(right.recordedAt) ||
      left.eventId.localeCompare(right.eventId),
  );
};

const projectProgress = ({
  attempt,
  events,
}: {
  readonly attempt: ExecutionAttempt;
  readonly events: readonly ExecutionAttemptEvent[];
}): ExecutionAttemptProgress => {
  const outcomes = new Map<string, ExecutionAttemptTaskOutcome>();
  const dirty = new Set(attempt.dirtyTaskRevisions);
  let state: ExecutionAttemptProgress["state"] = attempt.state;
  let updatedAt = attempt.updatedAt;
  let diagnosticCode = attempt.diagnosticCode;
  let terminalResult: ExecutionAttemptTerminalResult = pendingTerminal;
  for (const event of events) {
    if (event.recordedAt > updatedAt) updatedAt = event.recordedAt;
    if (event.taskOutcome !== null) {
      assertPlanBoundDirtyAgentTask({
        authority: attempt,
        taskRevision: event.taskOutcome.taskRevision,
        taskKind: event.taskOutcome.taskKind,
      });
      if (outcomes.has(event.taskOutcome.taskRevision)) {
        throw new Error(
          "Execution attempt contains duplicate task terminal events.",
        );
      }
      outcomes.set(event.taskOutcome.taskRevision, event.taskOutcome);
      if (event.taskOutcome.outcome === "failed") {
        dirty.add(event.taskOutcome.taskRevision);
      } else {
        dirty.delete(event.taskOutcome.taskRevision);
      }
    }
    if (event.terminalResult !== null) {
      if (terminalResult.status !== "pending") {
        throw new Error(
          "Execution attempt contains duplicate terminal events.",
        );
      }
      terminalResult = event.terminalResult;
      state = event.terminalResult.status === "failed" ? "failed" : "succeeded";
      diagnosticCode = event.terminalResult.diagnosticCode;
    }
  }
  const taskOutcomes = [...outcomes.values()].sort((left, right) =>
    left.taskRevision.localeCompare(right.taskRevision),
  );
  return ExecutionAttemptProgressSchema.parse({
    schemaVersion: 4,
    contractVersion: EXECUTION_ATTEMPT_PROGRESS_VERSION,
    attemptId: attempt.attemptId,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    planFingerprint: attempt.planFingerprint,
    artifactSetFingerprint: attempt.artifactSetFingerprint,
    taskExplanations: attempt.taskExplanations,
    taskSnapshots: attempt.taskSnapshots,
    estimatedCost: attempt.estimatedCost,
    actualCost: {
      ...attempt.actualCost,
      deliveryMedia: terminalResult.deliveryMedia,
    },
    state,
    createdAt: attempt.createdAt,
    updatedAt,
    dirtyTaskRevisions: [...dirty].sort(),
    taskSummary: attempt.taskSummary,
    diagnosticCode,
    eventCount: events.length,
    taskOutcomes,
    taskOutcomeSummary: {
      committedTaskCount: taskOutcomes.filter(
        ({ outcome }) => outcome === "artifact-committed",
      ).length,
      currentTaskCount: taskOutcomes.filter(
        ({ outcome }) => outcome === "artifact-current",
      ).length,
      failedTaskCount: taskOutcomes.filter(
        ({ outcome }) => outcome === "failed",
      ).length,
    },
    terminalResult,
  });
};

const assertPlanBoundDirtyAgentTask = ({
  authority,
  taskRevision,
  taskKind,
}: {
  readonly authority: Pick<
    ExecutionAttempt | ExecutionAttemptProgress,
    "taskSnapshots" | "dirtyTaskRevisions"
  >;
  readonly taskRevision: string;
  readonly taskKind: string;
}) => {
  const snapshot = authority.taskSnapshots.find(
    (candidate) =>
      candidate.taskRevision === taskRevision && candidate.taskKind === taskKind,
  );
  if (snapshot === undefined || snapshot.decision.action !== "dispatch-agent") {
    throw new Error(
      "Execution attempt task outcome is not bound to a dispatched Agent task.",
    );
  }
  if (!authority.dirtyTaskRevisions.includes(snapshot.taskRevision)) {
    throw new Error("Execution attempt task outcome is not dirty.");
  }
};

const writeProgress = async ({
  attemptStoreRoot,
  progress,
}: {
  readonly attemptStoreRoot: string;
  readonly progress: ExecutionAttemptProgress;
}) => {
  if (
    !(await assertAttemptDirectory({
      attemptStoreRoot,
      storyId: progress.storyId,
      attemptId: progress.attemptId,
    }))
  ) {
    throw missingAttemptError();
  }
  const directory = attemptRoot(
    attemptStoreRoot,
    progress.storyId,
    progress.attemptId,
  );
  const temporary = join(directory, `.progress.generated-${randomUUID()}.json`);
  try {
    await writeCanonicalJson(temporary, progress, "wx");
    await rename(temporary, join(directory, "progress.generated.json"));
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

const writeExecutionAttemptAtRoot = async ({
  attemptStoreRoot,
  attempt,
}: {
  readonly attemptStoreRoot: string;
  readonly attempt: ExecutionAttempt;
}) => {
  const parsed = ExecutionAttemptSchema.parse(attempt);
  await assertAttemptParents({
    attemptStoreRoot,
    storyId: parsed.storyId,
    create: true,
  });
  const parent = attemptsRoot(attemptStoreRoot, parsed.storyId);
  const directory = attemptRoot(
    attemptStoreRoot,
    parsed.storyId,
    parsed.attemptId,
  );
  const staging = join(parent, `.${parsed.attemptId}.staging-${randomUUID()}`);
  const opened = buildOpenedEvent(parsed);
  try {
    await mkdir(join(staging, "events"), { recursive: true });
    await writeCanonicalJson(join(staging, "attempt.json"), parsed, "wx");
    await writeCanonicalJson(
      join(staging, "events", `${opened.eventId}.json`),
      opened,
      "wx",
    );
    await writeCanonicalJson(
      join(staging, "progress.generated.json"),
      baseProgress(parsed, 1),
      "wx",
    );
    await rename(staging, directory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return directory;
};

export const writeExecutionAttempt = async (input: {
  readonly locations: ProductionLocations;
  readonly attempt: ExecutionAttempt;
}) =>
  writeExecutionAttemptAtRoot({
    attemptStoreRoot: input.locations.attemptStoreRoot,
    attempt: input.attempt,
  });

const readImmutableAttempt = async ({
  attemptStoreRoot,
  storyId,
  attemptId,
}: {
  readonly attemptStoreRoot: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  if (
    !(await assertAttemptDirectory({ attemptStoreRoot, storyId, attemptId }))
  ) {
    throw missingAttemptError();
  }
  return ExecutionAttemptSchema.parse(
    JSON.parse(
      await readFile(
        join(attemptRoot(attemptStoreRoot, storyId, attemptId), "attempt.json"),
        "utf8",
      ),
    ),
  );
};

const readExecutionAttemptProgressAtRoot = async ({
  attemptStoreRoot,
  storyId: rawStoryId,
  attemptId,
}: {
  readonly attemptStoreRoot: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  try {
    const attempt = await readImmutableAttempt({
      attemptStoreRoot,
      storyId,
      attemptId,
    });
    if (attempt.storyId !== storyId || attempt.attemptId !== attemptId) {
      throw new Error("Execution attempt identity is cross-bound.");
    }
    const events = await readEvents({ attemptStoreRoot, attempt });
    return projectProgress({ attempt, events });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const readExecutionAttemptProgress = async (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly attemptId: string;
}) =>
  readExecutionAttemptProgressAtRoot({
    attemptStoreRoot: input.locations.attemptStoreRoot,
    storyId: input.storyId,
    attemptId: input.attemptId,
  });

export const readExecutionAttempt = async (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  const progress = await readExecutionAttemptProgress(input);
  if (progress === null) {
    throw new Error("Execution attempt is missing.");
  }
  return progress;
};

export const readExecutionAttemptsForStory = async (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
}) => {
  const storyId = StoryIdSchema.parse(input.storyId);
  const attemptStoreRoot = input.locations.attemptStoreRoot;
  if (
    !(await assertAttemptParents({ attemptStoreRoot, storyId, create: false }))
  ) {
    return [];
  }
  const entries = await readdir(attemptsRoot(attemptStoreRoot, storyId), {
    withFileTypes: true,
  });
  const attempts: ExecutionAttemptProgress[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error("Execution attempt store contains an unsafe entry.");
    }
    const progress = await readExecutionAttemptProgressAtRoot({
      attemptStoreRoot,
      storyId,
      attemptId: entry.name,
    });
    if (progress === null) {
      throw new Error("Execution attempt store entry is incomplete.");
    }
    attempts.push(progress);
  }
  return attempts.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.attemptId.localeCompare(right.attemptId),
  );
};

const readCurrentDeliveryBinding = async (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly inspectDelivery: typeof inspectCurrentDelivery;
}) => {
  const { storyId, inspectDelivery } = input;
  try {
    const publish = await inspectDelivery({
      locations: input.locations,
      storyId,
    });
    if (publish === null) return null;
    return {
      revisionId: publish.revisionId,
      deliveryBuildId: publish.deliveryBuildId,
    } as const;
  } catch {
    // A diagnostic baseline is optional and never repairs or reclassifies data.
    return null;
  }
};

const readVerifiedAttemptCandidates = async ({
  attemptStoreRoot,
  storyId,
}: {
  readonly attemptStoreRoot: string;
  readonly storyId: string;
}) => {
  if (
    !(await assertAttemptParents({ attemptStoreRoot, storyId, create: false }))
  ) {
    return [];
  }
  let entries;
  try {
    entries = await readdir(attemptsRoot(attemptStoreRoot, storyId), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const candidates: ExecutionAttemptProgress[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const progress = await readExecutionAttemptProgressAtRoot({
        attemptStoreRoot,
        storyId,
        attemptId: entry.name,
      });
      if (
        progress !== null &&
        progress.state === "succeeded" &&
        (progress.terminalResult.status === "source-current" ||
          progress.terminalResult.status === "delivery-current")
      ) {
        candidates.push(progress);
      }
    } catch {
      // Old, missing, or malformed diagnostics are isolated in place.
    }
  }
  return candidates.sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.attemptId.localeCompare(left.attemptId),
  );
};

export type ExecutionAttemptDiagnosticBaseline = Readonly<{
  kind: "current-delivery" | "latest-successful-attempt";
  attemptId: string;
  revisionId: ExecutionAttemptProgress["revisionId"];
  taskExplanations: ExecutionAttemptProgress["taskExplanations"];
  taskSnapshots: ExecutionAttemptProgress["taskSnapshots"];
}>;

export const readExecutionAttemptDiagnosticBaseline = async (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly dependencies?: Readonly<{
    inspectCurrentDelivery?: typeof inspectCurrentDelivery;
  }>;
}): Promise<ExecutionAttemptDiagnosticBaseline | null> => {
  const { storyId: rawStoryId, dependencies = {} } = input;
  const storyId = StoryIdSchema.parse(rawStoryId);
  const attemptStoreRoot = input.locations.attemptStoreRoot;
  const [delivery, candidates] = await Promise.all([
    readCurrentDeliveryBinding({
      locations: input.locations,
      storyId,
      inspectDelivery:
        dependencies.inspectCurrentDelivery ?? inspectCurrentDelivery,
    }),
    readVerifiedAttemptCandidates({ attemptStoreRoot, storyId }),
  ]);
  const current =
    delivery === null
      ? undefined
      : candidates.find(
          (candidate) =>
            candidate.revisionId === delivery.revisionId &&
            candidate.terminalResult.deliveryBuildId ===
              delivery.deliveryBuildId,
        );
  const selected = current ?? candidates[0];
  if (selected === undefined) return null;
  return {
    kind:
      current === undefined ? "latest-successful-attempt" : "current-delivery",
    attemptId: selected.attemptId,
    revisionId: selected.revisionId,
    taskExplanations: selected.taskExplanations,
    taskSnapshots: selected.taskSnapshots,
  };
};

const planAttemptFields = ({
  plan,
  taskSnapshots,
  estimatedCost,
  actualCost,
}: {
  readonly plan: ProducerPlan;
  readonly taskSnapshots: readonly TaskDiagnosticSnapshot[];
  readonly estimatedCost: EstimatedProductionCost;
  readonly actualCost: ActualProductionCost;
}) => {
  const parsed = ProducerPlanSchema.parse(plan);
  const parsedSnapshots = TaskDiagnosticSnapshotListSchema.parse(taskSnapshots);
  return {
    planFingerprint: parsed.planFingerprint,
    artifactSetFingerprint: parsed.artifactSetFingerprint,
    taskExplanations: parsed.tasks,
    taskSnapshots: parsedSnapshots,
    estimatedCost,
    actualCost,
    dirtyTaskRevisions: parsed.tasks
      .filter(({ action }) => action !== "reuse" && action !== "blocked")
      .map(({ taskRevision }) => taskRevision)
      .filter(
        (revision): revision is NonNullable<typeof revision> =>
          revision !== null,
      )
      .sort(),
    taskSummary: parsed.summary,
  } as const;
};

export const createExecutionAttemptForPlan = async (input: {
  readonly locations: ProductionLocations;
  readonly plan: ProducerPlan;
  readonly taskSnapshots: readonly TaskDiagnosticSnapshot[];
  readonly estimatedCost: EstimatedProductionCost;
  readonly actualCost: ActualProductionCost;
  readonly state: "waiting-for-agent" | "converging";
}) => {
  const { plan, taskSnapshots, estimatedCost, actualCost, state } = input;
  const attemptStoreRoot = input.locations.attemptStoreRoot;
  const fields = planAttemptFields({
    plan,
    taskSnapshots,
    estimatedCost,
    actualCost,
  });
  const now = new Date().toISOString();
  const attempt = ExecutionAttemptSchema.parse({
    schemaVersion: 4,
    contractVersion: EXECUTION_ATTEMPT_VERSION,
    attemptId: randomUUID(),
    storyId: plan.storyId,
    revisionId: plan.revisionId,
    ...fields,
    state,
    createdAt: now,
    updatedAt: now,
    diagnosticCode: null,
  });
  await writeExecutionAttemptAtRoot({ attemptStoreRoot, attempt });
  return attempt;
};

const appendEvent = async ({
  attemptStoreRoot,
  progress,
  event,
}: {
  readonly attemptStoreRoot: string;
  readonly progress: ExecutionAttemptProgress;
  readonly event: ExecutionAttemptEvent;
}) => {
  assertEventIdentity(event, progress);
  if (
    !(await assertAttemptEventsDirectory({
      attemptStoreRoot,
      storyId: progress.storyId,
      attemptId: progress.attemptId,
    }))
  ) {
    throw missingAttemptError();
  }
  const path = eventPath(
    attemptStoreRoot,
    progress.storyId,
    progress.attemptId,
    event.eventId,
  );
  const eventBytes = `${serializeCanonicalJson(event)}\n`;
  try {
    await writeTextFileAtomic({
      destination: path,
      bytes: eventBytes,
      mode: "create",
      // readEvents treats every entry in events/ as immutable authority. Stage
      // outside that strict directory so a concurrent reader never observes
      // another writer's temporary file as an unsafe event.
      temporaryDirectory: attemptRoot(
        attemptStoreRoot,
        progress.storyId,
        progress.attemptId,
      ),
    });
  } catch (error) {
    const existingBytes = await readOptionalTextFile(path);
    if (existingBytes === null) throw error;
    const existing = ExecutionAttemptEventSchema.parse(
      JSON.parse(existingBytes),
    );
    assertEventIdentity(existing, progress);
    const sameTerminal =
      existing.eventKind === event.eventKind &&
      serializeCanonicalJson(existing.taskOutcome) ===
        serializeCanonicalJson(event.taskOutcome) &&
      serializeCanonicalJson(existing.terminalResult) ===
        serializeCanonicalJson(event.terminalResult);
    if (!sameTerminal) {
      throw new Error(
        event.eventKind === "task-terminal"
          ? "Execution attempt task terminal is immutable."
          : "Execution attempt terminal is immutable.",
        { cause: error },
      );
    }
  }

  // Concurrent terminal writers may project different event snapshots. Keep
  // refreshing until the written projection covers the complete event set.
  const attempt = await readImmutableAttempt({
    attemptStoreRoot,
    storyId: progress.storyId,
    attemptId: progress.attemptId,
  });
  for (;;) {
    const before = await readEvents({ attemptStoreRoot, attempt });
    const projected = projectProgress({ attempt, events: before });
    await writeProgress({ attemptStoreRoot, progress: projected });
    const after = await readEvents({ attemptStoreRoot, attempt });
    if (
      before.length === after.length &&
      before.every((value, index) => value.eventId === after[index]?.eventId)
    ) {
      return projected;
    }
  }
};

export const claimExecutionAttemptContinuation = async (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly revisionId: string;
  readonly attemptId: string;
}) => {
  const { storyId: rawStoryId, revisionId, attemptId } = input;
  const attemptStoreRoot = input.locations.attemptStoreRoot;
  const storyId = StoryIdSchema.parse(rawStoryId);
  const progress = await readExecutionAttemptProgressAtRoot({
    attemptStoreRoot,
    storyId,
    attemptId,
  });
  if (progress === null) throw missingAttemptError();
  if (
    progress.revisionId !== revisionId ||
    progress.state === "succeeded" ||
    progress.state === "failed"
  ) {
    throw new Error("Execution attempt is not active continuation authority.");
  }
  const claim = {
    schemaVersion: 1,
    claimId: randomUUID(),
    attemptId: progress.attemptId,
    storyId: progress.storyId,
    revisionId: progress.revisionId,
  } as const;
  const path = continuationClaimPath(attemptStoreRoot, storyId, attemptId);
  try {
    await writeTextFileAtomic({
      destination: path,
      bytes: `${serializeCanonicalJson(claim)}\n`,
      mode: "create",
    });
  } catch (error) {
    if ((await readOptionalTextFile(path)) === null) throw error;
    throw new Error("Execution attempt continuation is already claimed.", {
      cause: error,
    });
  }
  return claim;
};

export const assertExecutionAttemptTaskAuthority = async (input: {
  readonly locations: ProductionLocations;
  readonly attemptId: string;
  readonly task: ProducerTaskSpec;
}) => {
  const task = ProducerTaskSpecSchema.parse(input.task);
  const progress = await readExecutionAttemptProgressAtRoot({
    attemptStoreRoot: input.locations.attemptStoreRoot,
    storyId: task.storyId,
    attemptId: input.attemptId,
  });
  if (progress === null) throw missingAttemptError();
  if (
    progress.revisionId !== task.revisionId ||
    progress.state === "succeeded" ||
    progress.state === "failed" ||
    progress.terminalResult.status !== "pending"
  ) {
    throw new Error("Execution attempt is not the active task authority.");
  }
  assertPlanBoundDirtyAgentTask({
    authority: progress,
    taskRevision: task.taskRevision,
    taskKind: task.taskKind,
  });
  if (
    progress.taskOutcomes.some(
      ({ taskRevision }) => taskRevision === task.taskRevision,
    )
  ) {
    throw new Error("Execution attempt task terminal is immutable.");
  }
  return progress;
};

export const appendExecutionAttemptTaskOutcome = async (input: {
  readonly locations: ProductionLocations;
  readonly attemptId: string;
  readonly task: ProducerTaskSpec;
  readonly outcome: Omit<
    ExecutionAttemptTaskOutcome,
    "taskRevision" | "taskKind"
  >;
}) => {
  const { attemptId, task: rawTask, outcome: rawOutcome } = input;
  const attemptStoreRoot = input.locations.attemptStoreRoot;
  const task = ProducerTaskSpecSchema.parse(rawTask);
  const outcome = ExecutionAttemptTaskOutcomeSchema.parse({
    taskRevision: task.taskRevision,
    taskKind: task.taskKind,
    ...rawOutcome,
  });
  const progress = await assertExecutionAttemptTaskAuthority({
    locations: input.locations,
    attemptId,
    task,
  });
  const recordedAt = new Date().toISOString();
  return appendEvent({
    attemptStoreRoot,
    progress,
    event: ExecutionAttemptEventSchema.parse({
      schemaVersion: 4,
      contractVersion: EXECUTION_ATTEMPT_EVENT_VERSION,
      eventId: deterministicEventId(
        `${progress.attemptId}:task-terminal:${task.taskRevision}`,
      ),
      eventKind: "task-terminal",
      recordedAt,
      attemptId: progress.attemptId,
      storyId: progress.storyId,
      revisionId: progress.revisionId,
      taskOutcome: outcome,
      terminalResult: null,
    }),
  });
};

export const appendExecutionAttemptTerminalResult = async (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly revisionId: string;
  readonly attemptId: string;
  readonly result: Exclude<
    ExecutionAttemptTerminalResult,
    { readonly status: "pending" }
  >;
}) => {
  const {
    storyId: rawStoryId,
    revisionId,
    attemptId,
    result: rawResult,
  } = input;
  const attemptStoreRoot = input.locations.attemptStoreRoot;
  const storyId = StoryIdSchema.parse(rawStoryId);
  const result = ExecutionAttemptTerminalResultSchema.parse(rawResult);
  if (result.status === "pending") {
    throw new Error("An attempt terminal result cannot be pending.");
  }
  const progress = await readExecutionAttemptProgressAtRoot({
    attemptStoreRoot,
    storyId,
    attemptId,
  });
  if (progress === null) throw missingAttemptError();
  if (progress.revisionId !== revisionId) {
    throw new Error("Execution attempt is not the active terminal authority.");
  }
  if (progress.terminalResult.status !== "pending") {
    if (
      serializeCanonicalJson(progress.terminalResult) ===
      serializeCanonicalJson(result)
    ) {
      return progress;
    }
    throw new Error("Execution attempt terminal is immutable.");
  }
  if (progress.state === "succeeded" || progress.state === "failed") {
    throw new Error("Execution attempt is not the active terminal authority.");
  }
  return appendEvent({
    attemptStoreRoot,
    progress,
    event: ExecutionAttemptEventSchema.parse({
      schemaVersion: 4,
      contractVersion: EXECUTION_ATTEMPT_EVENT_VERSION,
      eventId: deterministicEventId(`${progress.attemptId}:attempt-terminal`),
      eventKind: "attempt-terminal",
      recordedAt: new Date().toISOString(),
      attemptId: progress.attemptId,
      storyId: progress.storyId,
      revisionId: progress.revisionId,
      taskOutcome: null,
      terminalResult: result,
    }),
  });
};
