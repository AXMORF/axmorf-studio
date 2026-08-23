import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import ts from "typescript";

import {
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  generateSemanticTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
} from "../../src/contracts";
import { renderProjectRegistrySource } from "../../scripts/registry/domain";
import {
  discoverProjectEntries as discoverProjectEntriesForStorage,
  loadProjectRegistrationEntry as loadProjectRegistrationEntryForStorage,
} from "../../scripts/registry/project-files";
import { generateProjectRegistry as generateProjectRegistryForStorage } from "../../scripts/registry/generate";
import {
  discoverRepositoryProjectEntries as discoverProjectEntries,
  generateRepositoryProjectRegistry as generateProjectRegistry,
  loadRepositoryProjectRegistrationEntry as loadProjectRegistrationEntry,
} from "../../scripts/registry/repository-registry";
import { runRegistryCli } from "../../scripts/registry/cli";
import { createWorkspaceProjectStorageLocations } from "../../scripts/projects/project-locations";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
  type ProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import {
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
  validVideoBrief,
} from "../fixtures/narrative";

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-registry-test-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "src/projects"), { recursive: true });
  return rootDir;
};

const repositoryLocations = (rootDir: string) =>
  createRepositoryProductionLocations({ repositoryRoot: rootDir });

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const createProject = async ({
  rootDir,
  projectSourceRoot,
  slug,
  compositionId,
  compositionSource = "const Composition = () => null; export default Composition;\n",
}: {
  readonly rootDir: string;
  readonly projectSourceRoot?: string;
  readonly slug: string;
  readonly compositionId: string;
  readonly compositionSource?: string;
}) => {
  const projectDir = join(
    projectSourceRoot ?? join(rootDir, "src/projects"),
    slug,
  );
  const brief = { ...validVideoBrief, storyId: slug, title: slug };
  const story = {
    ...validStorySpec,
    storyId: slug,
    title: slug,
  };
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const render = RenderSpecSchema.parse({
    ...validRenderSpec,
    compositionId,
  });
  const parsedStory = StorySpecSchema.parse(story);
  const pcm = {
    sampleRate: 48_000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const sealInput = {
    schemaVersion: 1,
    storyId: slug,
    narrationSpec: narration,
    generationInputFingerprint: computeGenerationInputFingerprint(
      parsedStory,
      narration,
    ),
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments: [
      {
        kind: "chunk" as const,
        chunkId: "opening-01",
        meaningId: "opening",
        ttsText: "A",
        localPath: `public/projects/${slug}/narration/chunks/opening-01.wav`,
        checksum: `sha256:${"a".repeat(64)}`,
        pcm,
        sampleFrameCount: 52_800,
      },
      {
        kind: "pause" as const,
        afterChunkId: "opening-01",
        meaningId: "opening",
        pauseMs: 250,
        sampleFrameCount: 12_000,
      },
      {
        kind: "chunk" as const,
        chunkId: "conclusion-01",
        meaningId: "conclusion",
        ttsText: "B",
        localPath: `public/projects/${slug}/narration/chunks/conclusion-01.wav`,
        checksum: `sha256:${"b".repeat(64)}`,
        pcm,
        sampleFrameCount: 45_600,
      },
    ],
    completeAudio: {
      localPath: `public/projects/${slug}/narration/complete.wav`,
      checksum: `sha256:${"c".repeat(64)}`,
      pcm,
      sampleFrameCount: 110_400,
    },
  } as const;
  const sealedNarration = SealedNarrationManifestSchema.parse({
    ...sealInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(sealInput),
  });
  const semanticTiming = generateSemanticTiming({
    story: parsedStory,
    narration,
    render,
    sealedNarration,
  });

  await Promise.all([
    writeJson(join(projectDir, "brief.json"), brief),
    writeJson(join(projectDir, "story.json"), story),
    writeJson(join(projectDir, "narration.json"), narration),
    writeJson(join(projectDir, "render.json"), render),
    writeJson(
      join(projectDir, "generated/sealed-narration.generated.json"),
      sealedNarration,
    ),
    writeJson(
      join(projectDir, "generated/semantic-timing.generated.json"),
      semanticTiming,
    ),
  ]);
  await writeFile(join(projectDir, "Composition.tsx"), compositionSource);
  return projectDir;
};

const loadAll = async (locations: ProductionLocations) =>
  Promise.all(
    (await discoverProjectEntries(locations)).map((compositionPath) =>
      loadProjectRegistrationEntry({ locations, compositionPath }),
    ),
  );

test("discovery considers only exact first-level Composition.tsx files", async (context) => {
  const rootDir = await createRoot(context);
  await createProject({ rootDir, slug: "zeta", compositionId: "Zeta" });
  await createProject({ rootDir, slug: "alpha", compositionId: "Alpha" });
  const locations = repositoryLocations(rootDir);
  await mkdir(join(rootDir, "src/projects/group/nested"), { recursive: true });
  await writeFile(
    join(rootDir, "src/projects/group/nested/Composition.tsx"),
    "export default () => null;\n",
  );

  assert.deepEqual(await discoverProjectEntries(locations), [
    "src/projects/alpha/Composition.tsx",
    "src/projects/zeta/Composition.tsx",
  ]);
});

test("registry excludes explicitly non-current StorySpec projects", async (context) => {
  const rootDir = await createRoot(context);
  const locations = repositoryLocations(rootDir);
  await createProject({ rootDir, slug: "current", compositionId: "Current" });
  const legacyProjectDir = await createProject({
    rootDir,
    slug: "legacy",
    compositionId: "Legacy",
    compositionSource:
      'import "./removed-runtime"; export default () => null;\n',
  });
  const legacyBeats = validStorySpec.beats.flatMap((beat) =>
    beat.kind === "narrated-scene"
      ? [
          {
            meaningId: beat.meaningId,
            narrativePurpose: beat.narrativePurpose,
            ttsChunks: beat.ttsChunks,
            explicitPauses: beat.explicitPauses,
          },
        ]
      : [],
  );
  await writeJson(join(legacyProjectDir, "story.json"), {
    schemaVersion: 1,
    storyId: "legacy",
    title: "legacy",
    beats: legacyBeats,
  });

  assert.deepEqual(await discoverProjectEntries(locations), [
    "src/projects/current/Composition.tsx",
  ]);
  await generateProjectRegistry({ locations, mode: "write" });
  const generated = await readFile(
    join(rootDir, "src/projects/project-registry.generated.ts"),
    "utf8",
  );
  assert.match(generated, /id: "Current"/u);
  assert.doesNotMatch(generated, /Legacy|removed-runtime/u);
});

test("generated entries are stably sorted and use literal import expressions", async (context) => {
  const rootDir = await createRoot(context);
  const locations = repositoryLocations(rootDir);
  await createProject({ rootDir, slug: "zeta", compositionId: "Zeta" });
  await createProject({ rootDir, slug: "alpha", compositionId: "Alpha" });
  const entries = await loadAll(locations);
  const first = await renderProjectRegistrySource(entries);
  const second = await renderProjectRegistrySource([...entries].reverse());
  assert.equal(first, second);
  assert.ok(first.indexOf('id: "Alpha"') < first.indexOf('id: "Zeta"'));
  assert.match(first, /load: \(\) => import\("\.\/alpha\/Composition"\)/);

  const ast = ts.createSourceFile(
    "project-registry.generated.ts",
    first,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const importArguments: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      importArguments.push(...node.arguments);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(importArguments.length, 2);
  assert.ok(importArguments.every(ts.isStringLiteral));
  assert.match(first, /durationInFrames: 96/u);
});

test("read-only check detects one-byte registry drift", async (context) => {
  const rootDir = await createRoot(context);
  const locations = repositoryLocations(rootDir);
  await createProject({ rootDir, slug: "alpha", compositionId: "Alpha" });
  await generateProjectRegistry({ locations, mode: "write" });
  const generatedPath = join(
    rootDir,
    "src/projects/project-registry.generated.ts",
  );
  await appendFile(generatedPath, " ");
  await assert.rejects(
    () => generateProjectRegistry({ locations, mode: "check" }),
    /ProjectRegistry drift/i,
  );
});

test("an invalid project leaves the previous registry byte-identical", async (context) => {
  const rootDir = await createRoot(context);
  const locations = repositoryLocations(rootDir);
  const projectDir = await createProject({
    rootDir,
    slug: "alpha",
    compositionId: "Alpha",
  });
  await generateProjectRegistry({ locations, mode: "write" });
  const generatedPath = join(
    rootDir,
    "src/projects/project-registry.generated.ts",
  );
  const before = await readFile(generatedPath);
  await writeFile(
    join(projectDir, "Composition.tsx"),
    "export const Composition = () => null;\n",
  );
  await assert.rejects(
    () => generateProjectRegistry({ locations, mode: "write" }),
    /default export/i,
  );
  assert.deepEqual(await readFile(generatedPath), before);
});

test("invalid projects and duplicate IDs fail closed", async (context) => {
  const duplicateRoot = await createRoot(context);
  const duplicateLocations = repositoryLocations(duplicateRoot);
  await createProject({
    rootDir: duplicateRoot,
    slug: "alpha",
    compositionId: "SameId",
  });
  await createProject({
    rootDir: duplicateRoot,
    slug: "zeta",
    compositionId: "SameId",
  });
  await assert.rejects(
    () =>
      generateProjectRegistry({ locations: duplicateLocations, mode: "write" }),
    /duplicate Composition ID/i,
  );

  const invalidSlugRoot = await createRoot(context);
  const invalidSlugLocations = repositoryLocations(invalidSlugRoot);
  await mkdir(join(invalidSlugRoot, "src/projects/Bad_Slug"));
  await writeFile(
    join(invalidSlugRoot, "src/projects/Bad_Slug/Composition.tsx"),
    "export default () => null;\n",
  );
  await assert.rejects(
    () => discoverProjectEntries(invalidSlugLocations),
    /invalid project slug/i,
  );

  const missingRoot = await createRoot(context);
  const missingDir = await createProject({
    rootDir: missingRoot,
    slug: "missing",
    compositionId: "Missing",
  });
  await rm(join(missingDir, "story.json"));
  await assert.rejects(() => loadAll(repositoryLocations(missingRoot)));
});

test("project directory symlinks are rejected and nested entries stay ignored", async (context) => {
  const rootDir = await createRoot(context);
  const locations = repositoryLocations(rootDir);
  const external = join(rootDir, "external-project");
  await mkdir(external);
  await writeFile(
    join(external, "Composition.tsx"),
    "export default () => null;\n",
  );
  await symlink(external, join(rootDir, "src/projects/linked"));
  await assert.rejects(
    () => discoverProjectEntries(locations),
    /symbolic link/i,
  );
});

test("registry CLI accepts only fixed generate or check commands", async (context) => {
  const rootDir = await createRoot(context);
  const locations = repositoryLocations(rootDir);
  await createProject({ rootDir, slug: "alpha", compositionId: "Alpha" });
  const output: string[] = [];
  await assert.rejects(
    () =>
      runRegistryCli(["generate", "--root", "/tmp"], {
        locations,
        stdout: output.push.bind(output),
      }),
    /exactly one/i,
  );
  await assert.rejects(
    () =>
      runRegistryCli(["repair"], {
        locations,
        stdout: output.push.bind(output),
      }),
    /generate or check/i,
  );
  await runRegistryCli(["generate"], {
    locations,
    stdout: output.push.bind(output),
  });
  await runRegistryCli(["check"], {
    locations,
    stdout: output.push.bind(output),
  });
  assert.deepEqual(output, [
    "Generated ProjectRegistry with 1 entry.",
    "ProjectRegistry is current with 1 entry.",
  ]);
});

test("Workspace Registry uses the same locations-only API without repository probing", async (context) => {
  const rootDir = await createRoot(context);
  const workspaceRoot = join(rootDir, "workspace");
  const locations = createWorkspaceProductionLocations({
    workspaceRoot,
    applicationSupportRoot: join(rootDir, "application-support"),
    runtimeResources: join(rootDir, "runtime-pack"),
    cacheRoot: join(rootDir, "cache"),
  });
  await createProject({
    rootDir,
    projectSourceRoot: locations.projectSourceRoot,
    slug: "workspace-story",
    compositionId: "WorkspaceStory",
  });
  const storage = createWorkspaceProjectStorageLocations(locations);

  assert.deepEqual(await discoverProjectEntriesForStorage({ storage }), [
    "src/projects/workspace-story/Composition.tsx",
  ]);
  await loadProjectRegistrationEntryForStorage({
    storage,
    compositionPath: "src/projects/workspace-story/Composition.tsx",
  });
  const result = await generateProjectRegistryForStorage({
    storage,
    mode: "write",
  });
  assert.equal(
    result.destination,
    join(workspaceRoot, ".rsp/current/project-registry.generated.ts"),
  );
  assert.match(await readFile(result.destination, "utf8"), /WorkspaceStory/u);
  await assert.rejects(
    readFile(join(rootDir, "src/projects/project-registry.generated.ts")),
  );
});
