import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadWorkspaceExecutionPreferences,
  loadWorkspaceProjectControlSettings,
} from "../../desktop/adapters/workspace-context-settings";

test("Workspace context settings default to inline/manual absence and load strict saved values", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "workspace-context-settings-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const privateConfigRoot = join(root, "support");
  await mkdir(privateConfigRoot);

  const defaults = await loadWorkspaceExecutionPreferences({
    privateConfigRoot,
  });
  assert.equal(defaults.source, "builtin-default");
  assert.deepEqual(defaults.preferences.creativeTaskExecution, {
    mode: "inline",
  });
  assert.equal(
    await loadWorkspaceProjectControlSettings({
      privateConfigRoot,
      storyId: "story-example",
    }),
    null,
  );

  await writeFile(
    join(privateConfigRoot, "execution-preferences.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      contractVersion: "execution-preferences-v1",
      creativeTaskExecution: { mode: "subagents", maxConcurrency: 4 },
    })}\n`,
    { mode: 0o600 },
  );
  await mkdir(join(privateConfigRoot, "project-settings"));
  await writeFile(
    join(privateConfigRoot, "project-settings/story-example.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      contractVersion: "desktop-project-control-settings-v1",
      storyId: "story-example",
      deliveryPolicy: "automatic",
    })}\n`,
    { mode: 0o600 },
  );
  const saved = await loadWorkspaceExecutionPreferences({ privateConfigRoot });
  assert.equal(saved.source, "settings");
  assert.deepEqual(saved.preferences.creativeTaskExecution, {
    mode: "subagents",
    maxConcurrency: 4,
  });
  assert.equal(
    (
      await loadWorkspaceProjectControlSettings({
        privateConfigRoot,
        storyId: "story-example",
      })
    )?.deliveryPolicy,
    "automatic",
  );
});

test("Workspace context settings reject malformed, cross-bound, and symbolic inputs", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "workspace-context-settings-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const privateConfigRoot = join(root, "support");
  await mkdir(join(privateConfigRoot, "project-settings"), {
    recursive: true,
  });
  const projectSettings = join(
    privateConfigRoot,
    "project-settings/story-example.json",
  );
  await writeFile(
    projectSettings,
    `${JSON.stringify({
      schemaVersion: 1,
      contractVersion: "desktop-project-control-settings-v1",
      storyId: "other-story",
      deliveryPolicy: "manual",
    })}\n`,
    { mode: 0o600 },
  );
  await assert.rejects(
    loadWorkspaceProjectControlSettings({
      privateConfigRoot,
      storyId: "story-example",
    }),
    /identity is stale/iu,
  );

  await rm(projectSettings);
  await writeFile(join(root, "outside.json"), "{}\n", { mode: 0o600 });
  await symlink(join(root, "outside.json"), projectSettings);
  await assert.rejects(
    loadWorkspaceProjectControlSettings({
      privateConfigRoot,
      storyId: "story-example",
    }),
    /owner-only regular file/iu,
  );
});
