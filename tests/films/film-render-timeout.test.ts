import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerConfig,
  DEFAULT_RENDER_TIMEOUT_MINUTES,
  ProducerConfigSchema,
  resolveRenderTimeoutMs,
} from "@axmorf/studio/contracts";

import { renderFilmVideo } from "../../scripts/films/media";
import { readWorkspaceRenderTimeoutMs } from "../../scripts/films/render-timeout";
import { validProducerConfig } from "../fixtures/producer-config";

test("render timeout defaults to 15 minutes and accepts 15–120", () => {
  assert.equal(DEFAULT_RENDER_TIMEOUT_MINUTES, 15);
  assert.equal(resolveRenderTimeoutMs({ renderDefaults: {} }), 15 * 60_000);
  const config = (minutes: number) =>
    buildProducerConfig({
      ...validProducerConfig,
      renderDefaults: {
        ...validProducerConfig.renderDefaults,
        renderTimeoutMinutes: minutes,
      },
    });
  assert.equal(resolveRenderTimeoutMs(config(60)), 60 * 60_000);
  assert.throws(() => config(10));
  assert.throws(() => config(121));
  // Existing configs without the field keep parsing unchanged.
  assert.equal(
    ProducerConfigSchema.safeParse(buildProducerConfig(validProducerConfig))
      .success,
    true,
  );
});

test("the Workspace setting reaches the render process and a timeout keeps quality", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-render-timeout-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "producer.config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      buildProducerConfig({
        ...validProducerConfig,
        renderDefaults: {
          ...validProducerConfig.renderDefaults,
          renderTimeoutMinutes: 45,
        },
      }),
    ),
  );
  const env = { RSP_PRODUCER_CONFIG: configPath };
  assert.equal(
    await readWorkspaceRenderTimeoutMs({ rootDir: root, env }),
    45 * 60_000,
  );
  // No config file falls back to the default rather than failing.
  assert.equal(
    await readWorkspaceRenderTimeoutMs({
      rootDir: root,
      env: { RSP_PRODUCER_CONFIG: join(root, "missing.json") },
    }),
    15 * 60_000,
  );

  const seen: (number | undefined)[] = [];
  await assert.rejects(
    () =>
      renderFilmVideo({
        // The repository is itself a Workspace, so the Remotion CLI resolves.
        rootDir: process.cwd(),
        compositionId: "film",
        outputPath: join(root, "out", "video.mp4"),
        timeoutMs: 45 * 60_000,
        runProcess: async (_command, _args, options) => {
          seen.push(options?.timeoutMs);
          throw new Error("Media process timed out after 2700000 ms.");
        },
      }),
    /stopped after 45 minutes\. Keep the film's size, fps and quality; raise renderDefaults\.renderTimeoutMinutes/u,
  );
  assert.deepEqual(seen, [45 * 60_000]);
});
