import type {
  RuntimePolicyManifest,
  RuntimeResources,
} from "@axmorf/studio";

import { deleteProjectData } from "../../scripts/projects/delete";
import { readCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import { readCurrentProjectDelivery } from "../../scripts/project-production/application/progress-query";
import type { StartWebControlCenterInput } from "../../packages/studio/src/web/server";
import { createSettingsApi } from "./api";
import { runProducerEnvironmentDiagnostics } from "./diagnostics";
import { readProjectProductionProgress } from "./production-progress";

export const createSettingsWebDependencies = ({
  rootDir,
  env,
  runtimeResources,
  runtimePolicyManifest,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runtimeResources: RuntimeResources;
  readonly runtimePolicyManifest: RuntimePolicyManifest;
}): Pick<
  StartWebControlCenterInput,
  "api" | "inspectCurrentDelivery" | "readCurrentRevision"
> => ({
  api: createSettingsApi({
    rootDir,
    env,
    diagnose: () =>
      runProducerEnvironmentDiagnostics({ rootDir, env, runtimeResources }),
    inspectProductionProgress: () => readProjectProductionProgress({ rootDir }),
    deleteProject: ({ projectId }) =>
      deleteProjectData({
        rootDir,
        selection: { kind: "projects", projectIds: [projectId] },
      }),
  }),
  inspectCurrentDelivery: ({ storyId }) =>
    readCurrentProjectDelivery({ rootDir, storyId }),
  readCurrentRevision: ({ projectId }) =>
    readCurrentProductionRevision({
      rootDir,
      projectId,
      runtimePolicyManifest,
    }),
});
