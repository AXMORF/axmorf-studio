import assert from "node:assert/strict";
import test from "node:test";

import {
  getConfigConsistencyError,
  isRepositoryRelativeFilePath,
  nextUniqueId,
  parseRenderSize,
  projectDeletionErrorMessage,
  selectProviderAndVoice,
  removeProvider,
  removeVoiceProfile,
  type EditableTtsConfig,
} from "../../settings/client/model";

test("an interrupted deletion request is reported as ambiguous rather than failed", () => {
  assert.match(
    projectDeletionErrorMessage(new TypeError("Failed to fetch")),
    /可能已经删除/u,
  );
  assert.doesNotMatch(
    projectDeletionErrorMessage(new TypeError("Failed to fetch")),
    /删除未完成/u,
  );
});

test("new collection and voice IDs skip existing collisions", () => {
  assert.equal(
    nextUniqueId("collection", ["collection-1", "collection-3"]),
    "collection-2",
  );
  assert.equal(nextUniqueId("voice", ["voice-1", "voice-2"]), "voice-3");
});

test("common render values parse as one width-height selection", () => {
  assert.deepEqual(parseRenderSize("1080x1920"), {
    width: 1080,
    height: 1920,
  });
  assert.throws(() => parseRenderSize("1080"));
  assert.throws(() => parseRenderSize("1080x0"));
});

test("local file fields reject absolute and escaping paths", () => {
  assert.equal(
    isRepositoryRelativeFilePath("voxcpm/voice_profile/my-voice.wav"),
    true,
  );
  assert.equal(isRepositoryRelativeFilePath("/srv/private/voice.wav"), false);
  assert.equal(isRepositoryRelativeFilePath("../voice.wav"), false);
  assert.equal(isRepositoryRelativeFilePath("C:\\voice.wav"), false);
});

test("provider switching and voice deletion keep a valid default immediately", () => {
  const config: EditableTtsConfig & {
    publishingCollections: Array<{ id: string }>;
  } = {
    publishingCollections: [{ id: "collection-1" }],
    tts: {
      defaultProviderId: "first-provider",
      defaultVoiceProfileId: "first-voice",
      providers: [
        { id: "first-provider", voiceProfiles: [{ id: "first-voice" }] },
        {
          id: "other-provider",
          voiceProfiles: [{ id: "other-voice" }, { id: "backup-voice" }],
        },
      ],
    },
  };
  selectProviderAndVoice(config, "other-provider");
  assert.equal(config.tts.defaultVoiceProfileId, "other-voice");
  removeVoiceProfile(config, "other-provider", "other-voice");
  assert.equal(config.tts.defaultVoiceProfileId, "backup-voice");
  assert.throws(
    () => removeVoiceProfile(config, "other-provider", "backup-voice"),
    /at least one|至少一个/iu,
  );
  assert.equal(getConfigConsistencyError(config), null);
});

test("mixed provider deletion and empty-list boundaries fail closed", () => {
  const config: EditableTtsConfig & {
    publishingCollections: Array<{ id: string }>;
  } = {
    publishingCollections: [{ id: "collection-1" }],
    tts: {
      defaultProviderId: "cloud-provider",
      defaultVoiceProfileId: "cloud-voice",
      providers: [
        {
          id: "local-provider",
          kind: "voxcpm",
          voiceProfiles: [{ id: "local-voice" }],
        },
        {
          id: "cloud-provider",
          kind: "speech-sdk",
          connection: { apiKey: "private-key" },
          voiceProfiles: [{ id: "cloud-voice", voiceId: "alloy" }],
        },
      ],
    },
  };
  removeProvider(config, "cloud-provider");
  assert.equal(config.tts.defaultProviderId, "local-provider");
  assert.equal(config.tts.defaultVoiceProfileId, "local-voice");
  assert.throws(
    () => removeProvider(config, "local-provider"),
    /at least one/iu,
  );
  config.tts.providers = [];
  assert.match(getConfigConsistencyError(config) ?? "", /至少保留一个/iu);
});

test("Edge profiles require a catalog voice and its matching locale", () => {
  const config: EditableTtsConfig & {
    publishingCollections: Array<{ id: string }>;
  } = {
    publishingCollections: [{ id: "collection-1" }],
    tts: {
      defaultProviderId: "edge-free",
      defaultVoiceProfileId: "edge-voice",
      providers: [
        {
          id: "edge-free",
          kind: "edge-tts",
          voiceProfiles: [
            {
              id: "edge-voice",
              voiceId: "zh-CN-XiaoxiaoNeural",
              locale: "zh-TW",
            },
          ],
        },
      ],
    },
  };
  assert.match(getConfigConsistencyError(config) ?? "", /Locale/u);
  config.tts.providers[0]!.voiceProfiles = [
    {
      id: "edge-voice",
      voiceId: "zh-CN-UnknownNeural",
      locale: "zh-CN",
    },
  ];
  assert.match(getConfigConsistencyError(config) ?? "", /支持的 Edge 声线/u);
});
