import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { generateProjectRegistry } from "../../scripts/registry/generate";
import { createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";
import { createRepositoryProjectStorageFromProductionLocations } from "../../scripts/projects/repository-project-locations";
import {
  createRemovableProjectRoot,
  writeRemovableProject,
} from "../fixtures/removable-project";

const locationsFor = (rootDir: string) =>
  createRepositoryProductionLocations({ repositoryRoot: rootDir });

const storageFor = (rootDir: string) =>
  createRepositoryProjectStorageFromProductionLocations(locationsFor(rootDir));

test("ProjectRegistry generation accepts zero Projects", async (context) => {
  const rootDir = await createRemovableProjectRoot(context);
  const result = await generateProjectRegistry({
    storage: storageFor(rootDir),
    mode: "write",
  });
  const source = await readFile(result.destination, "utf8");

  assert.equal(result.entryCount, 0);
  assert.match(source, /export const projectRegistry =\s*\[\]/);
});

test("ProjectRegistry bootstraps when the local Projects root is absent", async (context) => {
  const rootDir = await createRemovableProjectRoot(context);
  await rm(join(rootDir, "src/projects"), { recursive: true });

  const result = await generateProjectRegistry({
    storage: storageFor(rootDir),
    mode: "write",
  });
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

  const storage = storageFor(rootDir);
  const first = await generateProjectRegistry({ storage, mode: "write" });
  assert.match(await readFile(first.destination, "utf8"), /alpha-story/);

  await rm(alpha, { recursive: true });
  const second = await generateProjectRegistry({ storage, mode: "write" });
  const source = await readFile(second.destination, "utf8");
  assert.doesNotMatch(source, /alpha-story/);
  assert.match(source, /beta-story/);
  assert.equal(
    second.destination,
    join(rootDir, "src/projects/project-registry.generated.ts"),
  );
});

test("deletion can publish a Registry without the target before removing source", async (context) => {
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

  const result = await generateProjectRegistry({
    storage: storageFor(rootDir),
    mode: "write",
    excludeProjectIds: ["alpha-story"],
  });
  const source = await readFile(result.destination, "utf8");
  await readFile(join(alpha, "Composition.tsx"), "utf8");
  assert.doesNotMatch(source, /alpha-story/);
  assert.match(source, /beta-story/);
  assert.equal(result.entryCount, 1);
});
