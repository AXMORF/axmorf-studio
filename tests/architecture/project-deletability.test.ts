import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { generateProjectRegistry } from "../../scripts/registry/generate";
import {
  createRemovableProjectRoot,
  writeRemovableProject,
} from "../fixtures/removable-project";

test("ProjectRegistry generation accepts zero Projects", async (context) => {
  const rootDir = await createRemovableProjectRoot(context);
  const result = await generateProjectRegistry({ rootDir, mode: "write" });
  const source = await readFile(result.destination, "utf8");

  assert.equal(result.entryCount, 0);
  assert.match(source, /export const projectRegistry =\s*\[\]/);
});

test("regeneration removes a deleted Project literal import", async (context) => {
  const rootDir = await createRemovableProjectRoot(context);
  const alpha = await writeRemovableProject({
    rootDir,
    slug: "alpha-story",
    compositionId: "AlphaStory",
  });
  await writeRemovableProject({
    rootDir,
    slug: "beta-story",
    compositionId: "BetaStory",
  });

  const first = await generateProjectRegistry({ rootDir, mode: "write" });
  assert.match(await readFile(first.destination, "utf8"), /alpha-story/);

  await rm(alpha, { recursive: true });
  const second = await generateProjectRegistry({ rootDir, mode: "write" });
  const source = await readFile(second.destination, "utf8");
  assert.doesNotMatch(source, /alpha-story/);
  assert.match(source, /beta-story/);
  assert.equal(
    second.destination,
    join(rootDir, "src/projects/project-registry.generated.ts"),
  );
});
