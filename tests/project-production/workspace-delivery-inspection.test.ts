import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectCurrentDelivery } from "../../scripts/project-production/adapters/current-delivery-inspection";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";

const createFixture = async () => {
  const parent = await mkdtemp(join(tmpdir(), "rsp-workspace-delivery-"));
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(parent, "workspace"),
    applicationSupportRoot: join(parent, "application-support"),
    runtimeResources: join(parent, "runtime-pack"),
    cacheRoot: join(parent, "cache"),
  });
  return { parent, locations } as const;
};

test("missing configured Workspace delivery root is a read-only empty state", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.parent, { recursive: true, force: true }));
  assert.equal(
    await inspectCurrentDelivery({
      locations: fixture.locations,
      storyId: "story-example",
    }),
    null,
  );
});

test("Workspace delivery inspection does not probe a repository-shaped decoy", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await Promise.all([
    mkdir(fixture.locations.deliveryRoot, { recursive: true }),
    mkdir(join(fixture.parent, "workspace/src/projects/story-example"), {
      recursive: true,
    }),
  ]);
  assert.equal(
    await inspectCurrentDelivery({
      locations: fixture.locations,
      storyId: "story-example",
    }),
    null,
  );
});

test("Workspace delivery inspection rejects a symlinked configured root", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const outside = join(fixture.parent, "outside");
  await mkdir(join(fixture.parent, "workspace"), { recursive: true });
  await mkdir(outside);
  await symlink(outside, fixture.locations.deliveryRoot);
  await assert.rejects(
    inspectCurrentDelivery({
      locations: fixture.locations,
      storyId: "story-example",
    }),
    /unsafe/u,
  );
});
