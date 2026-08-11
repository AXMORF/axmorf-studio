import assert from "node:assert/strict";
import test from "node:test";

import {
  getConfigConsistencyError,
  nextUniqueId,
  selectProviderAndVoice,
  removeVoiceProfile,
  type EditableTtsConfig,
} from "../../settings/src/model";

test("new collection and voice IDs skip existing collisions", () => {
  assert.equal(
    nextUniqueId("collection", ["collection-1", "collection-3"]),
    "collection-2",
  );
  assert.equal(nextUniqueId("voice", ["voice-1", "voice-2"]), "voice-3");
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
