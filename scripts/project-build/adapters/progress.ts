import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  PROJECT_BUILD_FAILURE_HINT,
  PROJECT_BUILD_STEP_IDS,
  ProjectBuildProgressSchema,
  StoryIdSchema,
  buildProjectBuildProgress,
  serializeCanonicalJson,
  type ProjectBuildProgress,
  type ProjectBuildStepId,
} from "../../../src/contracts";

const PROGRESS_FILE_NAME = "progress.generated.json";

const metadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const ensureDirectory = async (path: string) => {
  const current = await metadata(path);
  if (current === null) {
    await mkdir(path);
    return;
  }
  if (!current.isDirectory() || current.isSymbolicLink()) {
    throw new Error("Project build progress directory is unsafe.");
  }
};

const removeEmptyDirectory = async (path: string) => {
  try {
    await rmdir(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
  }
};

export const resolveProjectBuildProgressPaths = ({
  rootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const deliveries = join(rootDir, "deliveries");
  const staging = join(deliveries, ".staging");
  const projectBuilds = join(staging, "project-build");
  const projectStaging = join(projectBuilds, projectId);
  return {
    deliveries,
    staging,
    projectBuilds,
    projectStaging,
    progress: join(projectStaging, PROGRESS_FILE_NAME),
  } as const;
};

const writeProgress = async (path: string, progress: ProjectBuildProgress) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${serializeCanonicalJson(progress)}\n`, {
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

export type ProjectBuildProgressReporter = Readonly<{
  bindIdentity: (identity: {
    readonly buildId: string;
    readonly sourceSnapshotFingerprint: string;
  }) => Promise<void>;
  start: (step: ProjectBuildStepId) => Promise<void>;
  succeed: (
    step: ProjectBuildStepId,
    result?: Readonly<{ reused?: boolean }>,
  ) => Promise<void>;
  fail: () => Promise<void>;
  clear: () => Promise<void>;
}>;

export const createProjectBuildProgressReporter = async ({
  rootDir,
  projectId: rawProjectId,
  now = () => new Date().toISOString(),
  attemptId = randomUUID(),
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly now?: () => string;
  readonly attemptId?: string;
}): Promise<ProjectBuildProgressReporter> => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const paths = resolveProjectBuildProgressPaths({ rootDir, projectId });
  for (const path of [
    paths.deliveries,
    paths.staging,
    paths.projectBuilds,
    paths.projectStaging,
  ]) {
    await ensureDirectory(path);
  }
  const startedAt = now();
  let progress = buildProjectBuildProgress({
    attemptId,
    storyId: projectId,
    buildId: null,
    sourceSnapshotFingerprint: null,
    state: "running",
    failureHint: null,
    currentStep: "prepare",
    startedAt,
    updatedAt: startedAt,
    steps: PROJECT_BUILD_STEP_IDS.map((id) => ({
      id,
      status: id === "prepare" ? "running" : "pending",
      occurredAt: id === "prepare" ? startedAt : null,
      reused: null,
    })),
  });
  await writeProgress(paths.progress, progress);

  const currentInput = () => ({
    attemptId: progress.attemptId,
    storyId: progress.storyId,
    buildId: progress.buildId,
    sourceSnapshotFingerprint: progress.sourceSnapshotFingerprint,
    state: progress.state,
    failureHint: progress.failureHint,
    currentStep: progress.currentStep,
    startedAt: progress.startedAt,
    updatedAt: progress.updatedAt,
    steps: progress.steps,
  });

  const update = async (
    step: ProjectBuildStepId,
    state: ProjectBuildProgress["state"],
    reused: boolean | null,
  ) => {
    const updatedAt = now();
    progress = buildProjectBuildProgress({
      ...currentInput(),
      state,
      failureHint: state === "failed" ? PROJECT_BUILD_FAILURE_HINT : null,
      currentStep: step,
      updatedAt,
      steps: progress.steps.map((candidate) =>
        candidate.id === step
          ? {
              ...candidate,
              status: state,
              occurredAt: updatedAt,
              reused,
            }
          : candidate,
      ),
    });
    await writeProgress(paths.progress, progress);
  };

  return {
    bindIdentity: async ({ buildId, sourceSnapshotFingerprint }) => {
      progress = buildProjectBuildProgress({
        ...currentInput(),
        buildId,
        sourceSnapshotFingerprint,
        updatedAt: now(),
      });
      await writeProgress(paths.progress, progress);
    },
    start: (step) => update(step, "running", null),
    succeed: (step, result) =>
      update(step, "succeeded", result?.reused ?? null),
    fail: () => update(progress.currentStep, "failed", null),
    clear: async () => {
      await rm(paths.progress, { force: true });
      await removeEmptyDirectory(paths.projectStaging);
      await removeEmptyDirectory(paths.projectBuilds);
      await removeEmptyDirectory(paths.staging);
    },
  };
};

export const readProjectBuildProgress = async ({
  rootDir,
  projectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const path = resolveProjectBuildProgressPaths({
    rootDir,
    projectId,
  }).progress;
  const current = await metadata(path);
  if (current === null) return null;
  if (!current.isFile() || current.isSymbolicLink()) {
    throw new Error("Project build progress file is unsafe.");
  }
  return ProjectBuildProgressSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
};
