import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSettingsApi } from "../../settings/api";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { validProducerConfigInput } from "../contracts/producer-config.test";

test("settings API GET PUT validation origin and diagnostics stay strict and private-safe", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-settings-api-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/config.json");
  await writeProducerConfig({ configPath, value: validProducerConfigInput });
  const deletedProjectIds: string[] = [];
  const api = createSettingsApi({
    rootDir,
    env: { RSP_PRODUCER_CONFIG: configPath },
    diagnose: async () => ({
      schemaVersion: 1,
      status: "attention",
      checks: [
        {
          id: "voxcpm",
          status: "fail",
          summary: "本地语音服务不可达。",
          remediation: "恢复本地语音服务后重试诊断。",
        },
      ],
    }),
    inspectProductionProgress: async () => ({
      schemaVersion: 2,
      projects: [],
    }),
    deleteProject: async ({ projectId }) => {
      deletedProjectIds.push(projectId);
    },
  });

  const get = await api({ method: "GET", url: "/api/settings", headers: {} });
  assert.equal(get.statusCode, 200);
  assert.equal(
    (get.body as typeof validProducerConfigInput).renderDefaults.fps,
    30,
  );
  assert.deepEqual(
    (get.body as typeof validProducerConfigInput).audioDefaults.globalBgm,
    validProducerConfigInput.audioDefaults.globalBgm,
  );

  const rejectedOrigin = await api({
    method: "PUT",
    url: "/api/settings",
    headers: {
      origin: "http://evil.example",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify(validProducerConfigInput),
  });
  assert.equal(rejectedOrigin.statusCode, 403);

  const invalid = await api({
    method: "PUT",
    url: "/api/settings",
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...validProducerConfigInput, unknown: true }),
  });
  assert.equal(invalid.statusCode, 400);

  const put = await api({
    method: "PUT",
    url: "/api/settings",
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...validProducerConfigInput,
      renderDefaults: { ...validProducerConfigInput.renderDefaults, fps: 25 },
    }),
  });
  assert.equal(put.statusCode, 200);
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.equal(
    JSON.parse(await readFile(configPath, "utf8")).renderDefaults.fps,
    25,
  );
  assert.equal(
    JSON.parse(await readFile(configPath, "utf8")).audioDefaults.globalBgm
      .volume,
    0.15,
  );

  const diagnostics = await api({
    method: "GET",
    url: "/api/diagnostics",
    headers: {},
  });
  assert.equal(diagnostics.statusCode, 200);
  assert.doesNotMatch(
    JSON.stringify(diagnostics.body),
    /visible-editable-token|127\.0\.0\.1:9880|\/srv\/private/iu,
  );

  const progress = await api({
    method: "GET",
    url: "/api/production-progress",
    headers: {},
  });
  assert.deepEqual(progress, {
    statusCode: 200,
    body: { schemaVersion: 2, projects: [] },
  });

  const rejectedDeleteOrigin = await api({
    method: "DELETE",
    url: "/api/projects/delete",
    headers: {
      origin: "http://evil.example",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectId: "story-example",
      confirmation: "story-example",
    }),
  });
  assert.equal(rejectedDeleteOrigin.statusCode, 403);

  const rejectedDeleteConfirmation = await api({
    method: "DELETE",
    url: "/api/projects/delete",
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectId: "story-example",
      confirmation: "wrong-project",
    }),
  });
  assert.equal(rejectedDeleteConfirmation.statusCode, 400);

  const deleted = await api({
    method: "DELETE",
    url: "/api/projects/delete",
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectId: "story-example",
      confirmation: "story-example",
    }),
  });
  assert.deepEqual(deleted, {
    statusCode: 200,
    body: { deletedProjectId: "story-example" },
  });
  assert.deepEqual(deletedProjectIds, ["story-example"]);
});
