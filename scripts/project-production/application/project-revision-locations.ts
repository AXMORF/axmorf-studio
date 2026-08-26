import { dirname, join } from "node:path";

import {
  ProjectRevisionCandidateIdSchema,
  StoryIdSchema,
} from "../../../src/contracts";
import { createProductionLocations } from "./production-locations";
import type { ProductionLocations } from "./production-locations";

const workspaceRspRoot = (locations: ProductionLocations) => {
  if (locations.layoutKind !== "workspace") {
    throw new Error("Project revision candidates require Workspace locations.");
  }
  return dirname(locations.taskWorkspaceRoot);
};

export const projectRevisionCandidateRoot = ({
  locations,
  storyId: rawStoryId,
  candidateId: rawCandidateId,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly candidateId: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const candidateId = ProjectRevisionCandidateIdSchema.parse(rawCandidateId);
  return join(
    workspaceRspRoot(locations),
    "revisions",
    storyId,
    candidateId,
  );
};

export const createProjectRevisionCandidateLocations = ({
  locations,
  storyId,
  candidateId,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly candidateId: string;
}) => {
  const root = projectRevisionCandidateRoot({
    locations,
    storyId,
    candidateId,
  });
  return createProductionLocations({
    ...locations,
    projectSourceRoot: join(root, "projects"),
    projectMediaRoot: join(root, "media"),
    sourceCurrentRoot: join(root, "current", "source"),
    deliveryRoot: join(root, "deliveries"),
    disposableBuildRoot: join(
      locations.disposableBuildRoot,
      "revision-candidates",
      storyId,
      candidateId,
    ),
    evidenceRoot: join(
      locations.evidenceRoot,
      "revision-candidates",
      storyId,
      candidateId,
    ),
  });
};

export const projectRevisionCandidateRecordPath = (input: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly candidateId: string;
}) => join(projectRevisionCandidateRoot(input), "candidate.json");
