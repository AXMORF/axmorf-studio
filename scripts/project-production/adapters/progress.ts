import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { StoryIdSchema } from "@axmorf/studio/contracts";
import {
  readExecutionAttemptDiagnosticBaseline,
  readExecutionAttemptProgress,
} from "./attempt-store";

export const readLatestExecutionAttempt = async ({
  rootDir,
  storyId: rawStoryId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  let entries;
  try {
    entries = await readdir(join(rootDir, ".producer-attempts", storyId), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const attempts = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const progress = await readExecutionAttemptProgress({
        rootDir,
        storyId,
        attemptId: entry.name,
      });
      if (progress !== null) attempts.push(progress);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Execution attempt identity is cross-bound."
      ) {
        throw error;
      }
      continue;
    }
  }
  return (
    attempts.sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.attemptId.localeCompare(left.attemptId),
    )[0] ?? null
  );
};

export const readProductionDiagnosticBaseline =
  readExecutionAttemptDiagnosticBaseline;
