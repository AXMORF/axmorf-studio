import { watch } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { StoryIdSchema } from "@axmorf/studio/contracts";

export type ExecutionAttemptEventWait = Readonly<{
  changed: Promise<void>;
  close: () => void;
}>;

export class ExecutionAttemptEventWaitTimeoutError extends Error {
  public constructor() {
    super("Execution attempt event wait timed out.");
    this.name = "ExecutionAttemptEventWaitTimeoutError";
  }
}

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
  let settled = false;
  let resolveChanged: (() => void) | undefined;
  let rejectChanged: ((error: Error) => void) | undefined;
  const changed = new Promise<void>((resolve, reject) => {
    resolveChanged = resolve;
    rejectChanged = reject;
  });
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
    changed,
    close: () => {
      clearTimeout(timeout);
      watcher.close();
    },
  };
};
