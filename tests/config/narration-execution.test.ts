import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveProducerNarrationInspection } from "../../scripts/config/narration-execution";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { NarrationSpecSchema } from "../../src/contracts/narration";
import { validProjectCreateProducerConfig } from "../fixtures/project-create";

const narration = NarrationSpecSchema.parse({
  schemaVersion: 2,
  voiceProfileId: "my-voice",
  mode: "voice-clone",
});

test("inspection metadata does not open the selected VoxCPM voice material", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-narration-inspection-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "private/producer.config.json");
  await writeProducerConfig({
    configPath,
    value: validProjectCreateProducerConfig,
  });

  const inspection = await resolveProducerNarrationInspection({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    narration,
  });

  assert.equal(inspection.providerAttemptFingerprint, null);
  assert.equal(
    inspection.providerAttemptIdentityState,
    "unknown-protected-voice-material",
  );
  assert.equal(
    inspection.masteringPolicy.targetIntegratedLoudnessLufs,
    -16,
  );
  assert.deepEqual(inspection.metadata, {
    kind: "voxcpm",
    mode: "controllable-clone",
    profileMatched: true,
    validationState: "configuration-validated-material-not-inspected",
  });
  assert.doesNotMatch(
    JSON.stringify(inspection),
    /visible-editable-token|127\.0\.0\.1|voice_profile|natural|自然/u,
  );
});

test("high-fidelity VoxCPM inspection does not read normalize or measure protected prompt inputs", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-prompt-inspection-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "private/producer.config.json");
  const provider = validProjectCreateProducerConfig.tts.providers[0];
  await writeProducerConfig({
    configPath,
    value: {
      ...validProjectCreateProducerConfig,
      tts: {
        ...validProjectCreateProducerConfig.tts,
        defaultVoiceProfileId: "prompt-voice",
        providers: [
          {
            ...provider,
            voiceProfiles: [
              {
                id: "prompt-voice",
                name: "Prompt voice",
                mode: "high-fidelity-clone",
                promptAudioPath: "public/voice_profile/protected.wav",
                promptTextPath: "public/voice_profile/protected.txt",
                promptTranscriptConfirmed: true,
              },
            ],
          },
        ],
      },
    },
  });

  const inspection = await resolveProducerNarrationInspection({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    narration: NarrationSpecSchema.parse({
      schemaVersion: 2,
      voiceProfileId: "prompt-voice",
      mode: "voice-clone",
    }),
  });

  assert.equal(inspection.providerAttemptFingerprint, null);
  assert.equal(inspection.metadata.kind, "voxcpm");
  assert.equal(inspection.metadata.mode, "high-fidelity-clone");
  assert.doesNotMatch(
    JSON.stringify(inspection),
    /public\/voice_profile|protected\.(?:wav|txt)/u,
  );
});

test("SpeechSDK inspection exposes an exact safe fingerprint without exposing its private key", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-speech-sdk-inspection-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "private/producer.config.json");
  await writeProducerConfig({
    configPath,
    value: {
      ...validProjectCreateProducerConfig,
      tts: {
        ...validProjectCreateProducerConfig.tts,
        defaultProviderId: "openai-direct",
        defaultVoiceProfileId: "cloud-voice",
        providers: [
          {
            id: "openai-direct",
            kind: "speech-sdk",
            vendor: "openai",
            name: "OpenAI direct",
            connection: {
              apiKey: "inspection-must-redact-this-key",
              baseUrl: "https://api.openai.com/v1",
              timeoutMs: 60_000,
            },
            modelId: "gpt-4o-mini-tts",
            voiceProfiles: [
              {
                id: "cloud-voice",
                name: "Cloud voice",
                voiceId: "alloy",
                source: "catalog",
              },
            ],
          },
        ],
      },
    },
  });

  const inspection = await resolveProducerNarrationInspection({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    narration: NarrationSpecSchema.parse({
      schemaVersion: 2,
      voiceProfileId: "cloud-voice",
      mode: "voice-clone",
    }),
  });

  assert.match(inspection.providerAttemptFingerprint ?? "", /^sha256:[a-f0-9]{64}$/u);
  assert.equal(inspection.providerAttemptIdentityState, "exact");
  assert.deepEqual(inspection.metadata, {
    kind: "speech-sdk",
    vendor: "openai",
    profileMatched: true,
    validationState: "configuration-validated-generation-not-probed",
  });
  assert.doesNotMatch(
    JSON.stringify(inspection),
    /inspection-must-redact-this-key|api\.openai\.com/u,
  );
});
