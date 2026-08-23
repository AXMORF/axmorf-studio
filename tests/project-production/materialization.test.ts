import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerTaskSpec,
  type ProducerTaskSpec,
} from "../../src/contracts";
import { commitTaskArtifact } from "../../scripts/project-production/adapters/artifact-store";
import {
  materializeOwnerArtifacts,
  verifyMaterializedOwnerArtifacts,
} from "../../scripts/project-production/adapters/project-materializer";
import { checksumBytes } from "../../scripts/project-production/adapters/project-input-snapshot";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"1".repeat(64)}` as const;
const locationsFor = (rootDir: string) =>
  createRepositoryProductionLocations({ repositoryRoot: rootDir });

const commit = async (
  rootDir: string,
  task: ProducerTaskSpec,
  files: Readonly<Record<string, string>>,
) => {
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  await Promise.all([
    mkdir(locations.projectSourceRoot, { recursive: true }),
    mkdir(locations.projectMediaRoot, { recursive: true }),
  ]);
  const workspace = await createTaskWorkspace({
    locations,
    task,
    seedFiles: files,
  });
  const attestation = (await commitTaskArtifact({ locations, task, workspace }))
    .attestation;
  if (attestation === null) throw new Error("Fixture artifact commit failed.");
  return attestation;
};

test("owner materialization writes only the configured Workspace source and media roots", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "rsp-workspace-materialize-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const workspaceRoot = join(parent, "workspace");
  const locations = createWorkspaceProductionLocations({
    workspaceRoot,
    applicationSupportRoot: join(parent, "application-support"),
    runtimeResources: join(parent, "runtime-pack"),
    cacheRoot: join(parent, "cache"),
  });
  await Promise.all([
    mkdir(locations.projectSourceRoot, { recursive: true }),
    mkdir(locations.projectMediaRoot, { recursive: true }),
  ]);
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "scene", fingerprint: sha("9") }],
    declaredReadSet: [],
    declaredOutputSet: ["public/texture.bin", "src/Renderer.tsx"],
    validatorPolicyVersion: "scene-v1",
  });
  const taskWorkspace = await createTaskWorkspace({
    locations,
    task,
    seedFiles: {
      "public/texture.bin": "workspace-media",
      "src/Renderer.tsx": "export default null;",
    },
  });
  const committed = await commitTaskArtifact({
    locations,
    task,
    workspace: taskWorkspace,
  });
  if (committed.attestation === null) {
    throw new Error("Workspace fixture artifact commit failed.");
  }
  const attestation = committed.attestation;
  await materializeOwnerArtifacts({
    locations,
    projectId: "story-example",
    artifacts: [{ task, attestation }],
    sceneTaskInputs: new Map([["opening", { meaningId: "opening" }]]),
  });
  assert.equal(
    await readFile(
      join(
        locations.projectSourceRoot,
        "story-example/scenes/opening/Renderer.tsx",
      ),
      "utf8",
    ),
    "export default null;",
  );
  assert.equal(
    await readFile(
      join(
        locations.projectMediaRoot,
        "story-example/scenes/opening/texture.bin",
      ),
      "utf8",
    ),
    "workspace-media",
  );
  await assert.rejects(
    readFile(
      join(
        workspaceRoot,
        "src/projects/story-example/scenes/opening/Renderer.tsx",
      ),
    ),
    { code: "ENOENT" },
  );
});

test("owner materialization atomically replaces src/public/file roots and verifies live bytes", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-materialize-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const scene = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "scene", fingerprint: sha("2") }],
    declaredReadSet: [],
    declaredOutputSet: ["public/texture.bin", "src/Renderer.tsx"],
    validatorPolicyVersion: "scene-v1",
  });
  const global = buildProducerTaskSpec({
    taskKind: "global-visual-owner",
    storyId: "story-example",
    semanticId: null,
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "global", fingerprint: sha("3") }],
    declaredReadSet: [],
    declaredOutputSet: [
      "project/global-visual-plan.json",
      "src/GlobalVisualLayers.tsx",
    ],
    validatorPolicyVersion: "global-v1",
  });
  const [sceneAttestation, globalAttestation] = await Promise.all([
    commit(rootDir, scene, {
      "public/texture.bin": "texture-v1",
      "src/Renderer.tsx": "export default () => null;",
    }),
    commit(rootDir, global, {
      "project/global-visual-plan.json": "{}\n",
      "src/GlobalVisualLayers.tsx":
        "export const GlobalVisualLayers = () => null;",
    }),
  ]);
  const oldScene = join(rootDir, "src/projects/story-example/scenes/opening");
  const oldPublic = join(
    rootDir,
    "public/projects/story-example/scenes/opening",
  );
  await mkdir(oldScene, { recursive: true });
  await mkdir(oldPublic, { recursive: true });
  await writeFile(join(oldScene, "old.tsx"), "old");
  await writeFile(join(oldPublic, "old.bin"), "old");
  const artifacts = [
    { task: scene, attestation: sceneAttestation },
    { task: global, attestation: globalAttestation },
  ];
  const sceneTaskInputs = new Map<string, unknown>([
    ["opening", { meaningId: "opening" }],
  ]);
  await materializeOwnerArtifacts({
    locations: locationsFor(rootDir),
    projectId: "story-example",
    artifacts,
    sceneTaskInputs,
  });
  assert.equal(
    await readFile(join(oldScene, "Renderer.tsx"), "utf8"),
    "export default () => null;",
  );
  assert.equal(
    await readFile(join(oldPublic, "texture.bin"), "utf8"),
    "texture-v1",
  );
  assert.equal(
    await readFile(
      join(rootDir, "src/projects/story-example/global-visual-plan.json"),
      "utf8",
    ),
    "{}\n",
  );
  await verifyMaterializedOwnerArtifacts({
    locations: locationsFor(rootDir),
    projectId: "story-example",
    artifacts,
    sceneTaskInputs,
  });
  await writeFile(join(oldScene, "Renderer.tsx"), "drift");
  await assert.rejects(
    () =>
      verifyMaterializedOwnerArtifacts({
        locations: locationsFor(rootDir),
        projectId: "story-example",
        artifacts,
        sceneTaskInputs,
      }),
    /checksum drifted/,
  );
});

test("cross-root promotion rolls back an already replaced owner root", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-materialize-rollback-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "scene", fingerprint: sha("4") }],
    declaredReadSet: [],
    declaredOutputSet: ["public/texture.bin", "src/Renderer.tsx"],
    validatorPolicyVersion: "scene-v1",
  });
  const attestation = await commit(rootDir, task, {
    "public/texture.bin": "new-public",
    "src/Renderer.tsx": "new-source",
  });
  const sceneRoot = join(rootDir, "src/projects/story-example/scenes/opening");
  const publicRoot = join(
    rootDir,
    "public/projects/story-example/scenes/opening",
  );
  await mkdir(sceneRoot, { recursive: true });
  await mkdir(publicRoot, { recursive: true });
  await writeFile(join(sceneRoot, "old.txt"), "old-source");
  await writeFile(join(publicRoot, "old.txt"), "old-public");
  await assert.rejects(
    () =>
      materializeOwnerArtifacts({
        locations: locationsFor(rootDir),
        projectId: "story-example",
        artifacts: [{ task, attestation }],
        sceneTaskInputs: new Map([["opening", { meaningId: "opening" }]]),
        dependencies: {
          beforePromote: async ({ index }) => {
            if (index === 1) throw new Error("injected promotion failure");
          },
        },
      }),
    /injected promotion failure/,
  );
  assert.equal(
    await readFile(join(sceneRoot, "old.txt"), "utf8"),
    "old-source",
  );
  assert.equal(
    await readFile(join(publicRoot, "old.txt"), "utf8"),
    "old-public",
  );
});

test("Scene materialization clears and verifies the public root when artifact has no public outputs", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-materialize-empty-public-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "scene", fingerprint: sha("5") }],
    declaredReadSet: [],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-v1",
  });
  const attestation = await commit(rootDir, task, {
    "src/Renderer.tsx": "export default () => null;",
  });
  const publicRoot = join(
    rootDir,
    "public/projects/story-example/scenes/opening",
  );
  await mkdir(publicRoot, { recursive: true });
  await writeFile(join(publicRoot, "stale.bin"), "stale");
  const artifacts = [{ task, attestation }];
  const sceneTaskInputs = new Map<string, unknown>([
    ["opening", { meaningId: "opening" }],
  ]);
  await materializeOwnerArtifacts({
    locations: locationsFor(rootDir),
    projectId: "story-example",
    artifacts,
    sceneTaskInputs,
  });
  assert.deepEqual(await readdir(publicRoot), []);
  await writeFile(join(publicRoot, "unexpected.bin"), "unexpected");
  await assert.rejects(
    () =>
      verifyMaterializedOwnerArtifacts({
        locations: locationsFor(rootDir),
        projectId: "story-example",
        artifacts,
        sceneTaskInputs,
      }),
    /exact file set drifted/,
  );
});

test("prepare-like fixed Scene files require an explicit exact manifest", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-materialize-fixed-scene-file-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "scene", fingerprint: sha("6") }],
    declaredReadSet: [],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-v1",
  });
  const attestation = await commit(rootDir, task, {
    "src/Renderer.tsx": "export default () => null;",
  });
  const artifacts = [{ task, attestation }];
  const sceneTaskInputs = new Map<string, unknown>([
    ["opening", { meaningId: "opening" }],
  ]);
  await materializeOwnerArtifacts({
    locations: locationsFor(rootDir),
    projectId: "story-example",
    artifacts,
    sceneTaskInputs,
  });
  const sceneRoot = join(rootDir, "src/projects/story-example/scenes/opening");
  const fixedPath = join(sceneRoot, "generated/scene-package.generated.json");
  const fixedBytes = new TextEncoder().encode('{"schemaVersion":5}\n');
  await mkdir(join(sceneRoot, "generated"), { recursive: true });
  await writeFile(fixedPath, fixedBytes);
  await assert.rejects(
    () =>
      verifyMaterializedOwnerArtifacts({
        locations: locationsFor(rootDir),
        projectId: "story-example",
        artifacts,
        sceneTaskInputs,
      }),
    /exact file set drifted/,
  );
  const additionalSceneFiles = new Map([
    [
      "opening",
      new Map([
        [
          "generated/scene-package.generated.json",
          {
            checksum: checksumBytes(fixedBytes),
            sizeBytes: fixedBytes.byteLength,
          },
        ],
      ]),
    ],
  ]);
  await verifyMaterializedOwnerArtifacts({
    locations: locationsFor(rootDir),
    projectId: "story-example",
    artifacts,
    sceneTaskInputs,
    additionalSceneFiles,
  });
  await writeFile(fixedPath, "tampered");
  await assert.rejects(
    () =>
      verifyMaterializedOwnerArtifacts({
        locations: locationsFor(rootDir),
        projectId: "story-example",
        artifacts,
        sceneTaskInputs,
        additionalSceneFiles,
      }),
    /checksum drifted/,
  );
  await writeFile(fixedPath, fixedBytes);
  await writeFile(join(sceneRoot, "unknown.json"), "{}");
  await assert.rejects(
    () =>
      verifyMaterializedOwnerArtifacts({
        locations: locationsFor(rootDir),
        projectId: "story-example",
        artifacts,
        sceneTaskInputs,
        additionalSceneFiles,
      }),
    /exact file set drifted/,
  );
});

for (const unsafeParent of ["src", "public"] as const) {
  test(`owner materialization rejects a symlinked ${unsafeParent} intermediate parent before writing outside`, async (context) => {
    const rootDir = await mkdtemp(
      join(tmpdir(), `rsp-materialize-${unsafeParent}-parent-`),
    );
    const outside = await mkdtemp(
      join(tmpdir(), `rsp-materialize-${unsafeParent}-outside-`),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    context.after(() => rm(outside, { recursive: true, force: true }));
    const task = buildProducerTaskSpec({
      taskKind: "scene-owner",
      storyId: "story-example",
      semanticId: "opening",
      revisionId,
      dependencyArtifacts: [],
      inputFingerprints: [{ id: "scene", fingerprint: sha("7") }],
      declaredReadSet: [],
      declaredOutputSet: ["public/texture.bin", "src/Renderer.tsx"],
      validatorPolicyVersion: "scene-v1",
    });
    const attestation = await commit(rootDir, task, {
      "public/texture.bin": "texture",
      "src/Renderer.tsx": "export default null;",
    });
    const parent =
      unsafeParent === "src"
        ? join(rootDir, "src/projects/story-example/scenes")
        : join(rootDir, "public/projects/story-example/scenes");
    await mkdir(join(parent, ".."), { recursive: true });
    await symlink(outside, parent);

    await assert.rejects(
      () =>
        materializeOwnerArtifacts({
          locations: locationsFor(rootDir),
          projectId: "story-example",
          artifacts: [{ task, attestation }],
          sceneTaskInputs: new Map([["opening", { meaningId: "opening" }]]),
        }),
      /unsafe/u,
    );
    assert.deepEqual(await readdir(outside), []);
  });
}

test("owner materialization rechecks parent containment immediately before promotion", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-materialize-parent-swap-"));
  const outside = await mkdtemp(
    join(tmpdir(), "rsp-materialize-parent-swap-outside-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: "opening",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "scene", fingerprint: sha("8") }],
    declaredReadSet: [],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-v1",
  });
  const attestation = await commit(rootDir, task, {
    "src/Renderer.tsx": "export default null;",
  });
  const scenes = join(rootDir, "src/projects/story-example/scenes");

  await assert.rejects(
    () =>
      materializeOwnerArtifacts({
        locations: locationsFor(rootDir),
        projectId: "story-example",
        artifacts: [{ task, attestation }],
        sceneTaskInputs: new Map([["opening", { meaningId: "opening" }]]),
        dependencies: {
          beforePromote: async ({ index }) => {
            if (index !== 0) return;
            await rename(scenes, `${scenes}.parked`);
            await symlink(outside, scenes);
          },
        },
      }),
    /unsafe/u,
  );
  assert.deepEqual(await readdir(outside), []);
});
