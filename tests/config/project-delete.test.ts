import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
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
  await mkdir(join(projectRoot, "production"), { recursive: true });
  await writeFile(pendingPath, "{}\n", "utf8");
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
  await assert.rejects(access(pendingPath));
  await access(privatePath);
});
