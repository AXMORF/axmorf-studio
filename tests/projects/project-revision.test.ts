import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ProjectRevisionCandidateRecordSchema,
  ProjectRevisionInputSchema,
  computeProjectRevisionCandidateId,
  serializeCanonicalJson,
} from "../../src/contracts";
import {
  promoteProjectRevisionCandidate,
} from "../../scripts/projects/application/project-revision";
import {
  createProjectRevisionCandidateLocations,
  projectRevisionCandidateRoot,
} from "../../scripts/project-production/application/project-revision-locations";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";
import { validProjectCreateInput } from "../fixtures/project-create";

const oldRevisionId = `revision-${"1".repeat(64)}`;
const oldSourceCurrentId = `source-current-${"2".repeat(64)}`;
const oldDeliveryBuildId = `delivery-${"3".repeat(64)}`;
const newRevisionId = `revision-${"4".repeat(64)}`;
const newSourceCurrentId = `source-current-${"5".repeat(64)}`;
const newDeliveryBuildId = `delivery-${"6".repeat(64)}`;

const fixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-project-revision-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(root, "workspace"),
    applicationSupportRoot: join(root, "support"),
    runtimeResources: join(root, "runtime"),
    cacheRoot: join(root, "cache"),
  });
  const input = ProjectRevisionInputSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-revision-input-v1",
    storyId: validProjectCreateInput.storyId,
    baseRevisionId: oldRevisionId,
    patch: {
      scenes: [
        {
          ...validProjectCreateInput.scenes[0],
          visualIntent: "Show the revised measured timeline.",
        },
      ],
    },
  });
  const candidateId = computeProjectRevisionCandidateId(input);
  const candidateLocations = createProjectRevisionCandidateLocations({
    locations,
    storyId: input.storyId,
    candidateId,
  });
  await mkdir(locations.operationLockRoot, { recursive: true });
  const record = ProjectRevisionCandidateRecordSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-revision-candidate-v1",
    candidateId,
    input,
    baseSourceCurrentId: oldSourceCurrentId,
    baseDeliveryBuildId: oldDeliveryBuildId,
    changedSections: ["scenes"],
    createdAt: "2026-08-27T00:00:00.000Z",
  });
  for (const [scope, productionLocations] of [
    ["old", locations],
    ["new", candidateLocations],
  ] as const) {
    await Promise.all([
      mkdir(join(productionLocations.projectSourceRoot, input.storyId), {
        recursive: true,
      }),
      mkdir(join(productionLocations.projectMediaRoot, input.storyId), {
        recursive: true,
      }),
      mkdir(productionLocations.sourceCurrentRoot, { recursive: true }),
      mkdir(join(productionLocations.deliveryRoot, input.storyId), {
        recursive: true,
      }),
    ]);
    await Promise.all([
      writeFile(
        join(
          productionLocations.projectSourceRoot,
          input.storyId,
          "sentinel",
        ),
        scope,
      ),
      writeFile(
        join(
          productionLocations.projectMediaRoot,
          input.storyId,
          "sentinel",
        ),
        scope,
      ),
      writeFile(
        join(productionLocations.sourceCurrentRoot, `${input.storyId}.json`),
        scope,
      ),
      writeFile(
        join(productionLocations.deliveryRoot, input.storyId, "video.mp4"),
        scope,
      ),
    ]);
  }
  await writeFile(
    join(
      projectRevisionCandidateRoot({
        locations,
        storyId: input.storyId,
        candidateId,
      }),
      "candidate.json",
    ),
    `${serializeCanonicalJson(record)}\n`,
  );
  return { locations, input, candidateId, candidateLocations } as const;
};

const oldCurrent = {
  currentRevisionId: oldRevisionId,
  sourceCurrentId: oldSourceCurrentId,
  deliveryBuildId: oldDeliveryBuildId,
};
const newCurrent = {
  currentRevisionId: newRevisionId,
  sourceCurrentId: newSourceCurrentId,
  deliveryBuildId: newDeliveryBuildId,
};

test("Project revision promotion replaces the four current scopes only after verification", async (context) => {
  const { locations, input, candidateId } = await fixture(context);
  const result = await promoteProjectRevisionCandidate({
    locations,
    storyId: input.storyId,
    candidateId,
    readCurrent: async () => oldCurrent,
    regenerate: async () => undefined,
    verify: async () => newCurrent,
  });
  assert.equal(result.status, "project-revision-promoted");
  assert.equal(
    await readFile(
      join(locations.projectSourceRoot, input.storyId, "sentinel"),
      "utf8",
    ),
    "new",
  );
  assert.equal(
    await readFile(
      join(locations.deliveryRoot, input.storyId, "video.mp4"),
      "utf8",
    ),
    "new",
  );
  await assert.rejects(
    access(
      projectRevisionCandidateRoot({
        locations,
        storyId: input.storyId,
        candidateId,
      }),
    ),
  );
});

test("Project revision promotion rolls every current scope back when regeneration fails", async (context) => {
  const { locations, input, candidateId, candidateLocations } =
    await fixture(context);
  await assert.rejects(
    promoteProjectRevisionCandidate({
      locations,
      storyId: input.storyId,
      candidateId,
      readCurrent: async () => oldCurrent,
      regenerate: async () => {
        throw new Error("regeneration failed");
      },
      verify: async () => newCurrent,
    }),
    /rollback was incomplete/u,
  );
  assert.equal(
    await readFile(
      join(locations.projectSourceRoot, input.storyId, "sentinel"),
      "utf8",
    ),
    "old",
  );
  assert.equal(
    await readFile(
      join(candidateLocations.projectSourceRoot, input.storyId, "sentinel"),
      "utf8",
    ),
    "new",
  );
});

test("Project revision promotion can retry after a complete rollback", async (context) => {
  const { locations, input, candidateId, candidateLocations } =
    await fixture(context);
  await assert.rejects(
    promoteProjectRevisionCandidate({
      locations,
      storyId: input.storyId,
      candidateId,
      readCurrent: async () => oldCurrent,
      regenerate: async () => undefined,
      verify: async () => {
        throw new Error("verification failed");
      },
    }),
    /verification failed/u,
  );
  assert.equal(
    await readFile(
      join(locations.projectSourceRoot, input.storyId, "sentinel"),
      "utf8",
    ),
    "old",
  );
  assert.equal(
    await readFile(
      join(candidateLocations.projectSourceRoot, input.storyId, "sentinel"),
      "utf8",
    ),
    "new",
  );

  const result = await promoteProjectRevisionCandidate({
    locations,
    storyId: input.storyId,
    candidateId,
    readCurrent: async () => oldCurrent,
    regenerate: async () => undefined,
    verify: async () => newCurrent,
  });
  assert.equal(result.status, "project-revision-promoted");
  assert.equal(
    await readFile(
      join(locations.projectSourceRoot, input.storyId, "sentinel"),
      "utf8",
    ),
    "new",
  );
});
