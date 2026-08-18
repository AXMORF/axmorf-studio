import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import { buildProductionAgentWriteBoundary } from "../../src/contracts";
import {
  checkAgentWriteBoundary,
  writeAgentWriteBoundary,
} from "../../scripts/production/adapters/agent-write-boundary";

const runId = "story-example-run-001";
const storyId = "story-example";

const write = async (rootDir: string, path: string, bytes: string) => {
  await mkdir(dirname(join(rootDir, path)), { recursive: true });
  await writeFile(join(rootDir, path), bytes);
};

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-agent-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await Promise.all([
    write(rootDir, "AGENTS.md", "authority\n"),
    write(rootDir, "scripts/fixed.ts", "export {};\n"),
    write(rootDir, "src/projects/story-example/story.json", "{}\n"),
    write(
      rootDir,
      "src/projects/story-example/scenes/opening/Renderer.tsx",
      "export default null;\n",
    ),
    write(rootDir, "src/projects/other-story/story.json", "{}\n"),
    write(rootDir, "public/projects/other-story/asset.bin", "media\n"),
    write(rootDir, "public/shared-proof.bin", "proof\n"),
    write(rootDir, "private/producer.config.json", "secret\n"),
    write(rootDir, ".env", "TOKEN=secret\n"),
    write(rootDir, "public/voice_profile/reference.wav", "voice\n"),
    mkdir(join(rootDir, `.producer-runs/${runId}/artifacts`), {
      recursive: true,
    }),
  ]);
  return rootDir;
};

test("agent write boundary contract rejects unsorted and escaping scopes", () => {
  const base = {
    runId,
    storyId,
    phase: "owner-authoring",
    workspaceFingerprint: `sha256:${"a".repeat(64)}`,
  } as const;
  assert.throws(() =>
    buildProductionAgentWriteBoundary({
      ...base,
      allowedWriteScopes: [
        { kind: "file", repositoryPath: "z.ts" },
        { kind: "directory", repositoryPath: "a" },
      ],
    }),
  );
  assert.throws(() =>
    buildProductionAgentWriteBoundary({
      ...base,
      allowedWriteScopes: [{ kind: "directory", repositoryPath: "../escape" }],
    }),
  );
  assert.throws(() =>
    buildProductionAgentWriteBoundary({
      ...base,
      allowedWriteScopes: [{ kind: "directory", repositoryPath: "./escape" }],
    }),
  );
});

test("Project authoring may change only the current Project while preserving core and other Projects", async (context) => {
  const rootDir = await createFixture(context);
  await writeAgentWriteBoundary({
    rootDir,
    runId,
    storyId,
    phase: "project-authoring",
    allowedWriteScopes: [
      {
        kind: "directory",
        repositoryPath: "src/projects/story-example",
      },
      {
        kind: "directory",
        repositoryPath: "public/projects/story-example",
      },
    ],
  });
  await write(rootDir, "src/projects/story-example/visual-style.json", "{}\n");
  assert.equal(
    (
      await checkAgentWriteBoundary({
        rootDir,
        runId,
        phase: "project-authoring",
      })
    ).status,
    "current",
  );
  await write(
    rootDir,
    "src/projects/other-story/story.json",
    '{"changed":true}\n',
  );
  assert.equal(
    (
      await checkAgentWriteBoundary({
        rootDir,
        runId,
        phase: "project-authoring",
      })
    ).status,
    "violated",
  );
});

test("owner authoring permits assignment scopes and detects frozen source or core drift", async (context) => {
  const rootDir = await createFixture(context);
  await writeAgentWriteBoundary({
    rootDir,
    runId,
    storyId,
    phase: "owner-authoring",
    allowedWriteScopes: [
      {
        kind: "directory",
        repositoryPath: "src/projects/story-example/scenes/opening",
      },
      {
        kind: "directory",
        repositoryPath: "public/projects/story-example/scenes/opening",
      },
    ],
  });
  await write(
    rootDir,
    "src/projects/story-example/scenes/opening/Renderer.tsx",
    "export default function Opening() { return null; }\n",
  );
  assert.equal(
    (
      await checkAgentWriteBoundary({
        rootDir,
        runId,
        phase: "owner-authoring",
      })
    ).status,
    "current",
  );
  await write(
    rootDir,
    "src/projects/story-example/story.json",
    '{"changed":true}\n',
  );
  assert.equal(
    (
      await checkAgentWriteBoundary({
        rootDir,
        runId,
        phase: "owner-authoring",
      })
    ).status,
    "violated",
  );
});

test("protected private and voice material is checked by metadata without entering the boundary artifact", async (context) => {
  const rootDir = await createFixture(context);
  const written = await writeAgentWriteBoundary({
    rootDir,
    runId,
    storyId,
    phase: "owner-authoring",
    allowedWriteScopes: [],
  });
  assert.doesNotMatch(
    JSON.stringify(written.boundary),
    /secret|voice_profile|TOKEN|\.env/u,
  );
  await write(rootDir, "private/producer.config.json", "changed-secret\n");
  assert.equal(
    (
      await checkAgentWriteBoundary({
        rootDir,
        runId,
        phase: "owner-authoring",
      })
    ).status,
    "violated",
  );
});

test("private environment files are protected by metadata without exposing their names", async (context) => {
  const rootDir = await createFixture(context);
  const written = await writeAgentWriteBoundary({
    rootDir,
    runId,
    storyId,
    phase: "owner-authoring",
    allowedWriteScopes: [],
  });
  assert.doesNotMatch(JSON.stringify(written.boundary), /TOKEN|\.env/u);
  await write(rootDir, ".env", "TOKEN=changed-secret\n");
  assert.equal(
    (
      await checkAgentWriteBoundary({
        rootDir,
        runId,
        phase: "owner-authoring",
      })
    ).status,
    "violated",
  );
});

test("ordinary public assets use content identity rather than metadata only", async (context) => {
  const rootDir = await createFixture(context);
  await writeAgentWriteBoundary({
    rootDir,
    runId,
    storyId,
    phase: "owner-authoring",
    allowedWriteScopes: [],
  });
  const assetPath = join(rootDir, "public/shared-proof.bin");
  const metadata = await stat(assetPath);
  await writeFile(assetPath, "drift\n");
  await utimes(assetPath, metadata.atime, metadata.mtime);
  assert.equal(
    (
      await checkAgentWriteBoundary({
        rootDir,
        runId,
        phase: "owner-authoring",
      })
    ).status,
    "violated",
  );
});
