import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseNarrativeProjectSource,
  StoryIdSchema,
  type NarrativeProjectSource,
} from "../../src/contracts";
import type { ProductionLocations } from "../project-production/application/production-locations";
import { resolveNarrationProjectRoot } from "./production-paths";

export const getNarrationProjectPaths = ({
  locations,
  projectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
}) => {
  let storyId: string;
  try {
    storyId = StoryIdSchema.parse(projectId);
  } catch (error) {
    throw new Error("Invalid project slug.", { cause: error });
  }
  const projectDirectory = resolveNarrationProjectRoot({ locations, storyId });
  return {
    projectDirectory,
    brief: join(projectDirectory, "brief.json"),
    story: join(projectDirectory, "story.json"),
    narration: join(projectDirectory, "narration.json"),
    render: join(projectDirectory, "render.json"),
    sealedNarration: join(
      projectDirectory,
      "generated/sealed-narration.generated.json",
    ),
    semanticTiming: join(
      projectDirectory,
      "generated/semantic-timing.generated.json",
    ),
  } as const;
};

const readJson = async (path: string, label: string): Promise<unknown> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
};

export const loadNarrationProjectFiles = async ({
  locations,
  projectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
}): Promise<{
  readonly projectSource: NarrativeProjectSource;
}> => {
  const paths = getNarrationProjectPaths({ locations, projectId });
  const [brief, story, narration, render] = await Promise.all([
    readJson(paths.brief, "brief.json"),
    readJson(paths.story, "story.json"),
    readJson(paths.narration, "narration.json"),
    readJson(paths.render, "render.json"),
  ]);
  return {
    projectSource: parseNarrativeProjectSource({
      brief,
      story,
      narration,
      render,
    }),
  };
};
