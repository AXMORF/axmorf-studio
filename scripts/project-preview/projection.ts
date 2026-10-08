import { join, resolve } from "node:path";

import { serializeCanonicalJson } from "@axmorf/studio/contracts";

import {
  checksumBytes,
  readRegularBytes,
} from "../project-production/adapters/project-input-snapshot";
import {
  materializeOwnerArtifacts,
  verifyMaterializedOwnerArtifacts,
} from "../project-production/adapters/project-materializer";
import { prepareProjectAuthoringBuild } from "../project-production/application/prepare-delivery";
import { createLiveProjectProductionScope } from "../project-production/application/production-scope";
import { assertPreviewDirectory } from "./filesystem";
import {
  loadProjectPreviewProjection,
  previewSourcesMatch,
  type PreviewSourceRequest,
  type VerifiedPreviewSource,
} from "./source";

export type ProjectPreviewProjectionDependencies = Readonly<{
  loadProjection?: typeof loadProjectPreviewProjection;
  materialize?: typeof materializeOwnerArtifacts;
  prepare?: typeof prepareProjectAuthoringBuild;
  verifyMaterialized?: typeof verifyMaterializedOwnerArtifacts;
}>;

export const prepareProjectPreviewView = async ({
  request,
  view,
  expectedSource,
  dependencies = {},
}: {
  readonly request: PreviewSourceRequest;
  readonly view: string;
  readonly expectedSource: VerifiedPreviewSource;
  readonly dependencies?: ProjectPreviewProjectionDependencies;
}) => {
  // A scratch Workspace gets all mutable roots below the already frozen view.
  // Only installed runtime code and the verified Artifact Store remain shared.
  await assertPreviewDirectory({ root: request.rootDir, directory: view });
  const frozenRoot = resolve(view);
  const scratch = createLiveProjectProductionScope({
    rootDir: frozenRoot,
    storyId: request.projectId,
  });
  const scope = {
    ...scratch,
    shared: {
      ...scratch.shared,
      runtimeRoot: request.scope.shared.runtimeRoot,
      producerArtifactRoot: request.scope.shared.producerArtifactRoot,
    },
  };
  const projection = await (
    dependencies.loadProjection ?? loadProjectPreviewProjection
  )(request);
  if (!previewSourcesMatch(projection.source, expectedSource)) {
    throw new Error("Project preview artifact projection became stale.");
  }
  const sceneTaskInputs = new Map(
    projection.inputs.sceneInputs.map(({ meaningId, taskInput }) => [
      meaningId,
      taskInput,
    ]),
  );
  await (dependencies.materialize ?? materializeOwnerArtifacts)({
    rootDir: frozenRoot,
    artifactRootDir: request.rootDir,
    projectId: request.projectId,
    artifacts: projection.ownerArtifacts,
    sceneTaskInputs,
  });
  const prepared = await (dependencies.prepare ?? prepareProjectAuthoringBuild)(
    {
      rootDir: frozenRoot,
      projectId: request.projectId,
      scope,
    },
  );
  const additionalSceneFiles = new Map();
  for (const { meaningId } of projection.inputs.sceneInputs) {
    const bytes = await readRegularBytes(
      join(
        scope.projectSourceRoot,
        request.projectId,
        "scenes",
        meaningId,
        "generated/scene-package.generated.json",
      ),
      "Preview projected ScenePackage",
    );
    additionalSceneFiles.set(
      meaningId,
      new Map([
        [
          "generated/scene-package.generated.json",
          { checksum: checksumBytes(bytes), sizeBytes: bytes.byteLength },
        ],
      ]),
    );
  }
  await (dependencies.verifyMaterialized ?? verifyMaterializedOwnerArtifacts)({
    rootDir: frozenRoot,
    artifactRootDir: request.rootDir,
    projectId: request.projectId,
    artifacts: projection.ownerArtifacts,
    sceneTaskInputs,
    additionalSceneFiles,
  });
  if (
    prepared.frameCount !== expectedSource.frameCount ||
    serializeCanonicalJson(prepared.render) !==
      serializeCanonicalJson(expectedSource.render)
  ) {
    throw new Error("Project preview projected Composition metadata is stale.");
  }
};
