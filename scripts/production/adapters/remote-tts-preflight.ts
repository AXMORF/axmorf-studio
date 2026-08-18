import type { RemoteTtsProfileMetadata } from "../../config/narration-execution";
import type { SpeechSdkVendor } from "../../../src/contracts/tts-provider-registry";

export type RemoteTtsPreflightResult =
  | Readonly<{
      status: "pass";
      domain: "speech-sdk";
      vendor: SpeechSdkVendor;
      validationState: "configuration-validated-generation-not-probed";
    }>
  | Readonly<{
      status: "pass";
      domain: "edge-tts";
      vendor: "microsoft-edge-read-aloud";
      validationState: "configuration-validated-generation-not-probed";
    }>;

export const preflightRemoteTts = ({
  metadata,
}: {
  readonly requirementsFingerprint: string;
  readonly metadata: RemoteTtsProfileMetadata;
}): RemoteTtsPreflightResult =>
  metadata.kind === "speech-sdk"
    ? {
        status: "pass",
        domain: "speech-sdk",
        vendor: metadata.vendor,
        validationState: metadata.validationState,
      }
    : {
        status: "pass",
        domain: "edge-tts",
        vendor: metadata.vendor,
        validationState: metadata.validationState,
      };
