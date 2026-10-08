import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { buildSilentScenePreset } from "@axmorf/studio/contracts";
import { computeProjectRevisionCandidateId } from "../../packages/studio/src/contracts/project-revision";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";
import { createProjectRevisionCandidateDefinition } from "../../scripts/projects/application/project-revision-candidate-store";
import {
  promoteProjectRevisionCandidate,
  type ProjectRevisionPromotionCheckpoint,
  type ProjectRevisionPromotionDependencies,
} from "../../scripts/projects/application/project-revision-promotion";
import { parseProjectRevisionPromotionArguments } from "../../scripts/projects/revision-promotion";
import { validProjectCreateInput } from "../fixtures/project-create";
import { buildRuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { snapshotPolicyRoots } from "../../scripts/project-production/adapters/project-input-snapshot";

const storyId = validProjectCreateInput.storyId;
const baseRevisionId = `revision-${"a".repeat(64)}`;
const baseDeliveryBuildId = `delivery-${"b".repeat(64)}`;
const expectedRevisionId = `revision-${"c".repeat(64)}`;
const expectedDeliveryBuildId = `delivery-${"d".repeat(64)}`;

const revisionInput = {
  schemaVersion: 1,
  contractVersion: "project-revision-input-v1",
  storyId,
  baseRevisionId,
  baseDeliveryBuildId,
  patch: {
    brief: {
      ...validProjectCreateInput.brief,
      audience: "A promotion test audience.",
    },
  },
} as const;

const execFileAsync = promisify(execFile);

test("promotion CLI requires one complete expected tuple", () => {
  assert.deepEqual(
    parseProjectRevisionPromotionArguments([
      "--project",
      storyId,
      "--candidate",
      `revision-candidate-${"f".repeat(64)}`,
      "--revision",
      expectedRevisionId,
      "--delivery",
      expectedDeliveryBuildId,
    ]),
    {
      storyId,
      candidateId: `revision-candidate-${"f".repeat(64)}`,
      expectedRevisionId,
      expectedDeliveryBuildId,
    },
  );
  assert.throws(
    () =>
      parseProjectRevisionPromotionArguments([
        "--project",
        storyId,
        "--candidate",
        `revision-candidate-${"f".repeat(64)}`,
      ]),
    /Expected --project/u,
  );
});

const writeDelivery = async ({
  rootDir,
  revisionId,
  deliveryBuildId,
  marker,
}: {
  readonly rootDir: string;
  readonly revisionId: string;
  readonly deliveryBuildId: string;
  readonly marker: string;
}) => {
  const directory = join(rootDir, "deliveries", storyId);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "video.mp4"), `video:${marker}`),
    writeFile(join(directory, "cover-4x3.png"), `cover-4x3:${marker}`),
    writeFile(join(directory, "cover-3x4.png"), `cover-3x4:${marker}`),
    writeFile(
      join(directory, "publish.json"),
      `${JSON.stringify({ storyId, revisionId, deliveryBuildId })}\n`,
    ),
  ]);
};

const readDeliveryTuple: NonNullable<
  ProjectRevisionPromotionDependencies["inspectDelivery"]
> = async ({ rootDir }) =>
  JSON.parse(
    await readFile(
      join(rootDir, "deliveries", storyId, "publish.json"),
      "utf8",
    ),
  );

const fixture = async (
  context: {
    after: (callback: () => Promise<void>) => void;
  },
  authoredFrames = false,
  narrationPresent = !authoredFrames,
) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-revision-promote-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const live = {
    source: join(rootDir, "src/projects", storyId),
    public: join(rootDir, "public/projects", storyId),
    narration: join(rootDir, ".narration-work", storyId),
    delivery: join(rootDir, "deliveries", storyId),
  } as const;
  await Promise.all([
    mkdir(live.source, { recursive: true }),
    mkdir(live.public, { recursive: true }),
    ...(narrationPresent ? [mkdir(live.narration, { recursive: true })] : []),
    mkdir(join(rootDir, "src/remotion/catalog"), { recursive: true }),
  ]);
  const story = authoredFrames
    ? {
        ...validProjectCreateInput.story,
        timingSource: "authored-frames",
        beats: [
          {
            kind: "silent-scene",
            meaningId: "opening",
            narrativePurpose: "Show the idea visually.",
            preset: buildSilentScenePreset({
              presetId: "opening",
              durationInFrames: 120,
              visualIntent: "One visual subject.",
              soundIntent: "No narration.",
              resourceIds: [],
              implementation: { kind: "scene-owner" },
            }),
          },
        ],
      }
    : validProjectCreateInput.story;
  await Promise.all([
    writeFile(join(live.source, "story.json"), `${JSON.stringify(story)}\n`),
    writeFile(
      join(live.source, "revision.json"),
      `${JSON.stringify({ revisionId: baseRevisionId, marker: "base" })}\n`,
    ),
    writeFile(join(live.public, "asset.bin"), "public:base"),
    ...(narrationPresent
      ? [writeFile(join(live.narration, "draft.wav"), "narration:base")]
      : []),
    writeFile(
      join(rootDir, "src/projects/project-registry.generated.ts"),
      "registry:base\n",
    ),
    writeFile(
      join(rootDir, "src/remotion/catalog/resource-catalog.generated.json"),
      "catalog:base\n",
    ),
  ]);
  await writeDelivery({
    rootDir,
    revisionId: baseRevisionId,
    deliveryBuildId: baseDeliveryBuildId,
    marker: "base",
  });

  const candidateId = computeProjectRevisionCandidateId(revisionInput);
  const scope = createProjectRevisionProductionScope({
    rootDir,
    storyId,
    candidateId,
  });
  await createProjectRevisionCandidateDefinition({
    scope,
    input: revisionInput,
    baseDirectories: live,
  });
  const candidate = {
    source: join(scope.projectSourceRoot, storyId),
    public: join(scope.projectPublicRoot, storyId),
    narration: join(scope.narrationWorkRoot, storyId),
    delivery: join(scope.deliveryRoot, storyId),
  } as const;
  await Promise.all([
    mkdir(candidate.source, { recursive: true }),
    mkdir(candidate.public, { recursive: true }),
    ...(narrationPresent
      ? [mkdir(candidate.narration, { recursive: true })]
      : []),
  ]);
  await Promise.all([
    writeFile(
      join(candidate.source, "story.json"),
      `${JSON.stringify(story)}\n`,
    ),
    writeFile(
      join(candidate.source, "revision.json"),
      `${JSON.stringify({ revisionId: expectedRevisionId, marker: "candidate" })}\n`,
    ),
    writeFile(join(candidate.public, "asset.bin"), "public:candidate"),
    ...(narrationPresent
      ? [
          writeFile(
            join(candidate.narration, "draft.wav"),
            "narration:candidate",
          ),
        ]
      : []),
  ]);
  await writeDelivery({
    rootDir: scope.isolatedRoot,
    revisionId: expectedRevisionId,
    deliveryBuildId: expectedDeliveryBuildId,
    marker: "candidate",
  });

  const dependencies: ProjectRevisionPromotionDependencies = {
    inspectDelivery: readDeliveryTuple,
    readRevision: async ({ rootDir: revisionRoot }) =>
      JSON.parse(
        await readFile(
          join(revisionRoot, "src/projects", storyId, "revision.json"),
          "utf8",
        ),
      ),
    readCandidateRevision: async ({ scope: candidateScope }) =>
      JSON.parse(
        await readFile(
          join(candidateScope.projectSourceRoot, storyId, "revision.json"),
          "utf8",
        ),
      ),
    regenerateProjections: async (projectionRoot) => {
      await Promise.all([
        writeFile(
          join(
            projectionRoot,
            "src/remotion/catalog/resource-catalog.generated.json",
          ),
          "catalog:candidate\n",
        ),
        writeFile(
          join(projectionRoot, "src/projects/project-registry.generated.ts"),
          "registry:candidate\n",
        ),
      ]);
      return { catalogEntryCount: 4, projectEntryCount: 1 };
    },
  };
  const input = {
    rootDir,
    storyId,
    candidateId,
    expectedRevisionId,
    expectedDeliveryBuildId,
  } as const;
  return { rootDir, live, candidate, scope, dependencies, input } as const;
};

test("promotion retains installed policy for candidate and live revision reads", async (context) => {
  const current = await fixture(context);
  const runtimePolicyManifest = buildRuntimePolicyManifest({
    packageVersion: "0.1.11",
    files: [
      {
        logicalPath: "dist/contracts.js",
        bytes: Buffer.from("runtime"),
        scopes: ["composition", "delivery", "global-visual", "scene"],
      },
    ],
  });
  const expected = await snapshotPolicyRoots({
    rootDir: "/unused",
    runtimePolicyManifest,
  });
  const reads: string[] = [];
  const input = { ...current.input, runtimePolicyManifest };
  const dependencies: ProjectRevisionPromotionDependencies = {
    ...current.dependencies,
    readRevision: async (readInput) => {
      assert.equal(await snapshotPolicyRoots(readInput), expected);
      reads.push("live");
      return current.dependencies.readRevision!(readInput);
    },
    readCandidateRevision: async (readInput) => {
      assert.equal(await snapshotPolicyRoots(readInput), expected);
      reads.push("candidate");
      return current.dependencies.readCandidateRevision!(readInput);
    },
  };
  const promoted = await promoteProjectRevisionCandidate(input, dependencies);
  assert.equal(promoted.status, "project-revision-promoted");
  assert.ok(reads.includes("live") && reads.includes("candidate"));
});

test("promotion replaces the live tuple and is idempotent without consuming the candidate", async (context) => {
  const { rootDir, candidate, dependencies, input } = await fixture(context);
  const promoted = await promoteProjectRevisionCandidate(input, dependencies);
  assert.deepEqual(promoted, {
    status: "project-revision-promoted",
    storyId,
    candidateId: input.candidateId,
    revisionId: expectedRevisionId,
    deliveryBuildId: expectedDeliveryBuildId,
    catalogEntryCount: 4,
    projectEntryCount: 1,
  });
  assert.match(
    await readFile(
      join(rootDir, "src/projects", storyId, "revision.json"),
      "utf8",
    ),
    /candidate/u,
  );
  assert.equal(
    await readFile(
      join(rootDir, "public/projects", storyId, "asset.bin"),
      "utf8",
    ),
    "public:candidate",
  );
  assert.equal(
    await readFile(
      join(rootDir, ".narration-work", storyId, "draft.wav"),
      "utf8",
    ),
    "narration:candidate",
  );
  await access(join(candidate.source, "revision.json"));
  await access(join(candidate.delivery, "publish.json"));

  const current = await promoteProjectRevisionCandidate(input, dependencies);
  assert.deepEqual(current, {
    status: "project-revision-current",
    storyId,
    candidateId: input.candidateId,
    revisionId: expectedRevisionId,
    deliveryBuildId: expectedDeliveryBuildId,
  });
});

test("authored promotion and its idempotent retry keep narration genuinely absent", async (context) => {
  const { live, candidate, dependencies, input } = await fixture(context, true);
  assert.equal(
    (await promoteProjectRevisionCandidate(input, dependencies)).status,
    "project-revision-promoted",
  );
  assert.equal(
    (await promoteProjectRevisionCandidate(input, dependencies)).status,
    "project-revision-current",
  );
  for (const root of [live.narration, candidate.narration]) {
    await assert.rejects(lstat(root), { code: "ENOENT" });
  }
  assert.match(
    await readFile(join(live.source, "revision.json"), "utf8"),
    /candidate/u,
  );
  assert.match(
    await readFile(join(live.delivery, "publish.json"), "utf8"),
    new RegExp(expectedDeliveryBuildId, "u"),
  );
  await mkdir(live.narration, { recursive: true });
  await assert.rejects(
    promoteProjectRevisionCandidate(input, dependencies),
    /Current narration.*do not match/u,
  );
});

for (const failingCheckpoint of [
  "source-installed",
  "public-installed",
  "narration-installed",
  "delivery-installed",
  "projections-regenerated",
  "verification-complete",
] as const) {
  test(`authored promotion restores absent narration on ${failingCheckpoint} failure`, async (context) => {
    const { live, candidate, dependencies, input } = await fixture(
      context,
      true,
    );
    await assert.rejects(
      promoteProjectRevisionCandidate(input, {
        ...dependencies,
        checkpoint: async (checkpoint) => {
          if (checkpoint === failingCheckpoint)
            throw new Error(`injected:${checkpoint}`);
        },
      }),
      new RegExp(`injected:${failingCheckpoint}`, "u"),
    );
    for (const root of [live.narration, candidate.narration]) {
      await assert.rejects(lstat(root), { code: "ENOENT" });
    }
    assert.match(
      await readFile(join(live.source, "revision.json"), "utf8"),
      /base/u,
    );
    assert.match(
      await readFile(join(live.delivery, "publish.json"), "utf8"),
      new RegExp(baseDeliveryBuildId, "u"),
    );
  });
}

test("authored promotion rejects live root presence drift and unsafe missing-root parents", async (context) => {
  const { rootDir, live, dependencies, input } = await fixture(context, true);
  await mkdir(live.narration, { recursive: true });
  await assert.rejects(
    promoteProjectRevisionCandidate(input, dependencies),
    /Live narration base snapshot.*do not match/u,
  );
  await rm(live.narration, { recursive: true });
  await rm(join(rootDir, ".narration-work"), { recursive: true });
  await symlink(
    join(rootDir, "missing-target"),
    join(rootDir, ".narration-work"),
  );
  await assert.rejects(
    promoteProjectRevisionCandidate(input, dependencies),
    /real directory|unsafe|symbolic/u,
  );
  assert.match(
    await readFile(join(live.source, "revision.json"), "utf8"),
    /base/u,
  );
});

test("authored promotion rejects candidate narration presence drift after locking", async (context) => {
  const { live, candidate, dependencies, input } = await fixture(context, true);
  await assert.rejects(
    promoteProjectRevisionCandidate(input, {
      ...dependencies,
      checkpoint: async (checkpoint) => {
        if (checkpoint === "lock-acquired")
          await mkdir(candidate.narration, { recursive: true });
      },
    }),
    /Candidate narration.*do not match/u,
  );
  await assert.rejects(lstat(live.narration), { code: "ENOENT" });
  assert.match(
    await readFile(join(live.source, "revision.json"), "utf8"),
    /base/u,
  );
});

test("narrated promotion requires candidate narration even with a matching delivery tuple", async (context) => {
  const { live, candidate, dependencies, input } = await fixture(context);
  await rm(candidate.narration, { recursive: true });
  await assert.rejects(
    promoteProjectRevisionCandidate(input, dependencies),
    /missing|ENOENT|real directory/u,
  );
  assert.match(
    await readFile(join(live.source, "revision.json"), "utf8"),
    /base/u,
  );
});

test("promotion rolls an installed optional narration root back to absence", async (context) => {
  const { live, candidate, dependencies, input } = await fixture(context, true);
  await mkdir(candidate.narration, { recursive: true });
  await writeFile(
    join(candidate.narration, "draft.wav"),
    "candidate-owned narration bytes",
  );
  await assert.rejects(
    promoteProjectRevisionCandidate(input, {
      ...dependencies,
      checkpoint: async (checkpoint) => {
        if (checkpoint === "narration-installed") {
          assert.equal(
            await readFile(join(live.narration, "draft.wav"), "utf8"),
            "candidate-owned narration bytes",
          );
          throw new Error("injected optional narration install failure");
        }
      },
    }),
    /injected optional narration install failure/u,
  );
  await assert.rejects(lstat(live.narration), { code: "ENOENT" });
  assert.match(
    await readFile(join(live.source, "revision.json"), "utf8"),
    /base/u,
  );
  assert.equal(
    await readFile(join(candidate.narration, "draft.wav"), "utf8"),
    "candidate-owned narration bytes",
  );
});

test("promotion restores a present optional narration root after removing it and can commit absence", async (context) => {
  const { live, candidate, dependencies, input } = await fixture(
    context,
    true,
    true,
  );
  await rm(candidate.narration, { recursive: true });
  await assert.rejects(
    promoteProjectRevisionCandidate(input, {
      ...dependencies,
      checkpoint: async (checkpoint) => {
        if (checkpoint === "narration-installed") {
          await assert.rejects(lstat(live.narration), { code: "ENOENT" });
          throw new Error("injected optional narration removal failure");
        }
      },
    }),
    /injected optional narration removal failure/u,
  );
  assert.equal(
    await readFile(join(live.narration, "draft.wav"), "utf8"),
    "narration:base",
  );
  assert.equal(
    (await promoteProjectRevisionCandidate(input, dependencies)).status,
    "project-revision-promoted",
  );
  await assert.rejects(lstat(live.narration), { code: "ENOENT" });
  assert.equal(
    (await promoteProjectRevisionCandidate(input, dependencies)).status,
    "project-revision-current",
  );
});

for (const failingCheckpoint of [
  "lock-acquired",
  "staging-complete",
  "source-installed",
  "public-installed",
  "narration-installed",
  "delivery-installed",
  "projections-regenerated",
  "verification-complete",
] as const) {
  test(`promotion rolls back a failure at ${failingCheckpoint}`, async (context) => {
    const { rootDir, candidate, dependencies, input } = await fixture(context);
    await assert.rejects(
      promoteProjectRevisionCandidate(input, {
        ...dependencies,
        checkpoint: async (checkpoint) => {
          if (checkpoint === failingCheckpoint) {
            throw new Error(`injected:${checkpoint}`);
          }
        },
      }),
      new RegExp(`injected:${failingCheckpoint}`, "u"),
    );
    assert.match(
      await readFile(
        join(rootDir, "src/projects", storyId, "revision.json"),
        "utf8",
      ),
      /base/u,
    );
    assert.equal(
      await readFile(
        join(rootDir, "public/projects", storyId, "asset.bin"),
        "utf8",
      ),
      "public:base",
    );
    assert.equal(
      await readFile(
        join(rootDir, ".narration-work", storyId, "draft.wav"),
        "utf8",
      ),
      "narration:base",
    );
    assert.match(
      await readFile(
        join(rootDir, "deliveries", storyId, "publish.json"),
        "utf8",
      ),
      new RegExp(baseDeliveryBuildId, "u"),
    );
    await access(join(candidate.source, "revision.json"));
    await access(join(candidate.delivery, "publish.json"));
  });
}

test("promotion reports rollback corruption as AggregateError and retains the candidate", async (context) => {
  const { rootDir, candidate, dependencies, input } = await fixture(context);
  await assert.rejects(
    promoteProjectRevisionCandidate(input, {
      ...dependencies,
      checkpoint: async (checkpoint) => {
        if (checkpoint !== "source-installed") return;
        const liveSource = join(rootDir, "src/projects", storyId);
        await rm(liveSource, { recursive: true });
        await symlink(candidate.source, liveSource);
        throw new Error("injected rollback corruption");
      },
    }),
    (error: unknown) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match((error as Error).message, /rollback was incomplete/u);
      return true;
    },
  );
  await access(join(candidate.source, "revision.json"));
  await access(join(candidate.delivery, "publish.json"));
  assert.equal(
    await readFile(
      join(rootDir, "src/projects/project-registry.generated.ts"),
      "utf8",
    ),
    "registry:base\n",
  );
});

test("promotion rejects candidate symlinks, unknown delivery files, and tuple drift before mutation", async (context) => {
  const { rootDir, candidate, dependencies, input } = await fixture(context);
  await symlink(
    join(candidate.source, "revision.json"),
    join(candidate.source, "revision-link.json"),
  );
  await assert.rejects(
    promoteProjectRevisionCandidate(input, dependencies),
    /symbolic link/u,
  );
  await rm(join(candidate.source, "revision-link.json"));
  const fifoPath = join(candidate.source, "special.fifo");
  await execFileAsync("mkfifo", [fifoPath]);
  try {
    await assert.rejects(
      promoteProjectRevisionCandidate(input, dependencies),
      /special entry/u,
    );
  } finally {
    await rm(fifoPath, { force: true });
  }
  await writeFile(join(candidate.delivery, "unexpected.bin"), "unknown");
  await assert.rejects(
    promoteProjectRevisionCandidate(input, dependencies),
    /exactly four regular files/u,
  );
  await rm(join(candidate.delivery, "unexpected.bin"));
  const driftedInput = {
    ...input,
    expectedDeliveryBuildId: `delivery-${"e".repeat(64)}`,
  };
  await assert.rejects(
    promoteProjectRevisionCandidate(driftedInput, dependencies),
    /expected revision tuple/u,
  );
  assert.match(
    await readFile(
      join(rootDir, "src/projects", storyId, "revision.json"),
      "utf8",
    ),
    /base/u,
  );
});

test("promotion revalidates candidate bytes after acquiring the repository lock", async (context) => {
  const { candidate, dependencies, input } = await fixture(context);
  await assert.rejects(
    promoteProjectRevisionCandidate(input, {
      ...dependencies,
      checkpoint: async (checkpoint: ProjectRevisionPromotionCheckpoint) => {
        if (checkpoint === "lock-acquired") {
          await writeFile(
            join(candidate.source, "revision.json"),
            `${JSON.stringify({ revisionId: expectedRevisionId, marker: "drift" })}\n`,
          );
        }
      },
    }),
    /Candidate source bytes do not match/u,
  );
});

test("promotion rejects a tampered candidate source revision without changing live bytes", async (context) => {
  const { rootDir, candidate, dependencies, input } = await fixture(context);
  await writeFile(
    join(candidate.source, "revision.json"),
    `${JSON.stringify({ revisionId: `revision-${"e".repeat(64)}`, marker: "tampered" })}\n`,
  );
  let reachedLock = false;
  await assert.rejects(
    promoteProjectRevisionCandidate(input, {
      ...dependencies,
      checkpoint: async (checkpoint) => {
        if (checkpoint === "lock-acquired") reachedLock = true;
      },
    }),
    /Candidate source does not match the expected ProductionRevision/u,
  );
  assert.equal(reachedLock, false);
  assert.match(
    await readFile(
      join(rootDir, "src/projects", storyId, "revision.json"),
      "utf8",
    ),
    /base/u,
  );
  assert.equal(
    await readFile(
      join(rootDir, "public/projects", storyId, "asset.bin"),
      "utf8",
    ),
    "public:base",
  );
  assert.equal(
    await readFile(
      join(rootDir, ".narration-work", storyId, "draft.wav"),
      "utf8",
    ),
    "narration:base",
  );
  assert.match(
    await readFile(
      join(rootDir, "deliveries", storyId, "publish.json"),
      "utf8",
    ),
    new RegExp(baseDeliveryBuildId, "u"),
  );
});
