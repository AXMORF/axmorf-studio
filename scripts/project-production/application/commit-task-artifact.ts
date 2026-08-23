import { commitTaskArtifact } from "../adapters/artifact-store";
import { checkTaskByKind } from "./check-task";
import type { ProductionLocations } from "./production-locations";

export const commitProducerTaskArtifact = async ({ locations, taskRevision }: { readonly locations: ProductionLocations; readonly taskRevision: string }) => {
  const checked = await checkTaskByKind({ locations, taskRevision });
  return commitTaskArtifact({ locations, task: checked.task, workspace: checked.workspace });
};
