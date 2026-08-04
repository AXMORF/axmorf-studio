import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryResourcePoolSchema,
  buildStoryResourcePool,
  validateStoryResourcePool,
} from "../../src/contracts/production-scene-result";
import { capabilityDescriptorDeclarations } from "../../src/remotion/catalog/capability-descriptors";
import { buildResourceCatalog } from "../../scripts/catalog/domain";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const catalog = buildResourceCatalog([
  capabilityDescriptorDeclarations.find(
    ({ id }) => id === "capability.motion",
  )!,
]);

const buildPool = (overrides: Record<string, unknown> = {}) =>
  buildStoryResourcePool({
    storyId: "story-example",
    requirementsFingerprint: sha("a"),
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedResourceIds: ["capability.motion"],
    allowedSnapshots: [],
    selfAuthoredVisualsAllowed: true,
    ...overrides,
  });

test("builds a strict current pool and permits an empty resource allowlist", () => {
  const current = validateStoryResourcePool({
    pool: buildPool(),
    catalog,
    requirementsFingerprint: sha("a"),
  });
  assert.deepEqual(current.allowedResourceIds, ["capability.motion"]);
  const empty = validateStoryResourcePool({
    pool: buildPool({ allowedResourceIds: [] }),
    catalog,
    requirementsFingerprint: sha("a"),
  });
  assert.deepEqual(empty.allowedResourceIds, []);
});

test("rejects resources outside the current Catalog and stale pool identity", () => {
  assert.throws(() =>
    validateStoryResourcePool({
      pool: buildPool({ allowedResourceIds: ["capability.unknown"] }),
      catalog,
      requirementsFingerprint: sha("a"),
    }),
  );
  assert.throws(() =>
    validateStoryResourcePool({
      pool: buildPool(),
      catalog,
      requirementsFingerprint: sha("b"),
    }),
  );
  assert.throws(() =>
    StoryResourcePoolSchema.parse({ ...buildPool(), privateConfig: "secret" }),
  );
});

test("rejects duplicate resources, snapshot sources, and cards", () => {
  assert.throws(() =>
    buildPool({
      allowedResourceIds: ["capability.motion", "capability.motion"],
    }),
  );
  const snapshot = {
    sourceId: "video-shotcraft",
    snapshotFingerprint: sha("c"),
    allowedCardIds: ["draw-svg-trace", "draw-svg-trace"],
  };
  assert.throws(() => buildPool({ allowedSnapshots: [snapshot] }));
  assert.throws(() =>
    buildPool({
      allowedSnapshots: [
        { ...snapshot, allowedCardIds: ["draw-svg-trace"] },
        { ...snapshot, allowedCardIds: ["spring-card"] },
      ],
    }),
  );
});
