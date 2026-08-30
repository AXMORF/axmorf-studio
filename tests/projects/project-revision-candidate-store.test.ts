import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { computeProjectRevisionCandidateId } from "../../packages/studio/src/contracts/project-revision";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";
import {
  createProjectRevisionCandidateDefinition,
  inspectProjectRevisionCandidateDefinition,
  stageProjectRevisionCandidateDefinition,
} from "../../scripts/projects/application/project-revision-candidate-store";
import { validProjectCreateInput } from "../fixtures/project-create";

const revisionInput = {
  schemaVersion: 1,
  contractVersion: "project-revision-input-v1",
  storyId: validProjectCreateInput.storyId,
  baseRevisionId: `revision-${"a".repeat(64)}`,
  baseDeliveryBuildId: `delivery-${"b".repeat(64)}`,
  patch: {
    brief: {
      ...validProjectCreateInput.brief,
      audience: "A more focused candidate audience.",
    },
  },
} as const;

const fixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-revision-store-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const baseRoot = join(root, "base-fixture");
  const baseDirectories = {
    delivery: join(baseRoot, "delivery"),
    narration: join(baseRoot, "narration"),
    public: join(baseRoot, "public"),
    source: join(baseRoot, "source"),
  } as const;
  await Promise.all(
    Object.values(baseDirectories).map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );
  await mkdir(join(baseDirectories.source, "nested"));
  await mkdir(join(baseDirectories.public, "empty"));
  await Promise.all([
    writeFile(join(baseDirectories.source, "story.json"), '{"story":1}\n'),
    writeFile(
      join(baseDirectories.source, "nested", "scene.tsx"),
      "export {};\n",
    ),
    writeFile(
      join(baseDirectories.narration, "complete.wav"),
      Buffer.from([1, 2, 3]),
    ),
    writeFile(
      join(baseDirectories.delivery, "video.mp4"),
      Buffer.from([4, 5, 6]),
    ),
  ]);
  const scope = createProjectRevisionProductionScope({
    rootDir: root,
    storyId: revisionInput.storyId,
    candidateId: computeProjectRevisionCandidateId(revisionInput),
  });
  return { root, scope, baseDirectories } as const;
};

test("candidate definition installs atomically and identical base bytes are idempotent", async (context) => {
  const { scope, baseDirectories } = await fixture(context);
  const installed = await createProjectRevisionCandidateDefinition({
    scope,
    input: revisionInput,
    baseDirectories,
  });
  assert.equal(installed.status, "project-revision-candidate-installed");
  assert.deepEqual(installed.record.patchedSections, ["brief"]);
  assert.equal(
    await readFile(
      join(scope.baseSnapshotRoot, "source", "nested", "scene.tsx"),
      "utf8",
    ),
    "export {};\n",
  );

  const current = await createProjectRevisionCandidateDefinition({
    scope,
    input: revisionInput,
    baseDirectories,
  });
  assert.equal(current.status, "project-revision-candidate-current");
  assert.deepEqual(current.record, installed.record);
});

test("candidate definition rejects a same-ID base whose bytes differ", async (context) => {
  const { scope, baseDirectories } = await fixture(context);
  await createProjectRevisionCandidateDefinition({
    scope,
    input: revisionInput,
    baseDirectories,
  });
  await writeFile(join(baseDirectories.source, "story.json"), '{"story":2}\n');
  await assert.rejects(
    createProjectRevisionCandidateDefinition({
      scope,
      input: revisionInput,
      baseDirectories,
    }),
    /base binding differs|bytes differ/u,
  );
  assert.equal(
    await readFile(
      join(scope.baseSnapshotRoot, "source", "story.json"),
      "utf8",
    ),
    '{"story":1}\n',
  );
});

test("candidate staging and inspection fail closed on symlinks and unknown bytes", async (context) => {
  const { root, scope, baseDirectories } = await fixture(context);
  await symlink(
    join(baseDirectories.source, "story.json"),
    join(baseDirectories.source, "story-link.json"),
  );
  await assert.rejects(
    stageProjectRevisionCandidateDefinition({
      scope,
      input: revisionInput,
      baseDirectories,
    }),
    /symbolic link/u,
  );
  await rm(join(baseDirectories.source, "story-link.json"));

  const staged = await stageProjectRevisionCandidateDefinition({
    scope,
    input: revisionInput,
    baseDirectories,
  });
  await writeFile(
    join(staged.stagingDirectory, "base", "source", "unknown.json"),
    "{}\n",
  );
  await assert.rejects(
    inspectProjectRevisionCandidateDefinition({
      scope,
      directory: staged.stagingDirectory,
    }),
    /snapshot bytes are stale/u,
  );
  assert.equal(root.length > 0, true);
});

test("candidate definition rejects unknown top-level entries and record symlinks", async (context) => {
  const { scope, baseDirectories } = await fixture(context);
  await createProjectRevisionCandidateDefinition({
    scope,
    input: revisionInput,
    baseDirectories,
  });
  await writeFile(join(scope.definitionRoot, "unexpected.json"), "{}\n");
  await assert.rejects(
    inspectProjectRevisionCandidateDefinition({ scope }),
    /missing or unknown entries/u,
  );
  await rm(join(scope.definitionRoot, "unexpected.json"));
  await rm(join(scope.definitionRoot, "candidate.json"));
  await symlink(
    join(scope.baseSnapshotRoot, "source", "story.json"),
    join(scope.definitionRoot, "candidate.json"),
  );
  await assert.rejects(
    inspectProjectRevisionCandidateDefinition({ scope }),
    /regular file/u,
  );
});

test("candidate staging rejects a symbolic storage parent", async (context) => {
  const { root, scope, baseDirectories } = await fixture(context);
  const redirectedRoot = join(root, "redirected-revisions");
  await mkdir(redirectedRoot);
  await symlink(redirectedRoot, join(root, ".producer-revisions"));
  await assert.rejects(
    stageProjectRevisionCandidateDefinition({
      scope,
      input: revisionInput,
      baseDirectories,
    }),
    /storage path must be a real directory/u,
  );
});
