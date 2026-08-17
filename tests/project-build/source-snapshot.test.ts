import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectProjectSourceSnapshot } from "../../scripts/project-build/adapters/source-snapshot";

const createFixture = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-snapshot-"));
  for (const directory of [
    "src/contracts",
    "src/remotion/runtime",
    "src/projects/story-example/generated",
    "src/projects/story-example/production/scene-assignments",
    "src/projects/story-example/scenes/opening/generated",
    "public/projects/story-example/scenes/opening",
  ]) {
    await mkdir(join(rootDir, directory), { recursive: true });
  }
  for (const [path, bytes] of [
    ["src/contracts/index.ts", "export {};\n"],
    ["src/remotion/runtime/index.ts", "export {};\n"],
    ["src/projects/story-example/Composition.tsx", "export default 1;\n"],
    ["src/projects/story-example/scenes/opening/Renderer.tsx", "color: 'red'\n"],
    ["src/projects/story-example/generated/semantic-timing.generated.json", "{}\n"],
    ["src/projects/story-example/generated/production-render-ready.generated.json", "run-a\n"],
    ["src/projects/story-example/scenes/opening/generated/scene-package.generated.json", "run-a\n"],
    ["src/projects/story-example/production/scene-assignments/opening.generated.json", "run-a\n"],
    ["public/projects/story-example/scenes/opening/asset.png", "asset-a"],
    ["src/Root.tsx", "export {};\n"],
    ["src/index.css", "body{}\n"],
    ["src/index.ts", "export {};\n"],
    ["package.json", "{}\n"],
    ["package-lock.json", "{}\n"],
    ["remotion.config.ts", "export {};\n"],
  ] as const) {
    await writeFile(join(rootDir, path), bytes);
  }
  return rootDir;
};

test("source snapshot binds authoring and public bytes but excludes run projections", async (context) => {
  const rootDir = await createFixture();
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const first = await collectProjectSourceSnapshot({
    rootDir,
    projectId: "story-example",
  });
  assert.equal(
    first.files.some(({ repositoryPath }) =>
      repositoryPath.includes("production-render-ready"),
    ),
    false,
  );
  assert.equal(
    first.files.some(({ repositoryPath }) =>
      repositoryPath.includes("scene-package.generated"),
    ),
    false,
  );

  await writeFile(
    join(rootDir, "src/projects/story-example/generated/production-render-ready.generated.json"),
    "run-b\n",
  );
  const runChanged = await collectProjectSourceSnapshot({
    rootDir,
    projectId: "story-example",
  });
  assert.equal(runChanged.fingerprint, first.fingerprint);

  await writeFile(
    join(rootDir, "src/projects/story-example/scenes/opening/Renderer.tsx"),
    "color: 'blue'\n",
  );
  const sourceChanged = await collectProjectSourceSnapshot({
    rootDir,
    projectId: "story-example",
  });
  assert.notEqual(sourceChanged.fingerprint, first.fingerprint);

  await writeFile(
    join(rootDir, "public/projects/story-example/scenes/opening/asset.png"),
    "asset-b",
  );
  const assetChanged = await collectProjectSourceSnapshot({
    rootDir,
    projectId: "story-example",
  });
  assert.notEqual(assetChanged.fingerprint, sourceChanged.fingerprint);
});

test("source snapshot rejects symbolic links", async (context) => {
  const rootDir = await createFixture();
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await symlink(
    join(rootDir, "package.json"),
    join(rootDir, "src/projects/story-example/linked.json"),
  );
  await assert.rejects(
    collectProjectSourceSnapshot({ rootDir, projectId: "story-example" }),
    /symbolic links/iu,
  );
});
