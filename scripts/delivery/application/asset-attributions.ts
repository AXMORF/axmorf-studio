import {
  GlobalVisualPackageSchema,
  ProductionRenderPlanSchema,
  ResourceCatalogSchema,
  ScenePackageSchema,
  buildAssetAttributions,
} from "../../../src/contracts";
import { readDeliveryJson } from "../adapters/filesystem";

export const loadDeliveryAssetAttributions = async ({
  rootDir,
  projectId,
  renderPlan: rawRenderPlan,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly renderPlan: unknown;
}) => {
  const renderPlan = ProductionRenderPlanSchema.parse(rawRenderPlan);
  if (renderPlan.storyId !== projectId) {
    throw new Error(
      "Delivery attribution render plan story identity is stale.",
    );
  }
  const [catalog, scenePackages, globalVisualPackage] = await Promise.all([
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/generated/resource-catalog.generated.json`,
    }).then(ResourceCatalogSchema.parse),
    Promise.all(
      renderPlan.scenePackages.map(({ meaningId }) =>
        readDeliveryJson({
          rootDir,
          relativePath: `src/projects/${projectId}/scenes/${meaningId}/generated/scene-package.generated.json`,
        }).then(ScenePackageSchema.parse),
      ),
    ),
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/global-visual/generated/global-visual-package.generated.json`,
    }).then(GlobalVisualPackageSchema.parse),
  ]);
  for (const [index, identity] of renderPlan.scenePackages.entries()) {
    const scenePackage = scenePackages[index];
    if (
      scenePackage === undefined ||
      scenePackage.storyId !== projectId ||
      scenePackage.meaningId !== identity.meaningId ||
      scenePackage.packageFingerprint !== identity.packageFingerprint ||
      scenePackage.resourceCatalogFingerprint !== catalog.catalogFingerprint
    ) {
      throw new Error("Delivery attribution ScenePackage binding is stale.");
    }
  }
  if (
    globalVisualPackage.storyId !== projectId ||
    globalVisualPackage.packageFingerprint !==
      renderPlan.globalVisual.packageFingerprint ||
    globalVisualPackage.selectedResources.some(
      ({ catalogFingerprint }) =>
        catalogFingerprint !== catalog.catalogFingerprint,
    )
  ) {
    throw new Error(
      "Delivery attribution GlobalVisualPackage binding is stale.",
    );
  }
  return buildAssetAttributions({
    storyId: projectId,
    resourceCatalog: catalog,
    renderPlanFingerprint: renderPlan.renderPlanFingerprint,
    selectedResources: [
      ...scenePackages.flatMap(({ selectedResources }) => selectedResources),
      ...globalVisualPackage.selectedResources,
      ...renderPlan.soundResources,
    ],
  });
};
