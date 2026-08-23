import {
  inspectProjectCover,
  inspectProjectVideo,
  renderProjectCover,
  renderProjectVideo,
} from "../adapters/media";
import { createRepositoryProjectStorageFromProductionLocations } from "../../projects/repository-project-locations";
import {
  buildDelivery,
  buildDeliveryUnlocked,
  buildCurrentDelivery,
  type DeliveryBuildDependencies,
  type DeliveryBuildPort,
} from "./build-delivery";
import { prepareProjectAuthoringBuild } from "./prepare-delivery";

const repositoryDeliveryDependencies = (
  input: Parameters<DeliveryBuildPort>[0],
): DeliveryBuildDependencies => {
  if (input.locations.layoutKind !== "repository") {
    throw new Error("Repository Delivery requires repository locations.");
  }
  return {
    prepare:
      input.dependencies?.prepare ??
      ((prepareInput) =>
        prepareProjectAuthoringBuild({
          ...prepareInput,
          storage: createRepositoryProjectStorageFromProductionLocations(
            prepareInput.locations,
          ),
        })),
    renderVideo: renderProjectVideo,
    renderCover: renderProjectCover,
    inspectVideo: inspectProjectVideo,
    inspectCover: inspectProjectCover,
    ...(input.dependencies?.verifyMaterialized === undefined
      ? {}
      : { verifyMaterialized: input.dependencies.verifyMaterialized }),
  };
};

export const buildRepositoryDeliveryUnlocked: DeliveryBuildPort = (input) =>
  buildDeliveryUnlocked(input, repositoryDeliveryDependencies(input));

export const buildRepositoryDelivery: DeliveryBuildPort = (input) =>
  buildDelivery(input, repositoryDeliveryDependencies(input));

export const buildCurrentRepositoryDelivery = (
  input: Parameters<typeof buildCurrentDelivery>[0],
) => buildCurrentDelivery(input, { build: buildRepositoryDelivery });
