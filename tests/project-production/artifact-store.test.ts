import assert from "node:assert/strict";
import {
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
} from "@axmorf/studio/contracts";
import {
  commitTaskArtifact,
  inspectArtifact,
  inspectArtifactState,
} from "../../scripts/project-production/adapters/artifact-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";

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
  const workspace = await createTaskWorkspace({ rootDir, task });
  await mkdir(join(workspace, "public"));
  await writeFile(join(workspace, "public/cover.png"), "png-v1");
  const first = await commitTaskArtifact({ rootDir, task, workspace });
  assert.equal(first.reused, false);
  assert.equal(
    (await inspectArtifact({ rootDir, task }))?.artifactFingerprint,
    first.attestation?.artifactFingerprint,
  );
  assert.equal(
    (await commitTaskArtifact({ rootDir, task, workspace })).reused,
    true,
  );
  await writeFile(join(workspace, "public/cover.png"), "png-v2");
  await assert.rejects(
    () => commitTaskArtifact({ rootDir, task, workspace }),
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
    () => inspectArtifact({ rootDir, task }),
    /checksum drifted/,
  );
});

test("Artifact Store rejects workspace symlinks and unknown output", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-artifact-unsafe-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const workspace = await createTaskWorkspace({ rootDir, task });
  await mkdir(join(workspace, "public"));
  await symlink(
    await readFile("package.json", "utf8").then(() =>
      join(process.cwd(), "package.json"),
    ),
    join(workspace, "public/cover.png"),
  );
  await assert.rejects(
    () => commitTaskArtifact({ rootDir, task, workspace }),
    /non-regular/,
  );
});

const committedFixture = async (prefix: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const workspace = await createTaskWorkspace({ rootDir, task });
  await mkdir(join(workspace, "public"));
  await writeFile(join(workspace, "public/cover.png"), "png-v1");
  const committed = await commitTaskArtifact({ rootDir, task, workspace });
  const artifactRoot = join(
    rootDir,
    ".producer-artifacts/story-example/cover-owner",
    task.taskRevision,
  );
  return { rootDir, artifactRoot, committed };
};

test("Artifact Store reports stable typed invalidation states", async (context) => {
  const malformed = await committedFixture("rsp-artifact-manifest-");
  context.after(() => rm(malformed.rootDir, { recursive: true, force: true }));
  await writeFile(
    join(malformed.artifactRoot, "artifact-attestation.json"),
    "{ nope",
  );
  assert.equal(
    (await inspectArtifactState({ rootDir: malformed.rootDir, task }))
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
    (await inspectArtifactState({ rootDir: identity.rootDir, task }))
      .artifactState,
    "identity-mismatch",
  );

  const exactSet = await committedFixture("rsp-artifact-exact-set-");
  context.after(() => rm(exactSet.rootDir, { recursive: true, force: true }));
  await writeFile(join(exactSet.artifactRoot, "unknown.txt"), "unknown");
  assert.equal(
    (await inspectArtifactState({ rootDir: exactSet.rootDir, task }))
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
    (await inspectArtifactState({ rootDir: checksum.rootDir, task }))
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
    (await inspectArtifactState({ rootDir: unsafe.rootDir, task }))
      .artifactState,
    "unsafe-path",
  );
});

test("Artifact Store lets unexpected filesystem errors escape", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-artifact-io-error-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await assert.rejects(
    inspectArtifactState({
      rootDir,
      task: { ...task, declaredOutputSet: [] } as typeof task,
    }),
  );
});
