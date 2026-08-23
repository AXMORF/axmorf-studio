import { createWorkspaceProjectStorageLocations } from "../../projects/project-locations";
import {
  createWorkspaceRemotionRenderer,
  type WorkspaceDeliveryLifecyclePort,
  type WorkspaceRemotionToolchain,
} from "../adapters/workspace-remotion-renderer";
import {
  buildDelivery,
  type DeliveryBuildDependencies,
  type DeliveryBuildPort,
} from "./build-delivery";
import { prepareProjectAuthoringBuild } from "./prepare-delivery";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";

type WorkspaceRemotionDeliveryDependencies = Readonly<{
  loadToolchain?: (
    runtimePackRoot: string,
  ) => Promise<WorkspaceRemotionToolchain>;
  buildDelivery?: typeof buildDelivery;
}>;

export type WorkspaceDeliveryRuntime = Readonly<{
  build: DeliveryBuildPort;
  shutdown: () => Promise<void>;
}>;

export const createWorkspaceRemotionDeliveryRuntime = ({
  locations,
  runtime,
  lifecycle,
  dependencies = {},
}: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly lifecycle: WorkspaceDeliveryLifecyclePort;
  readonly dependencies?: WorkspaceRemotionDeliveryDependencies;
}): WorkspaceDeliveryRuntime => {
  const renderer = createWorkspaceRemotionRenderer({
    locations,
    runtime,
    lifecycle,
    dependencies: {
      ...(dependencies.loadToolchain === undefined
        ? {}
        : { loadToolchain: dependencies.loadToolchain }),
    },
  });
  const invokeBuild = dependencies.buildDelivery ?? buildDelivery;
  const build: DeliveryBuildPort = (input) =>
    renderer.execute({
      locations: input.locations,
      runtime: input.runtime,
      projectId: input.projectId,
      run: (renderPorts) => {
        const requestPorts = input.dependencies;
        const deliveryPorts: DeliveryBuildDependencies = {
          prepare:
            requestPorts?.prepare ??
            ((prepareInput) =>
              prepareProjectAuthoringBuild({
                ...prepareInput,
                storage: createWorkspaceProjectStorageLocations(
                  prepareInput.locations,
                ),
              })),
          ...renderPorts,
          ...(requestPorts?.verifyMaterialized === undefined
            ? {}
            : { verifyMaterialized: requestPorts.verifyMaterialized }),
        };
        return invokeBuild(input, deliveryPorts);
      },
    });

  return Object.freeze({ build, shutdown: renderer.shutdown });
};
