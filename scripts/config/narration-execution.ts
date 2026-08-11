import type { NarrationSpec } from "../../src/contracts/narration";
import { buildNarrationExecutionSnapshot } from "../../src/contracts/narration-execution";
import {
  resolveVoxcpmProfile,
  resolveVoxcpmProfileMetadata,
} from "../narration/adapters/private-config";
import { computeProviderAttemptFingerprint } from "../narration/domain/provider-input";
import {
  readProducerConfig,
  resolveDefaultTtsProvider,
  resolveProducerConfigPathFromEnvironment,
  toVoxcpmPrivateConfig,
} from "./producer-config";

export const resolveProducerNarrationExecution = async ({
  rootDir,
  env,
  narration,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly narration: NarrationSpec;
}) => {
  const configPath = await resolveProducerConfigPathFromEnvironment({
    rootDir,
    env,
  });
  const producerConfig = await readProducerConfig({ configPath });
  const provider = resolveDefaultTtsProvider(producerConfig);
  const privateConfig = toVoxcpmPrivateConfig(provider, rootDir);
  const metadata = await resolveVoxcpmProfileMetadata({
    config: privateConfig,
    narration,
    rootDir,
  });
  const resolved = await resolveVoxcpmProfile({
    config: privateConfig,
    narration,
    speechRate: producerConfig.tts.speech.rate,
  });
  const providerAttemptFingerprint = computeProviderAttemptFingerprint(
    resolved.safeDescriptor,
  );
  return {
    snapshot: buildNarrationExecutionSnapshot({
      providerId: provider.id,
      voiceProfileId: narration.voiceProfileId,
      speechRate: producerConfig.tts.speech.rate,
      providerAttemptFingerprint,
      targetLoudnessLufs: producerConfig.tts.speech.targetLoudnessLufs,
    }),
    resolved,
    metadata,
  } as const;
};
