import { checkProducerTaskWorkspace } from "./task-check";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { deriveCoverCompositionBaseId } from "../../../src/contracts";
import { validateDeliveryCoverSource } from "../domain/cover-source";

const COVER_FILES = [
  ["Cover4x3.tsx", "cover-4x3"],
  ["Cover3x4.tsx", "cover-3x4"],
  ["Root.tsx", "root"],
  ["index.ts", "index"],
] as const;

export const checkCoverTask = async (
  input: Parameters<typeof checkProducerTaskWorkspace>[0],
) => {
  const checked = await checkProducerTaskWorkspace(input);
  if (checked.task.taskKind !== "cover-owner")
    throw new Error("Task is not a Cover task.");
  const compositionId = deriveCoverCompositionBaseId(checked.task.storyId);
  for (const [fileName, role] of COVER_FILES) {
    validateDeliveryCoverSource({
      sourcePath: `src/projects/${checked.task.storyId}/delivery/cover/${fileName}`,
      source: await readFile(join(checked.workspace, "src", fileName), "utf8"),
      role,
      compositionId,
    });
  }
  return checked;
};
