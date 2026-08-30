import type {
  ArtifactAttestation,
  ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import type { ArtifactState } from "@axmorf/studio/contracts";

export type ArtifactInspection =
  | Readonly<{
      artifactState: "valid";
      attestation: ArtifactAttestation;
    }>
  | Readonly<{
      artifactState: Exclude<ArtifactState, "valid">;
      attestation: null;
    }>;

export const missingArtifactInspection = (): ArtifactInspection => ({
  artifactState: "missing",
  attestation: null,
});

export const classifyTaskArtifact = ({
  task,
  inspection,
}: {
  readonly task: ProducerTaskSpec;
  readonly inspection: ArtifactInspection;
}): Readonly<{
  artifactState: ArtifactState;
  reusable: boolean;
}> => {
  if (inspection.artifactState !== "valid") {
    return { artifactState: inspection.artifactState, reusable: false };
  }
  const attestation = inspection.attestation;
  if (
    attestation.storyId !== task.storyId ||
    attestation.taskKind !== task.taskKind ||
    attestation.semanticId !== task.semanticId ||
    attestation.taskRevision !== task.taskRevision ||
    attestation.validatorPolicyVersion !== task.validatorPolicyVersion
  ) {
    return { artifactState: "identity-mismatch", reusable: false };
  }
  return { artifactState: "valid", reusable: true };
};
