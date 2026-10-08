import { join } from "node:path";
import { generateAuthoredFrameTiming } from "../../packages/studio/src/contracts/semantic-timing";
import type { NarrativeProjectSource } from "../../packages/studio/src/contracts/project";
import { writeJsonAtomic } from "./adapters/atomic-files";

/** Frame authority has no provider candidates, seal, mastering or audio projection. */
export const writeAuthoredFrameTiming = async ({
  rootDir,
  projectSource,
}: {
  readonly rootDir: string;
  readonly projectSource: NarrativeProjectSource;
}) => {
  const timing = generateAuthoredFrameTiming({
    story: projectSource.story,
    render: projectSource.render,
  });
  await writeJsonAtomic({
    destination: join(
      rootDir,
      "src/projects",
      projectSource.story.storyId,
      "generated/semantic-timing.generated.json",
    ),
    value: timing,
  });
  return timing;
};
