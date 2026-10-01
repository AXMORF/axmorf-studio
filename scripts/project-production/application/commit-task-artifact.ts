import { commitTaskArtifact } from "../adapters/artifact-store";
import { checkTaskByKind } from "./check-task";

export const commitProducerTaskArtifact = async ({
  rootDir,
  taskRevision,
  artifactRootDir = rootDir,
  runtimeRootDir = rootDir,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly artifactRootDir?: string;
  readonly runtimeRootDir?: string;
}) => {
  const checked = await checkTaskByKind({
    rootDir,
    taskRevision,
    runtimeRootDir,
  });
  const artifact = await commitTaskArtifact({
    rootDir: artifactRootDir,
    task: checked.task,
    workspace: checked.workspace,
  });
  return {
    ...artifact,
    ...("motionReview" in checked
      ? { motionReview: checked.motionReview }
      : {}),
  };
};
