import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  createProductionRunManifest,
  ProductionRequirementsFreezeSchema,
  resolveCurrentProductionRequirements,
  StoryIdSchema,
} from "../../src/contracts";
import {
  appendProductionRunEvent,
  initializeProductionRunStore,
} from "./adapters/run-store";
import { createProductionStageEvent } from "./domain/events";
import { ensureProductionProjectScaffold } from "./project-scaffold";
import {
  requireCurrentProductionReadabilityPolicy,
  validateProductionReadabilityInputs,
} from "./readability-validator";

type JsonArtifact = Readonly<{ raw: unknown; checksum: `sha256:${string}` }>;

const readJsonArtifact = async (
  path: string,
  label: string,
): Promise<JsonArtifact> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
  return {
    raw,
    checksum: `sha256:${createHash("sha256")
      .update(Uint8Array.from(bytes))
      .digest("hex")}`,
  };
};

const defaultRunId = ({
  storyId,
  now,
}: {
  readonly storyId: string;
  readonly now: Date;
}) => {
  const timestamp = now.toISOString().replace(/\D/gu, "").slice(0, 14);
  return `${storyId}-run-${timestamp}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
};

const toPosixRelative = (rootDir: string, path: string) =>
  relative(rootDir, path).split(sep).join("/");

export const loadCurrentProductionInputs = async ({
  rootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const projectDir = join(rootDir, "src/projects", projectId);
  const paths = {
    brief: join(projectDir, "brief.json"),
    story: join(projectDir, "story.json"),
    narration: join(projectDir, "narration.json"),
    render: join(projectDir, "render.json"),
    storyCheck: join(projectDir, "reviews/story-check.json"),
    requirements: join(projectDir, "production/requirements.json"),
  } as const;
  const [brief, story, narration, render, storyCheck, requirementsArtifact] =
    await Promise.all([
      readJsonArtifact(paths.brief, "brief.json"),
      readJsonArtifact(paths.story, "story.json"),
      readJsonArtifact(paths.narration, "narration.json"),
      readJsonArtifact(paths.render, "render.json"),
      readJsonArtifact(paths.storyCheck, "reviews/story-check.json"),
      readJsonArtifact(paths.requirements, "production/requirements.json"),
    ]);
  const source = {
    brief: brief.raw,
    story: story.raw,
    narration: narration.raw,
    render: render.raw,
    storyCheck: storyCheck.raw,
  } as const;
  const parsedRequirements = ProductionRequirementsFreezeSchema.parse(
    requirementsArtifact.raw,
  );
  validateProductionReadabilityInputs({
    requirements: parsedRequirements,
    story: source.story,
  });
  const requirements = resolveCurrentProductionRequirements({
    requirements: parsedRequirements,
    source,
    sourceChecksums: {
      videoBrief: brief.checksum,
      storySpec: story.checksum,
      narrationSpec: narration.checksum,
      renderSpec: render.checksum,
      storyCheck: storyCheck.checksum,
    },
  });
  if (requirements.storyId !== projectId) {
    throw new Error(
      "Production requirements do not belong to the requested project.",
    );
  }
  return { projectId, projectDir, paths, source, requirements } as const;
};

export const runProductionStart = async ({
  rootDir,
  projectId: rawProjectId,
  clock = () => new Date(),
  createRunId = defaultRunId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly clock?: () => Date;
  readonly createRunId?: (input: {
    readonly storyId: string;
    readonly now: Date;
  }) => string;
}) => {
  const { projectId, requirements } = await loadCurrentProductionInputs({
    rootDir,
    projectId: rawProjectId,
  });
  requireCurrentProductionReadabilityPolicy(requirements);
  await ensureProductionProjectScaffold({
    rootDir,
    storyId: projectId,
    mode: "write",
  });

  const now = clock();
  if (Number.isNaN(now.getTime()))
    throw new Error("Production clock is invalid.");
  const run = createProductionRunManifest({
    runId: createRunId({ storyId: projectId, now }),
    storyId: projectId,
    requirementsPath: `src/projects/${projectId}/production/requirements.json`,
    requirementsFingerprint: requirements.requirementsFingerprint,
    policy: { pollIntervalMs: 1_000, sceneTimeoutMs: 30 * 60 * 1_000 },
    createdAt: now.toISOString(),
  });
  const initialized = await initializeProductionRunStore({ rootDir, run });
  const event = createProductionStageEvent({
    type: "stage-succeeded",
    runId: run.runId,
    storyId: run.storyId,
    sequence: 1,
    eventId: "production-start-succeeded-1",
    stageId: "production-start",
    attempt: 1,
    occurredAt: now.toISOString(),
    commandId: "production-start",
    previousStateFingerprint: initialized.state.stateFingerprint,
    inputFingerprints: [
      {
        artifactId: "requirements",
        fingerprint: requirements.requirementsFingerprint,
      },
    ],
    outputArtifacts: [
      {
        artifactId: "run-manifest",
        repositoryPath: `.producer-runs/${run.runId}/run.json`,
        fingerprint: run.runFingerprint,
      },
    ],
  });
  const appended = await appendProductionRunEvent({
    rootDir,
    runId: run.runId,
    event,
  });
  return {
    runId: run.runId,
    status: appended.state.state,
    statePath: toPosixRelative(
      rootDir,
      join(rootDir, ".producer-runs", run.runId, "state.generated.json"),
    ),
    requirementsFingerprint: requirements.requirementsFingerprint,
  } as const;
};
