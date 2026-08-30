import {
  buildProducerTaskSpec,
  type ProducerTaskSpec,
} from "@axmorf/studio/contracts";

export const TEMPLATE_SCENE_DERIVED_OUTPUTS = [
  "src/generated/reference-fidelity.generated.json",
  "src/scene-template-instance.json",
  "src/selected-resources.json",
  "src/shot-plan.json",
  "src/shot-recipe-selection.json",
  "src/sound-plan.json",
  "src/sync-anchors.json",
  "src/visual-plan.json",
] as const;

export const TEMPLATE_SCENE_LIVE_PROJECTION_PATHS = [
  "src/generated/scene-package.generated.json",
  "src/task-input.generated.json",
] as const;

const templateSceneLiveProjectionPaths = new Set<string>(
  TEMPLATE_SCENE_LIVE_PROJECTION_PATHS,
);

export const isTemplateSceneLiveProjectionPath = (path: string) =>
  templateSceneLiveProjectionPaths.has(path);

export const toTemplateSceneWorkspacePath = ({
  storyId,
  meaningId,
  repositoryPath,
}: {
  readonly storyId: string;
  readonly meaningId: string;
  readonly repositoryPath: string;
}) => {
  const sourcePrefix = `src/projects/${storyId}/scenes/${meaningId}/`;
  const publicPrefix = `public/projects/${storyId}/scenes/${meaningId}/`;
  if (repositoryPath.startsWith(sourcePrefix)) {
    return `src/${repositoryPath.slice(sourcePrefix.length)}`;
  }
  if (repositoryPath.startsWith(publicPrefix)) {
    return `public/${repositoryPath.slice(publicPrefix.length)}`;
  }
  throw new Error("Scene template copied path escapes its owning Scene.");
};

export const expectedTemplateSceneOutputSet = ({
  storyId,
  meaningId,
  copiedRepositoryPaths,
}: {
  readonly storyId: string;
  readonly meaningId: string;
  readonly copiedRepositoryPaths: readonly string[];
}) => {
  const outputs = [
    ...copiedRepositoryPaths.map((repositoryPath) =>
      toTemplateSceneWorkspacePath({ storyId, meaningId, repositoryPath }),
    ),
    ...TEMPLATE_SCENE_DERIVED_OUTPUTS,
  ];
  if (new Set(outputs).size !== outputs.length) {
    throw new Error("Scene template output contract contains duplicate paths.");
  }
  return outputs.sort();
};

export const expectedTemplateSceneOutputSetFromPreparedFiles = (
  preparedWorkspacePaths: readonly string[],
) => {
  const preparedOutputs = preparedWorkspacePaths.filter(
    (path) => !isTemplateSceneLiveProjectionPath(path),
  );
  if (!preparedOutputs.includes("src/scene-template-instance.json")) {
    throw new Error("Prepared Scene template instance is missing.");
  }
  const outputs = [...preparedOutputs, ...TEMPLATE_SCENE_DERIVED_OUTPUTS];
  return [...new Set(outputs)].sort();
};

export const bindTemplateTaskOutputSet = (
  task: ProducerTaskSpec,
  outputPaths: readonly string[],
) => {
  if (task.taskKind !== "scene-template") {
    throw new Error("Only a Scene template task can bind fixed outputs.");
  }
  return buildProducerTaskSpec({
    taskKind: task.taskKind,
    storyId: task.storyId,
    semanticId: task.semanticId,
    revisionId: task.revisionId,
    dependencyArtifacts: task.dependencyArtifacts,
    inputFingerprints: task.inputFingerprints,
    declaredReadSet: task.declaredReadSet,
    declaredOutputSet: [...outputPaths].sort(),
    validatorPolicyVersion: task.validatorPolicyVersion,
  });
};
