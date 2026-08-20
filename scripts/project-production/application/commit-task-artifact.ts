import { commitTaskArtifact } from "../adapters/artifact-store";
import { checkTaskByKind } from "./check-task";

export const commitProducerTaskArtifact = async ({ rootDir, taskRevision }: { readonly rootDir: string; readonly taskRevision: string }) => {
  const checked = await checkTaskByKind({ rootDir, taskRevision });
  return commitTaskArtifact({ rootDir, task: checked.task, workspace: checked.workspace });
};
