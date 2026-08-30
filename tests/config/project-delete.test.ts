import assert from "node:assert/strict";
import { access, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { deleteProjectData } from "../../scripts/projects/delete";
import {
  createRemovableProjectRoot,
  writeRemovableProject,
} from "../fixtures/removable-project";

test("Project deletion removes story-owned pending create authoring with its source root", async (context) => {
  const rootDir = await createRemovableProjectRoot(context);
  const projectRoot = await writeRemovableProject({
    rootDir,
    slug: "pending-story",
    compositionId: "PendingStory",
  });
  const pendingPath = join(
    projectRoot,
    "production/pending-scene-production-brief.json",
  );
  const originalityPath = join(
    projectRoot,
    "production/scene-originality-baseline.json",
  );
  await mkdir(join(projectRoot, "production"), { recursive: true });
  await writeFile(pendingPath, "{}\n", "utf8");
  await writeFile(originalityPath, "{}\n", "utf8");
  const revisionCandidatePath = join(
    rootDir,
    ".producer-revisions/pending-story/revision-candidate-test",
  );
  await mkdir(revisionCandidatePath, { recursive: true });
  await writeFile(join(revisionCandidatePath, "candidate.json"), "{}\n");
  await mkdir(join(rootDir, "private"), { recursive: true });
  const privatePath = join(rootDir, "private/producer.config.json");
  await writeFile(privatePath, "protected\n", "utf8");

  const result = await deleteProjectData({
    rootDir,
    selection: { kind: "projects", projectIds: ["pending-story"] },
    regenerate: async () => ({
      catalogEntryCount: 0,
      projectEntryCount: 0,
    }),
  });

  assert.ok(result.deletedPaths.includes("src/projects/pending-story"));
  assert.ok(
    result.deletedPaths.includes(".producer-revisions/pending-story"),
  );
  await assert.rejects(access(pendingPath));
  await assert.rejects(access(originalityPath));
  await assert.rejects(access(revisionCandidatePath));
  await access(privatePath);
});

test("Project deletion rejects a symbolic revision-candidate storage root", async (context) => {
  const rootDir = await createRemovableProjectRoot(context);
  await writeRemovableProject({
    rootDir,
    slug: "candidate-story",
    compositionId: "CandidateStory",
  });
  const redirected = join(rootDir, "redirected-revisions");
  await mkdir(redirected);
  await symlink(redirected, join(rootDir, ".producer-revisions"));

  await assert.rejects(
    deleteProjectData({
      rootDir,
      selection: { kind: "projects", projectIds: ["candidate-story"] },
      regenerate: async () => ({
        catalogEntryCount: 0,
        projectEntryCount: 0,
      }),
    }),
    /.producer-revisions must be a real directory/u,
  );
});
