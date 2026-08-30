import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  nodeSceneOriginalitySnapshotFileSystem,
  freezeProjectSceneOriginalityBaseline,
  readProjectSceneOriginalityBaseline,
  snapshotSceneSourceGraph,
  snapshotWorkspaceSceneOriginalityBaseline,
} from "../../scripts/projects/application/scene-originality";
import {
  parseProjectOriginalityArguments,
  runProjectOriginalityFreezeCli,
} from "../../scripts/projects/originality";

const writeScene = async ({
  rootDir,
  storyId,
  meaningId,
  renderer,
  helper = "export const label = 'one';",
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly meaningId: string;
  readonly renderer: string;
  readonly helper?: string;
}) => {
  const sceneRoot = join(rootDir, "src/projects", storyId, "scenes", meaningId);
  await mkdir(join(sceneRoot, "helpers"), { recursive: true });
  await writeFile(join(sceneRoot, "Renderer.tsx"), renderer);
  await writeFile(join(sceneRoot, "helpers/content.ts"), helper);
  await writeFile(join(sceneRoot, "scene-package.generated.json"), "{}");
  return sceneRoot;
};

const renderer =
  "import {label} from './helpers/content'; export default () => <div>{label}</div>;";

test("Workspace baseline snapshots complete source graphs with explicit owners", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-originality-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeScene({
    rootDir,
    storyId: "selected-story",
    meaningId: "opening",
    renderer,
  });
  await writeScene({
    rootDir,
    storyId: "other-story",
    meaningId: "closing",
    renderer,
    helper: "export const label = 'two';",
  });

  const selectedGraph = await snapshotSceneSourceGraph({
    rootDir,
    storyId: "selected-story",
    meaningId: "opening",
  });
  assert.deepEqual(
    selectedGraph.files.map(({ path }) => path),
    ["helpers/content.ts", "Renderer.tsx"].sort((left, right) =>
      left.localeCompare(right),
    ),
  );

  const baseline = await snapshotWorkspaceSceneOriginalityBaseline({
    rootDir,
    subjectStoryId: "selected-story",
  });
  assert.deepEqual(
    baseline.entries.map(({ owner }) => `${owner.storyId}/${owner.meaningId}`),
    ["other-story/closing"],
  );
  assert.notEqual(selectedGraph.sourceGraphFingerprint, undefined);
});

test("Workspace snapshots canonicalize an aliasing ancestor without admitting a root symlink", async (context) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "axmorf-originality-root-alias-"),
  );
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const canonicalParent = join(fixtureRoot, "canonical-parent");
  const canonicalRoot = join(canonicalParent, "workspace");
  const aliasParent = join(fixtureRoot, "alias-parent");
  const directRootAlias = join(fixtureRoot, "workspace-link");
  await mkdir(canonicalRoot, { recursive: true });
  await symlink(canonicalParent, aliasParent, "dir");
  await symlink(canonicalRoot, directRootAlias, "dir");
  const rootThroughAliasingAncestor = join(aliasParent, "workspace");
  await writeScene({
    rootDir: rootThroughAliasingAncestor,
    storyId: "selected-story",
    meaningId: "opening",
    renderer,
  });

  const graph = await snapshotSceneSourceGraph({
    rootDir: rootThroughAliasingAncestor,
    storyId: "selected-story",
    meaningId: "opening",
  });
  assert.equal(graph.files.length, 2);
  await assert.rejects(
    snapshotSceneSourceGraph({
      rootDir: directRootAlias,
      storyId: "selected-story",
      meaningId: "opening",
    }),
    /Workspace root must be a real directory/u,
  );
});

test("baseline freeze is explicit, immutable, and excludes the subject Project", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-originality-freeze-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeScene({
    rootDir,
    storyId: "selected-story",
    meaningId: "opening",
    renderer,
  });
  await mkdir(join(rootDir, "src/projects/selected-story/production"));
  await writeScene({
    rootDir,
    storyId: "other-story",
    meaningId: "closing",
    renderer,
  });

  const output: string[] = [];
  const frozen = await runProjectOriginalityFreezeCli(
    ["--project", "selected-story"],
    { rootDir, stdout: (line) => output.push(line) },
  );
  assert.equal(frozen.status, "scene-originality-baseline-frozen");
  assert.equal(frozen.entryCount, 1);
  assert.deepEqual(JSON.parse(output[0] ?? ""), frozen);
  assert.throws(() => parseProjectOriginalityArguments([]), /Expected/u);
  const baseline = await readProjectSceneOriginalityBaseline({
    rootDir,
    subjectStoryId: "selected-story",
  });
  assert.deepEqual(
    baseline.entries.map(({ owner }) => `${owner.storyId}/${owner.meaningId}`),
    ["other-story/closing"],
  );

  await writeFile(
    join(rootDir, "src/projects/other-story/scenes/closing/Renderer.tsx"),
    "export default () => <main>changed</main>;",
  );
  const current = await freezeProjectSceneOriginalityBaseline({
    rootDir,
    subjectStoryId: "selected-story",
  });
  assert.equal(current.status, "scene-originality-baseline-current");
  assert.equal(current.baselineFingerprint, frozen.baselineFingerprint);
});

test("Scene snapshots reject symlinks anywhere inside the source graph", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-originality-link-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sceneRoot = await writeScene({
    rootDir,
    storyId: "selected-story",
    meaningId: "opening",
    renderer,
  });
  await symlink(
    join(sceneRoot, "helpers/content.ts"),
    join(sceneRoot, "helpers/linked.ts"),
  );
  await assert.rejects(
    snapshotSceneSourceGraph({
      rootDir,
      storyId: "selected-story",
      meaningId: "opening",
    }),
    /symbolic links/u,
  );
});

test("Scene snapshots fail closed when a source changes during its read", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-originality-drift-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sceneRoot = await writeScene({
    rootDir,
    storyId: "selected-story",
    meaningId: "opening",
    renderer,
  });
  const rendererPath = join(sceneRoot, "Renderer.tsx");
  let changed = false;
  await assert.rejects(
    snapshotSceneSourceGraph({
      rootDir,
      storyId: "selected-story",
      meaningId: "opening",
      fileSystem: {
        ...nodeSceneOriginalitySnapshotFileSystem,
        readFile: async (path) => {
          const bytes = await readFile(path);
          if (!changed && path === rendererPath) {
            changed = true;
            await writeFile(
              path,
              `${bytes.toString("utf8")}\nconst drift = true;`,
            );
          }
          return Uint8Array.from(bytes);
        },
      },
    }),
    /changed while being read/u,
  );
});
