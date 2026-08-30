import { join, resolve } from "node:path";

import type { ProjectRevisionCandidateId } from "../../../packages/studio/src/contracts/project-revision";
import {
  StoryIdSchema,
  type StoryId,
} from "../../../packages/studio/src/contracts/primitives";

export const PROJECT_REVISION_STORAGE_DIRECTORY =
  ".producer-revisions" as const;

export type ProjectRevisionProductionScope = Readonly<{
  kind: "project-revision-candidate";
  repositoryRoot: string;
  storyId: StoryId;
  candidateId: ProjectRevisionCandidateId;
  candidateRoot: string;
  definitionRoot: string;
  baseSnapshotRoot: string;
  isolatedRoot: string;
  projectSourceRoot: string;
  projectPublicRoot: string;
  narrationWorkRoot: string;
  producerWorkRoot: string;
  producerAttemptsRoot: string;
  outputRoot: string;
  deliveryRoot: string;
  shared: Readonly<{
    runtimeRoot: string;
    privateConfigRoot: string;
    operationLockPath: string;
    producerArtifactRoot: string;
  }>;
}>;

export type LiveProjectProductionScope = Readonly<{
  kind: "live-project";
  repositoryRoot: string;
  storyId: StoryId;
  candidateId: null;
  isolatedRoot: string;
  projectSourceRoot: string;
  projectPublicRoot: string;
  narrationWorkRoot: string;
  producerWorkRoot: string;
  producerAttemptsRoot: string;
  outputRoot: string;
  deliveryRoot: string;
  shared: ProjectRevisionProductionScope["shared"];
}>;

/**
 * Routing authority for one production. Content identity deliberately excludes
 * this value: a candidate routes the same contracts through isolated mutable
 * roots while runtime policy, locks, and the content-addressed artifact store
 * remain repository-owned.
 */
export type ProductionScope =
  | LiveProjectProductionScope
  | ProjectRevisionProductionScope;

export const createLiveProjectProductionScope = ({
  rootDir,
  storyId: rawStoryId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}): LiveProjectProductionScope => {
  const repositoryRoot = resolve(rootDir);
  const storyId = StoryIdSchema.parse(rawStoryId);
  return {
    kind: "live-project",
    repositoryRoot,
    storyId,
    candidateId: null,
    isolatedRoot: repositoryRoot,
    projectSourceRoot: join(repositoryRoot, "src", "projects"),
    projectPublicRoot: join(repositoryRoot, "public", "projects"),
    narrationWorkRoot: join(repositoryRoot, ".narration-work"),
    producerWorkRoot: join(repositoryRoot, ".producer-work"),
    producerAttemptsRoot: join(repositoryRoot, ".producer-attempts"),
    outputRoot: join(repositoryRoot, "out"),
    deliveryRoot: join(repositoryRoot, "deliveries"),
    shared: {
      runtimeRoot: repositoryRoot,
      privateConfigRoot: join(repositoryRoot, "private"),
      operationLockPath: join(repositoryRoot, ".project-operation.lock"),
      producerArtifactRoot: join(repositoryRoot, ".producer-artifacts"),
    },
  };
};
