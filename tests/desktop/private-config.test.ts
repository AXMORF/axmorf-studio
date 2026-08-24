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
  readDesktopPrivateConfig,
  resolveDesktopPrivateConfigPath,
  writeDesktopPrivateConfig,
} from "../../desktop/adapters/private-config-store";
import { buildProducerConfig } from "../../src/contracts";
import { createDesktopSettingsSnapshot } from "../../desktop/application/manage-settings";
import {
  DesktopSettingsSnapshotSchema,
  createDesktopPrivateConfig,
} from "../../desktop/contracts/settings";

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
const privateConfig = createDesktopPrivateConfig({ producerConfig: config });

test("Desktop private config stays encrypted under Application Support", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-private-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDesktopPrivateConfig({
    applicationSupportRoot: root,
    crypto,
    value: privateConfig,
  });
  const privateConfigPath = resolveDesktopPrivateConfigPath(root);
  const bytes = await readFile(privateConfigPath, "utf8");
  assert.doesNotMatch(bytes, /Xiaoxiao/u);
  assert.equal((await lstat(dirname(privateConfigPath))).mode & 0o777, 0o700);
  assert.equal((await lstat(privateConfigPath)).mode & 0o777, 0o600);
  assert.deepEqual(
    await readDesktopPrivateConfig({ applicationSupportRoot: root, crypto }),
    privateConfig,
  );
});

test("Desktop private config reads the legacy encrypted ProducerConfig as one envelope", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-private-legacy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = resolveDesktopPrivateConfigPath(root);
  await mkdir(dirname(path), { mode: 0o700 });
  await writeFile(path, crypto.encrypt(JSON.stringify(config)), { mode: 0o600 });
  assert.deepEqual(
    await readDesktopPrivateConfig({ applicationSupportRoot: root, crypto }),
    privateConfig,
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
    writeDesktopPrivateConfig({
      applicationSupportRoot: linkedRoot,
      crypto,
      value: privateConfig,
    }),
    /canonical real directory|canonical/u,
  );
  await assert.rejects(
    readDesktopPrivateConfig({ applicationSupportRoot: linkedRoot, crypto }),
    /canonical real directory|canonical/u,
  );
  await symlink(external, join(realRoot, "private"));
  await assert.rejects(
    writeDesktopPrivateConfig({
      applicationSupportRoot: realRoot,
      crypto,
      value: privateConfig,
    }),
    /owner-only real directory|canonical/u,
  );
  await assert.rejects(
    readDesktopPrivateConfig({ applicationSupportRoot: realRoot, crypto }),
    /owner-only real directory|canonical/u,
  );
  await assert.rejects(readFile(join(external, "producer-config.enc")));
});

test("Desktop private config fails closed after its private directory is swapped", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-private-swap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeDesktopPrivateConfig({
    applicationSupportRoot: root,
    crypto,
    value: privateConfig,
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
    readDesktopPrivateConfig({ applicationSupportRoot: root, crypto }),
    /owner-only real directory|canonical/u,
  );
  await assert.rejects(
    writeDesktopPrivateConfig({
      applicationSupportRoot: root,
      crypto,
      value: privateConfig,
    }),
    /owner-only real directory|canonical/u,
  );
  assert.equal(await readFile(sentinel, "utf8"), "external-must-not-change");
});

test("Desktop Settings snapshot is strict and never echoes credentials", () => {
  const configInput = createDesktopSettingsSnapshot({
    privateConfig,
  }).config;
  const speechConfig = buildProducerConfig({
    ...configInput,
    tts: {
      ...config.tts,
      defaultProviderId: "cloud",
      defaultVoiceProfileId: "alloy",
      providers: [
        {
          id: "cloud",
          kind: "speech-sdk",
          vendor: "openai",
          name: "Cloud",
          connection: { apiKey: "must-not-echo", timeoutMs: 1_000 },
          modelId: "gpt-4o-mini-tts",
          voiceProfiles: [
            {
              id: "alloy",
              name: "Alloy",
              voiceId: "alloy",
              source: "catalog",
            },
          ],
        },
      ],
    },
  });
  const summary = createDesktopSettingsSnapshot({
    privateConfig: createDesktopPrivateConfig({ producerConfig: speechConfig }),
  });
  assert.deepEqual(DesktopSettingsSnapshotSchema.parse(summary), summary);
  assert.doesNotMatch(JSON.stringify(summary), /must-not-echo/u);
  assert.equal(
    summary.secrets.find(({ field }) => field === "apiKey")?.configured,
    true,
  );
  const leaked = structuredClone(summary);
  const leakedProvider = leaked.config.tts.providers[0];
  assert.equal(leakedProvider?.kind, "speech-sdk");
  if (leakedProvider?.kind === "speech-sdk") {
    leakedProvider.connection.apiKey = "must-not-be-readable";
  }
  assert.throws(() => DesktopSettingsSnapshotSchema.parse(leaked));
  assert.throws(() =>
    DesktopSettingsSnapshotSchema.parse({
      ...summary,
      token: "must-not-be-readable",
    }),
  );
});
