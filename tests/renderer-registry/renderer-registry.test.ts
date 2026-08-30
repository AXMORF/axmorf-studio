import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildSceneCoverageMap } from "@axmorf/studio/contracts";
import {
  buildRendererRegistry,
  collectRendererSourceGraph,
} from "../../scripts/renderer-registry/domain";
import { generateRendererRegistry } from "../../scripts/renderer-registry/generate";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const write = async (root: string, path: string, source: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), source, "utf8");
};

const prepare = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-renderer-registry-"));
  const projectRoot = "src/projects/synthetic-proof";
  const rendererPath = `${projectRoot}/scenes/meaning-one/Renderer.tsx`;
  await write(
    rootDir,
    rendererPath,
    `import type {SceneRendererProps} from "../../../../remotion/runtime/story-visual/types";
     import {ProofShot} from "./shots/ProofShot";
     const Renderer = ({sceneFrame}: Pick<SceneRendererProps, "sceneFrame">) => <ProofShot shotFrame={sceneFrame} />;
     export default Renderer;
    `,
  );
  await write(
    rootDir,
    `${projectRoot}/scenes/meaning-one/shots/ProofShot.tsx`,
    `export const ProofShot=({shotFrame}:{shotFrame:number}) => <div style={{opacity: shotFrame / 120}} />;`,
  );
  await write(
    rootDir,
    `${projectRoot}/scenes/meaning-one/nested/Renderer.tsx`,
    `export default () => <div />;`,
  );
  const graph = await collectRendererSourceGraph({
    rootDir,
    projectId: "synthetic-proof",
    rendererPath,
  });
  const packageInput = createScenePackageInput();
  packageInput.rendererBinding.rendererSourceFingerprint =
    graph.sourceGraphFingerprint;
  packageInput.current.rendererSourceFingerprint = graph.sourceGraphFingerprint;
  const scenePackage = buildScenePackage(packageInput);
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: ["meaning-one"],
    packages: [scenePackage],
    fallbacks: [],
    stalePackages: [],
  });
  return { rootDir, rendererPath, graph, scenePackage, coverage };
};

test("registry discovers fixed-depth Renderer only and emits stable literal static imports", async () => {
  const fixture = await prepare();
  try {
    const first = await buildRendererRegistry({
      rootDir: fixture.rootDir,
      projectId: "synthetic-proof",
      coverage: fixture.coverage,
      packages: [fixture.scenePackage],
    });
    const second = await buildRendererRegistry({
      rootDir: fixture.rootDir,
      projectId: "synthetic-proof",
      coverage: fixture.coverage,
      packages: [fixture.scenePackage],
    });
    assert.deepEqual(first, second);
    assert.ok(first);
    assert.match(
      first.source,
      /import Renderer0 from "\.\/scenes\/meaning-one\/Renderer"/u,
    );
    assert.equal(first.source.includes("import("), false);
    assert.equal(first.source.includes("ProofShot"), false);
    assert.equal(first.source.includes("modulePath"), false);
    assert.deepEqual(
      fixture.graph.files.map(({ sourcePath }) => sourcePath),
      [
        "src/projects/synthetic-proof/scenes/meaning-one/Renderer.tsx",
        "src/projects/synthetic-proof/scenes/meaning-one/shots/ProofShot.tsx",
      ],
    );
    assert.equal(first.entries.length, 1);
  } finally {
    await rm(fixture.rootDir, { recursive: true, force: true });
  }
});

test("registry rejects missing default export Audio violations stale package IDs and symlinked Scenes", async () => {
  const fixture = await prepare();
  try {
    const rendererAbsolute = join(fixture.rootDir, fixture.rendererPath);
    const original = await readFile(rendererAbsolute, "utf8");
    for (const invalid of [
      `export const Renderer=() => <div />;`,
      `import {Audio} from "remotion"; export default () => <Audio src="x" />;`,
      `export default () => <div style={{animation: "spin 1s"}} />;`,
      `export default () => <img src="https://example.invalid/x.png" />;`,
    ]) {
      await writeFile(rendererAbsolute, invalid, "utf8");
      await assert.rejects(() =>
        collectRendererSourceGraph({
          rootDir: fixture.rootDir,
          projectId: "synthetic-proof",
          rendererPath: fixture.rendererPath,
        }),
      );
    }
    await writeFile(rendererAbsolute, original, "utf8");
    await assert.rejects(() =>
      buildRendererRegistry({
        rootDir: fixture.rootDir,
        projectId: "synthetic-proof",
        coverage: fixture.coverage,
        packages: [
          {
            ...fixture.scenePackage,
            rendererBinding: {
              ...fixture.scenePackage.rendererBinding,
              rendererId: "unknown-renderer",
            },
          },
        ],
      }),
    );
    await rm(
      join(fixture.rootDir, "src/projects/synthetic-proof/scenes/meaning-one"),
      {
        recursive: true,
        force: true,
      },
    );
    await symlink(
      "/tmp",
      join(fixture.rootDir, "src/projects/synthetic-proof/scenes/meaning-one"),
    );
    await assert.rejects(() =>
      buildRendererRegistry({
        rootDir: fixture.rootDir,
        projectId: "synthetic-proof",
        coverage: fixture.coverage,
        packages: [fixture.scenePackage],
      }),
    );
  } finally {
    await rm(fixture.rootDir, { recursive: true, force: true });
  }
});

test("registry generation is atomic byte-stable and check detects one-byte drift", async () => {
  const fixture = await prepare();
  const destination = join(
    fixture.rootDir,
    "src/projects/synthetic-proof/renderer-registry.generated.ts",
  );
  try {
    await generateRendererRegistry({
      mode: "write",
      destination,
      rootDir: fixture.rootDir,
      projectId: "synthetic-proof",
      coverage: fixture.coverage,
      packages: [fixture.scenePackage],
    });
    const before = await readFile(destination, "utf8");
    const beforeMtime = (await stat(destination)).mtimeMs;
    await generateRendererRegistry({
      mode: "write",
      destination,
      rootDir: fixture.rootDir,
      projectId: "synthetic-proof",
      coverage: fixture.coverage,
      packages: [fixture.scenePackage],
    });
    assert.equal((await stat(destination)).mtimeMs, beforeMtime);
    await writeFile(destination, `${before}// drift\n`, "utf8");
    await assert.rejects(() =>
      generateRendererRegistry({
        mode: "check",
        destination,
        rootDir: fixture.rootDir,
        projectId: "synthetic-proof",
        coverage: fixture.coverage,
        packages: [fixture.scenePackage],
      }),
    );
  } finally {
    await rm(fixture.rootDir, { recursive: true, force: true });
  }
});

test("no ready package returns no registry requirement", async () => {
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: ["meaning-one"],
    packages: [],
    fallbacks: [],
    stalePackages: [],
  });
  assert.equal(
    await buildRendererRegistry({
      rootDir: "/unused",
      projectId: "synthetic-proof",
      coverage,
      packages: [],
    }),
    null,
  );
});
