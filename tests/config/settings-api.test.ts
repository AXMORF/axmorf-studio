import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SETTINGS_API_ROUTES } from "../../settings/contracts/api";
import { createSettingsApi } from "../../settings/server/api";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { validProducerConfigInput } from "../contracts/producer-config.test";

test("settings API GET PUT validation origin and diagnostics stay strict and private-safe", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-settings-api-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/config.json");
  await writeProducerConfig({ configPath, value: validProducerConfigInput });
  const deletedFilmIds: string[] = [];
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
    listFilms: async () => ({ status: "films-listed", films: [] }),
    deleteFilm: async ({ filmId }) => {
      deletedFilmIds.push(filmId);
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

  const films = await api({
    method: "GET",
    url: SETTINGS_API_ROUTES.films,
    headers: {},
  });
  assert.deepEqual(films, {
    statusCode: 200,
    body: { status: "films-listed", films: [] },
  });

  const rejectedDeleteOrigin = await api({
    method: "DELETE",
    url: SETTINGS_API_ROUTES.filmDeletion,
    headers: {
      origin: "http://evil.example",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      filmId: "film-example",
      confirmation: "film-example",
    }),
  });
  assert.equal(rejectedDeleteOrigin.statusCode, 403);

  const rejectedDeleteConfirmation = await api({
    method: "DELETE",
    url: SETTINGS_API_ROUTES.filmDeletion,
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      filmId: "film-example",
      confirmation: "wrong-film",
    }),
  });
  assert.equal(rejectedDeleteConfirmation.statusCode, 400);

  const deleted = await api({
    method: "DELETE",
    url: SETTINGS_API_ROUTES.filmDeletion,
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      filmId: "film-example",
      confirmation: "film-example",
    }),
  });
  assert.deepEqual(deleted, {
    statusCode: 200,
    body: { deletedFilmId: "film-example" },
  });
  assert.deepEqual(deletedFilmIds, ["film-example"]);
});
