import assert from "node:assert/strict";
import test from "node:test";

import { buildProducerTaskSpec } from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"1".repeat(64)}` as const;

const revision = (kind: "scene-owner" | "cover-owner" | "narration-chunk", inputs: readonly { id: string; fingerprint: ReturnType<typeof sha> }[], policy = `${kind}-v1`) =>
  buildProducerTaskSpec({
    taskKind: kind,
    storyId: "story-example",
    semanticId: kind === "scene-owner" ? "opening" : null,
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [...inputs].sort((left, right) => left.id.localeCompare(right.id)),
    declaredReadSet: [],
    declaredOutputSet: [kind === "scene-owner" ? "src/Renderer.tsx" : kind === "cover-owner" ? "src/Cover.tsx" : "public/chunk.wav"],
    validatorPolicyVersion: policy,
  }).taskRevision;

test("task-local scene, cover, TTS, and validator inputs invalidate only their owning node", () => {
  const scene = revision("scene-owner", [{ id: "brief", fingerprint: sha("2") }]);
  const cover = revision("cover-owner", [{ id: "story", fingerprint: sha("3") }]);
  const chunk = revision("narration-chunk", [{ id: "tts-text", fingerprint: sha("4") }]);
  assert.notEqual(scene, revision("scene-owner", [{ id: "brief", fingerprint: sha("5") }]));
  assert.notEqual(cover, revision("cover-owner", [{ id: "story", fingerprint: sha("6") }]));
  assert.notEqual(chunk, revision("narration-chunk", [{ id: "tts-text", fingerprint: sha("7") }]));
  assert.equal(cover, revision("cover-owner", [{ id: "story", fingerprint: sha("3") }]));
  assert.equal(chunk, revision("narration-chunk", [{ id: "tts-text", fingerprint: sha("4") }]));
  assert.notEqual(scene, revision("scene-owner", [{ id: "brief", fingerprint: sha("2") }], "scene-owner-v2"));
});
