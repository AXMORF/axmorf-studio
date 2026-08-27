import {
  ProjectCreateInputSchema,
  type ProducerConfig,
  type ResourceDescriptor,
} from "../../src/contracts";
import { SCENE_TEMPLATE_OPTIONS } from "../../src/remotion/capabilities/scene-templates/catalog";
import { loadWorkspaceCatalogAuthorityDescriptors } from "../../scripts/catalog/project-files";
import type { ProductionLocations } from "../../scripts/project-production/application/production-locations";
import {
  RspProjectCreateContextSchema,
  RspProjectCreateValidationSchema,
  type RspProjectCreateContext,
  type RspProjectCreateValidation,
} from "../contracts/project-create-context";
import {
  projectCreateFieldIssues,
  type RspFieldIssue,
} from "../contracts/project-create-surface";
import { rspCaptionReadabilityIssues } from "./caption-readability-contract";

type ProviderReadiness = "ready" | "not-configured" | "unavailable";

const configIssue = (): RspFieldIssue => ({
  path: "$",
  code: "rsp-project-create-config-required",
  message: "Project creation requires a configured ProducerConfig.",
  ownerAction: "Open AXMORF Studio Settings and save a valid provider configuration before creating the Project.",
});

const dynamicIssue = (
  path: string,
  code: string,
  message: string,
  ownerAction: string,
): RspFieldIssue => ({ path, code, message, ownerAction });

const selectableResources = (descriptors: readonly ResourceDescriptor[]) =>
  descriptors.filter(
    (descriptor) =>
      (descriptor.kind === "asset" || descriptor.kind === "capability") &&
      descriptor.status === "approved" &&
      descriptor.allowedUse !== "blocked",
  );

const availableStyleProfiles = (descriptors: readonly ResourceDescriptor[]) =>
  descriptors.filter(
    (
      descriptor,
    ): descriptor is Extract<ResourceDescriptor, { kind: "style-profile" }> =>
      descriptor.kind === "style-profile" &&
      descriptor.status === "approved" &&
      descriptor.allowedUse !== "blocked",
  );

export const buildRspProjectCreateContext = async ({
  locations,
  config,
  providerReadiness,
  loadDescriptors = loadWorkspaceCatalogAuthorityDescriptors,
}: {
  readonly locations: ProductionLocations;
  readonly config: ProducerConfig | null;
  readonly providerReadiness: ProviderReadiness;
  readonly loadDescriptors?: typeof loadWorkspaceCatalogAuthorityDescriptors;
}): Promise<RspProjectCreateContext> => {
  const descriptors = await loadDescriptors({ locations });
  const styleProfiles = availableStyleProfiles(descriptors)
    .map(({ styleProfileId: id, title, description }) => ({
      id,
      title,
      description,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const resources = selectableResources(descriptors)
    .map((descriptor) => ({
      id: descriptor.id,
      title: descriptor.title,
      description: descriptor.description,
      kind: descriptor.kind,
      allowedUse: descriptor.allowedUse,
      mediaRole: descriptor.kind === "asset" ? descriptor.mediaRole : null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return RspProjectCreateContextSchema.parse({
    schemaVersion: 1,
    contractVersion: "rsp-project-create-context-v1",
    protocolVersion: "rsp-local-v2",
    config: {
      state: config === null ? "not-configured" : "configured",
      blocker:
        config === null
          ? {
              code: "desktop-producer-config-required",
              message: "ProducerConfig is not configured.",
              ownerAction:
                "Open AXMORF Studio Settings and save a valid provider configuration.",
            }
          : null,
    },
    provider: {
      readiness: providerReadiness,
      requiredForProjectCreate: false,
    },
    styleProfiles,
    publishingCollections: config?.publishingCollections ?? [],
    sceneTemplates: {
      omission: "inherit-producer-config-defaults",
      defaults: config?.sceneDefaults ?? null,
      options: SCENE_TEMPLATE_OPTIONS,
    },
    resources,
    renderDefaults: config?.renderDefaults ?? null,
    commands: {
      validate: "./.rsp/bin/rsp project validate",
      create: "./.rsp/bin/rsp project create",
    },
  });
};

export const validateRspProjectCreate = async ({
  locations,
  config,
  input: rawInput,
  loadDescriptors = loadWorkspaceCatalogAuthorityDescriptors,
}: {
  readonly locations: ProductionLocations;
  readonly config: ProducerConfig | null;
  readonly input: unknown;
  readonly loadDescriptors?: typeof loadWorkspaceCatalogAuthorityDescriptors;
}): Promise<RspProjectCreateValidation> => {
  const parsed = ProjectCreateInputSchema.safeParse(rawInput);
  const issues: RspFieldIssue[] = parsed.success
    ? []
    : [...projectCreateFieldIssues({ error: parsed.error, raw: rawInput })];
  if (config === null) issues.push(configIssue());
  if (!parsed.success || config === null) {
    return RspProjectCreateValidationSchema.parse({
      schemaVersion: 1,
      contractVersion: "rsp-project-create-validation-v1",
      status: "project-create-invalid",
      storyId: parsed.success ? parsed.data.storyId : null,
      issues: issues.slice(0, 50),
    });
  }

  const input = parsed.data;
  issues.push(
    ...rspCaptionReadabilityIssues({
      story: input.story,
      pathPrefix: "$.story",
    }),
  );
  const descriptors = await loadDescriptors({ locations });
  const styleIds = new Set(
    availableStyleProfiles(descriptors).map(({ styleProfileId }) =>
      String(styleProfileId),
    ),
  );
  if (!styleIds.has(input.visualStyle.styleProfileId)) {
    issues.push(
      dynamicIssue(
        "$.visualStyle.styleProfileId",
        "rsp-project-create-style-unavailable",
        "Selected styleProfileId is not available in the embedded Runtime Pack.",
        "Choose one exact id returned by rsp project create-context.",
      ),
    );
  }
  if (
    config.publishingCollections.filter(
      ({ id }) => id === input.publishing.collectionId,
    ).length !== 1
  ) {
    issues.push(
      dynamicIssue(
        "$.publishing.collectionId",
        "rsp-project-create-collection-unavailable",
        "Selected collectionId is not configured exactly once.",
        "Choose one exact id returned by rsp project create-context.",
      ),
    );
  }
  const templateIds = new Set<string>(
    SCENE_TEMPLATE_OPTIONS.map(({ id }) => id),
  );
  const templates = input.sceneTemplates ?? config.sceneDefaults;
  for (const field of [
    "introSceneTemplateId",
    "outroSceneTemplateId",
  ] as const) {
    const templateId = templates[field];
    if (templateId !== null && !templateIds.has(templateId)) {
      issues.push(
        dynamicIssue(
          `$.sceneTemplates.${field}`,
          "rsp-project-create-template-unavailable",
          "Selected Scene template is not available in the embedded Runtime Pack.",
          "Choose one exact id returned by rsp project create-context, use null, or omit sceneTemplates to inherit defaults.",
        ),
      );
    }
  }
  const resources = new Set(
    selectableResources(descriptors).map(({ id }) => String(id)),
  );
  input.resources.allowedResourceIds.forEach((resourceId, index) => {
    if (!resources.has(resourceId)) {
      issues.push(
        dynamicIssue(
          `$.resources.allowedResourceIds[${index}]`,
          "rsp-project-create-resource-unavailable",
          "Selected resource is not currently approved for Project use.",
          "Choose one exact id returned by rsp project create-context or remove it.",
        ),
      );
    }
  });
  if (input.resources.allowedSnapshots.length > 0) {
    issues.push(
      dynamicIssue(
        "$.resources.allowedSnapshots",
        "rsp-project-create-snapshot-import-required",
        "Workspace Project snapshots require an immutable asset import before selection.",
        "Import the asset through rsp asset import, then use the returned Project-owned resource id.",
      ),
    );
  }
  return RspProjectCreateValidationSchema.parse({
    schemaVersion: 1,
    contractVersion: "rsp-project-create-validation-v1",
    status:
      issues.length === 0 ? "project-create-valid" : "project-create-invalid",
    storyId: input.storyId,
    issues: issues.slice(0, 50),
  });
};
