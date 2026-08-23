import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  AuthoringRequirementsSchema,
  ResourceCatalogSchema,
  SemanticTimingSchema,
  StoryResourcePoolSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildSceneProductionBrief,
  computeVisualStyleFingerprint,
  serializeCanonicalJson,
  validateSceneProductionBrief,
  validateStoryResourcePool,
} from "../../../src/contracts";
import {
  PendingSceneAuthoringSchema,
} from "../../../src/contracts/project-create";
import { StoryIdSchema } from "../../../src/contracts/primitives";
import type { ProjectCatalogProjectionPort } from "../../catalog/generate";
import { writeTextFileAtomic } from "../../shared/atomic-file";
import type { ProductionLocations } from "../../project-production/application/production-locations";

export const PENDING_SCENE_AUTHORING_PATH =
  "production/pending-scene-production-brief.json" as const;

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const readProjectJson = async ({
  locations,
  projectId,
  relativePath,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly relativePath: string;
}) =>
  JSON.parse(
    await readFile(
      join(locations.projectSourceRoot, projectId, relativePath),
      "utf8",
    ),
  ) as unknown;

export const projectPendingSceneAuthoring = async (
  {
    locations,
    projectId: rawProjectId,
  }: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
  },
  projectCatalog: ProjectCatalogProjectionPort,
) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const required = [
    PENDING_SCENE_AUTHORING_PATH,
    "story.json",
    "production/requirements.json",
    "generated/semantic-timing.generated.json",
    "visual-style.json",
    "production/story-resource-pool.json",
  ] as const;
  const values: unknown[] = [];
  const missing: string[] = [];
  for (const relativePath of required) {
    try {
      values.push(
        await readProjectJson({ locations, projectId, relativePath }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        missing.push(`src/projects/${projectId}/${relativePath}`);
        values.push(null);
      } else {
        throw error;
      }
    }
  }
  if (missing.length > 0) {
    return { projected: false, missingLogicalInputs: missing.sort() } as const;
  }
  const pending = PendingSceneAuthoringSchema.parse(values[0]);
  const story = StorySpecSchema.parse(values[1]);
  const requirements = AuthoringRequirementsSchema.parse(values[2]);
  const timing = SemanticTimingSchema.parse(values[3]);
  const visualStyle = VisualStyleSpecSchema.parse(values[4]);
  const catalog = ResourceCatalogSchema.parse(
    (await projectCatalog({ locations, projectId, mode: "write" })).catalog,
  );
  const pool = validateStoryResourcePool({
    pool: StoryResourcePoolSchema.parse(values[5]),
    catalog,
    requirementsFingerprint: requirements.requirementsFingerprint,
  });
  const styleEntry = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (
    pending.storyId !== projectId ||
    story.storyId !== projectId ||
    requirements.storyId !== projectId ||
    timing.storyId !== projectId ||
    visualStyle.storyId !== projectId ||
    styleEntry === undefined ||
    visualStyle.resourceCatalogFingerprint !== catalog.catalogFingerprint
  ) {
    throw new Error("Pending Scene authoring identity is stale.");
  }
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  const brief = buildSceneProductionBrief({
    storyId: projectId,
    requirementsFingerprint: requirements.requirementsFingerprint,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    resourcePoolFingerprint: pool.poolFingerprint,
    soundPolicy: requirements.enhancementSelection.sound,
    reviewPolicy: "mechanical-only",
    scenes: pending.scenes,
  });
  validateSceneProductionBrief({
    brief,
    story,
    requirements,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    pool,
  });
  const destination = join(
    locations.projectSourceRoot,
    projectId,
    "production/scene-production-brief.json",
  );
  const result = await writeTextFileAtomic({
    destination,
    bytes: jsonBytes(brief),
    mode: "replace",
  });
  return {
    projected: true,
    written: result.written,
    logicalPath: `src/projects/${projectId}/production/scene-production-brief.json`,
    briefFingerprint: brief.briefFingerprint,
    missingLogicalInputs: [],
  } as const;
};
