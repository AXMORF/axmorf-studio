import { join } from "node:path";

import {
  NarrationPreparationReceiptSchema,
  createFingerprint,
  getStoryCompositionDurationInFrames,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
  type RenderSpec,
  type ProductionRevisionId,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import type { RuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { checkMasteredNarrationArtifacts } from "../narration/mastering";
import { checkM2NarrationArtifacts } from "../narration/check";
import { inspectArtifact } from "../project-production/adapters/artifact-store";
import { readRegularJson } from "../project-production/adapters/project-input-snapshot";
import { inspectProductionSourceReadiness } from "../project-production/adapters/production-inspection";
import { buildCurrentProductionPlan } from "../project-production/application/build-current-plan";
import { assertSceneArtifactsAreMeaningLocal } from "../project-production/application/converge-artifacts";
import { loadProjectProductionInputs } from "../project-production/application/load-inputs";
import type { ProductionScope } from "../project-production/application/production-scope";

export type VerifiedPreviewSource = Readonly<{
  revisionId: ProductionRevisionId;
  runtimePolicyFingerprint: Sha256Digest;
  artifactSetFingerprint: Sha256Digest;
  render: RenderSpec;
  frameCount: number;
}>;

export type PreviewSourceRequest = Readonly<{
  rootDir: string;
  projectId: string;
  scope: ProductionScope;
  runtimePolicyManifest?: RuntimePolicyManifest;
}>;

type PreviewArtifact = Readonly<{
  task: ProducerTaskSpec;
  attestation: ArtifactAttestation;
}>;

export const PREVIEW_OWNER_KINDS = new Set([
  "scene-owner",
  "scene-template",
  "global-visual-owner",
  "cover-owner",
]);

export const inspectPreviewPrerequisiteArtifacts = async ({
  rootDir,
  tasks,
  inspect = inspectArtifact,
}: {
  readonly rootDir: string;
  readonly tasks: readonly ProducerTaskSpec[];
  readonly inspect?: typeof inspectArtifact;
}) => {
  const prerequisites: PreviewArtifact[] = [];
  for (const task of tasks.filter(
    ({ taskKind }) =>
      taskKind !== "composition-convergence" && taskKind !== "delivery-build",
  )) {
    const attestation = await inspect({ rootDir, task });
    if (attestation === null) {
      throw new Error(
        `Project preview prerequisite artifact is unavailable: ${task.taskKind}.`,
      );
    }
    prerequisites.push({ task, attestation });
  }
  if (
    !prerequisites.some(({ task }) => PREVIEW_OWNER_KINDS.has(task.taskKind))
  ) {
    throw new Error("Project preview has no verified owner artifacts.");
  }
  return prerequisites;
};

export const loadProjectPreviewProjection = async ({
  rootDir,
  projectId,
  scope,
  runtimePolicyManifest,
}: PreviewSourceRequest) => {
  const readiness = await inspectProductionSourceReadiness({
    rootDir,
    projectId,
    scope,
  });
  if (readiness.sourceState !== "production-inputs-ready") {
    throw new Error(
      "Project preview requires ready authoring and verified timing artifacts.",
    );
  }
  const inputs = await loadProjectProductionInputs({
    rootDir,
    projectId,
    scope,
    runtimePolicyManifest,
  });
  const preparationReceipt =
    inputs.story.timingSource === "authored-frames"
      ? null
      : NarrationPreparationReceiptSchema.parse(
          (
            await readRegularJson(
              join(
                scope.projectSourceRoot,
                projectId,
                "generated/narration-preparation.generated.json",
              ),
              "Preview narration preparation receipt",
            )
          ).raw,
        );
  const planned = await buildCurrentProductionPlan({
    rootDir,
    projectId,
    scope,
    runtimePolicyManifest,
    inputs,
    narration:
      preparationReceipt === null
        ? { providerAttemptFingerprint: null, masteringPolicy: null }
        : {
            preparationReceipt,
            providerAttemptFingerprint:
              preparationReceipt.providerAttemptFingerprint,
            masteringPolicy: preparationReceipt.masteringPolicy,
          },
    baseline: null,
  });
  const prerequisites = await inspectPreviewPrerequisiteArtifacts({
    rootDir,
    tasks: planned.tasks,
  });
  const ownerArtifacts = prerequisites.filter(({ task }) =>
    PREVIEW_OWNER_KINDS.has(task.taskKind),
  );
  await assertSceneArtifactsAreMeaningLocal({
    rootDir,
    artifacts: ownerArtifacts,
  });
  if (inputs.story.timingSource !== "authored-frames") {
    await checkM2NarrationArtifacts({
      rootDir: scope.isolatedRoot,
      projectSource: {
        brief: inputs.brief,
        story: inputs.story,
        narration: inputs.narration,
        render: inputs.render,
      },
    });
    await checkMasteredNarrationArtifacts({
      rootDir: scope.isolatedRoot,
      storyId: projectId,
    });
  }
  const source: VerifiedPreviewSource = {
    revisionId: planned.revision.revisionId,
    runtimePolicyFingerprint: createFingerprint({
      namespace: "project-preview-runtime-policy",
      version: 1,
      value: {
        runtime: inputs.runtimePolicyFingerprint,
        taskPolicies: inputs.taskPolicyFingerprints,
        workspaceConfiguration: inputs.workspaceConfigurationFingerprint,
      },
    }),
    artifactSetFingerprint: createFingerprint({
      namespace: "project-preview-prerequisite-artifacts",
      version: 1,
      value: prerequisites
        .map(({ task, attestation }) => ({
          taskRevision: task.taskRevision,
          artifactFingerprint: attestation.artifactFingerprint,
        }))
        .sort((left, right) =>
          left.taskRevision.localeCompare(right.taskRevision),
        ),
    }),
    render: inputs.render,
    frameCount: getStoryCompositionDurationInFrames(
      inputs.timing.durationInFrames,
    ),
  };
  return { source, inputs, ownerArtifacts };
};

export const loadVerifiedPreviewSource = async (
  request: PreviewSourceRequest,
): Promise<VerifiedPreviewSource> =>
  (await loadProjectPreviewProjection(request)).source;

export const previewSourcesMatch = (
  left: VerifiedPreviewSource,
  right: VerifiedPreviewSource,
) => serializeCanonicalJson(left) === serializeCanonicalJson(right);
