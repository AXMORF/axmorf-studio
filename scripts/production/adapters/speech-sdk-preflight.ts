import type { SpeechSdkProfileMetadata } from "../../config/narration-execution";

export type SpeechSdkPreflightResult = Readonly<{
  status: "pass";
  domain: "speech-sdk";
  vendor: "openai";
  validationState: "configuration-validated-generation-not-probed";
}>;

export const preflightSpeechSdk = ({
  metadata,
}: {
  readonly requirementsFingerprint: string;
  readonly metadata: SpeechSdkProfileMetadata;
}): SpeechSdkPreflightResult => ({
  status: "pass",
  domain: "speech-sdk",
  vendor: metadata.vendor,
  validationState: metadata.validationState,
});
