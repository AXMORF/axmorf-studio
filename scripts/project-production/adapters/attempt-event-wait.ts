import { watch } from "node:fs";
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
    if (
      filename?.endsWith(".json") === true &&
      (eventType === "rename" || eventType === "change")
    ) {
      settle();
    }
  });
  watcher.once("error", (error) => settle(error));
  const timeout = setTimeout(
    () => settle(new ExecutionAttemptEventWaitTimeoutError()),
    timeoutMs,
  );
  return {
    ready,
    changed,
    close: () => {
      clearTimeout(timeout);
      watcher.close();
    },
  };
};
