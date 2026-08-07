import {
  StoryIdSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildDeliveryCoverAssignment,
} from "../../../src/contracts";
import { writeOrCheckCoverJson } from "../adapters/cover-files";
import { readDeliveryJson } from "../adapters/filesystem";

export const runDeliveryCoverFreeze = async ({
  rootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const [story, visualStyle] = await Promise.all([
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/story.json`,
    }).then(StorySpecSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/visual-style.json`,
    }).then(VisualStyleSpecSchema.parse),
  ]);
  const assignment = buildDeliveryCoverAssignment({ story, visualStyle });
  const relativePath = `${assignment.exclusivePaths.sourceDirectory}/assignment.generated.json`;
  const written = await writeOrCheckCoverJson({
    rootDir,
    relativePath,
    value: assignment,
  });
  return {
    projectId,
    status: "cover-inputs-frozen" as const,
    noOp: written.noOp,
    assignmentFingerprint: assignment.assignmentFingerprint,
    assignmentPath: `src/projects/${projectId}/delivery/cover/assignment.generated.json`,
  };
};
