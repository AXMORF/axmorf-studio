import assert from "node:assert/strict";
import test from "node:test";

import {
  computeChunkRequestFingerprint,
  computeProviderAttemptFingerprint,
} from "../../scripts/narration/domain/provider-input";
import {
  readVoxcpmPrivateConfig,
  resolveVoxcpmProfileMetadata,
  resolveVoxcpmProfile,
} from "../../scripts/narration/adapters/private-config";
import { NarrationSpecSchema } from "../../src/contracts/narration";
import { computeGenerationInputFingerprint } from "../../src/contracts/generation-input";
import { StorySpecSchema } from "../../src/contracts/story";
import { validNarrationSpec, validStorySpec } from "../fixtures/narrative";

const referencePath = "/srv/private/science.wav";
const referenceBytes = Buffer.from("fixture reference wav");
const narration = NarrationSpecSchema.parse({
  ...validNarrationSpec,
  voiceProfileId: "science-explainer-young-male",
});

test("metadata-only profile resolution never opens protected voice content", async () => {
  let accessCount = 0;
  await assert.rejects(
    () =>
      resolveVoxcpmProfileMetadata({
        config: {
          ...fixturePrivateConfig,
          voiceProfiles: [
            {
              ...fixturePrivateConfig.voiceProfiles[0],
              referenceAudioPath: "/repo/public/voice_profile/private.wav",
            },
          ],
        },
        narration,
        rootDir: "/repo",
        access: async () => {
          accessCount += 1;
        },
      }),
    /protected/i,
  );
  assert.equal(accessCount, 0);

  const metadata = await resolveVoxcpmProfileMetadata({
    config: fixturePrivateConfig,
    narration,
    rootDir: "/repo",
    access: async () => {
      accessCount += 1;
    },
  });
  assert.equal(metadata.mode, "controllable-clone");
  assert.equal(metadata.baseUrl, "http://127.0.0.1:9880");
  assert.equal(accessCount, 1);
});
const story = StorySpecSchema.parse(validStorySpec);
const fixturePrivateConfig = {
  schemaVersion: 2,
  baseUrl: "http://127.0.0.1:9880",
  token: "secret-token",
  timeoutMs: 120_000,
  modelId: "private-voxcpm-deployment",
  endpointPath: "/clone",
  parameters: {
    cfgValue: 2,
    inferenceTimesteps: 10,
    minLen: 2,
    maxLen: 4096,
    normalize: false,
    denoise: true,
    retryBadcase: true,
    retryBadcaseMaxTimes: 3,
    retryBadcaseRatioThreshold: 6,
  },
  voiceProfiles: [
    {
      id: "science-explainer-young-male",
      mode: "controllable-clone",
      referenceAudioPath: referencePath,
      controlInstruction: "冷静、清晰、自然地讲解科学概念。",
    },
  ],
} as const;

const fixtureReadFile = async (path: string): Promise<Buffer> => {
  if (path === referencePath) return referenceBytes;
  throw new Error(`fixture missing file: ${path}`);
};

test("private config resolves one controllable-clone profile", async () => {
  const resolved = await resolveVoxcpmProfile({
    config: fixturePrivateConfig,
    narration,
    readFile: fixtureReadFile,
  });

  assert.equal(
    resolved.safeDescriptor.voiceProfileId,
    narration.voiceProfileId,
  );
  assert.equal(resolved.safeDescriptor.mode, "controllable-clone");
  assert.match(
    resolved.safeDescriptor.referenceAudioChecksum,
    /^sha256:[a-f0-9]{64}$/,
  );
  assert.deepEqual(resolved.referenceAudioBytes, referenceBytes);
});

test("safe fingerprints exclude endpoints tokens and absolute paths", async () => {
  const resolved = await resolveVoxcpmProfile({
    config: fixturePrivateConfig,
    narration,
    readFile: fixtureReadFile,
  });
  const serialized = JSON.stringify(resolved.safeDescriptor);

  assert.equal(serialized.includes("127.0.0.1"), false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("/srv/private"), false);
  assert.deepEqual(Object.keys(resolved.safeDescriptor).sort(), [
    "adapterId",
    "cfgValue",
    "controlInstruction",
    "denoise",
    "inferenceTimesteps",
    "maxLen",
    "minLen",
    "mode",
    "modelId",
    "normalize",
    "privateConfigFingerprint",
    "referenceAudioChecksum",
    "retryBadcase",
    "retryBadcaseMaxTimes",
    "retryBadcaseRatioThreshold",
    "speechRate",
    "voiceProfileId",
  ]);
});

test("provider configuration changes fork the attempt but not narration generation input", async () => {
  const resolved = await resolveVoxcpmProfile({
    config: fixturePrivateConfig,
    narration,
    readFile: fixtureReadFile,
  });
  const currentGenerationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );

  assert.notEqual(
    computeProviderAttemptFingerprint({
      ...resolved.safeDescriptor,
      cfgValue: 2,
    }),
    computeProviderAttemptFingerprint({
      ...resolved.safeDescriptor,
      cfgValue: 2.5,
    }),
  );
  assert.equal(
    resolved.safeDescriptor.adapterId,
    "voxcpm-controllable-clone-http-v2",
  );
  assert.notEqual(
    computeProviderAttemptFingerprint(resolved.safeDescriptor),
    computeProviderAttemptFingerprint({
      ...resolved.safeDescriptor,
      adapterId: "voxcpm-controllable-clone-http-v1",
    } as unknown as typeof resolved.safeDescriptor),
  );
  for (const [key, changed] of [
    ["inferenceTimesteps", 11],
    ["minLen", 3],
    ["maxLen", 4095],
    ["normalize", true],
    ["denoise", false],
    ["retryBadcase", false],
    ["retryBadcaseMaxTimes", 4],
    ["retryBadcaseRatioThreshold", 5.5],
    ["speechRate", 1.1],
  ] as const) {
    assert.notEqual(
      computeProviderAttemptFingerprint(resolved.safeDescriptor),
      computeProviderAttemptFingerprint({
        ...resolved.safeDescriptor,
        [key]: changed,
      }),
      `${key} must fork the provider attempt`,
    );
  }
  assert.equal(
    currentGenerationInputFingerprint,
    computeGenerationInputFingerprint(story, narration),
  );
});

test("chunk request fingerprint binds exact authored text and safe attempt", async () => {
  const resolved = await resolveVoxcpmProfile({
    config: fixturePrivateConfig,
    narration,
    readFile: fixtureReadFile,
  });
  const generationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );
  const providerAttemptFingerprint = computeProviderAttemptFingerprint(
    resolved.safeDescriptor,
  );
  const input = {
    generationInputFingerprint,
    providerAttemptFingerprint,
    chunkId: "opening-01",
    meaningId: "opening",
    ttsText: "A，B。",
  } as const;

  assert.notEqual(
    computeChunkRequestFingerprint(input),
    computeChunkRequestFingerprint({ ...input, ttsText: "A。B。" }),
  );
});

test("unknown profiles missing references and malformed URLs fail closed", async () => {
  await assert.rejects(
    () =>
      resolveVoxcpmProfile({
        config: fixturePrivateConfig,
        narration: NarrationSpecSchema.parse({
          ...narration,
          voiceProfileId: "unknown-profile",
        }),
        readFile: fixtureReadFile,
      }),
    /unknown voice profile/i,
  );
  await assert.rejects(
    () =>
      resolveVoxcpmProfile({
        config: fixturePrivateConfig,
        narration,
        readFile: async () => {
          throw new Error("ENOENT");
        },
      }),
    /reference audio/i,
  );
  await assert.rejects(
    () =>
      readVoxcpmPrivateConfig({
        configPath: "/outside/voxcpm.private.json",
        readFile: async () =>
          Buffer.from(
            JSON.stringify({
              ...fixturePrivateConfig,
              baseUrl: "file:///private/provider",
            }),
          ),
      }),
    /valid HTTP URL/i,
  );
});

test("private config rejects duplicate profiles unsupported fields and bad references", async () => {
  await assert.rejects(() =>
    resolveVoxcpmProfile({
      config: {
        ...fixturePrivateConfig,
        voiceProfiles: [
          fixturePrivateConfig.voiceProfiles[0],
          fixturePrivateConfig.voiceProfiles[0],
        ],
      },
      narration,
      readFile: fixtureReadFile,
    }),
  );
  await assert.rejects(() =>
    resolveVoxcpmProfile({
      config: { ...fixturePrivateConfig, fallbackProvider: "other" },
      narration,
      readFile: fixtureReadFile,
    }),
  );
  await assert.rejects(
    () =>
      resolveVoxcpmProfile({
        config: {
          ...fixturePrivateConfig,
          voiceProfiles: [
            {
              ...fixturePrivateConfig.voiceProfiles[0],
              referenceAudioPath: "relative/reference.wav",
            },
          ],
        },
        narration,
        readFile: fixtureReadFile,
      }),
    /reference audio/i,
  );
});

test("private config enforces the upstream generation parameter contract", async () => {
  for (const parameters of [
    { ...fixturePrivateConfig.parameters, cfgValue: 0.9 },
    { ...fixturePrivateConfig.parameters, cfgValue: 3.1 },
    { ...fixturePrivateConfig.parameters, inferenceTimesteps: 3 },
    { ...fixturePrivateConfig.parameters, inferenceTimesteps: 31 },
    { ...fixturePrivateConfig.parameters, minLen: 0 },
    { ...fixturePrivateConfig.parameters, minLen: 20, maxLen: 10 },
    { ...fixturePrivateConfig.parameters, maxLen: 8193 },
    { ...fixturePrivateConfig.parameters, retryBadcaseMaxTimes: -1 },
    { ...fixturePrivateConfig.parameters, retryBadcaseMaxTimes: 11 },
    { ...fixturePrivateConfig.parameters, retryBadcaseRatioThreshold: 0 },
  ]) {
    await assert.rejects(() =>
      resolveVoxcpmProfile({
        config: { ...fixturePrivateConfig, parameters },
        narration,
        readFile: fixtureReadFile,
      }),
    );
  }
});
