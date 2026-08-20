import { randomUUID } from "node:crypto";
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
  ExecutionAttemptDeliveryResultSchema,
  ExecutionAttemptEventSchema,
  ExecutionAttemptProgressSchema,
  ExecutionAttemptSchema,
  ExecutionAttemptTaskOutcomeSchema,
  ProducerPlanSchema,
  ProducerTaskSpecSchema,
  StoryIdSchema,
  serializeCanonicalJson,
  type ExecutionAttempt,
  type ExecutionAttemptDeliveryResult,
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
import { inspectCurrentDelivery } from "./current-delivery-inspection";

const attemptsStorageRoot = (rootDir: string) =>
  join(rootDir, ".producer-attempts");

const attemptsRoot = (rootDir: string, storyId: string) =>
  join(attemptsStorageRoot(rootDir), StoryIdSchema.parse(storyId));

const attemptRoot = (rootDir: string, storyId: string, attemptId: string) =>
  join(attemptsRoot(rootDir, storyId), z.string().uuid().parse(attemptId));

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
  rootDir,
  storyId: rawStoryId,
  create,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly create: boolean;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const storage = attemptsStorageRoot(rootDir);
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

  const story = attemptsRoot(rootDir, storyId);
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
  rootDir,
  storyId,
  attemptId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  if (!(await assertAttemptParents({ rootDir, storyId, create: false }))) {
    return false;
  }
  const directory = attemptRoot(rootDir, storyId, attemptId);
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
  rootDir,
  storyId,
  attemptId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  if (!(await assertAttemptDirectory({ rootDir, storyId, attemptId }))) {
    return false;
  }
  try {
    const metadata = await lstat(
      join(attemptRoot(rootDir, storyId, attemptId), "events"),
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

const notVerifiedDelivery = {
  status: "not-verified",
  deliveryBuildId: null,
  diagnosticCode: null,
  deliveryMedia: [],
} as const;

const eventPath = (
  rootDir: string,
  storyId: string,
  attemptId: string,
  eventId: string,
) =>
  join(attemptRoot(rootDir, storyId, attemptId), "events", `${eventId}.json`);

const buildOpenedEvent = (attempt: ExecutionAttempt): ExecutionAttemptEvent =>
  ExecutionAttemptEventSchema.parse({
    schemaVersion: 3,
    contractVersion: EXECUTION_ATTEMPT_EVENT_VERSION,
    eventId: randomUUID(),
    eventKind: "attempt-opened",
    recordedAt: attempt.createdAt,
    attemptId: attempt.attemptId,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    taskOutcome: null,
    deliveryResult: null,
  });

const baseProgress = (
  attempt: ExecutionAttempt,
  eventCount: number,
): ExecutionAttemptProgress =>
  ExecutionAttemptProgressSchema.parse({
    schemaVersion: 3,
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
    deliveryResult: notVerifiedDelivery,
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
  rootDir,
  attempt,
}: {
  readonly rootDir: string;
  readonly attempt: ExecutionAttempt;
}) => {
  if (
    !(await assertAttemptEventsDirectory({
      rootDir,
      storyId: attempt.storyId,
      attemptId: attempt.attemptId,
    }))
  ) {
    return [];
  }
  const directory = join(
    attemptRoot(rootDir, attempt.storyId, attempt.attemptId),
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
  let deliveryResult: ExecutionAttemptDeliveryResult = notVerifiedDelivery;
  for (const event of events) {
    if (event.recordedAt > updatedAt) updatedAt = event.recordedAt;
    if (event.taskOutcome !== null) {
      outcomes.set(event.taskOutcome.taskRevision, event.taskOutcome);
      if (event.taskOutcome.outcome === "failed") {
        dirty.add(event.taskOutcome.taskRevision);
      } else {
        dirty.delete(event.taskOutcome.taskRevision);
      }
    }
    if (event.deliveryResult !== null) {
      deliveryResult = event.deliveryResult;
      state =
        event.deliveryResult.status === "verified" ? "succeeded" : "failed";
      diagnosticCode = event.deliveryResult.diagnosticCode;
    }
  }
  const taskOutcomes = [...outcomes.values()].sort((left, right) =>
    left.taskRevision.localeCompare(right.taskRevision),
  );
  return ExecutionAttemptProgressSchema.parse({
    schemaVersion: 3,
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
      deliveryMedia: deliveryResult.deliveryMedia,
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
    deliveryResult,
  });
};

const writeProgress = async ({
  rootDir,
  progress,
}: {
  readonly rootDir: string;
  readonly progress: ExecutionAttemptProgress;
}) => {
  if (
    !(await assertAttemptDirectory({
      rootDir,
      storyId: progress.storyId,
      attemptId: progress.attemptId,
    }))
  ) {
    throw missingAttemptError();
  }
  const directory = attemptRoot(rootDir, progress.storyId, progress.attemptId);
  const temporary = join(directory, `.progress.generated-${randomUUID()}.json`);
  try {
    await writeCanonicalJson(temporary, progress, "wx");
    await rename(temporary, join(directory, "progress.generated.json"));
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

export const writeExecutionAttempt = async ({
  rootDir,
  attempt,
}: {
  readonly rootDir: string;
  readonly attempt: ExecutionAttempt;
}) => {
  const parsed = ExecutionAttemptSchema.parse(attempt);
  await assertAttemptParents({
    rootDir,
    storyId: parsed.storyId,
    create: true,
  });
  const parent = attemptsRoot(rootDir, parsed.storyId);
  const directory = attemptRoot(rootDir, parsed.storyId, parsed.attemptId);
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

const readImmutableAttempt = async ({
  rootDir,
  storyId,
  attemptId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  if (!(await assertAttemptDirectory({ rootDir, storyId, attemptId }))) {
    throw missingAttemptError();
  }
  return ExecutionAttemptSchema.parse(
    JSON.parse(
      await readFile(
        join(attemptRoot(rootDir, storyId, attemptId), "attempt.json"),
        "utf8",
      ),
    ),
  );
};

export const readExecutionAttemptProgress = async ({
  rootDir,
  storyId: rawStoryId,
  attemptId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  try {
    const attempt = await readImmutableAttempt({ rootDir, storyId, attemptId });
    if (attempt.storyId !== storyId || attempt.attemptId !== attemptId) {
      throw new Error("Execution attempt identity is cross-bound.");
    }
    const events = await readEvents({ rootDir, attempt });
    return projectProgress({ attempt, events });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const readExecutionAttempt = async (input: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly attemptId: string;
}) => {
  const progress = await readExecutionAttemptProgress(input);
  if (progress === null) {
    throw new Error("Execution attempt is missing.");
  }
  return progress;
};

const readLatestActiveAttemptForRevision = async ({
  rootDir,
  storyId,
  revisionId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly revisionId: string;
}) => {
  if (!(await assertAttemptParents({ rootDir, storyId, create: false }))) {
    return null;
  }
  let entries;
  try {
    entries = await readdir(attemptsRoot(rootDir, storyId), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const candidates: ExecutionAttemptProgress[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const progress = await readExecutionAttemptProgress({
        rootDir,
        storyId,
        attemptId: entry.name,
      });
      if (
        progress !== null &&
        progress.revisionId === revisionId &&
        progress.state !== "succeeded" &&
        progress.state !== "failed"
      ) {
        candidates.push(progress);
      }
    } catch {
      // Invalid diagnostics are ignored because they are not content authority.
    }
  }
  return (
    candidates.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0] ?? null
  );
};

const readCurrentDeliveryBinding = async ({
  rootDir,
  storyId,
  inspectDelivery,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly inspectDelivery: typeof inspectCurrentDelivery;
}) => {
  try {
    const publish = await inspectDelivery({ rootDir, storyId });
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
  rootDir,
  storyId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  if (!(await assertAttemptParents({ rootDir, storyId, create: false }))) {
    return [];
  }
  let entries;
  try {
    entries = await readdir(attemptsRoot(rootDir, storyId), {
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
      const progress = await readExecutionAttemptProgress({
        rootDir,
        storyId,
        attemptId: entry.name,
      });
      if (
        progress !== null &&
        progress.state === "succeeded" &&
        progress.deliveryResult.status === "verified"
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
  kind: "current-delivery" | "latest-verified-attempt";
  attemptId: string;
  revisionId: ExecutionAttemptProgress["revisionId"];
  taskExplanations: ExecutionAttemptProgress["taskExplanations"];
  taskSnapshots: ExecutionAttemptProgress["taskSnapshots"];
}>;

export const readExecutionAttemptDiagnosticBaseline = async ({
  rootDir,
  storyId: rawStoryId,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly dependencies?: Readonly<{
    inspectCurrentDelivery?: typeof inspectCurrentDelivery;
  }>;
}): Promise<ExecutionAttemptDiagnosticBaseline | null> => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const [delivery, candidates] = await Promise.all([
    readCurrentDeliveryBinding({
      rootDir,
      storyId,
      inspectDelivery:
        dependencies.inspectCurrentDelivery ?? inspectCurrentDelivery,
    }),
    readVerifiedAttemptCandidates({ rootDir, storyId }),
  ]);
  const current =
    delivery === null
      ? undefined
      : candidates.find(
          (candidate) =>
            candidate.revisionId === delivery.revisionId &&
            candidate.deliveryResult.deliveryBuildId ===
              delivery.deliveryBuildId,
        );
  const selected = current ?? candidates[0];
  if (selected === undefined) return null;
  return {
    kind:
      current === undefined ? "latest-verified-attempt" : "current-delivery",
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

export const createExecutionAttemptForPlan = async ({
  rootDir,
  plan,
  taskSnapshots,
  estimatedCost,
  actualCost,
  state,
}: {
  readonly rootDir: string;
  readonly plan: ProducerPlan;
  readonly taskSnapshots: readonly TaskDiagnosticSnapshot[];
  readonly estimatedCost: EstimatedProductionCost;
  readonly actualCost: ActualProductionCost;
  readonly state: "waiting-for-agent" | "converging";
}) => {
  const fields = planAttemptFields({
    plan,
    taskSnapshots,
    estimatedCost,
    actualCost,
  });
  const now = new Date().toISOString();
  const attempt = ExecutionAttemptSchema.parse({
    schemaVersion: 3,
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
  await writeExecutionAttempt({ rootDir, attempt });
  return attempt;
};

const appendEvent = async ({
  rootDir,
  progress,
  event,
}: {
  readonly rootDir: string;
  readonly progress: ExecutionAttemptProgress;
  readonly event: ExecutionAttemptEvent;
}) => {
  assertEventIdentity(event, progress);
  if (
    !(await assertAttemptEventsDirectory({
      rootDir,
      storyId: progress.storyId,
      attemptId: progress.attemptId,
    }))
  ) {
    throw missingAttemptError();
  }
  await writeCanonicalJson(
    eventPath(rootDir, progress.storyId, progress.attemptId, event.eventId),
    event,
    "wx",
  );
  const attempt = await readImmutableAttempt({
    rootDir,
    storyId: progress.storyId,
    attemptId: progress.attemptId,
  });
  const projected = projectProgress({
    attempt,
    events: await readEvents({ rootDir, attempt }),
  });
  await writeProgress({ rootDir, progress: projected });
  return projected;
};

export const appendExecutionAttemptTaskOutcome = async ({
  rootDir,
  task: rawTask,
  outcome: rawOutcome,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly outcome: Omit<
    ExecutionAttemptTaskOutcome,
    "taskRevision" | "taskKind"
  >;
}) => {
  const task = ProducerTaskSpecSchema.parse(rawTask);
  const outcome = ExecutionAttemptTaskOutcomeSchema.parse({
    taskRevision: task.taskRevision,
    taskKind: task.taskKind,
    ...rawOutcome,
  });
  const progress = await readLatestActiveAttemptForRevision({
    rootDir,
    storyId: task.storyId,
    revisionId: task.revisionId,
  });
  if (progress === null) throw missingAttemptError();
  if (
    !progress.taskSnapshots.some(
      (snapshot) =>
        snapshot.taskRevision === task.taskRevision &&
        snapshot.taskKind === task.taskKind,
    )
  ) {
    throw new Error("Execution attempt task outcome is not plan-bound.");
  }
  const recordedAt = new Date().toISOString();
  return appendEvent({
    rootDir,
    progress,
    event: ExecutionAttemptEventSchema.parse({
      schemaVersion: 3,
      contractVersion: EXECUTION_ATTEMPT_EVENT_VERSION,
      eventId: randomUUID(),
      eventKind: "task-terminal",
      recordedAt,
      attemptId: progress.attemptId,
      storyId: progress.storyId,
      revisionId: progress.revisionId,
      taskOutcome: outcome,
      deliveryResult: null,
    }),
  });
};

export const appendExecutionAttemptDeliveryResult = async ({
  rootDir,
  storyId: rawStoryId,
  revisionId,
  result: rawResult,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly revisionId: string;
  readonly result: Exclude<
    ExecutionAttemptDeliveryResult,
    { readonly status: "not-verified" }
  >;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const result = ExecutionAttemptDeliveryResultSchema.parse(rawResult);
  if (result.status === "not-verified") {
    throw new Error("A terminal delivery result must be verified or failed.");
  }
  const progress = await readLatestActiveAttemptForRevision({
    rootDir,
    storyId,
    revisionId,
  });
  if (progress === null) throw missingAttemptError();
  return appendEvent({
    rootDir,
    progress,
    event: ExecutionAttemptEventSchema.parse({
      schemaVersion: 3,
      contractVersion: EXECUTION_ATTEMPT_EVENT_VERSION,
      eventId: randomUUID(),
      eventKind: "delivery-terminal",
      recordedAt: new Date().toISOString(),
      attemptId: progress.attemptId,
      storyId: progress.storyId,
      revisionId: progress.revisionId,
      taskOutcome: null,
      deliveryResult: result,
    }),
  });
};
