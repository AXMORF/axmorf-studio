import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import {
  NarrativeBaselineEvidenceReceiptSchema,
  MasteredNarrationManifestSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  type NarrativeBaselineEvidenceReceipt,
  type MasteredNarrationManifest,
  type SealedNarrationManifest,
  type SemanticTiming,
  type Sha256Digest,
} from "../../src/contracts";
import type { ProductionLocations } from "../project-production/application/production-locations";
import {
  createWorkspaceProjectStorageLocations,
  resolveProjectOwnedLogicalPath,
  type ProjectStorageLocations,
} from "../projects/project-locations";
import { createRepositoryProjectStorageFromProductionLocations } from "../projects/repository-project-locations";

export const getProjectCheckStorage = (
  locations: ProductionLocations,
): ProjectStorageLocations =>
  locations.layoutKind === "workspace"
    ? createWorkspaceProjectStorageLocations(locations)
    : createRepositoryProjectStorageFromProductionLocations(locations);

export const getProjectCheckPaths = ({
  locations,
  projectId,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
}) => {
  const storyId = StoryIdSchema.parse(projectId);
  const storage = getProjectCheckStorage(locations);
  const projectDirectory = join(locations.projectSourceRoot, storyId);
  return {
    storyId,
    projectDirectory,
    brief: join(projectDirectory, "brief.json"),
    story: join(projectDirectory, "story.json"),
    narration: join(projectDirectory, "narration.json"),
    render: join(projectDirectory, "render.json"),
    sealedNarration: join(
      projectDirectory,
      "generated/sealed-narration.generated.json",
    ),
    masteredNarration: join(
      projectDirectory,
      "generated/mastered-narration.generated.json",
    ),
    semanticTiming: join(
      projectDirectory,
      "generated/semantic-timing.generated.json",
    ),
    narrativeBaselineReceipt: join(
      projectDirectory,
      "generated/narrative-baseline-evidence.generated.json",
    ),
    autoCheck: join(
      projectDirectory,
      "generated/narrative-auto-check.generated.json",
    ),
    finalCheck: join(
      projectDirectory,
      "generated/final-mechanical-check.generated.json",
    ),
    visualStyle: join(projectDirectory, "visual-style.json"),
    sceneCoverage: join(
      projectDirectory,
      "generated/scene-coverage.generated.json",
    ),
    rendererRegistry: join(projectDirectory, "renderer-registry.generated.ts"),
    composition: join(projectDirectory, "Composition.tsx"),
    scenesDirectory: join(projectDirectory, "scenes"),
    registry: storage.registryProjectionPath,
    catalog: storage.catalogProjectionPath,
  } as const;
};

export const resolveProjectCheckLogicalPath = ({
  locations,
  storyId: rawStoryId,
  logicalPath,
}: {
  readonly locations: ProductionLocations;
  readonly storyId: string;
  readonly logicalPath: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  if (
    logicalPath.length === 0 ||
    logicalPath.includes("\\") ||
    posix.normalize(logicalPath) !== logicalPath ||
    posix.isAbsolute(logicalPath) ||
    logicalPath.split("/").some((segment) => !segment || segment === "..")
  ) {
    throw new Error("Project check logical path is unsafe.");
  }
  if (locations.layoutKind === "repository") {
    return join(locations.runtimeResources, ...logicalPath.split("/"));
  }
  const evidencePrefix = `out/${storyId}/`;
  if (logicalPath.startsWith(evidencePrefix)) {
    return join(
      locations.evidenceRoot,
      storyId,
      ...logicalPath.slice(evidencePrefix.length).split("/"),
    );
  }
  if (
    !logicalPath.startsWith(`src/projects/${storyId}/`) &&
    !logicalPath.startsWith(`public/projects/${storyId}/`)
  ) {
    throw new Error(
      "Project check logical path is outside its Workspace Project.",
    );
  }
  return resolveProjectOwnedLogicalPath({
    storage: getProjectCheckStorage(locations),
    logicalPath,
  });
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

export const loadProjectCheckJson = readJson;

export const loadProjectCheckText = async (
  path: string,
  label: string,
): Promise<string> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
};

export const checksumFile = async (path: string): Promise<Sha256Digest> =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(Uint8Array.from(await readFile(path)))
      .digest("hex")}`,
  );

export const loadProjectCheckSealedNarration = async (
  path: string,
): Promise<SealedNarrationManifest> =>
  SealedNarrationManifestSchema.parse(
    await readJson(path, "sealed-narration.generated.json"),
  );

export const loadProjectCheckMasteredNarration = async (
  path: string,
): Promise<MasteredNarrationManifest> =>
  MasteredNarrationManifestSchema.parse(
    await readJson(path, "mastered-narration.generated.json"),
  );

export const loadProjectCheckSemanticTiming = async (
  path: string,
): Promise<SemanticTiming> =>
  SemanticTimingSchema.parse(
    await readJson(path, "semantic-timing.generated.json"),
  );

export const loadProjectCheckNarrativeBaselineReceipt = async (
  path: string,
): Promise<NarrativeBaselineEvidenceReceipt> =>
  NarrativeBaselineEvidenceReceiptSchema.parse(
    await readJson(path, "narrative-baseline-evidence.generated.json"),
  );
