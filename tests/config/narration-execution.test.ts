import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  resolveProducerNarrationExecution,
  resolveProducerNarrationInspection,
} from "../../scripts/config/narration-execution";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { encodeCanonicalPcmWav } from "../../scripts/narration/domain/pcm-wav";
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
  const config = await writeProducerConfig({
    configPath,
    value: validProjectCreateProducerConfig,
  });

  const inspection = await resolveProducerNarrationInspection({
    config,
    privateConfigRoot: rootDir,
    narration,
  });

  assert.equal(inspection.providerAttemptFingerprint, null);
  assert.equal(
    inspection.providerAttemptIdentityState,
    "unknown-protected-voice-material",
  );
  assert.equal(inspection.masteringPolicy.targetIntegratedLoudnessLufs, -16);
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
  const config = await writeProducerConfig({
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
    config,
    privateConfigRoot: rootDir,
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
  const config = await writeProducerConfig({
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
    config,
    privateConfigRoot: rootDir,
    narration: NarrationSpecSchema.parse({
      schemaVersion: 2,
      voiceProfileId: "cloud-voice",
      mode: "voice-clone",
    }),
  });

  assert.match(
    inspection.providerAttemptFingerprint ?? "",
    /^sha256:[a-f0-9]{64}$/u,
  );
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

test("high-fidelity execution uses only the injected prompt normalization port", async (context) => {
  const privateConfigRoot = await mkdtemp(
    join(tmpdir(), "rsp-prompt-execution-"),
  );
  context.after(() => rm(privateConfigRoot, { recursive: true, force: true }));
  const providerRoot = join(privateConfigRoot, "provider-material");
  const promptAudioPath = join(providerRoot, "prompt.m4a");
  const promptTextPath = join(providerRoot, "prompt.txt");
  await mkdir(providerRoot, { recursive: true });
  const sourceBytes = Buffer.from("runtime-bound-prompt-source");
  await Promise.all([
    writeFile(promptAudioPath, sourceBytes),
    writeFile(promptTextPath, "confirmed transcript\n"),
  ]);
  const provider = validProjectCreateProducerConfig.tts.providers[0];
  const config = await writeProducerConfig({
    configPath: join(privateConfigRoot, "producer.config.json"),
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
                promptAudioPath: "provider-material/prompt.m4a",
                promptTextPath: "provider-material/prompt.txt",
                promptTranscriptConfirmed: true,
              },
            ],
          },
        ],
      },
    },
  });
  const canonicalPrompt = encodeCanonicalPcmWav(Buffer.alloc(3_200));
  let normalizationCalls = 0;

  const execution = await resolveProducerNarrationExecution({
    config,
    privateConfigRoot,
    narration: NarrationSpecSchema.parse({
      schemaVersion: 2,
      voiceProfileId: "prompt-voice",
      mode: "voice-clone",
    }),
    normalizePromptAudio: async ({ sourceBytes: actual }) => {
      normalizationCalls += 1;
      assert.deepEqual(actual, sourceBytes);
      return canonicalPrompt;
    },
  });

  assert.equal(normalizationCalls, 1);
  assert.equal(execution.resolved.kind, "voxcpm");
  assert.equal(execution.resolved.safeDescriptor.mode, "high-fidelity-clone");
});
