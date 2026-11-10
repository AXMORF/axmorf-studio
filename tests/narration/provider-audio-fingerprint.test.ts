import assert from "node:assert/strict";
import test from "node:test";

import {
  computeProviderAttemptFingerprint,
  computeProviderAudioFingerprint,
  type SafeSpeechSdkExecutionDescriptor,
  type SafeVoxcpmExecutionDescriptor,
} from "../../scripts/narration/domain/provider-input";

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const voxcpm: SafeVoxcpmExecutionDescriptor = {
  adapterId: "voxcpm-high-fidelity-clone-http-v2",
  mode: "high-fidelity-clone",
  privateConfigFingerprint: hash("a"),
  modelId: "VoxCPM2",
  voiceProfileId: "narrator",
  speechRate: 1.2,
  cfgValue: 2,
  inferenceTimesteps: 10,
  minLen: 2,
  maxLen: 4096,
  normalize: true,
  denoise: true,
  retryBadcase: false,
  retryBadcaseMaxTimes: 0,
  retryBadcaseRatioThreshold: 6,
  promptSourceChecksum: hash("b"),
  promptTextChecksum: hash("c"),
  promptAudioChecksum: hash("d"),
  referenceAudioChecksum: hash("d"),
};

test("VoxCPM audio identity excludes private execution config while legacy execution identity stays exact", () => {
  const moved = {
    ...voxcpm,
    privateConfigFingerprint: hash("f"),
    voiceProfileId: "renamed",
  };
  assert.equal(
    computeProviderAudioFingerprint(moved),
    computeProviderAudioFingerprint(voxcpm),
  );
  assert.notEqual(
    computeProviderAttemptFingerprint(moved),
    computeProviderAttemptFingerprint(voxcpm),
  );
  const changes = {
    modelId: "another-model",
    speechRate: 1.1,
    cfgValue: 2.5,
    inferenceTimesteps: 12,
    minLen: 3,
    maxLen: 2048,
    normalize: false,
    denoise: false,
    retryBadcase: true,
    retryBadcaseMaxTimes: 1,
    retryBadcaseRatioThreshold: 5,
    promptSourceChecksum: hash("e"),
    promptTextChecksum: hash("e"),
    promptAudioChecksum: hash("e"),
    referenceAudioChecksum: hash("e"),
  };
  for (const [field, value] of Object.entries(changes)) {
    assert.notEqual(
      computeProviderAudioFingerprint({ ...voxcpm, [field]: value }),
      computeProviderAudioFingerprint(voxcpm),
      field,
    );
  }
});

test("controllable clone audio identity tracks control instruction and reference content", () => {
  const descriptor: SafeVoxcpmExecutionDescriptor = {
    ...voxcpm,
    adapterId: "voxcpm-controllable-clone-http-v2",
    mode: "controllable-clone",
    controlInstruction: "自然、清晰。",
  };
  for (const change of [
    { controlInstruction: "更有活力。" },
    { referenceAudioChecksum: hash("e") },
  ]) {
    assert.notEqual(
      computeProviderAudioFingerprint({ ...descriptor, ...change }),
      computeProviderAudioFingerprint(descriptor),
    );
  }
});

test("SpeechSDK audio identity uses vendor/model/voice/rate instead of connection config and profile metadata", () => {
  const descriptor: SafeSpeechSdkExecutionDescriptor = {
    adapterId: "speech-sdk-direct-v2",
    providerConfigFingerprint: hash("a"),
    vendor: "openai",
    modelId: "gpt-4o-mini-tts",
    voiceProfileId: "narrator",
    voiceId: "alloy",
    voiceSource: "catalog",
    speechRate: 1.2,
    maxInputChars: 4096,
    maxRetries: 0,
  };
  assert.equal(
    computeProviderAudioFingerprint({
      ...descriptor,
      providerConfigFingerprint: hash("b"),
      voiceProfileId: "renamed",
      voiceSource: "remote-clone",
    }),
    computeProviderAudioFingerprint(descriptor),
  );
  for (const change of [
    { vendor: "elevenlabs" as const },
    { modelId: "tts-1" },
    { voiceId: "nova" },
    { speechRate: 1 },
  ]) {
    assert.notEqual(
      computeProviderAudioFingerprint({ ...descriptor, ...change }),
      computeProviderAudioFingerprint(descriptor),
    );
  }
});
