import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { writeProducerConfig } from "../../scripts/config/producer-config";
import { runProducerEnvironmentDiagnostics } from "../../settings/server/diagnostics";
import { validProducerConfigInput } from "../contracts/producer-config.test";

test("environment diagnostics reuse read-only preflight without generation or private projection", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-diagnostics-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/config.json");
  const referencePath = join(rootDir, "voice/reference.wav");
  const bgmPath = join(rootDir, "public/audio/default-bgm.mp3");
  await Promise.all([
    mkdir(dirname(referencePath), { recursive: true }),
    mkdir(dirname(bgmPath), { recursive: true }),
  ]);
  await writeFile(referencePath, "not-opened-by-metadata-diagnostic");
  await writeFile(bgmPath, "not-opened-by-file-diagnostic");
  await writeProducerConfig({
    configPath,
    value: {
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
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
    },
  });
  const routes: string[] = [];
  const diagnostics = await runProducerEnvironmentDiagnostics({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    voxcpmProbe: async ({ route }) => {
      routes.push(route);
      return route === "/health"
        ? { status: 200, body: { status: "ok" } }
        : { status: 200, body: { ready: true, denoiser_ready: true } };
    },
    browserPreflight: async () => ({
      status: "pass",
      domain: "remotion-browser",
    }),
  });

  assert.equal(diagnostics.status, "pass");
  assert.deepEqual(routes, ["/health", "/ready"]);
  assert.equal(
    diagnostics.checks.find(({ id }) => id === "global-bgm")?.status,
    "pass",
  );
  assert.equal(
    routes.some((route) => /generate|tts|warm/iu.test(route)),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /visible-editable-token|127\.0\.0\.1:9880|reference\.wav|operator\/config/iu,
  );
});

test("configured BGM must resolve to a local regular file", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-bgm-diagnostics-"));
  const outsideDir = await mkdtemp(join(tmpdir(), "rsp-bgm-outside-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  context.after(() => rm(outsideDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/config.json");
  const referencePath = join(rootDir, "voice/reference.wav");
  const outsideBgmPath = join(outsideDir, "audio/default-bgm.mp3");
  await mkdir(dirname(referencePath), { recursive: true });
  await mkdir(dirname(outsideBgmPath), { recursive: true });
  await writeFile(referencePath, "voice-source");
  await writeFile(outsideBgmPath, "outside-bgm");
  await symlink(outsideDir, join(rootDir, "public"), "dir");
  await writeProducerConfig({
    configPath,
    value: {
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
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
    },
  });

  const diagnostics = await runProducerEnvironmentDiagnostics({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    voxcpmProbe: async ({ route }) =>
      route === "/health"
        ? { status: 200, body: { status: "ok" } }
        : { status: 200, body: { ready: true, denoiser_ready: true } },
    browserPreflight: async () => ({
      status: "pass",
      domain: "remotion-browser",
    }),
  });

  assert.equal(diagnostics.status, "attention");
  assert.deepEqual(
    diagnostics.checks.find(({ id }) => id === "global-bgm"),
    {
      id: "global-bgm",
      status: "fail",
      summary: "全局 BGM 预设文件不可访问。",
      remediation: "修复仓库相对文件位置或权限后重新诊断。",
    },
  );
  assert.doesNotMatch(JSON.stringify(diagnostics), /default-bgm\.mp3/iu);
});

test("SpeechSDK diagnostics validate configuration without generation readiness or network probes", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cloud-diagnostics-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/config.json");
  await writeProducerConfig({
    configPath,
    value: {
      ...validProducerConfigInput,
      audioDefaults: { globalBgm: null },
      tts: {
        ...validProducerConfigInput.tts,
        defaultProviderId: "openai-direct",
        defaultVoiceProfileId: "cloud-voice",
        providers: [
          {
            id: "openai-direct",
            kind: "speech-sdk",
            vendor: "openai",
            name: "OpenAI direct",
            connection: {
              apiKey: "diagnostic-secret",
              baseUrl: "https://api.openai.com/v1",
              timeoutMs: 60_000,
            },
            modelId: "gpt-4o-mini-tts",
            voiceProfiles: [
              { id: "cloud-voice", name: "Cloud", voiceId: "alloy" },
            ],
          },
        ],
      },
    },
  });
  let providerProbeCount = 0;
  const diagnostics = await runProducerEnvironmentDiagnostics({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    voxcpmProbe: async () => {
      providerProbeCount += 1;
      throw new Error("must not probe cloud provider");
    },
    browserPreflight: async () => ({
      status: "pass",
      domain: "remotion-browser",
    }),
  });

  assert.equal(providerProbeCount, 0);
  assert.equal(diagnostics.status, "pass");
  assert.deepEqual(
    diagnostics.checks.find(({ id }) => id === "speech-sdk-openai"),
    {
      id: "speech-sdk-openai",
      status: "pass",
      summary:
        "SpeechSDK OpenAI 直连配置已验证；凭证与网络将在真实生成时校验。",
      remediation: null,
    },
  );
  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /diagnostic-secret|api\.openai\.com|alloy/iu,
  );
});
