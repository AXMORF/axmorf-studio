import type { ProcessRunner } from "../../baseline/evidence";
import {
  cleanupCoverCheckWorkspace,
  createCoverCheckWorkspace,
} from "../adapters/cover-files";
import { loadCurrentDeliveryCoverAssignment } from "./cover-inputs";
import { validateDeliveryCoverAuthoring } from "./cover-validation";

export const runDeliveryCoverCheck = async ({
  rootDir,
  projectId,
  runProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const { assignment } = await loadCurrentDeliveryCoverAssignment({
    rootDir,
    projectId,
  });
  const workspace = await createCoverCheckWorkspace();
  try {
    const validated = await validateDeliveryCoverAuthoring({
      rootDir,
      assignment,
      workspace,
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    return {
      projectId: assignment.storyId,
      status: "ready-to-submit" as const,
      assignmentFingerprint: assignment.assignmentFingerprint,
      packageFingerprint: validated.coverPackage.packageFingerprint,
      sourceGraphFingerprint:
        validated.coverPackage.sourceGraphFingerprint,
    };
  } finally {
    await cleanupCoverCheckWorkspace(workspace);
  }
};
