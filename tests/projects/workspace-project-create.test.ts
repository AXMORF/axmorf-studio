import assert from "node:assert/strict";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProducerConfig } from "../../src/contracts";
import {
  createRuntimeExecutionResources,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import {
  createWorkspaceProject,
  readWorkspaceProjectContext,
} from "../../scripts/projects/workspace-project";
import { commitWorkspaceProjectCreate } from "../../scripts/projects/workspace-project-create";
import { createProjectRevisionCandidate } from "../../scripts/projects/application/project-revision";
import { createProjectRevisionCandidateLocations } from "../../scripts/project-production/application/project-revision-locations";
import {
  validProjectCreateInput,
  validProjectCreateProducerConfig,
} from "../fixtures/project-create";

const fixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const root = await mkdtemp(join(tmpdir(), "workspace-project-create-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const runtimeRoot = join(root, "runtime-pack");
  const support = join(root, "support");
  const cache = join(root, "cache");
  await Promise.all([
    mkdir(join(workspace, "projects"), { recursive: true }),
    mkdir(join(workspace, "media"), { recursive: true }),
    mkdir(join(workspace, ".rsp/work"), { recursive: true }),
    mkdir(join(workspace, ".rsp/current"), { recursive: true }),
    mkdir(join(runtimeRoot, "bin"), { recursive: true }),
    mkdir(join(runtimeRoot, "browser"), { recursive: true }),
    mkdir(support, { recursive: true }),
    mkdir(cache, { recursive: true }),
  ]);
  await Promise.all([
    cp(
      join(import.meta.dirname, "../../src"),
      join(runtimeRoot, "source/src"),
      { recursive: true },
    ),
    cp(
      join(
        import.meta.dirname,
        "../../desktop/resources/workspace-integration/assets",
      ),
      join(runtimeRoot, "shared-assets"),
      { recursive: true },
    ),
  ]);
  for (const path of [
    "bin/remotion",
    "browser/headless",
    "bin/ffmpeg",
    "bin/ffprobe",
  ]) {
    await writeFile(join(runtimeRoot, path), "runtime\n");
  }
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: workspace,
    applicationSupportRoot: support,
    runtimeResources: runtimeRoot,
    cacheRoot: cache,
  });
  const runtime = createRuntimeExecutionResources({
    rendererRuntimeFingerprint: `sha256:${"a".repeat(64)}`,
    browserExecutable: join(runtimeRoot, "browser/headless"),
    binariesDirectory: join(runtimeRoot, "bin"),
    ffmpegExecutable: join(runtimeRoot, "bin/ffmpeg"),
    ffprobeExecutable: join(runtimeRoot, "bin/ffprobe"),
  });
  return { root, workspace, runtimeRoot, locations, runtime };
};

test("Workspace create atomically writes scoped authoring without provider or attempt output", async (context) => {
  const value = await fixture(context);
  const runtimeTemplatePath = join(
    value.runtimeRoot,
    "source/src/remotion/capabilities/scene-templates/axmorf/AxmorfBrand.tsx",
  );
  const runtimeTemplateBefore = await readFile(runtimeTemplatePath);
  const result = await createWorkspaceProject({
    locations: value.locations,
    runtime: value.runtime,
    config: buildProducerConfig(validProjectCreateProducerConfig),
    input: {
      ...validProjectCreateInput,
      sceneTemplates: {
        introSceneTemplateId: "axmorf-brand-reveal-v1",
        outroSceneTemplateId: "axmorf-source-follow-v1",
      },
    },
  });
  assert.equal(result.status, "project-created");
  assert.deepEqual(result.copiedSceneMeaningIds, [
    "configured-intro-scene",
    "configured-outro-scene",
  ]);
  const story = JSON.parse(
    await readFile(
      join(value.workspace, "projects/story-example/story.json"),
      "utf8",
    ),
  ) as { beats: readonly { meaningId: string }[] };
  assert.deepEqual(
    story.beats.map(({ meaningId }) => meaningId),
    ["configured-intro-scene", "opening", "configured-outro-scene"],
  );
  await Promise.all([
    access(
      join(
        value.workspace,
        "projects/story-example/scenes/configured-intro-scene/Renderer.tsx",
      ),
    ),
    access(
      join(
        value.workspace,
        "projects/story-example/production/project-create.json",
      ),
    ),
    access(
      join(value.workspace, ".rsp/current/resource-catalog.generated.json"),
    ),
    access(
      join(
        value.workspace,
        "media/story-example/scenes/configured-intro-scene/mixkit-movie-trailer-epic-impact-2908.wav",
      ),
    ),
    access(
      join(
        value.workspace,
        "media/story-example/scenes/configured-outro-scene/mixkit-deep-urban-623.mp3",
      ),
    ),
  ]);
  for (const [meaningId, assetName] of [
    ["configured-intro-scene", "mixkit-movie-trailer-epic-impact-2908.wav"],
    ["configured-outro-scene", "mixkit-deep-urban-623.mp3"],
  ] as const) {
    assert.deepEqual(
      await readFile(
        join(
          value.workspace,
          `media/story-example/scenes/${meaningId}/${assetName}`,
        ),
      ),
      await readFile(
        join(
          value.runtimeRoot,
          `shared-assets/library/mixkit/${meaningId === "configured-intro-scene" ? "sound-effects" : "music"}/${assetName}`,
        ),
      ),
    );
  }
  for (const forbidden of [
    "src/projects",
    "public/projects",
    ".rsp/attempts/story-example",
    ".rsp/artifacts/story-example",
    "deliveries/story-example",
  ])
    await assert.rejects(access(join(value.workspace, forbidden)));

  const current = await createWorkspaceProject({
    locations: value.locations,
    runtime: value.runtime,
    config: buildProducerConfig(validProjectCreateProducerConfig),
    input: {
      ...validProjectCreateInput,
      sceneTemplates: {
        introSceneTemplateId: "axmorf-brand-reveal-v1",
        outroSceneTemplateId: "axmorf-source-follow-v1",
      },
    },
  });
  assert.equal(current.status, "project-create-current");
  assert.equal(current.creationIdentity, result.creationIdentity);
  assert.deepEqual(await readFile(runtimeTemplatePath), runtimeTemplateBefore);
  const receiptPath = join(
    value.workspace,
    "projects/story-example/production/project-create.json",
  );
  const receiptBefore = await readFile(receiptPath);
  await assert.rejects(
    createWorkspaceProject({
      locations: value.locations,
      runtime: value.runtime,
      config: buildProducerConfig({
        ...validProjectCreateProducerConfig,
        readability: { edgeInsetPx: 91 },
      }),
      input: {
        ...validProjectCreateInput,
        sceneTemplates: {
          introSceneTemplateId: "axmorf-brand-reveal-v1",
          outroSceneTemplateId: "axmorf-source-follow-v1",
        },
      },
    }),
    /identity conflicts/u,
  );
  assert.deepEqual(await readFile(receiptPath), receiptBefore);
});

test("Workspace revision creates an isolated same-Project candidate without changing live authoring", async (context) => {
  const value = await fixture(context);
  const config = buildProducerConfig(validProjectCreateProducerConfig);
  await createWorkspaceProject({
    locations: value.locations,
    runtime: value.runtime,
    config,
    input: validProjectCreateInput,
  });
  const liveStoryPath = join(
    value.locations.projectSourceRoot,
    validProjectCreateInput.storyId,
    "story.json",
  );
  const liveBefore = await readFile(liveStoryPath, "utf8");
  const result = await createProjectRevisionCandidate({
    locations: value.locations,
    config,
    input: {
      schemaVersion: 1,
      contractVersion: "project-revision-input-v1",
      storyId: validProjectCreateInput.storyId,
      baseRevisionId: `revision-${"1".repeat(64)}`,
      patch: {
        story: {
          ...validProjectCreateInput.story,
          title: "A revised deterministic narration example",
        },
      },
    },
    current: {
      currentRevisionId: `revision-${"1".repeat(64)}`,
      sourceCurrentId: `source-current-${"2".repeat(64)}`,
      deliveryBuildId: `delivery-${"3".repeat(64)}`,
    },
  });
  assert.equal(result.status, "project-revision-candidate-created");
  assert.equal(await readFile(liveStoryPath, "utf8"), liveBefore);
  const candidateLocations = createProjectRevisionCandidateLocations({
    locations: value.locations,
    storyId: validProjectCreateInput.storyId,
    candidateId: result.candidateId,
  });
  const candidateStory = JSON.parse(
    await readFile(
      join(
        candidateLocations.projectSourceRoot,
        validProjectCreateInput.storyId,
        "story.json",
      ),
      "utf8",
    ),
  ) as { title: string };
  assert.equal(candidateStory.title, "A revised deterministic narration example");
  await access(
    join(
      candidateLocations.projectSourceRoot,
      validProjectCreateInput.storyId,
      "production/scene-originality-baseline.json",
    ),
  );
});

test("Workspace create supports explicit null templates without creating media or repository-shaped roots", async (context) => {
  const value = await fixture(context);
  const result = await createWorkspaceProject({
    locations: value.locations,
    runtime: value.runtime,
    config: buildProducerConfig(validProjectCreateProducerConfig),
    input: validProjectCreateInput,
  });
  assert.equal(result.status, "project-created");
  assert.deepEqual(result.copiedSceneMeaningIds, []);
  const story = JSON.parse(
    await readFile(
      join(value.workspace, "projects/story-example/story.json"),
      "utf8",
    ),
  ) as { beats: readonly { meaningId: string }[] };
  assert.deepEqual(
    story.beats.map(({ meaningId }) => meaningId),
    ["opening"],
  );
  await assert.rejects(access(join(value.workspace, "src")));
  await assert.rejects(access(join(value.workspace, "public")));
});

test("Workspace create rejects a symlinked Runtime Pack template without partial Project", async (context) => {
  const value = await fixture(context);
  const source = join(
    value.runtimeRoot,
    "source/src/remotion/capabilities/scene-templates/axmorf/AxmorfBrand.tsx",
  );
  const outside = join(value.root, "outside.tsx");
  await writeFile(outside, "export const Outside = true;\n");
  await rm(source);
  await symlink(outside, source);
  await assert.rejects(
    createWorkspaceProject({
      locations: value.locations,
      runtime: value.runtime,
      config: buildProducerConfig(validProjectCreateProducerConfig),
      input: {
        ...validProjectCreateInput,
        sceneTemplates: {
          introSceneTemplateId: "axmorf-brand-reveal-v1",
          outroSceneTemplateId: null,
        },
      },
    }),
    /symbolic|regular/u,
  );
  await assert.rejects(access(join(value.workspace, "projects/story-example")));
  await assert.rejects(access(join(value.workspace, "media/story-example")));
  assert.equal(
    await readFile(outside, "utf8"),
    "export const Outside = true;\n",
  );
});

test("Workspace create rejects a symlinked Workspace ancestor without external writes", async (context) => {
  const value = await fixture(context);
  const outsideWorkspace = join(value.root, "outside-workspace");
  await rename(value.workspace, outsideWorkspace);
  await writeFile(join(outsideWorkspace, "sentinel"), "workspace\n");
  await symlink(outsideWorkspace, value.workspace);

  await assert.rejects(
    createWorkspaceProject({
      locations: value.locations,
      runtime: value.runtime,
      config: buildProducerConfig(validProjectCreateProducerConfig),
      input: validProjectCreateInput,
    }),
    /ownership chain|canonical|symbolic/u,
  );
  assert.equal(
    await readFile(join(outsideWorkspace, "sentinel"), "utf8"),
    "workspace\n",
  );
  await assert.rejects(
    access(join(outsideWorkspace, "projects/story-example")),
  );
  await assert.rejects(access(join(outsideWorkspace, "media/story-example")));
});

test("Workspace context rejects a symlinked media ownership root", async (context) => {
  const value = await fixture(context);
  await createWorkspaceProject({
    locations: value.locations,
    runtime: value.runtime,
    config: buildProducerConfig(validProjectCreateProducerConfig),
    input: validProjectCreateInput,
  });
  const outsideMedia = join(value.root, "outside-context-media");
  await rename(join(value.workspace, "media"), outsideMedia);
  await symlink(outsideMedia, join(value.workspace, "media"));
  await assert.rejects(
    readWorkspaceProjectContext({
      locations: value.locations,
      projectId: "story-example",
    }),
    /ownership chain|canonical|symbolic/u,
  );
  await access(join(value.workspace, "projects/story-example/story.json"));
  await access(join(outsideMedia, "story-example"));
});

test("Workspace create promotion restores all roots when Catalog commit fails", async (context) => {
  const value = await fixture(context);
  const staging = join(value.root, "staging");
  const projectRoot = join(staging, "project/story-example");
  const mediaRoot = join(staging, "media/story-example");
  const projectionPath = join(
    staging,
    "projection/resource-catalog.generated.json",
  );
  const catalogTarget = join(
    value.workspace,
    ".rsp/current/resource-catalog.generated.json",
  );
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(mediaRoot, { recursive: true }),
    mkdir(join(staging, "projection"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(projectRoot, "sentinel"), "project\n"),
    writeFile(join(mediaRoot, "sentinel"), "media\n"),
    writeFile(projectionPath, "new catalog\n"),
    writeFile(catalogTarget, "old catalog\n"),
  ]);
  let moves = 0;
  await assert.rejects(
    commitWorkspaceProjectCreate({
      locations: value.locations,
      projectId: "story-example",
      prepared: { projectRoot, mediaRoot, projectionPath },
      verify: async () => undefined,
      move: async (source, destination) => {
        moves += 1;
        if (moves === 4) throw new Error("injected Catalog promotion failure");
        await rename(source, destination);
      },
    }),
    /injected Catalog promotion failure/u,
  );
  assert.equal(await readFile(catalogTarget, "utf8"), "old catalog\n");
  assert.equal(
    await readFile(join(projectRoot, "sentinel"), "utf8"),
    "project\n",
  );
  assert.equal(await readFile(join(mediaRoot, "sentinel"), "utf8"), "media\n");
  await assert.rejects(access(join(value.workspace, "projects/story-example")));
  await assert.rejects(access(join(value.workspace, "media/story-example")));
});
