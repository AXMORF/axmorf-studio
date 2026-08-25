import { readdirSync, watch } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { StoryIdSchema } from "../../../src/contracts";
import type { ProductionLocations } from "../domain/production-locations";

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

export const isExecutionAttemptEventLogChange = (
  eventType: string,
  filename: string | null,
) =>
  (eventType === "rename" || eventType === "change") &&
  (filename === null || filename.endsWith(".json"));

export const openExecutionAttemptEventWait = (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly attemptId: string;
  readonly timeoutMs: number;
}): ExecutionAttemptEventWait => {
  const { storyId: rawStoryId, attemptId: rawAttemptId, timeoutMs } = input;
  const storyId = StoryIdSchema.parse(rawStoryId);
  const attemptId = z.string().uuid().parse(rawAttemptId);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Execution attempt event wait timeout is invalid.");
  }
  const directory = join(
    input.locations.attemptStoreRoot,
    storyId,
    attemptId,
    "events",
  );
  const baselineEventFiles = new Set(
    readdirSync(directory).filter((filename) => filename.endsWith(".json")),
  );
  let settled = false;
  let resolveChanged: (() => void) | undefined;
  let rejectChanged: ((error: Error) => void) | undefined;
  // Cross one event-loop turn after fs.watch registration. Continuation reads
  // progress only after this barrier, closing the subscribe/read race.
  const ready = new Promise<void>((resolve) => setImmediate(resolve));
  const changed = new Promise<void>((resolve, reject) => {
    resolveChanged = resolve;
    rejectChanged = reject;
  });
  // The original promise still rejects for its consumer after the ready barrier.
  void changed.catch(() => undefined);
  const settle = (error?: Error) => {
    if (settled) return;
    settled = true;
    if (error === undefined) resolveChanged?.();
    else rejectChanged?.(error);
  };
  const watcher = watch(directory, (eventType, filename) => {
    if (isExecutionAttemptEventLogChange(eventType, filename)) {
      settle();
    }
  });
  watcher.once("error", (error) => settle(error));
  let deadlineSettlement: NodeJS.Immediate | undefined;
  const timeout = setTimeout(() => {
    // A filesystem notification can already be queued when a busy process
    // reaches the timers phase after the deadline. Give that same event-loop
    // turn's poll phase priority, then take one final immutable-log snapshot
    // so an event already written before the deadline wins over timeout even
    // if the host delays its fs.watch notification.
    deadlineSettlement = setImmediate(() => {
      try {
        const newEventExists = readdirSync(directory).some(
          (filename) =>
            filename.endsWith(".json") && !baselineEventFiles.has(filename),
        );
        settle(
          newEventExists
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
      if (deadlineSettlement !== undefined) {
        clearImmediate(deadlineSettlement);
      }
      watcher.close();
    },
  };
};
