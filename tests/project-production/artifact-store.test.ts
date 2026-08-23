import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildArtifactAttestation,
  buildProducerTaskSpec,
  serializeCanonicalJson,
} from "../../src/contracts";
import {
  commitTaskArtifact,
  inspectArtifact,
  inspectArtifactState,
} from "../../scripts/project-production/adapters/artifact-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const task = buildProducerTaskSpec({
  taskKind: "cover-owner",
  storyId: "story-example",
  semanticId: null,
  revisionId: `revision-${"1".repeat(64)}`,
  dependencyArtifacts: [],
  inputFingerprints: [{ id: "cover-spec", fingerprint: sha("2") }],
  declaredReadSet: [],
  declaredOutputSet: ["public/cover.png"],
  validatorPolicyVersion: "cover-v1",
});
test("Artifact Store commits exact bytes, revalidates hits, and detects conflicts", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-artifact-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const workspace = await createTaskWorkspace({ locations, task });
  await mkdir(join(workspace, "public"));
  await writeFile(join(workspace, "public/cover.png"), "png-v1");
  const first = await commitTaskArtifact({ locations, task, workspace });
  assert.equal(first.reused, false);
  assert.equal(
    (await inspectArtifact({ locations, task }))?.artifactFingerprint,
    first.attestation?.artifactFingerprint,
  );
  assert.equal(
    (await commitTaskArtifact({ locations, task, workspace })).reused,
    true,
  );
  await writeFile(join(workspace, "public/cover.png"), "png-v2");
  await assert.rejects(
    () => commitTaskArtifact({ locations, task, workspace }),
    /conflicting/,
  );
  const artifactFile = join(
    rootDir,
    ".producer-artifacts/story-example/cover-owner",
    task.taskRevision,
    "files/public/cover.png",
  );
  await writeFile(artifactFile, "drift");
  await assert.rejects(
    () => inspectArtifact({ locations, task }),
    /checksum drifted/,
  );
});

test("Artifact Store rejects workspace symlinks and unknown output", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-artifact-unsafe-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const workspace = await createTaskWorkspace({ locations, task });
  await mkdir(join(workspace, "public"));
  await symlink(
    await readFile("package.json", "utf8").then(() =>
      join(process.cwd(), "package.json"),
    ),
    join(workspace, "public/cover.png"),
  );
  await assert.rejects(
    () => commitTaskArtifact({ locations, task, workspace }),
    /non-regular/,
  );
});

test("Artifact Store writes only to the explicitly injected Workspace root", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "rsp-artifact-workspace-"));
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(fixtureRoot, "workspace"),
    applicationSupportRoot: join(fixtureRoot, "application-support"),
    runtimeResources: join(fixtureRoot, "runtime-pack"),
    cacheRoot: join(fixtureRoot, "cache"),
  });
  const workspace = await createTaskWorkspace({ locations, task });
  await mkdir(join(workspace, "public"));
  await writeFile(join(workspace, "public/cover.png"), "workspace-png");

  await commitTaskArtifact({ locations, task, workspace });

  await access(
    join(
      locations.artifactStoreRoot,
      task.storyId,
      task.taskKind,
      task.taskRevision,
      "artifact-attestation.json",
    ),
  );
  await assert.rejects(
    access(join(fixtureRoot, ".producer-artifacts")),
    /ENOENT/u,
  );
});

const committedFixture = async (prefix: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const workspace = await createTaskWorkspace({ locations, task });
  await mkdir(join(workspace, "public"));
  await writeFile(join(workspace, "public/cover.png"), "png-v1");
  const committed = await commitTaskArtifact({ locations, task, workspace });
  const artifactRoot = join(
    rootDir,
    ".producer-artifacts/story-example/cover-owner",
    task.taskRevision,
  );
  return { rootDir, locations, artifactRoot, committed };
};

test("Artifact Store reports stable typed invalidation states", async (context) => {
  const malformed = await committedFixture("rsp-artifact-manifest-");
  context.after(() => rm(malformed.rootDir, { recursive: true, force: true }));
  await writeFile(
    join(malformed.artifactRoot, "artifact-attestation.json"),
    "{ nope",
  );
  assert.equal(
    (await inspectArtifactState({ locations: malformed.locations, task }))
      .artifactState,
    "manifest-invalid",
  );

  const identity = await committedFixture("rsp-artifact-identity-");
  context.after(() => rm(identity.rootDir, { recursive: true, force: true }));
  assert.notEqual(identity.committed.attestation, null);
  if (identity.committed.attestation === null) {
    throw new Error("Committed fixture lost its ArtifactAttestation.");
  }
  const crossBound = buildArtifactAttestation({
    storyId: task.storyId,
    taskKind: task.taskKind,
    semanticId: task.semanticId,
    taskRevision: `task-${"9".repeat(64)}`,
    validatorPolicyVersion: task.validatorPolicyVersion,
    dependencyArtifacts: task.dependencyArtifacts,
    outputManifest: identity.committed.attestation.outputManifest,
  });
  await writeFile(
    join(identity.artifactRoot, "artifact-attestation.json"),
    `${serializeCanonicalJson(crossBound)}\n`,
  );
  assert.equal(
    (await inspectArtifactState({ locations: identity.locations, task }))
      .artifactState,
    "identity-mismatch",
  );

  const exactSet = await committedFixture("rsp-artifact-exact-set-");
  context.after(() => rm(exactSet.rootDir, { recursive: true, force: true }));
  await writeFile(join(exactSet.artifactRoot, "unknown.txt"), "unknown");
  assert.equal(
    (await inspectArtifactState({ locations: exactSet.locations, task }))
      .artifactState,
    "exact-set-drift",
  );

  const checksum = await committedFixture("rsp-artifact-checksum-");
  context.after(() => rm(checksum.rootDir, { recursive: true, force: true }));
  await writeFile(
    join(checksum.artifactRoot, "files/public/cover.png"),
    "drift",
  );
  assert.equal(
    (await inspectArtifactState({ locations: checksum.locations, task }))
      .artifactState,
    "checksum-drift",
  );

  const unsafe = await committedFixture("rsp-artifact-unsafe-state-");
  context.after(() => rm(unsafe.rootDir, { recursive: true, force: true }));
  await rm(join(unsafe.artifactRoot, "files/public/cover.png"));
  await symlink(
    join(process.cwd(), "package.json"),
    join(unsafe.artifactRoot, "files/public/cover.png"),
  );
  assert.equal(
    (await inspectArtifactState({ locations: unsafe.locations, task }))
      .artifactState,
    "unsafe-path",
  );
});

test("Artifact Store lets unexpected filesystem errors escape", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-artifact-io-error-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  await assert.rejects(
    inspectArtifactState({
      locations,
      task: { ...task, declaredOutputSet: [] } as typeof task,
    }),
  );
});
