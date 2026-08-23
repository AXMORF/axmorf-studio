import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  getProjectCheckPaths,
  resolveProjectCheckLogicalPath,
} from "../../scripts/project-check/project-files";
import {
  createProjectCheckTestLocations,
  createRepositoryProjectCheckTestLocations,
} from "./locations";

test("repository project checks preserve the injected repository layout", async (context) => {
  const locations = await createRepositoryProjectCheckTestLocations(context);
  const paths = getProjectCheckPaths({
    locations,
    projectId: "synthetic-proof",
  });
  assert.equal(
    paths.composition,
    join(
      locations.runtimeResources,
      "src/projects/synthetic-proof/Composition.tsx",
    ),
  );
  assert.equal(
    resolveProjectCheckLogicalPath({
      locations,
      storyId: "synthetic-proof",
      logicalPath: "out/synthetic-proof/narrative-baseline.mp4",
    }),
    join(
      locations.runtimeResources,
      "out/synthetic-proof/narrative-baseline.mp4",
    ),
  );
});

test("Workspace project checks bind source media evidence and reports to explicit roots", async (context) => {
  const locations = await createProjectCheckTestLocations(context);
  const paths = getProjectCheckPaths({
    locations,
    projectId: "synthetic-proof",
  });

  assert.equal(
    paths.finalCheck,
    join(
      locations.projectSourceRoot,
      "synthetic-proof/generated/final-mechanical-check.generated.json",
    ),
  );
  assert.equal(
    resolveProjectCheckLogicalPath({
      locations,
      storyId: "synthetic-proof",
      logicalPath: "public/projects/synthetic-proof/narration/complete.wav",
    }),
    join(locations.projectMediaRoot, "synthetic-proof/narration/complete.wav"),
  );
  assert.equal(
    resolveProjectCheckLogicalPath({
      locations,
      storyId: "synthetic-proof",
      logicalPath: "out/synthetic-proof/narrative-baseline.mp4",
    }),
    join(locations.evidenceRoot, "synthetic-proof/narrative-baseline.mp4"),
  );
});

test("Workspace project checks reject non-owned repository logical paths", async (context) => {
  const locations = await createProjectCheckTestLocations(context);
  for (const logicalPath of [
    "src/remotion/core/private.ts",
    "public/projects/another-story/narration/complete.wav",
    "out/another-story/narrative-baseline.mp4",
  ]) {
    assert.throws(() =>
      resolveProjectCheckLogicalPath({
        locations,
        storyId: "synthetic-proof",
        logicalPath,
      }),
    );
  }
});
