import assert from "node:assert/strict";
import {
  mkdir,
  lstat,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  readPrivateProducerConfig,
  resolvePrivateConfigPath,
  writePrivateProducerConfig,
} from "../../desktop/adapters/private-config-store";
import { buildProducerConfig } from "../../src/contracts";
import { DesktopProviderSettingsSchema } from "../../desktop/contracts/shell";

const crypto = {
  available: () => true,
  encrypt: (value: string) => Buffer.from(value).map((byte) => byte ^ 0xaa),
  decrypt: (bytes: Uint8Array) =>
    Buffer.from(Buffer.from(bytes).map((byte) => byte ^ 0xaa)).toString("utf8"),
};

const config = buildProducerConfig({
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: { width: 1920, height: 1080, fps: 30, locale: "zh-CN" },
  readability: { edgeInsetPx: 64 },
  sceneDefaults: { introSceneTemplateId: null, outroSceneTemplateId: null },
  publishingCollections: [
    { id: "default", name: "Default", description: "Default" },
  ],
  tts: {
    defaultProviderId: "edge",
    defaultVoiceProfileId: "zh-cn-xiaoxiao",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "edge",
        kind: "edge-tts",
        service: "microsoft-edge-read-aloud",
        name: "Edge",
        connection: { timeoutMs: 1000 },
        modelId: "edge-read-aloud",
        voiceProfiles: [
          {
            id: "zh-cn-xiaoxiao",
            name: "Voice",
            voiceId: "zh-CN-XiaoxiaoNeural",
            locale: "zh-CN",
          },
        ],
      },
    ],
  },
});

test("Desktop private config stays encrypted under Application Support", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-private-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writePrivateProducerConfig({
    applicationSupportRoot: root,
    crypto,
    value: config,
  });
  const privateConfigPath = resolvePrivateConfigPath(root);
  const bytes = await readFile(privateConfigPath, "utf8");
  assert.doesNotMatch(bytes, /Xiaoxiao/u);
  assert.equal((await lstat(dirname(privateConfigPath))).mode & 0o777, 0o700);
  assert.equal((await lstat(privateConfigPath)).mode & 0o777, 0o600);
  assert.deepEqual(
    await readPrivateProducerConfig({ applicationSupportRoot: root, crypto }),
    config,
  );
});

test("Desktop private config rejects symlinked Application Support and private parents", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "rsp-private-symlink-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const realRoot = join(base, "real-root");
  const external = join(base, "external");
  await mkdir(realRoot, { mode: 0o700 });
  await mkdir(external, { mode: 0o700 });
  const linkedRoot = join(base, "linked-root");
  await symlink(realRoot, linkedRoot);

  await assert.rejects(
    writePrivateProducerConfig({
      applicationSupportRoot: linkedRoot,
      crypto,
      value: config,
    }),
    /canonical real directory|canonical/u,
  );
  await assert.rejects(
    readPrivateProducerConfig({ applicationSupportRoot: linkedRoot, crypto }),
    /canonical real directory|canonical/u,
  );
  await symlink(external, join(realRoot, "private"));
  await assert.rejects(
    writePrivateProducerConfig({
      applicationSupportRoot: realRoot,
      crypto,
      value: config,
    }),
    /owner-only real directory|canonical/u,
  );
  await assert.rejects(
    readPrivateProducerConfig({ applicationSupportRoot: realRoot, crypto }),
    /owner-only real directory|canonical/u,
  );
  await assert.rejects(readFile(join(external, "producer-config.enc")));
});

test("Desktop private config fails closed after its private directory is swapped", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-private-swap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writePrivateProducerConfig({
    applicationSupportRoot: root,
    crypto,
    value: config,
  });
  const privateDirectory = join(root, "private");
  const parkedDirectory = join(root, "private-before-swap");
  const external = join(root, "external");
  await mkdir(external, { mode: 0o700 });
  const sentinel = join(external, "producer-config.enc");
  await writeFile(sentinel, "external-must-not-change", { mode: 0o600 });
  await rename(privateDirectory, parkedDirectory);
  await symlink(external, privateDirectory);

  await assert.rejects(
    readPrivateProducerConfig({ applicationSupportRoot: root, crypto }),
    /owner-only real directory|canonical/u,
  );
  await assert.rejects(
    writePrivateProducerConfig({
      applicationSupportRoot: root,
      crypto,
      value: config,
    }),
    /owner-only real directory|canonical/u,
  );
  assert.equal(await readFile(sentinel, "utf8"), "external-must-not-change");
});

test("Provider Settings summary cannot carry credentials or connection details", () => {
  const summary = {
    schemaVersion: 1,
    status: "ready",
    defaultProviderId: "edge",
    providers: [{ id: "edge", name: "Edge", kind: "edge-tts" }],
  } as const;
  assert.deepEqual(DesktopProviderSettingsSchema.parse(summary), summary);
  assert.throws(() =>
    DesktopProviderSettingsSchema.parse({
      ...summary,
      token: "must-not-be-readable",
    }),
  );
  assert.throws(() =>
    DesktopProviderSettingsSchema.parse({
      ...summary,
      providers: [{ ...summary.providers[0], baseUrl: "https://secret.test" }],
    }),
  );
});
