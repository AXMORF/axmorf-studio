import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  NarrationExecutionSnapshotSchema,
  NarrationSpecSchema,
  buildNarrationExecutionSnapshot,
  createProductionRunManifest,
} from "../../src/contracts";
import { assertNarrationExecutionCurrent } from "../../scripts/production/application/narration-execution";
import { resolveProducerNarrationExecution } from "../../scripts/config/narration-execution";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { validProducerConfigInput } from "../contracts/producer-config.test";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("Run narration execution reuses provider-attempt and mastering policy identities", () => {
  const snapshot = buildNarrationExecutionSnapshot({
    providerId: "local-voxcpm",
    voiceProfileId: "my-voice",
    speechRate: 1.15,
    providerAttemptFingerprint: sha("a"),
    targetLoudnessLufs: -18,
  });
  assert.deepEqual(NarrationExecutionSnapshotSchema.parse(snapshot), snapshot);
  assert.equal(snapshot.masteringPolicy.targetIntegratedLoudnessLufs, -18);
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /token|https?:|\/home\/|\/data\/|\/srv\/|promptText|controlInstruction/iu,
  );
  const run = createProductionRunManifest({
    schemaVersion: 1,
    contractVersion: "production-run-current-v3",
    runId: "run-20260811t120000z-story-example-a1b2c3",
    storyId: "story-example",
    requirementsPath: "src/projects/story-example/production/requirements.json",
    requirementsFingerprint: sha("b"),
    narrationExecution: snapshot,
    createdAt: "2026-08-11T12:00:00.000Z",
  });
  assert.doesNotMatch(
    JSON.stringify(run),
    /token|https?:|\/home\/|\/data\/|\/srv\/|promptText|controlInstruction/iu,
  );
});

test("configuration drift after preflight is rejected before generation or mastering", () => {
  const frozen = buildNarrationExecutionSnapshot({
    providerId: "local-voxcpm",
    voiceProfileId: "my-voice",
    speechRate: 1,
    providerAttemptFingerprint: sha("a"),
    targetLoudnessLufs: -16,
  });
  for (const current of [
    buildNarrationExecutionSnapshot({
      providerId: "other-provider",
      voiceProfileId: "my-voice",
      speechRate: 1,
      providerAttemptFingerprint: sha("a"),
      targetLoudnessLufs: -16,
    }),
    buildNarrationExecutionSnapshot({
      providerId: "local-voxcpm",
      voiceProfileId: "other-voice",
      speechRate: 1,
      providerAttemptFingerprint: sha("b"),
      targetLoudnessLufs: -16,
    }),
    buildNarrationExecutionSnapshot({
      providerId: "local-voxcpm",
      voiceProfileId: "my-voice",
      speechRate: 1.1,
      providerAttemptFingerprint: sha("c"),
      targetLoudnessLufs: -16,
    }),
    buildNarrationExecutionSnapshot({
      providerId: "local-voxcpm",
      voiceProfileId: "my-voice",
      speechRate: 1,
      providerAttemptFingerprint: sha("a"),
      targetLoudnessLufs: -18,
    }),
  ]) {
    assert.throws(
      () => assertNarrationExecutionCurrent({ frozen, current }),
      /fresh Run|execution.*drift/iu,
    );
  }
});

test("default provider voice generation policy rate and LUFS enter the prepared execution", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-execution-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/config.json");
  const referencePath = join(rootDir, "voice/reference.wav");
  await mkdir(dirname(referencePath), { recursive: true });
  await writeFile(referencePath, "private-voice-fixture");
  const input = {
    ...validProducerConfigInput,
    tts: {
      ...validProducerConfigInput.tts,
      speech: { rate: 1.2, targetLoudnessLufs: -18 },
      providers: [
        {
          ...validProducerConfigInput.tts.providers[0],
          voiceProfiles: [
            {
              ...validProducerConfigInput.tts.providers[0].voiceProfiles[0],
              referenceAudioPath: "voice/reference.wav",
            },
          ],
        },
      ],
    },
  } as const;
  await writeProducerConfig({ configPath, value: input });
  const execution = await resolveProducerNarrationExecution({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    narration: NarrationSpecSchema.parse({
      schemaVersion: 2,
      voiceProfileId: "my-voice",
      mode: "voice-clone",
    }),
  });
  assert.equal(execution.snapshot.providerId, "local-voxcpm");
  assert.equal(execution.snapshot.voiceProfileId, "my-voice");
  assert.equal(execution.snapshot.speechRate, 1.2);
  assert.equal(
    execution.snapshot.masteringPolicy.targetIntegratedLoudnessLufs,
    -18,
  );
  assert.equal(execution.resolved.safeDescriptor.cfgValue, 2);
  assert.doesNotMatch(
    JSON.stringify(execution.snapshot),
    /visible-editable-token|127\.0\.0\.1|reference\.wav|private-voice-fixture/iu,
  );

  await writeProducerConfig({
    configPath,
    value: {
      ...input,
      tts: {
        ...input.tts,
        providers: [
          {
            ...input.tts.providers[0],
            connection: {
              ...input.tts.providers[0].connection,
              baseUrl: "http://127.0.0.1:9988",
            },
          },
        ],
      },
    },
  });
  const drifted = await resolveProducerNarrationExecution({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    narration: NarrationSpecSchema.parse({
      schemaVersion: 2,
      voiceProfileId: "my-voice",
      mode: "voice-clone",
    }),
  });
  assert.notEqual(
    drifted.snapshot.providerAttemptFingerprint,
    execution.snapshot.providerAttemptFingerprint,
  );
  assert.throws(
    () =>
      assertNarrationExecutionCurrent({
        frozen: execution.snapshot,
        current: drifted.snapshot,
      }),
    (error: unknown) => {
      assert.match((error as Error).message, /fresh Run/iu);
      assert.doesNotMatch(
        (error as Error).message,
        /visible-editable-token|127\.0\.0\.1|reference\.wav/iu,
      );
      return true;
    },
  );
});
