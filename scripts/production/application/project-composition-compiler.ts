import { lstat } from "node:fs/promises";
import { join } from "node:path";

import { StoryIdSchema } from "../../../src/contracts";
import { compileTypeScriptImportGraph } from "./typescript-compile";

export const compileTargetProjectComposition = async ({
  rootDir,
  storyId: rawStoryId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const relativeCompositionPath = `src/projects/${storyId}/Composition.tsx`;
  const compositionPath = join(rootDir, relativeCompositionPath);
  const metadata = await lstat(compositionPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Target Project Composition must be a regular file.");
  }
  compileTypeScriptImportGraph({
    rootDir,
    rootPath: compositionPath,
    label: "Target Project Composition TypeScript compile",
  });
  return { storyId, compositionPath: relativeCompositionPath } as const;
};
