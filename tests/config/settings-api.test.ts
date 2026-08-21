import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ProductionProgressResponseSchema,
  SETTINGS_API_ROUTES,
} from "../../settings/contracts/api";
import { createSettingsApi } from "../../settings/server/api";
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
      schemaVersion: 5,
      projects: [],
    }),
    deleteProject: async ({ projectId }) => {
      deletedProjectIds.push(projectId);
    },
  });

  const get = await api({
    method: "GET",
    url: SETTINGS_API_ROUTES.settings,
    headers: {},
  });
  assert.equal(get.statusCode, 200);
  assert.equal(
    (get.body as typeof validProducerConfigInput).renderDefaults.fps,
    30,
  );
  assert.deepEqual(
    (get.body as typeof validProducerConfigInput).audioDefaults.globalBgm,
    validProducerConfigInput.audioDefaults.globalBgm,
  );

  const executionDefaults = await api({
    method: "GET",
    url: SETTINGS_API_ROUTES.executionPreferences,
    headers: {},
  });
  assert.deepEqual(executionDefaults, {
    statusCode: 200,
    body: {
      schemaVersion: 1,
      contractVersion: "execution-preferences-v1",
      creativeTaskExecution: { mode: "inline" },
    },
  });
  const rejectedExecutionOrigin = await api({
    method: "PUT",
    url: SETTINGS_API_ROUTES.executionPreferences,
    headers: {
      origin: "http://evil.example",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify(executionDefaults.body),
  });
  assert.equal(rejectedExecutionOrigin.statusCode, 403);
  const savedExecution = await api({
    method: "PUT",
    url: SETTINGS_API_ROUTES.executionPreferences,
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      schemaVersion: 1,
      contractVersion: "execution-preferences-v1",
      creativeTaskExecution: { mode: "subagents", maxConcurrency: 4 },
    }),
  });
  assert.equal(savedExecution.statusCode, 200);
  assert.equal(
    (await stat(join(rootDir, "private/execution-preferences.json"))).mode &
      0o777,
    0o600,
  );

  const rejectedOrigin = await api({
    method: "PUT",
    url: SETTINGS_API_ROUTES.settings,
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
    url: SETTINGS_API_ROUTES.settings,
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
    url: SETTINGS_API_ROUTES.settings,
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
    url: SETTINGS_API_ROUTES.diagnostics,
    headers: {},
  });
  assert.equal(diagnostics.statusCode, 200);
  assert.doesNotMatch(
    JSON.stringify(diagnostics.body),
    /visible-editable-token|127\.0\.0\.1:9880|\/srv\/private/iu,
  );

  const progress = await api({
    method: "GET",
    url: SETTINGS_API_ROUTES.productionProgress,
    headers: {},
  });
  assert.deepEqual(progress, {
    statusCode: 200,
    body: { schemaVersion: 5, projects: [] },
  });

  const rejectedDeleteOrigin = await api({
    method: "DELETE",
    url: SETTINGS_API_ROUTES.projectDeletion,
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
    url: SETTINGS_API_ROUTES.projectDeletion,
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
    url: SETTINGS_API_ROUTES.projectDeletion,
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

test("production progress API rejects raw diagnostic fingerprints", () => {
  assert.throws(() =>
    ProductionProgressResponseSchema.parse({
      schemaVersion: 5,
      projects: [
        {
          projectId: "story-example",
          status: "needs-agent",
          revisionId: `revision-${"a".repeat(64)}`,
          tasks: {
            reusedTaskCount: 0,
            dirtyAgentTaskCount: 1,
            dirtyFixedTaskCount: 0,
            blockedTaskCount: 0,
          },
          inspection: null,
          attempt: {
            attemptId: "00000000-0000-4000-8000-000000000001",
            revisionId: `revision-${"a".repeat(64)}`,
            planFingerprint: `sha256:${"b".repeat(64)}`,
            state: "waiting-for-agent",
            updatedAt: "2026-08-20T08:00:00.000Z",
            diagnosticCode: null,
            tasks: {
              reusedTaskCount: 0,
              dirtyAgentTaskCount: 1,
              dirtyFixedTaskCount: 0,
              blockedTaskCount: 0,
            },
            estimatedCost: {
              providerRequests: 0,
              providerCacheHits: 0,
              agentTasks: 1,
              deliveryMedia: null,
            },
            actualCost: {
              providerRequests: 0,
              providerCacheHits: 0,
              agentTasks: 1,
              deliveryMedia: [],
            },
            taskExplanations: [],
            taskOutcomes: {
              committedTaskCount: 0,
              currentTaskCount: 0,
              failedTaskCount: 0,
            },
            deliveryResult: "not-verified",
          },
          delivery: null,
          error: null,
        },
      ],
    }),
  );
});
