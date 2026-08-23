import { join, posix } from "node:path";

import { StoryIdSchema } from "../../src/contracts";
import type { ProductionLocations } from "../project-production/application/production-locations";

const story = (storyId: string) => StoryIdSchema.parse(storyId);

export const resolveNarrationProjectRoot = ({
  locations,
  storyId,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
}) => join(locations.projectSourceRoot, story(storyId));

export const resolveNarrationMediaRoot = ({
  locations,
  storyId,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
}) => join(locations.projectMediaRoot, story(storyId));

export const resolveNarrationMediaLogicalPath = ({
  locations,
  storyId: rawStoryId,
  logicalPath,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly logicalPath: string;
}) => {
  const storyId = story(rawStoryId);
  const prefix = `public/projects/${storyId}/`;
  if (
    !logicalPath.startsWith(prefix) ||
    logicalPath.includes("\\") ||
    posix.normalize(logicalPath) !== logicalPath
  ) {
    throw new Error("Narration media path is outside the Project media root.");
  }
  const relativePath = logicalPath.slice(prefix.length);
  if (
    relativePath.length === 0 ||
    relativePath.split("/").some((segment) => !segment || segment === "..")
  ) {
    throw new Error("Narration media path is invalid.");
  }
  return join(locations.projectMediaRoot, storyId, ...relativePath.split("/"));
};
