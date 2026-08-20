import type {
  ArtifactAttestation,
  ProducerReasonCodeSchema,
  ProducerTaskSpec,
} from "../../../src/contracts";
import type { z } from "zod";

export type ArtifactInspection = Readonly<{
  attestation: ArtifactAttestation | null;
  valid: boolean;
  reason?: "artifact-missing" | "checksum-drift" | "incompatible";
}>;

export const classifyTaskArtifact = ({
  task,
  inspection,
}: {
  readonly task: ProducerTaskSpec;
  readonly inspection: ArtifactInspection;
}): Readonly<{
  status: "reused" | "missing" | "incompatible";
  reasonCode: z.infer<typeof ProducerReasonCodeSchema>;
}> => {
  if (inspection.attestation === null || inspection.reason === "artifact-missing") {
    return { status: "missing", reasonCode: "artifact-missing" };
  }
  if (
    !inspection.valid ||
    inspection.attestation.taskRevision !== task.taskRevision ||
    inspection.attestation.validatorPolicyVersion !== task.validatorPolicyVersion
  ) {
    return {
      status: "incompatible",
      reasonCode:
        inspection.reason === "checksum-drift"
          ? "checksum-drift"
          : "validator-version-changed",
    };
  }
  return { status: "reused", reasonCode: "artifact-valid" };
};
