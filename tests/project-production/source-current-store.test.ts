import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildArtifactAttestation } from "../../src/contracts";
import {
  collectSourceCurrentFiles,
  createSourceCurrentAttestation,
  inspectSourceCurrent,
  writeSourceCurrent,
} from "../../scripts/project-production/adapters/source-current-store";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";

const digest = (value: string) => `sha256:${value.repeat(64)}`;

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "rsp-source-current-"));
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(root, "workspace"),
    applicationSupportRoot: join(root, "app-support"),
    runtimeResources: join(root, "runtime"),
    cacheRoot: join(root, "cache"),
  });
  await mkdir(join(locations.projectSourceRoot, "story"), { recursive: true });
  await mkdir(join(locations.projectMediaRoot, "story"), { recursive: true });
  await writeFile(
    join(locations.projectSourceRoot, "story/Composition.tsx"),
    "export default () => null;\n",
  );
  await writeFile(join(locations.projectSourceRoot, "story/story.json"), "{}\n");
  await writeFile(join(locations.projectMediaRoot, "story/audio.wav"), "pcm");
  return { root, locations };
};

const artifact = () =>
  buildArtifactAttestation({
    storyId: "story",
    taskKind: "global-visual-owner",
    semanticId: null,
    taskRevision: `task-${"a".repeat(64)}`,
    validatorPolicyVersion: "global-visual-owner-validator-v1",
    dependencyArtifacts: [],
    outputManifest: [
      {
        logicalPath: "project/GlobalVisual.generated.tsx",
        checksum: digest("b"),
        sizeBytes: 1,
        kind: "file",
      },
    ],
  });

test("source current store writes canonically and revalidates live bytes", async () => {
  const { locations } = await fixture();
  const logicalPaths = (
    await collectSourceCurrentFiles({ locations, storyId: "story" })
  ).map(({ logicalPath }) => logicalPath);
  assert.deepEqual(logicalPaths, [...logicalPaths].sort());
  const attestation = await createSourceCurrentAttestation({
    locations,
    storyId: "story",
    revisionId: `revision-${"c".repeat(64)}`,
    artifacts: [artifact()],
  });
  await writeSourceCurrent({ locations, attestation });
  assert.equal(
    (await inspectSourceCurrent({ locations, expected: attestation }))
      ?.sourceCurrentId,
    attestation.sourceCurrentId,
  );
  await writeFile(join(locations.projectMediaRoot, "story/audio.wav"), "drift");
  await assert.rejects(() =>
    inspectSourceCurrent({ locations, expected: attestation }),
  );
});

test("source current collection rejects symlink and special-file authority", async () => {
  const { locations } = await fixture();
  const path = join(locations.projectSourceRoot, "story/story.json");
  await unlink(path);
  await symlink("../escape.json", path);
  await assert.rejects(() =>
    collectSourceCurrentFiles({ locations, storyId: "story" }),
  );
});
