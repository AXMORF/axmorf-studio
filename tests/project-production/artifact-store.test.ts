import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProducerTaskSpec } from "../../src/contracts";
import { commitTaskArtifact, inspectArtifact } from "../../scripts/project-production/adapters/artifact-store";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const task = buildProducerTaskSpec({
  taskKind: "cover-owner", storyId: "story-example", semanticId: null,
  revisionId: `revision-${"1".repeat(64)}`, dependencyArtifacts: [],
  inputFingerprints: [{ id: "cover-spec", fingerprint: sha("2") }],
  declaredReadSet: [], declaredOutputSet: ["public/cover.png"], validatorPolicyVersion: "cover-v1",
});
test("Artifact Store commits exact bytes, revalidates hits, and detects conflicts", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-artifact-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const workspace = await createTaskWorkspace({ rootDir, task });
  await mkdir(join(workspace, "public"));
  await writeFile(join(workspace, "public/cover.png"), "png-v1");
  const first = await commitTaskArtifact({ rootDir, task, workspace });
  assert.equal(first.reused, false);
  assert.equal((await inspectArtifact({ rootDir, task }))?.artifactFingerprint, first.attestation?.artifactFingerprint);
  assert.equal((await commitTaskArtifact({ rootDir, task, workspace })).reused, true);
  await writeFile(join(workspace, "public/cover.png"), "png-v2");
  await assert.rejects(() => commitTaskArtifact({ rootDir, task, workspace }), /conflicting/);
  const artifactFile = join(rootDir, ".producer-artifacts/story-example/cover-owner", task.taskRevision, "files/public/cover.png");
  await writeFile(artifactFile, "drift");
  await assert.rejects(() => inspectArtifact({ rootDir, task }), /checksum drifted/);
});

test("Artifact Store rejects workspace symlinks and unknown output", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-artifact-unsafe-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const workspace = await createTaskWorkspace({ rootDir, task });
  await mkdir(join(workspace, "public"));
  await symlink(await readFile("package.json", "utf8").then(() => join(process.cwd(), "package.json")), join(workspace, "public/cover.png"));
  await assert.rejects(() => commitTaskArtifact({ rootDir, task, workspace }), /non-regular/);
});
