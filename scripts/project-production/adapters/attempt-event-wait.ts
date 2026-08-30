import { readdirSync, watch } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { StoryIdSchema } from "@axmorf/studio/contracts";

export type ExecutionAttemptEventWait = Readonly<{
  ready: Promise<void>;
  changed: Promise<void>;
  close: () => void;
}>;

export class ExecutionAttemptEventWaitTimeoutError extends Error {
  public constructor() {
    super("Execution attempt event wait timed out.");
    this.name = "ExecutionAttemptEventWaitTimeoutError";
  }
}

export const isExecutionAttemptEventNotification = (
  eventType: string,
  filename: string | null,
) =>
  (eventType === "rename" || eventType === "change") &&
  (filename === null || filename.endsWith(".json"));

export const containsNewExecutionAttemptEvent = (
  baseline: ReadonlySet<string>,
  currentEntries: readonly string[],
) =>
  currentEntries.some(
    (entry) => entry.endsWith(".json") && !baseline.has(entry),
  );

export const openExecutionAttemptEventWait = ({
  rootDir,
  storyId: rawStoryId,
  attemptId: rawAttemptId,
  timeoutMs,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly attemptId: string;
  readonly timeoutMs: number;
}): ExecutionAttemptEventWait => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const attemptId = z.string().uuid().parse(rawAttemptId);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Execution attempt event wait timeout is invalid.");
  }
  const directory = join(
    rootDir,
    ".producer-attempts",
    storyId,
    attemptId,
    "events",
  );
  const baseline = new Set(
    readdirSync(directory).filter((entry) => entry.endsWith(".json")),
  );
  let settled = false;
  let resolveChanged: (() => void) | undefined;
  let rejectChanged: ((error: Error) => void) | undefined;
  const changed = new Promise<void>((resolve, reject) => {
    resolveChanged = resolve;
    rejectChanged = reject;
  });
  // The consumer first crosses the readiness barrier. Keep this promise
  // observed in case the watcher fails before that barrier resolves.
  void changed.catch(() => undefined);
  const settle = (error?: Error) => {
    if (settled) return;
    settled = true;
    if (error === undefined) resolveChanged?.();
    else rejectChanged?.(error);
  };
  const watcher = watch(directory, (eventType, filename) => {
    if (isExecutionAttemptEventNotification(eventType, filename)) {
      settle();
    }
  });
  watcher.once("error", (error) => settle(error));
  // fs.watch is registered synchronously, then one event-loop turn is crossed
  // before continuation reads progress. This makes subscribe-before-read a
  // real ordering guarantee instead of a source-code ordering assumption.
  const ready = new Promise<void>((resolve) => setImmediate(resolve));
  let deadlineCheck: NodeJS.Immediate | undefined;
  const timeout = setTimeout(() => {
    // A filesystem notification may already be queued when the timers phase
    // runs. Let the poll phase deliver it first, then verify the immutable log
    // itself so delayed or filename-less notifications cannot lose an event
    // that was installed before the deadline turn.
    deadlineCheck = setImmediate(() => {
      try {
        settle(
          containsNewExecutionAttemptEvent(baseline, readdirSync(directory))
            ? undefined
            : new ExecutionAttemptEventWaitTimeoutError(),
        );
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, timeoutMs);
  return {
    ready,
    changed,
    close: () => {
      clearTimeout(timeout);
      if (deadlineCheck !== undefined) clearImmediate(deadlineCheck);
      watcher.close();
    },
  };
};
