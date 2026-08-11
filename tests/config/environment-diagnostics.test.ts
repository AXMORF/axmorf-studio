import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { writeProducerConfig } from "../../scripts/config/producer-config";
import { runProducerEnvironmentDiagnostics } from "../../settings/diagnostics";
import { validProducerConfigInput } from "../contracts/producer-config.test";

test("environment diagnostics reuse read-only preflight without generation or private projection", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-diagnostics-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/config.json");
  const referencePath = join(rootDir, "voice/reference.wav");
  await mkdir(dirname(referencePath), { recursive: true });
  await writeFile(referencePath, "not-opened-by-metadata-diagnostic");
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
    routes.some((route) => /generate|tts|warm/iu.test(route)),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /visible-editable-token|127\.0\.0\.1:9880|reference\.wav|operator\/config/iu,
  );
});
